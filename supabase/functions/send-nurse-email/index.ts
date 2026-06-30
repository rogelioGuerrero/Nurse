const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

interface NurseEmailRequest {
  nurse_name: string;
  nurse_email: string;
  cssp_registration: string;
  cssp_level: string;
  problem_type: string;
  problem_detail: string;
}

function buildBaseHtml(nurse: NurseEmailRequest): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1e293b;">
  <p>Hola ${nurse.nurse_name},</p>
  <p>Tenemos un detalle con tu número de registro CSSP <strong>${nurse.cssp_registration}</strong> en BienCuidar.</p>
  <p><strong>Qué pasó:</strong> ${nurse.problem_type}<br>${nurse.problem_detail}</p>
  <p>Por favor, ingresá a <a href="https://biencuidar.agtisa.com">biencuidar.agtisa.com</a>, andá a <strong>"Mi Perfil"</strong> y corregí tu número CSSP así podés seguir recibiendo ofertas de trabajo.</p>
  <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">BienCuidar — Plataforma de cuidado de salud en El Salvador<br>info@agtisa.com</p>
</div>`;
}

async function humanizeWithGroq(nurse: NurseEmailRequest, baseHtml: string): Promise<string> {
  const systemPrompt = `Sos el asistente de comunicaciones de BienCuidar. Reescribí el correo HTML para que suene empático y amable, sin cambiar la información.

REGLAS:
1. NO agregues información nueva. NO inventes nada.
2. Mantené todas las etiquetas HTML del original.
3. Tono empático y colaborativo, NO crítico ni acusatorio. La enfermera cometió un error inocente, ayúdala a corregirlo.
4. Usá voseo salvadoreño.
5. Máximo 120 palabras.
6. NO usés mayúsculas innecesarias (solo primera letra de oración y nombres propios).
7. Idioma: español por defecto. NO uses inglés a menos que sea estrictamente necesario.
8. NO menciones IA ni tecnología.
9. Devolvé solo el HTML, sin explicaciones.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Reescribí este correo más amable:\n\n${baseHtml}` },
      ],
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!res.ok) return baseHtml;
  const data = await res.json();
  return data.choices[0].message.content || baseHtml;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const nurse: NurseEmailRequest = await req.json();

    if (!nurse.nurse_email || !nurse.problem_type) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const baseHtml = buildBaseHtml(nurse);
    const htmlBody = await humanizeWithGroq(nurse, baseHtml);

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BienCuidar <info@agtisa.com>",
        to: nurse.nurse_email,
        subject: "Corregí tu registro CSSP en BienCuidar",
        html: htmlBody,
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      return new Response(
        JSON.stringify({ error: "Error al enviar", details: err }),
        { status: sendRes.status, headers: { "Content-Type": "application/json" } }
      );
    }

    const data = await sendRes.json();
    return new Response(
      JSON.stringify({ success: true, id: data.id, sent_to: nurse.nurse_email }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
