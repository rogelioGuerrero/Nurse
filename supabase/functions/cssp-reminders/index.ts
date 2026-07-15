import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_EMAIL = "guerrero_vi@yahoo.com";
const REPLY_TO = "info@agtisa.com";

function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const CSSP_SEARCH_URL = "https://cssp.gob.sv/profesionales/faces/consulta/buscar.xhtml";

/**
 * Verifica si el portal del CSSP está en línea.
 * Hace dos checks: dominio base + ruta específica.
 * Distingue entre "caído" (sitio entero no responde) y "url_changed" (dominio ok pero ruta no).
 */
async function checkCSSPPortalOnline(): Promise<{
  online: boolean;
  statusCode: number;
  error?: string;
  status: "online" | "down" | "url_changed";
}> {
  const ua = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

  // 1. Check dominio base
  let baseOk = false;
  try {
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 10000);
    const baseRes = await fetch("https://cssp.gob.sv", {
      method: "GET",
      headers: ua,
      signal: ctrl1.signal,
    });
    clearTimeout(t1);
    baseOk = baseRes.ok || baseRes.status < 500;
  } catch {
    baseOk = false;
  }

  // 2. Check ruta específica
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(CSSP_SEARCH_URL, {
      method: "GET",
      headers: ua,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 404) {
      // Si el dominio base funciona pero la ruta da 404 → URL cambiada
      if (baseOk) {
        return { online: false, statusCode: 404, status: "url_changed", error: "La ruta del portal cambió (404). El dominio cssp.gob.sv responde pero /profesionales/faces/consulta/buscar.xhtml no existe." };
      }
      return { online: false, statusCode: 404, status: "down", error: "404 Not Found — portal caído" };
    }
    if (!res.ok) {
      return { online: false, statusCode: res.status, status: "down", error: `HTTP ${res.status}` };
    }
    const html = await res.text();
    if (html.includes("GlassFish Server") && html.includes("Error report")) {
      return { online: false, statusCode: res.status, status: "down", error: "GlassFish error page — portal caído" };
    }
    if (!html.includes("frm1") && !html.includes("idProfesional")) {
      // Si el dominio base funciona pero el formulario no está → posible rediseño
      if (baseOk) {
        return { online: false, statusCode: res.status, status: "url_changed", error: "La página responde pero no contiene el formulario de búsqueda. Posible rediseño del portal." };
      }
      return { online: false, statusCode: res.status, status: "down", error: "Página no contiene formulario de búsqueda" };
    }
    return { online: true, statusCode: res.status, status: "online" };
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { online: false, statusCode: 0, status: "down", error: msg };
  }
}

/**
 * Actualiza el estado del portal en la tabla cssp_portal_status.
 * Devuelve cuántos días lleva caído (si está caído).
 */
async function updatePortalStatus(
  supabase: ReturnType<typeof createClient>,
  online: boolean
): Promise<{ daysDown: number; firstDownAt: string | null }> {
  if (online) {
    await supabase.from("cssp_portal_status").update({
      is_online: true,
      first_down_at: null,
      last_checked_at: new Date().toISOString(),
    }).eq("id", 1);
    return { daysDown: 0, firstDownAt: null };
  }

  // Portal caído — leer estado actual para ver si ya teníamos first_down_at
  const { data: current } = await supabase
    .from("cssp_portal_status")
    .select("first_down_at")
    .eq("id", 1)
    .single();

  const now = new Date();
  const firstDownAt = current?.first_down_at ? current.first_down_at : now.toISOString();
  const daysDown = current?.first_down_at
    ? Math.floor((now.getTime() - new Date(current.first_down_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  await supabase.from("cssp_portal_status").update({
    is_online: false,
    first_down_at: firstDownAt,
    last_checked_at: now.toISOString(),
  }).eq("id", 1);

  return { daysDown, firstDownAt };
}

async function sendPortalDownAlert(
  supabase: ReturnType<typeof createClient>,
  daysDown: number,
  errorDetail: string,
  portalStatus: "down" | "url_changed",
  notInDemo: string
): Promise<void> {
  if (!RESEND_API_KEY) return;

  const { count: affectedNurses } = await supabase
    .from("nurses")
    .select("*", { count: "exact", head: true })
    .in("cssp_verification_status", ["unverified", "pending"])
    .eq("is_active", true)
    .not("cssp_registration", "is", null)
    .not("user_id", "in", notInDemo);

  const { count: notifiedNurses } = await supabase
    .from("nurses")
    .select("*", { count: "exact", head: true })
    .eq("portal_down_notified", true)
    .not("user_id", "in", notInDemo);

  const statusLabel = portalStatus === "url_changed" ? "URL cambiada" : "Portal caído";
  const daysText = daysDown === 0 ? "hoy" : `${daysDown} día${daysDown > 1 ? "s" : ""}`;
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1e293b;">
    <h2 style="color: #dc2626; margin: 0 0 16px;">⚠️ ${statusLabel} CSSP — BienCuidar</h2>
    <p style="font-size: 14px; line-height: 1.6;">El portal del CSSP (<a href="${CSSP_SEARCH_URL}" style="color: #0d9488;">cssp.gob.sv</a>) no está disponible.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin: 16px 0;">
      <tr><td style="padding: 8px 0; color: #64748b;">Estado</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #dc2626;">${statusLabel}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Detectado</td><td style="padding: 8px 0; text-align: right; font-weight: 600;">${daysText}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Error</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #dc2626;">${errorDetail}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Enfermeras afectadas</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #f59e0b;">${affectedNurses || 0}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Enfermeras notificadas</td><td style="padding: 8px 0; text-align: right; font-weight: 600; color: #0d9488;">${notifiedNurses || 0}</td></tr>
    </table>
    <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
      <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Acciones suspendidas automáticamente:</strong></p>
      <ul style="margin: 8px 0 0; padding-left: 20px; font-size: 13px; color: #92400e;">
        <li>Re-verificación CSSP</li>
        <li>Envío de recordatorios a enfermeras</li>
        <li>Desactivación de cuentas por no verificación</li>
      </ul>
      <p style="margin: 8px 0 0; font-size: 13px; color: #92400e;"><strong>Enfermeras notificadas:</strong> Se les envió un correo informando que la verificación está pausada y que su cuenta sigue activa.</p>
    </div>
    <p style="font-size: 13px; color: #64748b; margin: 16px 0 0;">Se reanudarán automáticamente cuando el portal vuelva a estar disponible. Mientras tanto, podés verificar manualmente en el portal o pedir a las enfermeras su carnet CSSP.</p>
    <p style="font-size: 12px; color: #94a3b8; margin: 16px 0 0;">${new Date().toISOString()}</p>
  </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "BienCuidar <info@agtisa.com>",
      to: ADMIN_EMAIL,
      subject: daysDown === 0 ? `${statusLabel} CSSP — BienCuidar` : `${statusLabel} CSSP (${daysText}) — BienCuidar`,
      html,
      text: htmlToText(html),
      headers: { "Reply-To": REPLY_TO },
    }),
  });
}

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

    const res = await fetch("https://api.resend.com/emails", {
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
        text: htmlToText(html),
        headers: { "Reply-To": REPLY_TO },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[sendAdminSummary] Resend error ${res.status}:`, errText);
      return;
    }

    const resData = await res.json();
    console.log("[sendAdminSummary] Resumen enviado:", resData.id);
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

    // ===== -1. VERIFICAR PORTAL CSSP =====
    const portalCheck = await checkCSSPPortalOnline();
    const portalStatus = await updatePortalStatus(supabase, portalCheck.online);
    console.log(`[cssp-reminders] Portal CSSP: ${portalCheck.online ? "ONLINE" : "OFFLINE"} — ${portalCheck.error || "OK"}`);

    if (!portalCheck.online) {
      // Portal caído o URL cambiada: avisar al admin
      await sendPortalDownAlert(supabase, portalStatus.daysDown, portalCheck.error || "Desconocido", portalCheck.status as "down" | "url_changed", notInDemo);
      console.log(`[cssp-reminders] Portal ${portalCheck.status} (${portalStatus.daysDown} días) — suspendiendo operaciones CSSP`);

      // Notificar una sola vez a enfermeras pendientes que no han sido notificadas
      const { data: nursesToNotify } = await supabase
        .from("nurses")
        .select(`
          id, user_id, cssp_registration, cssp_level,
          profiles!inner(email, full_name)
        `)
        .in("cssp_verification_status", ["unverified", "pending"])
        .not("cssp_registration", "is", null)
        .eq("is_active", true)
        .eq("portal_down_notified", false)
        .not("user_id", "in", notInDemo);

      if (nursesToNotify && nursesToNotify.length > 0) {
        console.log(`[cssp-reminders] Notificando a ${nursesToNotify.length} enfermeras sobre portal caído`);
        for (const nurse of nursesToNotify) {
          const nurseEmail = nurse.profiles?.email || "";
          const nurseName = nurse.profiles?.full_name || "";
          if (!nurseEmail) continue;
          const sent = await sendNurseEmail(supabaseUrl, supabaseKey, {
            nurse_name: nurseName,
            nurse_email: nurseEmail,
            cssp_registration: nurse.cssp_registration,
            cssp_level: nurse.cssp_level || "",
            template_type: "cssp_portal_down",
            problem_detail: "",
          });
          if (sent) {
            await supabase.from("nurses").update({ portal_down_notified: true }).eq("id", nurse.id);
            results.push({ type: "portal_down_notified", name: nurseName, email: nurseEmail, sent: true });
          }
        }
      }

      // Still run inactivity alerts (no relacionadas con CSSP) y admin summary
      // ===== 3. INACTIVITY ALERTS =====
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
            if (inactivityCount === 0 && daysSince >= 15) { shouldSend = true; templateType = "inactivity_first"; }
            else if (inactivityCount === 1 && daysSince >= 30) { shouldSend = true; templateType = "inactivity_second"; }
            if (shouldSend) {
              const nurseEmail = nurse.profiles?.email || "";
              const nurseName = nurse.profiles?.full_name || "";
              if (!nurseEmail) continue;
              const sent = await sendNurseEmail(supabaseUrl, supabaseKey, {
                nurse_name: nurseName, nurse_email: nurseEmail,
                cssp_registration: "", cssp_level: "",
                template_type: templateType, problem_detail: "", days_inactive: daysSince,
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
      }

      // ===== 4. ADMIN DAILY SUMMARY =====
      await sendAdminSummary(supabase);

      return new Response(JSON.stringify({
        success: true,
        date: now.toISOString(),
        portalOnline: false,
        portalDownDays: portalStatus.daysDown,
        portalError: portalCheck.error,
        csspOperationsSuspended: true,
        inactivityAlerts: results.filter(r => r.type === "inactivity").length,
        adminSummary: true,
        details: results,
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // ===== PORTAL ONLINE — resetear flag de notificación =====
    await supabase.from("nurses").update({ portal_down_notified: false }).eq("portal_down_notified", true);

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
