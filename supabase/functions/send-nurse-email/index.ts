const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

interface NurseEmailRequest {
  nurse_name: string;
  nurse_email: string;
  cssp_registration: string;
  cssp_level: string;
  template_type: string;
  problem_detail: string;
  used_variant?: string;
  days_inactive?: number;
}

function wrap(body: string): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #1e293b; line-height: 1.6;">
  <div style="background: #0d9488; border-radius: 8px 8px 0 0; padding: 20px 24px;">
    <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 600;">BienCuidar</p>
    <p style="margin: 4px 0 0; color: #99f6e4; font-size: 13px;">Plataforma de cuidado de salud en El Salvador</p>
  </div>
  <div style="background: #f8fafc; border-radius: 0 0 8px 8px; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
    ${body}
  </div>
  <p style="text-align: center; font-size: 12px; color: #94a3b8; margin: 16px 0 0;">info@agtisa.com — El Salvador</p>
</div>`;
}

function box(color: string, text: string): string {
  const styles: Record<string, string> = {
    warning: "background: #fef3c7; border-left: 3px solid #f59e0b; color: #92400e;",
    alert: "background: #fee2e2; border-left: 3px solid #dc2626; color: #991b1b;",
    success: "background: #d1fae5; border-left: 3px solid #059669; color: #065f46;",
  };
  return `<div style="${styles[color] || styles.warning} border-radius: 4px; padding: 12px 16px; margin: 0 0 16px;">
    <p style="margin: 0; font-size: 14px;">${text}</p>
  </div>`;
}

function steps(): string {
  return `<ol style="margin: 0 0 16px; padding-left: 20px; font-size: 15px; color: #1e293b;">
    <li style="margin-bottom: 4px;">Ingresá a <a href="https://biencuidar.agtisa.com" style="color: #0d9488; text-decoration: none; font-weight: 500;">biencuidar.agtisa.com</a></li>
    <li style="margin-bottom: 4px;">Andá a la sección <strong>"Mi Perfil"</strong></li>
    <li style="margin-bottom: 4px;">Corregí tu número CSSP</li>
  </ol>`;
}

function help(): string {
  return `<p style="margin: 0 0 16px; font-size: 15px;">Si tenés alguna duda, respondé a este correo y te ayudamos con gusto.</p>`;
}

function sign(): string {
  return `<p style="margin: 0; font-size: 14px; color: #64748b;">Saludos,<br><strong>Equipo BienCuidar</strong></p>`;
}

function p(text: string): string {
  return `<p style="margin: 0 0 16px; font-size: 15px;">${text}</p>`;
}

// ===== 7 TEMPLATES =====

function cssp_discrepancy(n: NurseEmailRequest): string {
  const f = n.nurse_name.split(" ")[0];
  return wrap(`
    ${p(`Hola ${f},`)}
    ${p(`Necesitamos tu ayuda para completar la verificación de tu número de registro CSSP <strong>${n.cssp_registration}</strong> en nuestra plataforma.`)}
    ${box("warning", `<strong>Detalle:</strong> ${n.problem_detail}`)}
    ${p(`Para que podás seguir recibiendo ofertas de trabajo, por favor:`)}
    ${steps()}
    ${help()}
    ${sign()}`);
}

function cssp_variant(n: NurseEmailRequest): string {
  const f = n.nurse_name.split(" ")[0];
  return wrap(`
    ${p(`Hola ${f},`)}
    ${p(`¡Buenas noticias! Tu registro CSSP fue verificado exitosamente.`)}
    ${box("success", `Tu número fue verificado usando el formato <strong>${n.used_variant}</strong>. Para mantener tu perfil actualizado, por favor usá este formato en tu registro.`)}
    ${p(`Para actualizarlo:`)}
    ${steps()}
    ${help()}
    ${sign()}`);
}

function cssp_not_found(n: NurseEmailRequest): string {
  const f = n.nurse_name.split(" ")[0];
  return wrap(`
    ${p(`Hola ${f},`)}
    ${p(`Estamos intentando verificar tu número de registro CSSP <strong>${n.cssp_registration}</strong>, pero no lo encontramos en el portal del CSSP.`)}
    ${box("warning", `El número <strong>${n.cssp_registration}</strong> no aparece en el portal. Es posible que haya un error de tipeo o que el formato no sea el correcto.`)}
    ${p(`Para que podás seguir recibiendo ofertas de trabajo, por favor:`)}
    ${steps()}
    ${help()}
    ${sign()}`);
}

function cssp_reminder_second(n: NurseEmailRequest): string {
  const f = n.nurse_name.split(" ")[0];
  return wrap(`
    ${p(`Hola ${f},`)}
    ${p(`Te escribimos nuevamente porque tu número de registro CSSP <strong>${n.cssp_registration}</strong> aún no ha podido ser verificado.`)}
    ${box("warning", `<strong>Recordatorio:</strong> ${n.problem_detail}`)}
    ${p(`Sin un CSSP verificado, no podás recibir ofertas de trabajo a través de BienCuidar. Ya te habíamos notificado antes sobre este tema.`)}
    ${p(`Por favor, corregí tu registro cuanto antes:`)}
    ${steps()}
    ${help()}
    ${sign()}`);
}

function cssp_reminder_third(n: NurseEmailRequest): string {
  const f = n.nurse_name.split(" ")[0];
  return wrap(`
    ${p(`Hola ${f},`)}
    ${p(`Este es el <strong>último aviso</strong> sobre tu registro CSSP <strong>${n.cssp_registration}</strong>.`)}
    ${box("alert", `<strong>Urgente:</strong> ${n.problem_detail}`)}
    ${p(`Hemos enviado dos notificaciones anteriores y el problema persiste. Si no corregís tu registro en las próximas <strong>48 horas</strong>, tu cuenta en BienCuidar será desactivada y dejarás de aparecer en las búsquedas de familias.`)}
    ${p(`Evitá que esto pase. Corregí tu registro ahora:`)}
    ${steps()}
    ${p(`Si ya corregiste tu número, ignorá este correo. Si tenés alguna duda, respondé a este correo y te ayudamos con gusto.`)}
    ${sign()}`);
}

function inactivity_first(n: NurseEmailRequest): string {
  const f = n.nurse_name.split(" ")[0];
  const d = n.days_inactive || 15;
  return wrap(`
    ${p(`Hola ${f},`)}
    ${p(`Vimos que no has ingresado a BienCuidar en ${d} días. ¡Te extrañamos!`)}
    ${p(`Hay nuevas oportunidades de trabajo disponibles que podrían interesarte. Familias están buscando enfermeras verificadas como vos.`)}
    ${p(`Ingresá a <a href="https://biencuidar.agtisa.com" style="color: #0d9488; text-decoration: none; font-weight: 500;">biencuidar.agtisa.com</a> para ver las ofertas disponibles y mantener tu perfil activo.`)}
    ${help()}
    ${sign()}`);
}

function inactivity_second(n: NurseEmailRequest): string {
  const f = n.nurse_name.split(" ")[0];
  const d = n.days_inactive || 30;
  return wrap(`
    ${p(`Hola ${f},`)}
    ${p(`Han pasado ${d} días desde tu último ingreso a BienCuidar. Queremos asegurarnos de que todo esté bien.`)}
    ${box("warning", `Tu perfil sigue activo, pero las familias buscan enfermeras que ingresan regularmente. Si no ingresás pronto, podrías perder oportunidades de trabajo.`)}
    ${p(`Ingresá a <a href="https://biencuidar.agtisa.com" style="color: #0d9488; text-decoration: none; font-weight: 500;">biencuidar.agtisa.com</a> para revisar tu perfil y ver las ofertas disponibles.`)}
    ${p(`Si ya no estás interesada en recibir ofertas, podés desactivar tu perfil desde "Mi Perfil". No pasa nada, acá estamos si cambiás de opinión.`)}
    ${help()}
    ${sign()}`);
}

const templates: Record<string, (n: NurseEmailRequest) => string> = {
  cssp_discrepancy,
  cssp_variant,
  cssp_not_found,
  cssp_reminder_second,
  cssp_reminder_third,
  inactivity_first,
  inactivity_second,
};

const subjects: Record<string, string> = {
  cssp_discrepancy: "Necesitamos verificar tu registro CSSP en BienCuidar",
  cssp_variant: "Tu registro CSSP fue verificado en BienCuidar",
  cssp_not_found: "Necesitamos verificar tu registro CSSP en BienCuidar",
  cssp_reminder_second: "Recordatorio: Actualizá tu registro CSSP en BienCuidar",
  cssp_reminder_third: "Último aviso: Actualizá tu registro CSSP en BienCuidar",
  inactivity_first: "Te extrañamos en BienCuidar",
  inactivity_second: "Seguimos esperándote en BienCuidar",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const nurse: NurseEmailRequest = await req.json();

    if (!nurse.nurse_email || !nurse.template_type) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos: nurse_email, template_type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const buildFn = templates[nurse.template_type];
    if (!buildFn) {
      return new Response(
        JSON.stringify({ error: `Template type "${nurse.template_type}" no existe. Disponibles: ${Object.keys(templates).join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const htmlBody = buildFn(nurse);
    const subject = subjects[nurse.template_type] || "Notificación de BienCuidar";

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BienCuidar <info@agtisa.com>",
        to: nurse.nurse_email,
        subject,
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
      JSON.stringify({ success: true, id: data.id, sent_to: nurse.nurse_email, template: nurse.template_type }),
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
