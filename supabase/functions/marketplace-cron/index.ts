// @ts-nocheck — Deno Edge Function
// Server-side marketplace expiration: runs via Supabase cron (pg_cron)
// Handles: request expiration, offer cleanup, pending booking cancellation
// Must have verify_jwt: false (called by cron, not by users)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-cron-secret",
      },
    });
  }

  // Validate CRON_SECRET to prevent unauthorized invocations
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const providedSecret = req.headers.get("x-cron-secret");
    if (providedSecret !== cronSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results = {
    expired_requests: 0,
    expired_offers: 0,
    cancelled_bookings: 0,
    withdrawn_conflicting: 0,
    errors: [] as string[],
  };

  try {
    // 1. Expire care requests past their response_deadline
    const { data: expiredReqs, error: reqError } = await supabase
      .from("care_requests")
      .select("id")
      .eq("status", "open")
      .lte("response_deadline", new Date().toISOString());

    if (reqError) {
      results.errors.push(`expire_requests: ${reqError.message}`);
    } else if (expiredReqs && expiredReqs.length > 0) {
      const expiredIds = expiredReqs.map((r: any) => r.id);
      const { error: updateErr } = await supabase
        .from("care_requests")
        .update({ status: "expired" })
        .in("id", expiredIds);
      if (updateErr) {
        results.errors.push(`update_expired_requests: ${updateErr.message}`);
      } else {
        results.expired_requests = expiredIds.length;
      }

      // 2. Reject pending offers on expired requests
      const { error: offerErr } = await supabase
        .from("care_offers")
        .update({ status: "rejected", reject_reason: "auto" })
        .in("request_id", expiredIds)
        .eq("status", "pending");
      if (offerErr) {
        results.errors.push(`expire_offers: ${offerErr.message}`);
      } else {
        // Count affected offers (approximate — Supabase doesn't return count on update with .in())
        const { count } = await supabase
          .from("care_offers")
          .select("id", { count: "exact", head: true })
          .in("request_id", expiredIds)
          .eq("reject_reason", "auto");
        results.expired_offers = count || 0;
      }
    }

    // 3. Cancel pending bookings older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: staleBookings, error: bookingError } = await supabase
      .from("bookings")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", cutoff);

    if (bookingError) {
      results.errors.push(`cancel_bookings: ${bookingError.message}`);
    } else if (staleBookings && staleBookings.length > 0) {
      const bookingIds = staleBookings.map((b: any) => b.id);
      const { error: cancelErr } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .in("id", bookingIds);
      if (cancelErr) {
        results.errors.push(`update_cancelled_bookings: ${cancelErr.message}`);
      } else {
        results.cancelled_bookings = bookingIds.length;
      }
    }

    // 4. Auto-withdraw conflicting offers: if a nurse has an accepted offer,
    //    withdraw their other pending offers for the same date
    const { data: acceptedOffers, error: accError } = await supabase
      .from("care_offers")
      .select("id, nurse_id, request_id, slot_index")
      .eq("status", "accepted");

    if (accError) {
      results.errors.push(`fetch_accepted: ${accError.message}`);
    } else if (acceptedOffers && acceptedOffers.length > 0) {
      // Batch-load all referenced request slots in ONE query (was N+1)
      const requestIds = [...new Set(acceptedOffers.map((o: any) => o.request_id))];
      const { data: reqs } = await supabase
        .from("care_requests")
        .select("id, slots")
        .in("id", requestIds);
      const requestCache = new Map<string, any>((reqs || []).map((r: any) => [r.id, r]));

      const getSlot = (requestId: string, slotIndex: number) => {
        const req = requestCache.get(requestId);
        if (!req || !req.slots) return null;
        const slots = typeof req.slots === "string" ? JSON.parse(req.slots) : req.slots;
        return slots?.[slotIndex] || null;
      };

      // Build a map of nurse_id -> accepted slots (date + shift)
      const slotsConflict = (a: any, b: any): boolean => {
        if (!a || !b || a.date !== b.date) return false;
        return a.shift === b.shift || a.shift === "full_day" || b.shift === "full_day";
      };

      const nurseAcceptedSlots = new Map<string, any[]>();
      for (const offer of acceptedOffers) {
        const slot = getSlot(offer.request_id, offer.slot_index);
        if (slot) {
          if (!nurseAcceptedSlots.has(offer.nurse_id)) {
            nurseAcceptedSlots.set(offer.nurse_id, []);
          }
          nurseAcceptedSlots.get(offer.nurse_id)!.push(slot);
        }
      }

      // Fetch ALL pending offers for those nurses in ONE query (was 1 per nurse)
      const nurseIds = [...nurseAcceptedSlots.keys()];
      const { data: pendingOffers } = nurseIds.length > 0
        ? await supabase
            .from("care_offers")
            .select("id, nurse_id, request_id, slot_index")
            .in("nurse_id", nurseIds)
            .eq("status", "pending")
        : { data: [] as any[] };

      // Batch-load request slots for pending offers pointing at other requests
      const missingIds = [...new Set((pendingOffers || []).map((o: any) => o.request_id))]
        .filter((id) => !requestCache.has(id));
      if (missingIds.length > 0) {
        const { data: moreReqs } = await supabase
          .from("care_requests")
          .select("id, slots")
          .in("id", missingIds);
        for (const r of moreReqs || []) requestCache.set(r.id, r);
      }

      const toWithdraw = (pendingOffers || [])
        .filter((o: any) => {
          const slot = getSlot(o.request_id, o.slot_index);
          const acceptedList = nurseAcceptedSlots.get(o.nurse_id) || [];
          return slot && acceptedList.some((accSlot) => slotsConflict(slot, accSlot));
        })
        .map((o: any) => o.id);

      if (toWithdraw.length > 0) {
        const { error: withdrawErr } = await supabase
          .from("care_offers")
          .update({ status: "rejected", reject_reason: "auto" })
          .in("id", toWithdraw);
        if (withdrawErr) {
          results.errors.push(`withdraw_conflicting: ${withdrawErr.message}`);
        } else {
          results.withdrawn_conflicting += toWithdraw.length;
        }
      }
    }
  } catch (err) {
    results.errors.push(`unexpected: ${err instanceof Error ? err.message : String(err)}`);
  }

  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { "Content-Type": "application/json" },
  });
});
