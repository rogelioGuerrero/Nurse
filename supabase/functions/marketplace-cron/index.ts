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
        "Access-Control-Allow-Headers": "authorization, content-type, apikey",
      },
    });
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
      // Build a map of nurse_id -> set of accepted dates
      const nurseAcceptedDates = new Map<string, Set<string>>();
      const requestCache = new Map<string, any>();

      for (const offer of acceptedOffers) {
        if (!requestCache.has(offer.request_id)) {
          const { data: req } = await supabase
            .from("care_requests")
            .select("slots")
            .eq("id", offer.request_id)
            .single();
          if (req) requestCache.set(offer.request_id, req);
        }
        const req = requestCache.get(offer.request_id);
        if (req && req.slots) {
          const slots = typeof req.slots === "string" ? JSON.parse(req.slots) : req.slots;
          const slot = slots[offer.slot_index];
          if (slot) {
            if (!nurseAcceptedDates.has(offer.nurse_id)) {
              nurseAcceptedDates.set(offer.nurse_id, new Set());
            }
            nurseAcceptedDates.get(offer.nurse_id)!.add(slot.date);
          }
        }
      }

      // Find and withdraw conflicting pending offers
      for (const [nurseId, dates] of nurseAcceptedDates) {
        const { data: pendingOffers } = await supabase
          .from("care_offers")
          .select("id, request_id, slot_index")
          .eq("nurse_id", nurseId)
          .eq("status", "pending");

        if (pendingOffers) {
          const toWithdraw: string[] = [];
          for (const pOffer of pendingOffers) {
            const req = requestCache.get(pOffer.request_id) || (
              await supabase.from("care_requests").select("slots").eq("id", pOffer.request_id).single()
            ).data;
            if (req && req.slots) {
              const slots = typeof req.slots === "string" ? JSON.parse(req.slots) : req.slots;
              const slot = slots[pOffer.slot_index];
              if (slot && dates.has(slot.date)) {
                toWithdraw.push(pOffer.id);
              }
            }
          }
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
      }
    }
  } catch (err) {
    results.errors.push(`unexpected: ${err instanceof Error ? err.message : String(err)}`);
  }

  return new Response(JSON.stringify({ success: true, ...results }), {
    headers: { "Content-Type": "application/json" },
  });
});
