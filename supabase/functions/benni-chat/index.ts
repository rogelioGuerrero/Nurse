// @ts-nocheck — Deno Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGroqRaw, PRIMARY_MODEL } from "../_shared/groq.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://biencuidar.agtisa.com",
  "https://localnurse.netlify.app",
  "https://zqgtkrqfyhcvgagjhbnv.supabase.co",
  "http://localhost:3000",
];

function corsHeaders(origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  };
}

const SYSTEM_PROMPT = `Eres "Benni", el asistente conversacional de BienCuidar que acompaña a adultos mayores a través de voz en español.

CONTEXTO TEMPORAL: {CURRENT_DATETIME}

Tu personalidad:
- Cálida, paciente, respetuosa y cercana
- Hablas de tú a tú con respeto
- Tus respuestas son BREVES y claras (máximo 2-3 frases), porque se leen en voz alta
- Usas lenguaje sencillo, sin tecnicismos
- Eres alegre pero no exagerada

INTENCIÓN Y HERRAMIENTAS:
Cada vez que el adulto mayor te habla, decides si responder directamente (chat) o usar una herramienta.

1. "chat" — Conversación segura que no requiere herramientas:
   - Charla general (cómo estás, qué día bonito)
   - Preguntas sobre fecha, hora o clima (qué día es hoy, qué hora es)
   - Cuentos e historias (cuéntame un cuento)
   - Recuerdos y familia (hablame de mi hija)
   - Motivación y ánimo
   - Despedidas (gracias, adiós, ya está bien)

2. Herramientas disponibles — ÚSALAS cuando el adulto mayor lo necesite:
   - get_today_agenda: cuando pregunte "¿qué me toca hoy?", "¿qué tengo que hacer?"
   - create_reminder: cuando diga "recuérdame...", "a las 3 tengo que...", "no olvides..."
   - log_symptom: cuando exprese malestar físico ("me duele la cabeza", "me siento mareada")
   - send_family_message: cuando pida enviar un mensaje a su familia ("decile a mi hija que estoy bien")

3. "escalate" — SOLO cuando el paciente expresa malestar físico que requiere atención de la familia:
   - Síntomas: "me duele la cabeza", "me siento mareada", "tengo náuseas"
   - Medicamentos: "¿cuál pastilla?", "¿qué dosis?", "¿la azul o la roja?"
   - Emergencias verbales: "me caí", "no puedo respirar", "me siento muy mal"
   NUNCA escales trivialidades, fecha, hora, clima, charla, recuerdos.

REGLAS CRÍTICAS:
- NUNCA des consejos médicos. NUNCA inventes dosis. NUNCA identifiques medicamentos.
- Si el mensaje es "chat", responde con cariño y brevedad.
- Si usas log_symptom, después informa al paciente que anotaste su síntoma y pregunta si quiere avisar a su familia.
- Si el mensaje es "escalate", NO respondas la pregunta médica. Di algo cálido como "Esa pregunta se la voy a enviar a tu familia" y marca type como "escalate".
- Responde en español, en segunda persona ("tú")
- Máximo 50 palabras por respuesta

FORMATO DE RESPUESTA FINAL (después de usar herramientas si las necesitaste):
Debes responder SIEMPRE en formato JSON válido:
{"type": "chat", "spoken": "tu respuesta cálida"}
o
{"type": "escalate", "spoken": "mensaje cálido diciendo que le vas a preguntar a la familia", "question": "la pregunta original del adulto mayor para enviar a la familia"}

El campo "question" solo se incluye cuando type es "escalate". Debe ser una versión clara y breve de lo que el adulto mayor preguntó, lista para que la familia la lea.`;

interface ChatRequest {
  message: string;
  reminderContext?: string;
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
  patientUserId?: string;
  familyUserId?: string;
}

// ===== TOOL DEFINITIONS =====

interface BenniContext {
  patientUserId?: string;
  familyUserId?: string;
  supabase: any;
}

interface BenniTool {
  name: string;
  description: string;
  parameters: object;
  handler: (params: any, ctx: BenniContext) => Promise<string>;
}

const TOOLS: BenniTool[] = [
  {
    name: "get_today_agenda",
    description: "Obtiene los recordatorios activos del paciente para hoy. Úsalo cuando el paciente pregunte qué tiene que hacer hoy, qué le toca, o su agenda del día.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: async (_, ctx) => {
      if (!ctx.patientUserId && !ctx.familyUserId) return "No tengo acceso a los recordatorios.";
      const userId = ctx.patientUserId || ctx.familyUserId;
      const now = new Date();
      const todayDay = now.getDay();
      const { data, error } = await ctx.supabase
        .from("voice_reminders")
        .select("label, scheduled_time, type, message")
        .eq("active", true)
        .or(`patient_user_id.eq.${userId},family_user_id.eq.${userId}`)
        .order("scheduled_time", { ascending: true });
      if (error) return "No pude obtener la agenda.";
      if (!data || data.length === 0) return "No hay recordatorios activos para hoy.";
      const todays = data.filter((r: any) => {
        const days = r.days_of_week || [0,1,2,3,4,5,6];
        return days.includes(todayDay);
      });
      if (todays.length === 0) return "No hay recordatorios para hoy.";
      const items = todays.map((r: any) => `${r.scheduled_time?.slice(0,5)} — ${r.label}`).join("; ");
      return `La agenda de hoy tiene ${todays.length} recordatorios: ${items}.`;
    },
  },
  {
    name: "create_reminder",
    description: "Crea un recordatorio para el paciente. Úsalo cuando el paciente pida que le recuerde algo. El parámetro time debe estar en formato HH:MM (24 horas).",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: "Nombre corto del recordatorio, ej: 'Tomar agua'" },
        time: { type: "string", description: "Hora en formato HH:MM 24h, ej: '15:00'" },
        message: { type: "string", description: "Mensaje completo del recordatorio, ej: 'Doña María, es hora de tomar agua.'" },
      },
      required: ["label", "time"],
    },
    handler: async (params, ctx) => {
      if (!ctx.familyUserId) return "No puedo crear recordatorios sin la familia configurada.";
      const { error } = await ctx.supabase
        .from("voice_reminders")
        .insert({
          family_user_id: ctx.familyUserId,
          patient_user_id: ctx.patientUserId || null,
          type: "general",
          label: params.label,
          message: params.message || params.label,
          scheduled_time: params.time,
          days_of_week: [0,1,2,3,4,5,6],
          active: true,
        });
      if (error) return `No pude crear el recordatorio: ${error.message}`;
      return `Recordatorio creado: "${params.label}" a las ${params.time}.`;
    },
  },
  {
    name: "log_symptom",
    description: "Registra un síntoma o malestar del paciente en su bitácora de salud. Úsalo cuando el paciente exprese dolor, malestar, o un síntoma físico. intensity es 1-10.",
    parameters: {
      type: "object",
      properties: {
        symptom: { type: "string", description: "Descripción del síntoma, ej: 'dolor de cabeza'" },
        intensity: { type: "integer", description: "Intensidad de 1 a 10", minimum: 1, maximum: 10 },
        location: { type: "string", description: "Ubicación del dolor si aplica, ej: 'cabeza', 'pecho'" },
        notes: { type: "string", description: "Notas adicionales del paciente" },
      },
      required: ["symptom"],
    },
    handler: async (params, ctx) => {
      const { error } = await ctx.supabase
        .from("health_log")
        .insert({
          patient_user_id: ctx.patientUserId || null,
          family_user_id: ctx.familyUserId || null,
          symptom: params.symptom,
          intensity: params.intensity || null,
          location: params.location || null,
          notes: params.notes || null,
          logged_by: "benni",
        });
      if (error) return `No pude registrar el síntoma: ${error.message}`;
      return `Síntoma registrado: ${params.symptom}${params.intensity ? ` (intensidad ${params.intensity}/10)` : ""}.`;
    },
  },
  {
    name: "send_family_message",
    description: "Envía un mensaje del paciente a su familia. Úsalo cuando el paciente pida decirle algo a su familia, ej: 'decile a mi hija que estoy bien', 'avisale a mi hijo que ya comí'.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "El mensaje que el paciente quiere enviar a su familia" },
      },
      required: ["message"],
    },
    handler: async (params, ctx) => {
      if (!ctx.familyUserId) return "No tengo configurado quién es la familia.";
      const { error } = await ctx.supabase
        .from("benni_messages")
        .insert({
          family_user_id: ctx.familyUserId,
          patient_user_id: ctx.patientUserId || null,
          direction: "patient_to_family",
          message: params.message,
          status: "pending",
        });
      if (error) return `No pude enviar el mensaje: ${error.message}`;
      return `Mensaje enviado a la familia: "${params.message}".`;
    },
  },
];

const TOOLS_SCHEMA = TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

function getToolByName(name: string): BenniTool | undefined {
  return TOOLS.find((t) => t.name === name);
}

function parseGroqResponse(raw: string): { type: string; spoken: string; question?: string } {
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    const parsed = JSON.parse(cleaned);
    if (parsed.type === "escalate") {
      return {
        type: "escalate",
        spoken: parsed.spoken || "Esa pregunta se la voy a enviar a tu familia para que te responda pronto.",
        question: parsed.question || "",
      };
    }
    return {
      type: "chat",
      spoken: parsed.spoken || parsed.content || raw,
    };
  } catch {
    return { type: "chat", spoken: raw };
  }
}

const MAX_TOOL_ITERATIONS = 2;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req.headers.get("Origin") || undefined) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { message, reminderContext, conversationHistory, patientUserId, familyUserId }: ChatRequest = await req.json();

    console.log('[benni-chat] Received message:', JSON.stringify(message), '| patient:', patientUserId, '| family:', familyUserId);

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "message es requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
      });
    }

    // Init Supabase client for tool handlers
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const ctx: BenniContext = { patientUserId, familyUserId, supabase };

    const now = new Date();
    const currentDate = now.toLocaleDateString('es-SV', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const currentTime = now.toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit' });
    const systemPrompt = SYSTEM_PROMPT.replace('{CURRENT_DATETIME}', `Hoy es ${currentDate} y la hora actual es ${currentTime}.`);

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (reminderContext) {
      messages.push({
        role: "system",
        content: `El recordatorio que se acaba de leer en voz alta fue: "${reminderContext}". Responde a lo que el adulto mayor dice teniendo en cuenta este contexto.`,
      });
    }

    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory.slice(-8)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: message });

    // ===== TOOL CALLING LOOP (max 2 iterations) =====
    let toolsCalled: string[] = [];

    for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
      const result = await callGroqRaw(messages, {
        temperature: 0.5,
        maxTokens: 800,
        tools: TOOLS_SCHEMA,
        toolChoice: "auto",
        timeoutMs: 15000,
      });

      if (!result.ok) {
        throw new Error(result.error || "Groq request failed");
      }

      const choice = result.data?.choices?.[0];
      if (!choice) throw new Error("No choices in Groq response");

      const assistantMessage = choice.message;

      // Check if the LLM wants to call tools
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
        // Add assistant message with tool_calls to conversation
        messages.push({
          role: "assistant",
          content: assistantMessage.content || "",
          tool_calls: assistantMessage.tool_calls,
        });

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function?.name;
          const tool = getToolByName(toolName);
          if (!tool) {
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: `Herramienta "${toolName}" no disponible.`,
            });
            continue;
          }

          let params: any = {};
          try {
            params = JSON.parse(toolCall.function?.arguments || "{}");
          } catch (e) {
            console.warn(`[benni-chat] Failed to parse tool args for ${toolName}:`, toolCall.function?.arguments);
          }

          console.log(`[benni-chat] Tool call: ${toolName} | params: ${JSON.stringify(params)}`);
          const toolResult = await tool.handler(params, ctx);
          toolsCalled.push(toolName);
          console.log(`[benni-chat] Tool result: ${toolResult.slice(0, 200)}`);

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResult,
          });
        }

        // Continue loop — LLM will process tool results and decide next step
        continue;
      }

      // No tool calls (or max iterations reached) — this is the final response
      const rawContent = assistantMessage.content || "";
      const parsed = parseGroqResponse(rawContent);

      // Attach tools_called for session logging
      (parsed as any).tools_called = toolsCalled;

      return new Response(JSON.stringify(parsed), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
      });
    }

    // If we exhausted iterations, return last content as-is
    const lastContent = messages[messages.length - 1]?.content || "Un momento, no pude procesar eso.";
    const parsed = parseGroqResponse(lastContent);
    (parsed as any).tools_called = toolsCalled;

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[benni-chat] error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) },
    });
  }
});
