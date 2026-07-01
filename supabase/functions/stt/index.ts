// @ts-nocheck — Deno Edge Function (runs on Supabase, not Node.js)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;

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
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "No audio file provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Optional: prompt context and temperature from frontend
    const prompt = formData.get("prompt") as string | null;
    const temperature = parseFloat(formData.get("temperature") as string || "0.2");

    console.log(`[stt] Audio received: ${audioFile.name} | size: ${audioFile.size} bytes | type: ${audioFile.type} | prompt: ${prompt ? 'yes' : 'no'}`);

    let lastError: string | null = null;
    let lastStatus = 500;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const groqFormData = new FormData();
      groqFormData.append("file", audioFile, audioFile.name || "audio.webm");
      groqFormData.append("model", "whisper-large-v3-turbo");
      groqFormData.append("language", "es");
      groqFormData.append("response_format", "json");
      groqFormData.append("temperature", String(temperature));
      if (prompt) {
        groqFormData.append("prompt", prompt);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

      try {
        const groqRes = await fetch(GROQ_WHISPER_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: groqFormData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!groqRes.ok) {
          const errText = await groqRes.text();
          lastStatus = groqRes.status;
          lastError = `Groq error: ${groqRes.status} | ${errText.slice(0, 200)}`;
          console.error(`[stt] Groq Whisper error (attempt ${attempt + 1}): ${groqRes.status} | ${errText.slice(0, 300)}`);

          // Retry on rate limit or server errors
          if (attempt < MAX_RETRIES && (groqRes.status === 429 || groqRes.status >= 500)) {
            const backoff = 800 * (attempt + 1);
            console.log(`[stt] Retrying in ${backoff}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }

          return new Response(
            JSON.stringify({ error: `Groq Whisper error: ${groqRes.status}`, details: errText.slice(0, 200) }),
            { status: groqRes.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        const data = await groqRes.json();
        const transcript = data.text || "";

        console.log(`[stt] Transcription OK (attempt ${attempt + 1}) | text: "${transcript.slice(0, 100)}"`);

        return new Response(
          JSON.stringify({ text: transcript }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof DOMException && err.name === "AbortError") {
          lastError = "Groq timeout";
          lastStatus = 504;
          console.warn(`[stt] Groq timeout (attempt ${attempt + 1})`);
        } else {
          lastError = err instanceof Error ? err.message : "Error desconocido";
          console.error(`[stt] Fetch error (attempt ${attempt + 1}):`, lastError);
        }

        if (attempt < MAX_RETRIES) {
          const backoff = 800 * (attempt + 1);
          console.log(`[stt] Retrying in ${backoff}ms...`);
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
      }
    }

    // All retries exhausted
    return new Response(
      JSON.stringify({ error: lastError || "Groq Whisper failed after retries" }),
      { status: lastStatus, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Error desconocido";
    console.error(`[stt] Exception: ${errMsg}`);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
