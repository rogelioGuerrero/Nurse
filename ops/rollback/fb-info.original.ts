import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const FB_PAGE_ID = Deno.env.get("FB_PAGE_ID");
const FB_PAGE_TOKEN = Deno.env.get("FB_PAGE_TOKEN");
const FB_API_VERSION = "v18.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // 1. Get page info
    const pageRes = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${FB_PAGE_ID}?fields=name,category,about,link,followers_count&access_token=${FB_PAGE_TOKEN}`
    );
    const pageData = await pageRes.json();

    // 2. Try to get groups where page is a member
    const groupsRes = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${FB_PAGE_ID}/groups?fields=id,name,description,member_count,link,privacy&access_token=${FB_PAGE_TOKEN}`
    );
    const groupsData = await groupsRes.json();

    // 3. Also try /me/accounts to see what pages we manage
    const accountsRes = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/me?fields=id,name,accounts&access_token=${FB_PAGE_TOKEN}`
    );
    const accountsData = await accountsRes.json();

    // 4. Try liked pages
    const likesRes = await fetch(
      `https://graph.facebook.com/${FB_API_VERSION}/${FB_PAGE_ID}/likes?fields=id,name,category,link&access_token=${FB_PAGE_TOKEN}`
    );
    const likesData = await likesRes.json();

    return new Response(JSON.stringify({
      page: pageData,
      groups: groupsData,
      accounts: accountsData,
      likes: likesData,
    }, null, 2), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
