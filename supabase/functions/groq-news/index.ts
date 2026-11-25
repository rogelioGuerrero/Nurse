// Retired 2026-11-25: unused by the web app and local scripts; was an unauthenticated proxy. Original: ops/rollback/groq-news.original.ts
Deno.serve(() => new Response(JSON.stringify({ error: "Gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
