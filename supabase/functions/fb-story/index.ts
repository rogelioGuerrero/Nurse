// @ts-nocheck — This file runs in Deno (Supabase Edge Functions), not in the browser/Node context
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey, x-api-key",
  };
}

interface StoryRequest {
  imageBase64?: string;
  caption?: string;
}

async function uploadPhotoUnpublished(
  pageId: string,
  pageToken: string,
  base64Data: string,
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
        `Content-Disposition: form-data; name="published"\r\n\r\n` +
        `false\r\n` +
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="source"; filename="story.jpg"\r\n` +
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

async function publishPhotoStory(
  pageId: string,
  pageToken: string,
  photoId: string,
): Promise<string> {
  const body = new URLSearchParams();
  body.set("photo_id", photoId);
  body.set("access_token", pageToken);

  const response = await fetch(`${FB_GRAPH_URL}/${pageId}/photo_stories`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Facebook story publish error: ${response.status} - ${errText}`);
  }
  const data = await response.json();
  return data.post_id || data.id || JSON.stringify(data);
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
    const body: StoryRequest = await req.json();
    const pageId = Deno.env.get("FB_PAGE_ID");
    const pageToken = Deno.env.get("FB_PAGE_TOKEN");

    if (!pageId || !pageToken) {
      return new Response(
        JSON.stringify({ error: "FB_PAGE_ID y FB_PAGE_TOKEN deben estar configurados" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } },
      );
    }

    if (!body.imageBase64) {
      return new Response(
        JSON.stringify({ error: "Debe proporcionar 'imageBase64' (las stories requieren imagen)" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req.headers.get("Origin") || undefined) } },
      );
    }

    const caption = body.caption || "";

    // Paso 1: subir foto sin publicar
    const photoId = await uploadPhotoUnpublished(pageId, pageToken, body.imageBase64);

    // Paso 2: publicar como story
    const storyId = await publishPhotoStory(pageId, pageToken, photoId);

    return new Response(
      JSON.stringify({ success: true, storyId, photoId, message: "Story publicada (dura 24h)" }),
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
