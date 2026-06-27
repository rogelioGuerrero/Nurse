// @ts-nocheck — Deno Edge Function
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const SENDER_EMAIL = "BienCuidar <info@agtisa.com>";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    created_at: string;
    from: string;
    to: string[];
    subject: string;
    bcc?: string[];
    cc?: string[];
    message_id?: string;
    attachments?: any[];
  };
}

async function getEmailContent(emailId: string): Promise<{ html: string; text: string | null; subject: string }> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  if (!res.ok) {
    console.log(`[email-inbound] Failed to get email content: ${res.status}`);
    return { html: "", text: null, subject: "" };
  }
  const data = await res.json();
  return {
    html: data.html || "",
    text: data.text || null,
    subject: data.subject || "",
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function classifyEmail(
  from: string,
  subject: string,
  bodyText: string
): Promise<{ category: "consulta" | "spam" | "sistema" | "marketing"; reason: string }> {
  const prompt = `Clasificá el siguiente correo recibido por BienCuidar (plataforma de enfermería en El Salvador).

Remitente: ${from}
Asunto: ${subject}
Cuerpo (primeros 500 chars): ${bodyText.slice(0, 500)}

Categorías:
- "consulta": pregunta de un usuario sobre turnos, registro, CSSP, pagos, cómo funciona BienCuidar, o solicitud de ayuda
- "spam": phishing, estafas, notificaciones bancarias sospechosas, enlaces sospechosos
- "sistema": confirmaciones de reenvío, notificaciones de hosting, emails automáticos de servicios
- "marketing": boletines, promociones, cursos, publicidad

Respondé solo JSON: {"category": "...", "reason": "breve explicación"}`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 150,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.log(`[email-inbound] Classify failed: ${res.status}`);
    return { category: "sistema", reason: "classification_error" };
  }
  const data = await res.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return { category: "sistema", reason: "parse_error" };
  }
}

async function callAiAgent(
  userEmail: string,
  message: string,
  subject: string
): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      message: `Correo entrante — Asunto: ${subject}\n\n${message}`,
      user_email: userEmail,
      channel: "email",
      history: [],
      client_memory: {},
    }),
  });

  if (!res.ok) {
    console.log(`[email-inbound] ai-agent call failed: ${res.status}`);
    return "Gracias por escribir a BienCuidar. Recibimos tu correo y te responderemos pronto. Para urgencias, escribinos a info@agtisa.com";
  }
  const data = await res.json();
  return data.reply || "Gracias por escribir a BienCuidar. Te responderemos pronto.";
}

async function sendReply(to: string, subject: string, replyText: string): Promise<boolean> {
  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1e293b;">
  <p>${replyText.replace(/\n/g, "<br>")}</p>
  <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">BienCuidar — Plataforma de enfermería en El Salvador<br>info@agtisa.com</p>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: SENDER_EMAIL,
      to,
      subject: `Re: ${subject}`,
      html,
    }),
  });

  if (!res.ok) {
    console.log(`[email-inbound] Reply send failed: ${res.status} ${await res.text()}`);
    return false;
  }
  console.log(`[email-inbound] Reply sent to ${to}`);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const event: ResendWebhookEvent = await req.json();

    if (event.type !== "email.received") {
      return new Response(JSON.stringify({ ok: true, skipped: "not email.received" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { email_id, from, subject } = event.data;
    console.log(`[email-inbound] === START | from: ${from} | subject: ${subject}`);

    // 1. Verificar si el remitente está registrado en BienCuidar
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, role")
      .eq("email", from)
      .single();

    if (!profile) {
      console.log(`[email-inbound] Sender not registered: ${from} — discarding`);
      return new Response(JSON.stringify({ ok: true, action: "discarded", reason: "not_registered" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`[email-inbound] Registered user: ${profile.full_name} (${profile.role})`);

    // 2. Obtener contenido del correo
    const emailContent = await getEmailContent(email_id);
    const bodyText = emailContent.text || stripHtml(emailContent.html);

    if (!bodyText && !emailContent.subject) {
      console.log(`[email-inbound] Empty email body — discarding`);
      return new Response(JSON.stringify({ ok: true, action: "discarded", reason: "empty_body" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 3. Clasificar el correo
    const classification = await classifyEmail(from, subject, bodyText);
    console.log(`[email-inbound] Classification: ${classification.category} — ${classification.reason}`);

    if (classification.category !== "consulta") {
      console.log(`[email-inbound] Not a consulta (${classification.category}) — discarding`);
      return new Response(JSON.stringify({
        ok: true,
        action: "discarded",
        reason: classification.category,
        classification,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 4. Es una consulta legítima — llamar al ai-agent
    const reply = await callAiAgent(profile.email, bodyText, subject);
    console.log(`[email-inbound] ai-agent reply: ${reply.slice(0, 100)}`);

    // 5. Enviar respuesta por email
    const sent = await sendReply(from, subject, reply);

    console.log(`[email-inbound] === END | sent: ${sent}`);
    return new Response(JSON.stringify({
      ok: true,
      action: "replied",
      user: profile.full_name,
      classification,
      sent,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Error desconocido";
    console.log(`[email-inbound] === EXCEPTION: ${errMsg}`);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
