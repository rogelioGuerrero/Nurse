import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FB_PAGE_ID = Deno.env.get("FB_PAGE_ID") || "";
const FB_PAGE_TOKEN = Deno.env.get("FB_PAGE_TOKEN") || "";
const FB_API_VERSION = "v19.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Get recent posts (up to 25)
    const postsUrl = `https://graph.facebook.com/${FB_API_VERSION}/${FB_PAGE_ID}/posts?fields=id,message,created_time,permalink_url&limit=25&access_token=${FB_PAGE_TOKEN}`;
    const postsRes = await fetch(postsUrl);
    const postsData = await postsRes.json();

    if (!postsData.data) {
      return new Response(
        JSON.stringify({ error: "No posts returned", raw: postsData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. For each post, get reactions summary, comments count, shares
    const postsWithMetrics = await Promise.all(
      postsData.data.map(async (post: any) => {
        const metricsUrl = `https://graph.facebook.com/${FB_API_VERSION}/${post.id}?fields=reactions.summary(true).limit(0),comments.summary(true).limit(0),shares,message,created_time,permalink_url&access_token=${FB_PAGE_TOKEN}`;
        
        try {
          const metricsRes = await fetch(metricsUrl);
          const metricsData = await metricsRes.json();
          
          const reactionCount = metricsData.reactions?.summary?.total_count || 0;
          const commentCount = metricsData.comments?.summary?.total_count || 0;
          const shareCount = metricsData.shares?.count || 0;
          
          // Try to get reaction breakdown
          let reactionBreakdown: Record<string, number> = {};
          try {
            const reactionsDetailUrl = `https://graph.facebook.com/${FB_API_VERSION}/${post.id}/reactions?summary=true&limit=0&access_token=${FB_PAGE_TOKEN}`;
            const reactionsDetailRes = await fetch(reactionsDetailUrl);
            const reactionsDetailData = await reactionsDetailRes.json();
            if (reactionsDetailData.summary) {
              reactionBreakdown = {
                total: reactionsDetailData.summary.total_count || 0,
                viewers_reaction: reactionsDetailData.summary.viewer_reaction || "none",
              };
            }
          } catch {}
          
          return {
            id: post.id,
            message: (post.message || metricsData.message || "").slice(0, 200),
            created_time: post.created_time,
            permalink_url: post.permalink_url || metricsData.permalink_url || "",
            reactions: reactionCount,
            comments: commentCount,
            shares: shareCount,
            engagement: reactionCount + commentCount + shareCount,
            reaction_detail: reactionBreakdown,
          };
        } catch (err) {
          return {
            id: post.id,
            message: (post.message || "").slice(0, 200),
            created_time: post.created_time,
            permalink_url: post.permalink_url || "",
            reactions: 0,
            comments: 0,
            shares: 0,
            engagement: 0,
            error: (err as Error).message,
          };
        }
      })
    );

    // 3. Sort by engagement
    postsWithMetrics.sort((a: any, b: any) => (b.engagement || 0) - (a.engagement || 0));

    // 4. Summary
    const totalReactions = postsWithMetrics.reduce((s: number, p: any) => s + (p.reactions || 0), 0);
    const totalComments = postsWithMetrics.reduce((s: number, p: any) => s + (p.comments || 0), 0);
    const totalShares = postsWithMetrics.reduce((s: number, p: any) => s + (p.shares || 0), 0);
    const totalEngagement = totalReactions + totalComments + totalShares;

    return new Response(
      JSON.stringify({
        posts: postsWithMetrics,
        summary: {
          total_posts: postsWithMetrics.length,
          total_reactions: totalReactions,
          total_comments: totalComments,
          total_shares: totalShares,
          total_engagement: totalEngagement,
        },
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
