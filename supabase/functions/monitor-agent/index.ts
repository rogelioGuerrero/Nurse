// @ts-nocheck
import { callGroqRaw } from "../_shared/groq.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL = "guerrero_vi@yahoo.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_ACCESS_TOKEN = Deno.env.get("SB_ACCESS_TOKEN") || "";
const PROJECT_REF = "zqgtkrqfyhcvgagjhbnv";
const MANAGEMENT_API = "https://api.supabase.com/v1/projects";

// ===== TOOLS available to the LLM =====
const TOOLS = [
  {
    type: "function",
    function: {
      name: "send_admin_alert",
      description: "Send a push notification to the admin's phone. Use ONLY for critical issues that need immediate attention.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short alert title (max 50 chars)" },
          message: { type: "string", description: "Alert message (max 200 chars)" }
        },
        required: ["title", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_admin_email",
      description: "Send an email to the admin with detailed information about an incident.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body with details" }
        },
        required: ["subject", "body"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "log_incident",
      description: "Record an incident in the monitor_incidents table for tracking. Use for any anomaly detected.",
      parameters: {
        type: "object",
        properties: {
          incident_type: { type: "string", description: "Category: cron_failure, function_error, data_stale, config_error, unusual_pattern" },
          severity: { type: "string", enum: ["info", "warning", "critical"], description: "Severity level" },
          source: { type: "string", description: "Which function or system component" },
          message: { type: "string", description: "Description of the incident" },
          details: { type: "string", description: "Additional JSON details (optional)" }
        },
        required: ["incident_type", "severity", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "resolve_incident",
      description: "Mark a recent incident as resolved. Use when the issue is auto-resolved or no longer relevant.",
      parameters: {
        type: "object",
        properties: {
          incident_type: { type: "string", description: "The incident type to resolve" },
          note: { type: "string", description: "How it was resolved" }
        },
        required: ["incident_type", "note"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "trigger_cron_now",
      description: "Manually invoke an edge function that should have been triggered by a cron but didn't run. Use when a cron job hasn't run in its expected window.",
      parameters: {
        type: "object",
        properties: {
          function_name: { type: "string", description: "The edge function slug to invoke (e.g., cssp-reminders, check-voice-reminders, patient-wellness-check)" },
          reason: { type: "string", description: "Why this manual trigger is needed" }
        },
        required: ["function_name", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "fix_verify_jwt",
      description: "Fix a misconfigured edge function by updating its verify_jwt setting via Supabase Management API. Use when a cron-triggered function is returning 401 because verify_jwt is incorrectly set to true.",
      parameters: {
        type: "object",
        properties: {
          function_slug: { type: "string", description: "The edge function slug to fix" },
          verify_jwt: { type: "boolean", description: "The correct verify_jwt value (false for cron/internal functions, true for app functions)" },
          reason: { type: "string", description: "Why this fix is needed" }
        },
        required: ["function_slug", "verify_jwt", "reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_function_logs",
      description: "Fetch recent logs for a specific edge function to diagnose errors. Use when a function is returning 500 errors or is unreachable.",
      parameters: {
        type: "object",
        properties: {
          function_slug: { type: "string", description: "The edge function slug to get logs for" },
          limit: { type: "integer", description: "Number of log entries to fetch (default 20, max 50)" }
        },
        required: ["function_slug"]
      }
    }
  }
];

const SYSTEM_PROMPT = `You are the monitoring agent for BienCuidar, a nursing care platform running on Supabase.

You receive a health report every 4 hours with system status data. Your job:

1. ANALYZE the report for anomalies. Normal operation noise should be IGNORED.
2. CRITICAL issues (send push alert + email + log incident):
   - Cron jobs that haven't run in their expected window
   - Edge functions returning consistent errors
   - Data inconsistencies (missing records, stale data beyond expected)
   - Configuration errors (verify_jwt wrong, missing env vars)
3. WARNING issues (log incident only, no push):
   - Unusual patterns (higher than normal error rates, slow responses)
   - Stale data within tolerance (e.g., nurse not active for 7 days)
4. INFO (ignore, don't log):
   - Normal operation, successful runs, expected empty results

AUTO-HEALING CAPABILITIES:
- If a cron hasn't run, use trigger_cron_now to invoke it manually.
- If a function returns 401 and it's a cron/internal function, use fix_verify_jwt to set verify_jwt=false.
- If a function returns 500, use get_function_logs to investigate the error before alerting.
- After auto-healing, log_incident with severity=warning and send_admin_email explaining what was fixed.
- Only send_admin_alert (push) if auto-healing FAILED or the issue needs human intervention.

RULES:
- Do NOT alert for things that are working normally.
- Do NOT log incidents for normal operation.
- If a cron ran but found nothing to do, that's NORMAL.
- If a cron hasn't run in 2x its expected interval, try to auto-heal first (trigger_cron_now).
- If a function returns 401, try fix_verify_jwt first. Only alert if the fix fails.
- Use send_admin_alert sparingly — only for things that need human intervention NOW.
- Use log_incident for tracking — even warnings should be logged.
- Use resolve_incident if you detect a previous issue is now resolved.

Respond with your analysis and call tools as needed.`;

// ===== HEALTH CHECKS =====

async function supabaseQuery(table: string, select: string, filters: Record<string, string> = {}) {
  let url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}`;
  for (const [key, val] of Object.entries(filters)) {
    url += `&${key}=${val}`;
  }
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Profile": "public"
    }
  });
  if (!res.ok) {
    return { error: `Query ${table} failed: ${res.status}`, data: null };
  }
  const data = await res.json();
  return { error: null, data };
}

async function checkCronHealth(): Promise<string> {
  const now = new Date();
  const checks: string[] = [];

  // 1. cssp-reminders: should run daily at 08:00. Check if any nurse has cssp_email_sent_at in last 24h
  const { data: csspRecent } = await supabaseQuery("nurses", "id,cssp_email_sent_at", { "cssp_email_sent_at": "not.is.null" });
  const csspRanRecently = csspRecent?.some((n: any) => {
    if (!n.cssp_email_sent_at) return false;
    const sent = new Date(n.cssp_email_sent_at);
    return (now.getTime() - sent.getTime()) < 36 * 60 * 60 * 1000; // 36h tolerance
  });
  checks.push(`[CRON] cssp-reminders: ${csspRanRecently ? "OK - ran in last 36h" : "WARNING - no cssp_email_sent_at updates in last 36h"}`);

  // 2. check-voice-reminders: should run periodically. Check voice_reminders for recent last_sent_at
  const { data: voiceRecent } = await supabaseQuery("voice_reminders", "id,last_sent_at", { "last_sent_at": "not.is.null" });
  const voiceRanRecently = voiceRecent?.some((r: any) => {
    if (!r.last_sent_at) return false;
    const sent = new Date(r.last_sent_at);
    return (now.getTime() - sent.getTime()) < 12 * 60 * 60 * 1000; // 12h tolerance
  });
  checks.push(`[CRON] check-voice-reminders: ${voiceRanRecently ? "OK - sent reminders in last 12h" : "WARNING - no voice reminders sent in last 12h (may be normal if no reminders due)"}`);

  // 3. patient-wellness-check: check benni_messages for recent entries
  const { data: benniRecent } = await supabaseQuery("benni_messages", "id,created_at", { "created_at": `gte.${new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString()}` });
  checks.push(`[CRON] patient-wellness-check: ${benniRecent?.length > 0 ? `OK - ${benniRecent.length} benni messages in last 12h` : "INFO - no benni messages in last 12h (may be normal)"}`);

  return checks.join("\n");
}

async function checkDataHealth(): Promise<string> {
  const now = new Date();
  const checks: string[] = [];

  // Check for nurses with is_active=true but no login in 30+ days
  const { data: staleNurses } = await supabaseQuery("nurses", "id,cssp_verification_status,is_active", { "is_active": "eq.true" });
  const { data: profiles } = await supabaseQuery("profiles", "id,last_sign_in_at,role", { "role": "eq.nurse" });
  
  if (profiles && staleNurses) {
    const stale = profiles.filter((p: any) => {
      if (!p.last_sign_in_at) return false;
      const last = new Date(p.last_sign_in_at);
      return (now.getTime() - last.getTime()) > 30 * 24 * 60 * 60 * 1000; // 30 days
    });
    checks.push(`[DATA] Stale nurses (30+ days no login): ${stale.length} nurses`);

    // Check for unverified nurses that are active
    const unverified = staleNurses.filter((n: any) => 
      n.cssp_verification_status === "unverified" || n.cssp_verification_status === "pending"
    );
    checks.push(`[DATA] Active nurses with pending CSSP verification: ${unverified.length}`);
  }

  // Check for unresolved monitor incidents
  const { data: openIncidents } = await supabaseQuery("monitor_incidents", "id,incident_type,severity,message,created_at", { "resolved": "eq.false" });
  if (openIncidents && openIncidents.length > 0) {
    checks.push(`[DATA] Unresolved monitor incidents: ${openIncidents.length}`);
    openIncidents.slice(0, 5).forEach((inc: any) => {
      checks.push(`  - [${inc.severity}] ${inc.incident_type}: ${inc.message} (${new Date(inc.created_at).toISOString().slice(0, 16)})`);
    });
  } else {
    checks.push(`[DATA] Unresolved monitor incidents: 0`);
  }

  // Check recent notification_logs for failures
  const { data: notifLogs } = await supabaseQuery("notification_logs", "id,status,created_at", { "created_at": `gte.${new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()}` });
  if (notifLogs && notifLogs.length > 0) {
    const failed = notifLogs.filter((n: any) => n.status === "failed" || n.status === "error");
    checks.push(`[DATA] Notifications in last 6h: ${notifLogs.length} total, ${failed.length} failed`);
  } else {
    checks.push(`[DATA] Notifications in last 6h: 0 (may be normal)`);
  }

  return checks.join("\n");
}

async function checkFunctionHealth(): Promise<string> {
  const checks: string[] = [];

  // List of critical functions to ping
  const criticalFunctions = [
    { name: "cssp-reminders", expectJwt: false },
    { name: "send-push", expectJwt: false },
    { name: "benni-escalate", expectJwt: false },
    { name: "stt", expectJwt: false },
    { name: "verify-cssp", expectJwt: true },
    { name: "ai-chat", expectJwt: true },
    { name: "benni-chat", expectJwt: true },
  ];

  for (const fn of criticalFunctions) {
    try {
      const url = `${SUPABASE_URL}/functions/v2/${fn.name}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ _health_check: true }),
        signal: AbortSignal.timeout(10000),
      });
      
      // 401 means verify_jwt is blocking — expected for jwt=true functions with service key
      // 400/422 means function is alive but rejected our payload — that's OK
      // 500 means internal error — concerning
      if (res.status === 500) {
        checks.push(`[FUNC] ${fn.name}: ERROR - returned 500`);
      } else if (res.status <= 404) {
        checks.push(`[FUNC] ${fn.name}: OK - responding (status ${res.status})`);
      } else {
        checks.push(`[FUNC] ${fn.name}: ALIVE - status ${res.status}`);
      }
    } catch (e: any) {
      checks.push(`[FUNC] ${fn.name}: UNREACHABLE - ${e.message?.slice(0, 100) || "timeout"}`);
    }
  }

  return checks.join("\n");
}

async function checkRecentErrors(): Promise<string> {
  const checks: string[] = [];
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

  // Check for recent failed auth attempts
  // Can't query auth.users directly, but can check profiles for recent sign-ins
  const { data: recentSignins } = await supabaseQuery("profiles", "id,last_sign_in_at", { "last_sign_in_at": `gte.${sixHoursAgo}` });
  checks.push(`[AUTH] Recent sign-ins (last 6h): ${recentSignins?.length || 0}`);

  // Check for bookings stuck in pending_payment for too long
  const { data: stuckBookings } = await supabaseQuery("bookings", "id,created_at,status", { "status": "eq.pending_payment" });
  if (stuckBookings && stuckBookings.length > 0) {
    const oldStuck = stuckBookings.filter((b: any) => {
      const created = new Date(b.created_at);
      return (now.getTime() - created.getTime()) > 48 * 60 * 60 * 1000; // 48h
    });
    if (oldStuck.length > 0) {
      checks.push(`[DATA] Bookings stuck in pending_payment 48h+: ${oldStuck.length}`);
    }
  }

  return checks.join("\n");
}

// ===== TOOL EXECUTION =====

async function sendAdminAlert(title: string, message: string): Promise<string> {
  try {
    // Use send-push edge function to send push notification
    const res = await fetch(`${SUPABASE_URL}/functions/v2/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        title,
        body: message,
        target: "admin",
      }),
    });
    if (res.ok) {
      return `Push alert sent: ${title}`;
    }
    return `Push alert failed: ${res.status}`;
  } catch (e: any) {
    return `Push alert error: ${e.message}`;
  }
}

async function sendAdminEmail(subject: string, body: string): Promise<string> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BienCuidar Monitor <monitor@biencuidar.com>",
        to: ADMIN_EMAIL,
        subject,
        text: body,
      }),
    });
    if (res.ok) {
      return `Email sent: ${subject}`;
    }
    return `Email failed: ${res.status}`;
  } catch (e: any) {
    return `Email error: ${e.message}`;
  }
}

async function logIncident(params: any): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/monitor_incidents`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": "public",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        incident_type: params.incident_type,
        severity: params.severity || "info",
        source: params.source || null,
        message: params.message,
        details: params.details ? JSON.parse(params.details) : null,
      }),
    });
    if (res.ok) {
      return `Incident logged: ${params.incident_type} [${params.severity}]`;
    }
    return `Incident log failed: ${res.status}`;
  } catch (e: any) {
    return `Incident log error: ${e.message}`;
  }
}

async function resolveIncident(incidentType: string, note: string): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/monitor_incidents?incident_type=eq.${incidentType}&resolved=eq.false`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": "public",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        resolved: true,
        resolved_by: "monitor-agent",
        resolved_at: new Date().toISOString(),
        details: { resolution_note: note },
      }),
    });
    if (res.ok) {
      return `Incidents resolved: ${incidentType}`;
    }
    return `Resolve failed: ${res.status}`;
  } catch (e: any) {
    return `Resolve error: ${e.message}`;
  }
}

async function triggerCronNow(functionName: string, reason: string): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v2/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ _manual_trigger: true, reason }),
      signal: AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.text();
      return `Triggered ${functionName} manually: ${data.slice(0, 200)}`;
    }
    return `Trigger ${functionName} failed: ${res.status}`;
  } catch (e: any) {
    return `Trigger ${functionName} error: ${e.message}`;
  }
}

async function fixVerifyJwt(functionSlug: string, verifyJwt: boolean, reason: string): Promise<string> {
  if (!SUPABASE_ACCESS_TOKEN) {
    return `Cannot fix verify_jwt: SUPABASE_ACCESS_TOKEN not configured. Manual fix needed.`;
  }
  try {
    const res = await fetch(`${MANAGEMENT_API}/${PROJECT_REF}/functions/${functionSlug}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ verify_jwt: verifyJwt }),
    });
    if (res.ok) {
      return `Fixed ${functionSlug}: verify_jwt set to ${verifyJwt}. Reason: ${reason}`;
    }
    const errText = await res.text();
    return `Fix ${functionSlug} failed: ${res.status} ${errText.slice(0, 200)}`;
  } catch (e: any) {
    return `Fix ${functionSlug} error: ${e.message}`;
  }
}

async function getFunctionLogs(functionSlug: string, limit: number = 20): Promise<string> {
  if (!SUPABASE_ACCESS_TOKEN) {
    return `Cannot fetch logs: SUPABASE_ACCESS_TOKEN not configured.`;
  }
  try {
    const cappedLimit = Math.min(limit, 50);
    const res = await fetch(
      `${MANAGEMENT_API}/${PROJECT_REF}/functions/${functionSlug}/logs?limit=${cappedLimit}`,
      {
        headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(15000),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const logs = (data.logs || data || []).slice(0, cappedLimit);
      const summary = logs.map((l: any) => {
        const ts = l.timestamp || l.created_at || "?";
        const msg = l.message || l.event_message || JSON.stringify(l).slice(0, 150);
        return `[${ts}] ${msg}`;
      }).join("\n");
      return `Logs for ${functionSlug} (${logs.length} entries):\n${summary || "(empty)"}`;
    }
    return `Logs ${functionSlug} failed: ${res.status}`;
  } catch (e: any) {
    return `Logs ${functionSlug} error: ${e.message}`;
  }
}

async function executeTool(toolCall: any): Promise<string> {
  const name = toolCall.function.name;
  const args = JSON.parse(toolCall.function.arguments);

  switch (name) {
    case "send_admin_alert":
      return await sendAdminAlert(args.title, args.message);
    case "send_admin_email":
      return await sendAdminEmail(args.subject, args.body);
    case "log_incident":
      return await logIncident(args);
    case "resolve_incident":
      return await resolveIncident(args.incident_type, args.note);
    case "trigger_cron_now":
      return await triggerCronNow(args.function_name, args.reason);
    case "fix_verify_jwt":
      return await fixVerifyJwt(args.function_slug, args.verify_jwt, args.reason);
    case "get_function_logs":
      return await getFunctionLogs(args.function_slug, args.limit || 20);
    default:
      return `Unknown tool: ${name}`;
  }
}

// ===== MAIN =====

Deno.serve(async (req: Request) => {
  const startTime = Date.now();
  console.log("[monitor-agent] Starting health check...");

  try {
    // 1. Run all health checks in parallel
    const [cronHealth, dataHealth, funcHealth, errorHealth] = await Promise.all([
      checkCronHealth(),
      checkDataHealth(),
      checkFunctionHealth(),
      checkRecentErrors(),
    ]);

    // 2. Compile health report
    const report = [
      `=== BIENCUIDAR HEALTH REPORT ===`,
      `Timestamp: ${new Date().toISOString()}`,
      `Interval: Last 6 hours`,
      ``,
      `--- CRON HEALTH ---`,
      cronHealth,
      ``,
      `--- DATA HEALTH ---`,
      dataHealth,
      ``,
      `--- FUNCTION HEALTH ---`,
      funcHealth,
      ``,
      `--- RECENT ERRORS ---`,
      errorHealth,
      ``,
      `=== END REPORT ===`,
    ].join("\n");

    console.log("[monitor-agent] Health report compiled, sending to LLM...");

    // 3. Send to LLM for analysis with tools
    const llmResult = await callGroqRaw(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: report },
      ],
      {
        tools: TOOLS,
        temperature: 0.3,
        maxTokens: 2000,
        timeoutMs: 30000,
      }
    );

    // 4. Execute tool calls if any
    const toolResults: string[] = [];
    if (llmResult.ok && llmResult.data?.choices?.[0]?.message?.tool_calls) {
      const toolCalls = llmResult.data.choices[0].message.tool_calls;
      console.log(`[monitor-agent] LLM made ${toolCalls.length} tool calls`);

      for (const toolCall of toolCalls) {
        const result = await executeTool(toolCall);
        toolResults.push(`${toolCall.function.name}: ${result}`);
        console.log(`[monitor-agent] Tool result: ${result}`);
      }
    } else if (llmResult.ok && llmResult.content) {
      console.log(`[monitor-agent] LLM analysis (no tools called): ${llmResult.content.slice(0, 200)}`);
    } else {
      console.log(`[monitor-agent] LLM failed: ${llmResult.error}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[monitor-agent] Completed in ${elapsed}ms`);

    return new Response(JSON.stringify({
      ok: true,
      elapsed_ms: elapsed,
      tool_results: toolResults,
      llm_summary: llmResult.content?.slice(0, 500),
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[monitor-agent] FATAL:", err);
    return new Response(JSON.stringify({
      ok: false,
      error: err.message,
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
