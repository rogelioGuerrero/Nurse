// @ts-nocheck — Deno Edge Function (runs on Supabase, not Node.js)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

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

    console.log(`[stt] Audio received: ${audioFile.name} | size: ${audioFile.size} bytes | type: ${audioFile.type}`);

    // Forward to Groq Whisper API
    const groqFormData = new FormData();
    groqFormData.append("file", audioFile, audioFile.name || "audio.webm");
    groqFormData.append("model", "whisper-large-v3-turbo");
    groqFormData.append("language", "es");
    groqFormData.append("response_format", "json");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: groqFormData,
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error(`[stt] Groq Whisper error: ${groqRes.status} | ${errText.slice(0, 300)}`);
      return new Response(
        JSON.stringify({ error: `Groq Whisper error: ${groqRes.status}`, details: errText.slice(0, 200) }),
        { status: groqRes.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = await groqRes.json();
    const transcript = data.text || "";

    console.log(`[stt] Transcription OK | text: "${transcript.slice(0, 100)}"`);

    return new Response(
      JSON.stringify({ text: transcript }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
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
