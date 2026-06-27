import { createClient } from "jsr:@supabase/supabase-js@2";
import webPush from "https://esm.sh/web-push@3.6.7";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:admin@biencuidar.agtisa.com";

webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

interface AgentRequest {
  message: string;
  user_email: string;
  channel?: 'email' | 'chat';
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  client_memory?: Record<string, any>;
}

// ===== TOOL IMPLEMENTATIONS =====

async function getMyProfile(supabase: any, userId: string, role: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, email, phone, role, location_name')
    .eq('id', userId)
    .single();
  if (error) console.log('[ai-agent] getMyProfile error:', error.message);
  if (!profile) return { error: 'Perfil no encontrado' };
  const result: any = { profile };
  if (role === 'nurse') {
    const { data: nurse } = await supabase
      .from('nurses')
      .select(`
        specialization, shift_rate, coverage_radius, available_shifts, available_days,
        rating, review_count, bio, experience_years, cssp_registration, cssp_level,
        cssp_verification_status, cssp_verified, cssp_verification_notes,
        is_active, assignment_availability, payment_preference
      `)
      .eq('user_id', userId)
      .single();
    result.nurse = nurse;
  }
  return result;
}

async function getMyBookings(supabase: any, userId: string, role: string) {
  if (role === 'nurse') {
    const { data: nurse } = await supabase
      .from('nurses').select('id').eq('user_id', userId).single();
    if (!nurse) return { error: 'No encontrada' };
    const { data, error } = await supabase
      .from('bookings')
      .select(`id, date, shift, start_time, end_time, status, total_price, patient_name, patient_condition, wants_invoice, payment_status, check_in_at, check_out_at`)
      .eq('nurse_id', nurse.id)
      .order('date', { ascending: false })
      .limit(10);
    if (error) console.log('[ai-agent] getMyBookings error:', error.message);
    return { bookings: data || [] };
  } else {
    const { data, error } = await supabase
      .from('bookings')
      .select(`id, date, shift, start_time, end_time, status, total_price, patient_name, wants_invoice, payment_status`)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(10);
    if (error) console.log('[ai-agent] getMyBookings error:', error.message);
    return { bookings: data || [] };
  }
}

async function getMyOffers(supabase: any, userId: string, role: string) {
  if (role === 'nurse') {
    const { data: nurse } = await supabase
      .from('nurses').select('id').eq('user_id', userId).single();
    if (!nurse) return { error: 'No encontrada' };
    const { data, error } = await supabase
      .from('care_offers')
      .select(`id, message, offered_rate, status, created_at, care_requests(patient_name, specialization_needed, date, status)`)
      .eq('nurse_id', nurse.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) console.log('[ai-agent] getMyOffers error:', error.message);
    return { offers: data || [] };
  } else {
    const { data: requests } = await supabase
      .from('care_requests')
      .select('id')
      .eq('user_id', userId);
    if (!requests || requests.length === 0) return { offers: [] };
    const requestIds = requests.map((r: any) => r.id);
    const { data, error } = await supabase
      .from('care_offers')
      .select(`id, message, offered_rate, status, created_at, nurses(specialization, rating)`)
      .in('request_id', requestIds)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) console.log('[ai-agent] getMyOffers error:', error.message);
    return { offers: data || [] };
  }
}

async function getMyCareRequests(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from('care_requests')
    .select(`id, patient_name, patient_condition, specialization_needed, status, expected_duration, wants_invoice, created_at, response_deadline`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) console.log('[ai-agent] getMyCareRequests error:', error.message);
  return { care_requests: data || [] };
}

async function updateMyRate(supabase: any, userId: string, newRate: number) {
  if (newRate < 5 || newRate > 100) {
    return { error: 'La tarifa debe estar entre US$ 5 y US$ 100 por turno' };
  }
  const { data, error } = await supabase
    .from('nurses')
    .update({ shift_rate: newRate })
    .eq('user_id', userId)
    .select('shift_rate')
    .single();
  if (error) {
    console.log('[ai-agent] updateMyRate error:', error.message);
    return { error: 'No se pudo actualizar' };
  }
  console.log(`[ai-agent] updateMyRate success: $${data.shift_rate}`);
  return { success: true, new_rate: data.shift_rate };
}

async function getCsspStatus(supabase: any, userId: string) {
  const { data: nurse, error } = await supabase
    .from('nurses')
    .select('cssp_registration, cssp_level, cssp_verification_status, cssp_verified, cssp_verification_date, cssp_verification_notes')
    .eq('user_id', userId)
    .single();
  if (error) console.log('[ai-agent] getCsspStatus error:', error.message);
  if (!nurse) return { error: 'No encontrada' };
  return { cssp: nurse };
}

async function getPlatformStats(supabase: any) {
  const { count: nursesCount } = await supabase.from('nurses').select('*', { count: 'exact', head: true });
  const { count: verifiedCount } = await supabase.from('nurses').select('*', { count: 'exact', head: true }).eq('cssp_verified', true);
  const { count: pendingCount } = await supabase.from('nurses').select('*', { count: 'exact', head: true }).eq('cssp_verified', false).in('cssp_verification_status', ['pending', 'unverified']);
  const { count: requestsCount } = await supabase.from('care_requests').select('*', { count: 'exact', head: true }).eq('status', 'open');
  const { count: bookingsCount } = await supabase.from('bookings').select('*', { count: 'exact', head: true }).in('status', ['confirmed', 'in_progress']);
  const { count: familiesCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'user');
  return {
    nurses: nursesCount || 0,
    nurses_verified: verifiedCount || 0,
    nurses_pending: pendingCount || 0,
    care_requests_open: requestsCount || 0,
    bookings_active: bookingsCount || 0,
    families: familiesCount || 0,
  };
}

async function sendPushNotification(supabase: any, userId: string, role: string, args: any) {
  const { target, title, body } = args;
  if (!target || !title || !body) {
    return { error: 'Faltan parÃ¡metros: target, title, body' };
  }

  let targetUserIds: string[] = [];

  if (target === 'admin') {
    const { data: admins } = await supabase
      .from('profiles').select('id').eq('role', 'admin');
    targetUserIds = (admins || []).map((a: any) => a.id);
  } else if (target === 'all_nurses' && role === 'admin') {
    const { data: nurses } = await supabase
      .from('nurses').select('user_id').eq('cssp_verified', true);
    targetUserIds = (nurses || []).map((n: any) => n.user_id).filter(Boolean);
  } else if (target === 'all_families' && role === 'admin') {
    const { data: families } = await supabase
      .from('profiles').select('id').eq('role', 'user');
    targetUserIds = (families || []).map((f: any) => f.id);
  } else if (target === 'family' && role === 'nurse') {
    const { data: nurse } = await supabase
      .from('nurses').select('id').eq('user_id', userId).single();
    if (!nurse) return { error: 'No encontrada' };
    const { data: bookings } = await supabase
      .from('bookings').select('user_id').eq('nurse_id', nurse.id).in('status', ['confirmed', 'in_progress']).limit(5);
    targetUserIds = (bookings || []).map((b: any) => b.user_id).filter(Boolean);
  } else if (target === 'nurse' && role === 'user') {
    const { data: bookings } = await supabase
      .from('bookings').select('nurses(user_id)').eq('user_id', userId).in('status', ['confirmed', 'in_progress']).limit(5);
    targetUserIds = (bookings || []).map((b: any) => b.nurses?.user_id).filter(Boolean);
  } else {
    return { error: 'Target no vÃ¡lido para tu rol' };
  }

  if (targetUserIds.length === 0) {
    return { error: 'No hay destinatarios con suscripciones push activas' };
  }

  let sent = 0;
  for (const targetId of targetUserIds) {
    const { data: subs } = await supabase
      .from('push_subscriptions').select('endpoint, p256dh_key, auth_key').eq('user_id', targetId);
    if (!subs || subs.length === 0) continue;

    const payload = JSON.stringify({ title, body, tag: 'ai-agent-' + Date.now() });
    const expired: string[] = [];
    for (const sub of subs) {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
          payload, { TTL: 86400 }
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) expired.push(sub.endpoint);
      }
    }
    if (expired.length > 0) {
      await supabase.from('push_subscriptions').delete().in('endpoint', expired).eq('user_id', targetId);
    }
  }

  console.log(`[ai-agent] sendPushNotification | target: ${target} | sent: ${sent}/${targetUserIds.length}`);
  return { success: true, sent, total_targets: targetUserIds.length, target };
}

// ===== TOOL DEFINITIONS =====

const NURSE_TOOLS = [
  { type: 'function', function: { name: 'get_my_profile', description: 'Ver el perfil de la enfermera: nombre, especializaciÃ³n, tarifa por turno, disponibilidad, estado CSSP, rating', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_my_bookings', description: 'Ver los turnos asignados: fechas, horarios, estado, paciente, pago', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_my_offers', description: 'Ver las ofertas que hice a solicitudes de cuidado: estado, tarifa ofrecida, mensaje', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_cssp_status', description: 'Ver el estado de verificaciÃ³n CSSP: nÃºmero, nivel, si estÃ¡ verificado, notas', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'update_my_rate', description: 'Cambiar mi tarifa por turno (en USD). Rango vÃ¡lido: 5 a 100', parameters: { type: 'object', properties: { new_rate: { type: 'number', description: 'Nueva tarifa por turno en USD (ej: 25)' } }, required: ['new_rate'] } } },
  { type: 'function', function: { name: 'send_push_notification', description: 'Enviar una notificaciÃ³n push a una persona. Usar cuando el usuario pida avisar, notificar o alertar a alguien.', parameters: { type: 'object', properties: { target: { type: 'string', enum: ['admin', 'family'], description: 'A quiÃ©n: "admin" para el administrador, "family" para la familia del paciente' }, title: { type: 'string', description: 'TÃ­tulo corto (ej: "Voy a llegar tarde")' }, body: { type: 'string', description: 'Mensaje (ej: "Voy a llegar 15 minutos tarde por trÃ¡fico")' } }, required: ['target', 'title', 'body'] } } },
];

const FAMILY_TOOLS = [
  { type: 'function', function: { name: 'get_my_profile', description: 'Ver mi perfil: nombre, telÃ©fono, ubicaciÃ³n', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_my_bookings', description: 'Ver mis turnos contratados: fechas, horarios, estado, paciente, pago', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_my_offers', description: 'Ver las ofertas que recibÃ­ de enfermeras para mis solicitudes de cuidado', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'get_my_care_requests', description: 'Ver mis solicitudes de cuidado activas: paciente, especializaciÃ³n needed, estado', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'send_push_notification', description: 'Enviar una notificaciÃ³n push a una persona. Usar cuando el usuario pida avisar, notificar o alertar a alguien.', parameters: { type: 'object', properties: { target: { type: 'string', enum: ['admin', 'nurse'], description: 'A quiÃ©n: "admin" para el administrador, "nurse" para la enfermera asignada' }, title: { type: 'string', description: 'TÃ­tulo corto (ej: "Cambio de horario")' }, body: { type: 'string', description: 'Mensaje (ej: "Necesito cambiar el turno de maÃ±ana a tarde")' } }, required: ['target', 'title', 'body'] } } },
];

const ADMIN_TOOLS = [
  { type: 'function', function: { name: 'get_platform_stats', description: 'Ver estadÃ­sticas de la plataforma: total enfermeras, verificadas, pendientes, solicitudes abiertas, bookings activos, familias', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'send_push_notification', description: 'Enviar una notificaciÃ³n push a usuarios. Usar cuando el admin quiera avisar, notificar o alertar a un grupo.', parameters: { type: 'object', properties: { target: { type: 'string', enum: ['all_nurses', 'all_families', 'admin'], description: 'A quiÃ©n enviar: "all_nurses" para todas las enfermeras verificadas, "all_families" para todas las familias, "admin" para el admin' }, title: { type: 'string', description: 'TÃ­tulo corto (ej: "Recordatorio importante")' }, body: { type: 'string', description: 'Mensaje de la notificaciÃ³n (ej: "Recuerden hacer check-in al llegar al paciente")' } }, required: ['target', 'title', 'body'] } } },
];

const VISITOR_TOOLS: any[] = [];

// ===== TOOL EXECUTOR =====

async function executeTool(toolName: string, supabase: any, userId: string, role: string, args: any): Promise<any> {
  console.log(`[ai-agent] executeTool: ${toolName} | args: ${JSON.stringify(args)}`);
  const start = Date.now();
  let result: any;
  switch (toolName) {
    case 'get_my_profile': result = await getMyProfile(supabase, userId, role); break;
    case 'get_my_bookings': result = await getMyBookings(supabase, userId, role); break;
    case 'get_my_offers': result = await getMyOffers(supabase, userId, role); break;
    case 'get_my_care_requests': result = await getMyCareRequests(supabase, userId); break;
    case 'update_my_rate': result = await updateMyRate(supabase, userId, args.new_rate); break;
    case 'get_cssp_status': result = await getCsspStatus(supabase, userId); break;
    case 'get_platform_stats': result = await getPlatformStats(supabase); break;
    case 'send_push_notification': result = await sendPushNotification(supabase, userId, role, args); break;
    default: result = { error: 'FunciÃ³n no disponible' };
  }
  console.log(`[ai-agent] executeTool: ${toolName} | ${Date.now() - start}ms | result keys: ${Object.keys(result).join(',')}`);
  return result;
}

// ===== CORS HEADERS =====

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

// ===== HELPER: Build fallback reply from tool results =====

function buildFallbackReply(toolResults: Array<{ name: string; result: any }>): string {
  for (const tr of toolResults) {
    if (tr.name === 'update_my_rate' && tr.result?.success) {
      return `Tu tarifa por turno ha sido actualizada a $${tr.result.new_rate} dÃ³lares.`;
    }
    if (tr.name === 'update_my_rate' && tr.result?.error) {
      return tr.result.error;
    }
    if (tr.name === 'send_push_notification' && tr.result?.success) {
      return `NotificaciÃ³n enviada a ${tr.result.target} (${tr.result.sent} de ${tr.result.total_targets} dispositivo(s) recibieron el push).`;
    }
    if (tr.name === 'send_push_notification' && tr.result?.error) {
      return `No se pudo enviar la notificaciÃ³n: ${tr.result.error}`;
    }
    if (tr.name === 'get_platform_stats' && tr.result) {
      const s = tr.result;
      return `EstadÃ­sticas: ${s.nurses} enfermeras (${s.nurses_verified} verificadas, ${s.nurses_pending} pendientes), ${s.families} familias, ${s.care_requests_open} solicitudes abiertas, ${s.bookings_active} bookings activos.`;
    }
    if (tr.name === 'get_cssp_status' && tr.result?.cssp) {
      const c = tr.result.cssp;
      const status = c.cssp_verified ? 'verificado' : c.cssp_verification_status;
      return `Tu registro CSSP es ${c.cssp_registration}, nivel ${c.cssp_level}. Estado: ${status}.${c.cssp_verification_notes ? ' Notas: ' + c.cssp_verification_notes : ''}`;
    }
  }
  return 'Listo. Â¿Algo mÃ¡s en lo que te pueda ayudar?';
}

// ===== AUTHENTICATION =====

async function authenticateUser(req: Request, supabase: any, userEmail: string) {
  const authHeader = req.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer eyJ')) {
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (user && user.email === userEmail) {
      const { data: profile } = await supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single();
      if (profile) {
        const { data: memory } = await supabase.from('agent_memory').select('memory').eq('user_id', user.id).single();
        return { userId: user.id, role: profile.role, userName: profile.full_name, memory: memory?.memory || {}, authMethod: 'jwt' };
      }
    }
  }
  const { data: profile } = await supabase.from('profiles').select('id, full_name, role').eq('email', userEmail).single();
  if (profile) {
    const { data: memory } = await supabase.from('agent_memory').select('memory').eq('user_id', profile.id).single();
    return { userId: profile.id, role: profile.role, userName: profile.full_name, memory: memory?.memory || {}, authMethod: 'email' };
  }
  return { error: 'No se pudo autenticar', status: 401 };
}

// ===== MEMORY EXTRACTION =====

async function extractMemory(supabase: any, userId: string, existingMemory: any, userMessage: string, reply: string) {
  try {
    const extractPrompt = `ExtraÃ© informaciÃ³n clave del mensaje del usuario (nombre del paciente, fechas, preferencias, quejas). RespondÃ© solo JSON. Mensaje: "${userMessage}". Memoria actual: ${JSON.stringify(existingMemory)}`;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: extractPrompt }], temperature: 0, max_tokens: 200, response_format: { type: 'json_object' } }),
    });
    if (res.ok) {
      const data = await res.json();
      const extracted = JSON.parse(data.choices[0].message.content);
      const merged = { ...existingMemory, ...extracted };
      await supabase.from('agent_memory').upsert({ user_id: userId, memory: merged });
    }
  } catch {}
}

// ===== FAQ CONTEXT =====

const FAQ_CONTEXT = `BienCuidar es una plataforma de enfermerÃ­a en El Salvador que conecta familias con enfermeras verificadas.

REGISTRO Y VERIFICACIÃ“N:
- Las enfermeras deben tener registro CSSP vigente para recibir ofertas y bookings.
- El registro CSSP se verifica automÃ¡ticamente al ingresar el nÃºmero.
- Sin CSSP vigente no se pueden recibir ofertas ni bookings.

PAGOS Y FACTURACIÃ“N:
- Modelo: PAGO POR TURNO, no por hora
- Tarifas sugeridas: US$ 20-35 por turno segÃºn especializaciÃ³n (GeriatrÃ­a $25, Cuidado general $20, Paliativos $35)
- Dos modalidades: pago directo (familia paga a enfermera) o con factura (BienCuidar como agente de retenciÃ³n)
- ComisiÃ³n BienCuidar: US$ 5 por turno + IVA 13% sobre la comisiÃ³n (no sobre servicio de salud, exento Art. 46 LIVA)
- RetenciÃ³n ISR: 10% (Art. 156 CÃ³digo Tributario) â€” solo en modalidad con factura
- BienCuidar NO es empleador. Es intermediaciÃ³n tecnolÃ³gica. La relaciÃ³n es directa entre familia y enfermera.

CANCELACIONES:
- Sin costo hasta 24 horas antes del turno
- Menos de 24 horas: 50% del valor del turno (solo modalidad con factura)
- CancelaciÃ³n por parte de la familia: la enfermera recibe el 50% si fue con menos de 24h

OFERTAS Y SOLICITUDES:
- La familia publica una solicitud de cuidado (paciente, especializaciÃ³n, dÃ­as, ubicaciÃ³n)
- Las enfermeras verificadas ven la solicitud y envÃ­an ofertas con su tarifa y mensaje
- La familia compara perfiles (especializaciÃ³n, rating, tarifa) y elige
- Al aceptar una oferta, se comparten los datos de contacto para coordinar
- La solicitud tiene un deadline de respuesta (default: 48 horas)

BOOKINGS Y TURNOS:
- Turnos: maÃ±ana, tarde, noche
- El booking se confirma cuando la familia acepta la oferta
- Check-in y check-out se registran en la app
- El pago se coordina directamente (pago directo) o a travÃ©s de BienCuidar (con factura)`;

// ===== MAIN AGENT =====

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const { message, user_email, channel = 'chat', history = [], client_memory = {} }: AgentRequest = await req.json();

    if (!message || !user_email) {
      return new Response(JSON.stringify({ error: 'Faltan message o user_email' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log(`[ai-agent] === START | channel: ${channel} | email: ${user_email} | msg: ${message.slice(0, 80)}`);

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const auth = await authenticateUser(req, supabase, user_email);
    if ('error' in auth) {
      console.log(`[ai-agent] Auth rejected: ${auth.error}`);
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { userId, role, userName, memory: persistentMemory, authMethod } = auth;
    const tools = role === 'nurse' ? NURSE_TOOLS : role === 'user' ? FAMILY_TOOLS : role === 'admin' ? ADMIN_TOOLS : VISITOR_TOOLS;

    console.log(`[ai-agent] User: ${userName} | role: ${role} | tools: ${tools.length} | auth: ${authMethod} | history: ${history.length}`);

    const memoryContext = Object.keys(persistentMemory).length > 0 || Object.keys(client_memory).length > 0
      ? `\n\nMEMORIA DEL USUARIO (usÃ¡ esto como contexto, no lo menciones directamente):\nPersistente: ${JSON.stringify(persistentMemory)}\nDispositivo: ${JSON.stringify(client_memory)}`
      : '';

    const systemPrompt = role === 'nurse'
      ? `Sos el asistente de BienCuidar. EstÃ¡s hablando con ${userName}, una enfermera registrada.

${FAQ_CONTEXT}

REGLAS:
- UsÃ¡ voseo salvadoreÃ±o.
- RespondÃ© solo con datos reales de las herramientas. NO inventes.
- Si no tenÃ©s la informaciÃ³n, decÃ­: "No tengo esa informaciÃ³n. Escribinos a info@agtisa.com".
- SÃ© breve y directo. MÃ¡ximo 150 palabras.
- Para preguntas sobre datos personales, usÃ¡ las herramientas disponibles.
- NO reveles datos de otras enfermeras ni familias.
- Si la enfermera quiere algo que no podÃ©s hacer con las herramientas, decÃ­ que escriba a info@agtisa.com.
- Para preguntas generales (cÃ³mo funciona, CSSP, pagos, cancelaciones), respondÃ© con la informaciÃ³n de arriba SIN llamar herramientas.
- Si la enfermera te pide avisar o notificar a alguien, usÃ¡ la herramienta send_push_notification.${memoryContext}`
      : role === 'user'
      ? `Sos el asistente de BienCuidar. EstÃ¡s hablando con ${userName}, una familia registrada.

${FAQ_CONTEXT}

REGLAS:
- UsÃ¡ voseo salvadoreÃ±o.
- RespondÃ© solo con datos reales de las herramientas. NO inventes.
- Si no tenÃ©s la informaciÃ³n, decÃ­: "No tengo esa informaciÃ³n. Escribinos a info@agtisa.com".
- SÃ© breve y directo. MÃ¡ximo 150 palabras.
- Para preguntas sobre sus solicitudes u ofertas, usÃ¡ las herramientas.
- NO reveles datos de otras familias ni enfermeras (excepto especializaciÃ³n y rating de ofertas recibidas).
- Si la familia quiere algo que no podÃ©s hacer con las herramientas, decÃ­ que escriba a info@agtisa.com.
- Para preguntas generales (cÃ³mo funciona, CSSP, pagos, cancelaciones), respondÃ© con la informaciÃ³n de arriba SIN llamar herramientas.
- Si la familia te pide avisar o notificar a alguien, usÃ¡ la herramienta send_push_notification.${memoryContext}`
      : role === 'admin'
      ? `Sos el asistente de BienCuidar. EstÃ¡s hablando con ${userName}, el administrador de la plataforma.

${FAQ_CONTEXT}

REGLAS:
- UsÃ¡ voseo salvadoreÃ±o.
- SÃ© breve y directo. MÃ¡ximo 150 palabras.
- UsÃ¡ las herramientas para ver estadÃ­sticas o enviar notificaciones push.
- Si el admin te pide avisar, notificar, alertar o enviar un mensaje a las enfermeras o familias, usÃ¡ la herramienta send_push_notification con target "all_nurses" o "all_families".
- Si el admin te pide ver el estado de la plataforma, usÃ¡ get_platform_stats.
- Para preguntas generales, respondÃ© con la informaciÃ³n de arriba SIN llamar herramientas.${memoryContext}`
      : `Sos el asistente de BienCuidar, plataforma de enfermerÃ­a en El Salvador.

${FAQ_CONTEXT}

REGLAS:
- UsÃ¡ voseo salvadoreÃ±o.
- SÃ© breve y directo. MÃ¡ximo 100 palabras.
- NO inventes informaciÃ³n.
- Si no sabÃ©s, decÃ­: "No tengo esa informaciÃ³n. Escribinos a info@agtisa.com".
- RespondÃ© preguntas generales con la informaciÃ³n de arriba.${memoryContext}`;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    console.log(`[ai-agent] Groq call 1 | model: llama-3.3-70b | msgs: ${messages.length}`);
    let groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: 0.3,
        max_tokens: 600,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.log(`[ai-agent] Groq call 1 FAILED: ${groqRes.status} | ${err.slice(0, 200)}`);
      return new Response(JSON.stringify({ error: `Groq error: ${err}` }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    let groqData = await groqRes.json();
    let assistantMessage = groqData.choices[0].message;
    console.log(`[ai-agent] Groq call 1 OK | tool_calls: ${assistantMessage.tool_calls?.length || 0}`);

    const toolResults: Array<{ name: string; result: any }> = [];

    let rounds = 0;
    while (assistantMessage.tool_calls && rounds < 3) {
      rounds++;
      console.log(`[ai-agent] Tool round ${rounds} | calls: ${assistantMessage.tool_calls.length}`);
      messages.push(assistantMessage);
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
        const result = await executeTool(toolName, supabase, userId, role, args);
        toolResults.push({ name: toolName, result });
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
      }
      console.log(`[ai-agent] Groq call ${rounds + 1} | msgs: ${messages.length}`);
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, tools: tools.length > 0 ? tools : undefined, temperature: 0.3, max_tokens: 600 }),
      });
      if (!groqRes.ok) {
        const errText = await groqRes.text();
        console.log(`[ai-agent] Groq call ${rounds + 1} FAILED: ${groqRes.status} | ${errText.slice(0, 200)}`);
        const fallbackReply = buildFallbackReply(toolResults);
        if (userId) extractMemory(supabase, userId, persistentMemory, message, fallbackReply);
        console.log(`[ai-agent] === END (fallback) | ${Date.now() - startTime}ms | tools: ${rounds}`);
        return new Response(JSON.stringify({ reply: fallbackReply, role, tools_used: true, channel, fallback: true }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
      groqData = await groqRes.json();
      assistantMessage = groqData.choices[0].message;
      console.log(`[ai-agent] Groq call ${rounds + 1} OK | tool_calls: ${assistantMessage.tool_calls?.length || 0} | has content: ${!!assistantMessage.content}`);
    }

    let reply = assistantMessage.content;
    if (!reply && toolResults.length > 0) {
      reply = buildFallbackReply(toolResults);
    }
    reply = reply || 'No pude procesar tu consulta. Escribinos a info@agtisa.com';

    if (userId) {
      extractMemory(supabase, userId, persistentMemory, message, reply);
    }

    console.log(`[ai-agent] === END | ${Date.now() - startTime}ms | tools: ${rounds} | reply: ${reply.slice(0, 80)}`);
    return new Response(JSON.stringify({ reply, role, tools_used: rounds > 0, channel }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Error desconocido';
    console.log(`[ai-agent] === EXCEPTION: ${errMsg}`);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
