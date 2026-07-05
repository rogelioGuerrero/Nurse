// @ts-nocheck — This file runs in Deno (Supabase Edge Functions), not in the browser/Node context
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { callGroq } from "../_shared/groq.ts";

const FB_GRAPH_URL = "https://graph.facebook.com/v19.0";

const ALLOWED_ORIGINS = [
  "https://biencuidar.agtisa.com",
  "https://localnurse.netlify.app",
  "https://zqgtkrqfyhcvgagjhbnv.supabase.co",
];

function corsHeaders(origin?: string) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  };
}

interface PublishRequest {
  topic?: string;
  text?: string;
  generateText?: boolean;
  imageUrl?: string;
  imageBase64?: string;
}

async function generatePostText(topic: string): Promise<string> {
  const systemPrompt = `Sos el community manager de BienCuidar, una plataforma de intermediación que conecta familias que necesitan cuidado de salud en casa con enfermeras profesionales independientes en El Salvador.

Tu tarea es escribir un post para Facebook que sea:
- Cálido y cercano, dirigido a familias salvadoreñas
- Breve (máximo 3 párrafos, idealmente 2)
- Incluir un call to action suave (ej: "Publicá tu necesidad gratis en biencuidar.agtisa.com")
- En español, con tono profesional pero accesible
- Sin emojis excesivos (máximo 2)
- Sin hashtags excesivos (máximo 3)
- No usar cacofonía ni repetir "enfermería" cerca de "enfermeras"

Escribí solo el texto del post, sin explicaciones adicionales.`;

  return callGroq(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Escribí un post sobre: ${topic}` },
    ],
    { temperature: 0.7, maxTokens: 500 },
  );
}

async function uploadPhotoByUrl(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  const body = new URLSearchParams();
  body.set("url", imageUrl);
  body.set("caption", caption);
  body.set("access_token", pageToken);

  const response = await fetch(`${FB_GRAPH_URL}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Facebook photo upload error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.id;
}

async function publishTextOnly(
  pageId: string,
  pageToken: string,
  message: string,
): Promise<string> {
  const body = new URLSearchParams();
  body.set("message", message);
  body.set("access_token", pageToken);

  const response = await fetch(`${FB_GRAPH_URL}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Facebook publish error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.id;
}

async function publishTextWithPhoto(
  pageId: string,
  pageToken: string,
  message: string,
  imageUrl: string,
): Promise<string> {
  const photoId = await uploadPhotoByUrl(pageId, pageToken, imageUrl, message);
  return photoId;
}

async function uploadPhotoByBase64(
  pageId: string,
  pageToken: string,
  base64Data: string,
  caption: string,
): Promise<string> {
  const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const parts = [
    new TextEncoder().encode(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="access_token"\r\n\r\n` +
        `${pageToken}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="caption"\r\n\r\n` +
        `${caption}\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="source"; filename="ad.jpg\r\n` +
        `Content-Type: image/jpeg\r\n\r\n`
    ),
    bytes,
    new TextEncoder().encode(`\r\n--${boundary}--\r\n`),
  ];

  const body = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) { body.set(part, offset); offset += part.length; }

  const response = await fetch(`${FB_GRAPH_URL}/${pageId}/photos`, {
    method: "POST",
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Facebook photo upload error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req.headers.get("Origin") || undefined) });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método no permitido" }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const body: PublishRequest = await req.json();
    const pageId = Deno.env.get("FB_PAGE_ID");
    const pageToken = Deno.env.get("FB_PAGE_TOKEN");

    if (!pageId || !pageToken) {
      return new Response(
        JSON.stringify({ error: "FB_PAGE_ID y FB_PAGE_TOKEN deben estar configurados" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } },
      );
    }

    let postText = body.text || "";

    if (body.generateText && body.topic) {
      postText = await generatePostText(body.topic);
    }

    if (!postText && !body.topic) {
      return new Response(
        JSON.stringify({ error: "Debe proporcionar 'text' o 'topic' con 'generateText': true" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } },
      );
    }

    let postId: string;

    if (body.imageBase64) {
      postId = await uploadPhotoByBase64(pageId, pageToken, body.imageBase64, postText);
    } else if (body.imageUrl) {
      postId = await publishTextWithPhoto(pageId, pageToken, postText, body.imageUrl);
    } else {
      postId = await publishTextOnly(pageId, pageToken, postText);
    }

    const hasImage = !!(body.imageBase64 || body.imageUrl);
    return new Response(
      JSON.stringify({ success: true, postId, text: postText, hasImage }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error interno";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } },
    );
  }
});
