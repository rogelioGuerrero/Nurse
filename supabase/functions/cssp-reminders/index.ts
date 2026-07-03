import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = "guerrero_vi@yahoo.com";

async function sendNurseEmail(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    nurse_name: string;
    nurse_email: string;
    cssp_registration: string;
    cssp_level: string;
    template_type: string;
    problem_detail: string;
    used_variant?: string;
    days_inactive?: number;
  }
): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/functions/v1/send-nurse-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  });
  return response.ok;
}

async function sendAdminSummary(supabase: ReturnType<typeof createClient>): Promise<void> {
  if (!RESEND_API_KEY) return;

  try {
    const { data: demoUsers } = await supabase
      .from("profiles").select("id").eq("is_demo", true);
    const demoIds = (demoUsers || []).map((u: any) => u.id);
    const demoFilter = demoIds.length > 0 ? demoIds : ["00000000-0000-0000-0000-000000000000"];
    const notInDemo = `(${demoFilter.map((id: string) => `"${id}"`).join(",")})`;

    const { count: totalNurses } = await supabase
      .from("nurses").select("*", { count: "exact", head: true })
      .not("user_id", "in", notInDemo);

    const { count: verifiedNurses } = await supabase
      .from("nurses").select("*", { count: "exact", head: true })
      .eq("cssp_verified", true)
      .not("user_id", "in", notInDemo);

    const { count: pendingNurses } = await supabase
      .from("nurses").select("*", { count: "exact", head: true })
      .in("cssp_verification_status", ["pending", "unverified"])
      .not("cssp_registration", "is", null)
      .not("user_id", "in", notInDemo);

    const { count: incompleteNurses } = await supabase
      .from("nurses").select("*", { count: "exact", head: true })
      .or("cssp_registration.is.null,dui.is.null,dui.eq.")
      .not("user_id", "in", notInDemo);

    const { count: activeNurses } = await supabase
      .from("nurses").select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .not("user_id", "in", notInDemo);

    const { count: inactiveNurses } = await supabase
      .from("nurses").select("*", { count: "exact", head: true })
      .eq("is_active", false)
      .not("user_id", "in", notInDemo);

    const { count: totalRequests } = await supabase
      .from("care_requests").select("*", { count: "exact", head: true })
      .not("family_id", "in", notInDemo);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: newNurses24h } = await supabase
      .from("nurses").select("*", { count: "exact", head: true })
      .gte("created_at", yesterday)
      .not("user_id", "in", notInDemo);

    const { count: pendingReminders } = await supabase
      .from("nurses").select("*", { count: "exact", head: true })
      .gt("cssp_email_count", 0)
      .lt("cssp_email_count", 3)
      .in("cssp_verification_status", ["unverified", "pending"])
      .not("user_id", "in", notInDemo);

    const { data: pendingSupportEmails } = await supabase
      .from("support_emails")
      .select("from_email, subject, classification, created_at")
      .eq("needs_human", true)
      .is("notified_at", null)
      .order("created_at", { ascending: false })
      .limit(10);

    const supportCount = pendingSupportEmails?.length || 0;

    let supportHtml = "";
    if (supportCount > 0) {
      const items = pendingSupportEmails!.map((e: any, i: number) =>
        `<tr><td style="padding: 6px 8px;">${i + 1}</td><td style="padding: 6px 8px;">${e.subject || "(sin asunto)"}</td><td style="padding: 6px 8px; color: #64748b; font-size: 11px;">${e.from_email}</td></tr>`
      ).join("");
      supportHtml = `
      <tr><td colspan="2" style="padding: 12px 8px 4px; font-weight: bold; color: #dc2626; font-size: 14px;">Correos de soporte pendientes</td></tr>
      <tr><td colspan="2">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px;">
        <tr style="background: #f1f5f9;"><th style="padding: 4px 8px; text-align: left;">#</th><th style="padding: 4px 8px; text-align: left;">Asunto</th><th style="padding: 4px 8px; text-align: left;">De</th></tr>
        ${items}
        </table>
      </td></tr>`;
    }

    const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1e293b;">
    <h2 style="color: #0d9488; margin: 0 0 16px;">Resumen diario — BienCuidar</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #64748b;">Total enfermeras</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${totalNurses || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Verificadas</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #059669;">${verifiedNurses || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Pendientes de verificación</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #f59e0b;">${pendingNurses || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Incompletas (sin CSSP/DUI)</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #f59e0b;">${incompleteNurses || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Activas</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${activeNurses || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Desactivadas</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #94a3b8;">${inactiveNurses || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Solicitudes de cuidado</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${totalRequests || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Nuevas enfermeras (24h)</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${newNurses24h || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Recordatorios pendientes</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #f59e0b;">${pendingReminders || 0}</td></tr>
      ${supportHtml}
    </table>
    <p style="font-size: 12px; color: #94a3b8; margin: 16px 0 0;">${new Date().toISOString()}</p>
    </div>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BienCuidar <info@agtisa.com>",
        to: ADMIN_EMAIL,
        subject: "Resumen diario — BienCuidar",
        html,
      }),
    });
  } catch (err) {
    console.error("Error en sendAdminSummary:", err);
  }
}

Deno.serve(async (req: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const apiKey = req.headers.get("x-api-key");

  if (cronSecret && apiKey !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: demoUsers } = await supabase
      .from("profiles").select("id").eq("is_demo", true);
    const demoIds = (demoUsers || []).map((u: any) => u.id);
    const demoFilter = demoIds.length > 0 ? demoIds : ["00000000-0000-0000-0000-000000000000"];
    const notInDemo = `(${demoFilter.map((id: string) => `"${id}"`).join(",")})`;

    const now = new Date();
    const results: any[] = [];

    // ===== 0. RE-VERIFICACIÓN CSSP =====
    const { data: unverifiedNurses } = await supabase
      .from("nurses")
      .select(`
        id, user_id, cssp_registration, cssp_level, cssp_verification_status,
        cssp_email_count, is_active,
        profiles!inner(email, full_name)
      `)
      .in("cssp_verification_status", ["unverified", "pending"])
      .not("cssp_registration", "is", null)
      .eq("cssp_email_count", 0)
      .eq("is_active", true)
      .not("user_id", "in", notInDemo);

    if (unverifiedNurses) {
      for (const nurse of unverifiedNurses) {
        const profile = nurse.profiles;
        const nurseName = profile?.full_name || "";
        console.log(`[cssp-reminders] Re-verificando: ${nurseName} (CSSP: ${nurse.cssp_registration})`);

        try {
          const verifyRes = await fetch(`${supabaseUrl}/functions/v1/verify-cssp`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              nurse_id: nurse.id,
              cssp_registration: nurse.cssp_registration,
              nurse_name: nurseName,
              nurse_level: nurse.cssp_level || "",
            }),
          });

          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            console.log(`[cssp-reminders] Re-verificación de ${nurseName}: ${verifyData.status}`);
            results.push({
              type: "reverification",
              name: nurseName,
              cssp: nurse.cssp_registration,
              status: verifyData.status,
            });
          } else {
            console.error(`[cssp-reminders] Re-verificación falló para ${nurseName}: ${verifyRes.status}`);
          }
        } catch (err) {
          console.error(`[cssp-reminders] Re-verificación error para ${nurseName}:`, err);
        }

        await new Promise(r => setTimeout(r, 2000));
      }
    }

    // ===== 1. CSSP REMINDERS =====
    const { data: nurses } = await supabase
      .from("nurses")
      .select(`
        id, user_id, cssp_registration, cssp_level, cssp_verification_status,
        cssp_verification_notes, cssp_email_sent_at, cssp_email_count, is_active,
        profiles!inner(email, full_name)
      `)
      .in("cssp_verification_status", ["unverified", "pending"])
      .not("cssp_registration", "is", null)
      .gt("cssp_email_count", 0)
      .lt("cssp_email_count", 3)
      .eq("is_active", true)
      .not("user_id", "in", notInDemo);

    if (nurses) {
      for (const nurse of nurses) {
        const emailCount = nurse.cssp_email_count || 0;
        const sentAt = nurse.cssp_email_sent_at ? new Date(nurse.cssp_email_sent_at) : null;
        if (!sentAt) continue;

        const hoursSince = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);
        const profile = nurse.profiles;
        const nurseEmail = profile?.email || "";
        const nurseName = profile?.full_name || "";
        if (!nurseEmail) continue;

        const notes = nurse.cssp_verification_notes || "";
        let problemDetail = notes;

        if (notes.includes("no coincide") && notes.includes("Profesión")) {
          problemDetail = "El número de registro pertenece a una persona con una profesión diferente a la enfermería.";
        } else if (notes.includes("no coincide") && notes.includes("Nombre")) {
          problemDetail = "El número de registro pertenece a una persona con un nombre diferente al registrado.";
        } else if (notes.includes("no encontrado")) {
          problemDetail = `El número ${nurse.cssp_registration} no fue encontrado en el portal del CSSP.`;
        }

        let shouldSend = false;
        let templateType = "";

        if (emailCount === 1 && hoursSince >= 72) {
          shouldSend = true;
          templateType = "cssp_reminder_second";
        } else if (emailCount === 2 && hoursSince >= 168) {
          shouldSend = true;
          templateType = "cssp_reminder_third";
        }

        if (shouldSend) {
          const sent = await sendNurseEmail(supabaseUrl, supabaseKey, {
            nurse_name: nurseName,
            nurse_email: nurseEmail,
            cssp_registration: nurse.cssp_registration,
            cssp_level: nurse.cssp_level || "",
            template_type: templateType,
            problem_detail: problemDetail,
          });

          if (sent) {
            await supabase.from("nurses").update({
              cssp_email_sent_at: now.toISOString(),
              cssp_email_count: emailCount + 1,
            }).eq("id", nurse.id);

            results.push({ type: "cssp_reminder", name: nurseName, template: templateType, sent: true });
          }
        }
      }
    }

    // ===== 2. DEACTIVATION after 3rd email + 48h =====
    const { data: thirdNoticeNurses } = await supabase
      .from("nurses")
      .select(`
        id, cssp_email_sent_at, cssp_email_count, is_active,
        profiles!inner(email, full_name)
      `)
      .eq("cssp_email_count", 3)
      .eq("is_active", true)
      .in("cssp_verification_status", ["unverified", "pending"])
      .not("user_id", "in", notInDemo);

    if (thirdNoticeNurses) {
      for (const nurse of thirdNoticeNurses) {
        const sentAt = nurse.cssp_email_sent_at ? new Date(nurse.cssp_email_sent_at) : null;
        if (!sentAt) continue;

        const hoursSince = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);

        if (hoursSince >= 48) {
          await supabase.from("nurses").update({
            is_active: false,
          }).eq("id", nurse.id);

          results.push({
            type: "deactivated",
            name: nurse.profiles?.full_name || "",
            email: nurse.profiles?.email || "",
            hoursAfterThirdNotice: Math.round(hoursSince),
          });
        }
      }
    }

    // ===== 3. INACTIVITY ALERTS =====
    // Solo enviar alertas de inactividad si ya hay solicitudes de cuidado en la plataforma
    const { count: totalCareRequests } = await supabase
      .from("care_requests").select("*", { count: "exact", head: true })
      .not("family_id", "in", notInDemo);

    if ((totalCareRequests || 0) > 0) {
    const { data: inactiveNurses } = await supabase
      .from("nurses")
      .select(`
        id, user_id, inactivity_email_count, inactivity_email_sent_at, is_active,
        profiles!inner(email, full_name, last_sign_in_at)
      `)
      .eq("is_active", true)
      .not("profiles.last_sign_in_at", "is", null)
      .lt("inactivity_email_count", 2)
      .not("user_id", "in", notInDemo);

    if (inactiveNurses) {
      for (const nurse of inactiveNurses) {
        const lastSignIn = nurse.profiles?.last_sign_in_at ? new Date(nurse.profiles.last_sign_in_at) : null;
        if (!lastSignIn) continue;

        const daysSince = Math.floor((now.getTime() - lastSignIn.getTime()) / (1000 * 60 * 60 * 24));
        const inactivityCount = nurse.inactivity_email_count || 0;

        let shouldSend = false;
        let templateType = "";

        if (inactivityCount === 0 && daysSince >= 15) {
          shouldSend = true;
          templateType = "inactivity_first";
        } else if (inactivityCount === 1 && daysSince >= 30) {
          shouldSend = true;
          templateType = "inactivity_second";
        }

        if (shouldSend) {
          const nurseEmail = nurse.profiles?.email || "";
          const nurseName = nurse.profiles?.full_name || "";
          if (!nurseEmail) continue;

          const sent = await sendNurseEmail(supabaseUrl, supabaseKey, {
            nurse_name: nurseName,
            nurse_email: nurseEmail,
            cssp_registration: "",
            cssp_level: "",
            template_type: templateType,
            problem_detail: "",
            days_inactive: daysSince,
          });

          if (sent) {
            await supabase.from("nurses").update({
              inactivity_email_sent_at: now.toISOString(),
              inactivity_email_count: inactivityCount + 1,
            }).eq("id", nurse.id);

            results.push({ type: "inactivity", name: nurseName, daysInactive: daysSince, template: templateType, sent: true });
          }
        }
      }
    }
    } else {
      console.log("[cssp-reminders] Inactivity alerts skipped — no care requests yet");
    }

    // ===== 4. ADMIN DAILY SUMMARY =====
    await sendAdminSummary(supabase);

    return new Response(JSON.stringify({
      success: true,
      date: now.toISOString(),
      reverifications: results.filter(r => r.type === "reverification").length,
      csspReminders: results.filter(r => r.type === "cssp_reminder").length,
      deactivated: results.filter(r => r.type === "deactivated").length,
      inactivityAlerts: results.filter(r => r.type === "inactivity").length,
      adminSummary: true,
      details: results,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
