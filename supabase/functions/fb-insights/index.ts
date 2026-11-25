import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const FB_API = "https://graph.facebook.com/v19.0";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const pageId = Deno.env.get("FB_PAGE_ID");
  const pageToken = Deno.env.get("FB_PAGE_TOKEN");

  if (!pageId || !pageToken) {
    return new Response(JSON.stringify({ error: "Missing FB credentials" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // 1. Get last 25 posts
    const postsUrl = `${FB_API}/${pageId}/posts?fields=id,message,created_time,permalink_url&limit=25&access_token=${pageToken}`;
    const postsRes = await fetch(postsUrl);
    const postsData = await postsRes.json();

    if (!postsData.data) {
      return new Response(JSON.stringify({ error: "No posts found", raw: postsData }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. For each post, fetch insights
    const postsWithInsights = await Promise.all(
      postsData.data.map(async (post: any) => {
        try {
          const insightsUrl = `${FB_API}/${post.id}/insights?metric=post_impressions_unique,post_reactions_like_total,post_reactions_love_total&access_token=${pageToken}`;
          const insightsRes = await fetch(insightsUrl);
          const insightsData = await insightsRes.json();

          let impressions = 0;
          let likes = 0;
          let loves = 0;

          if (insightsData.data) {
            for (const metric of insightsData.data) {
              if (metric.name === "post_impressions_unique") {
                impressions = metric.values?.[0]?.value || 0;
              } else if (metric.name === "post_reactions_like_total") {
                likes = metric.values?.[0]?.value || 0;
              } else if (metric.name === "post_reactions_love_total") {
                loves = metric.values?.[0]?.value || 0;
              }
            }
          }

          // Also try reactions summary for total count
          let totalReactions = likes + loves;
          try {
            const reactUrl = `${FB_API}/${post.id}/reactions?summary=true&limit=0&access_token=${pageToken}`;
            const reactRes = await fetch(reactUrl);
            const reactData = await reactRes.json();
            if (reactData.summary) {
              totalReactions = reactData.summary.total_count || totalReactions;
            }
          } catch {}

          return {
            id: post.id,
            message: (post.message || "").slice(0, 200),
            created_time: post.created_time,
            permalink_url: post.permalink_url,
            impressions,
            reactions: totalReactions,
            engagement: impressions + totalReactions * 3,
          };
        } catch {
          return {
            id: post.id,
            message: (post.message || "").slice(0, 200),
            created_time: post.created_time,
            permalink_url: post.permalink_url,
            impressions: 0,
            reactions: 0,
            engagement: 0,
          };
        }
      })
    );

    // 3. Sort by engagement
    postsWithInsights.sort((a: any, b: any) => b.engagement - a.engagement);

    return new Response(JSON.stringify({
      total_posts: postsWithInsights.length,
      posts: postsWithInsights,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});