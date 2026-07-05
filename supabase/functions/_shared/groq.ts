// @ts-nocheck — Shared Groq client for Supabase Edge Functions (Deno)
// Centralizes model config, fallback, retry, and timeout logic.
// Import: import { callGroq, callGroqRaw, PRIMARY_MODEL, FALLBACK_MODEL, SAFETY_MODEL, LIGHT_MODEL } from "../_shared/groq.ts";

// ===== MODEL CONFIG (single source of truth) =====
export const PRIMARY_MODEL = "openai/gpt-oss-120b";
export const FALLBACK_MODEL = "openai/gpt-oss-20b";
export const SAFETY_MODEL = "openai/gpt-oss-safeguard-20b";
export const LIGHT_MODEL = "openai/gpt-oss-20b";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function getApiKey(): string {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not configured");
  return key;
}

// ===== TYPES =====
export interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface GroqCallOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" | "text" };
  tools?: any[];
  toolChoice?: string;
  timeoutMs?: number;
  // Override which models to try (default: [PRIMARY_MODEL, FALLBACK_MODEL])
  models?: string[];
  // If true, don't retry on 429/5xx — just fallback to next model
  noRetry?: boolean;
}

export interface GroqResult {
  ok: boolean;
  content?: string;       // convenience: extracted text from first choice
  data?: any;             // raw Groq API response
  model?: string;         // which model succeeded
  error?: string;
  status?: number;
}

// ===== MAIN CALLER: returns structured result =====
export async function callGroqRaw(
  messages: GroqMessage[],
  opts: GroqCallOptions = {},
): Promise<GroqResult> {
  const apiKey = getApiKey();
  const models = opts.models ?? [PRIMARY_MODEL, FALLBACK_MODEL];
  const timeout = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;

  for (const model of models) {
    const maxRetries = opts.noRetry ? 0 : MAX_RETRIES;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const body: Record<string, any> = { model, messages };
        if (opts.temperature !== undefined) body.temperature = opts.temperature;
        if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
        if (opts.responseFormat) body.response_format = opts.responseFormat;
        if (opts.tools?.length) {
          body.tools = opts.tools;
          body.tool_choice = opts.toolChoice ?? "auto";
        }

        const res = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text();
          console.log(`[groq] ${model} FAILED: ${res.status} | ${errText.slice(0, 200)}`);

          // Retry on 429/5xx (if not last attempt and retries enabled)
          if (attempt < maxRetries && isRetryable(res.status)) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }

          // Fallback to next model if primary failed with 429/5xx
          if (model !== models[models.length - 1] && isRetryable(res.status)) {
            console.log(`[groq] Falling back from ${model}...`);
            break; // break inner retry loop, continue outer model loop
          }

          return { ok: false, error: errText, status: res.status, model };
        }

        const data = await res.json();
        const content = data.choices[0]?.message?.content ?? "";
        console.log(`[groq] ${model} OK | tokens: ${data.usage?.total_tokens ?? "?"}`);
        return { ok: true, content, data, model };
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err instanceof DOMException && err.name === "AbortError") {
          console.log(`[groq] ${model} timed out (${timeout}ms)`);
        } else {
          console.log(`[groq] ${model} error: ${err.message}`);
        }

        // Retry on network error
        if (attempt < maxRetries && err instanceof TypeError) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        // Fallback to next model on network/timeout error
        if (model !== models[models.length - 1]) {
          console.log(`[groq] Falling back from ${model}...`);
          break;
        }

        return { ok: false, error: err.message, model };
      }
    }
  }

  return { ok: false, error: "All LLM models failed" };
}

// ===== SIMPLE CALLER: returns just the text content (throws on failure) =====
export async function callGroq(
  messages: GroqMessage[],
  opts: GroqCallOptions = {},
): Promise<string> {
  const result = await callGroqRaw(messages, opts);
  if (!result.ok) {
    throw new Error(result.error ?? "Groq request failed");
  }
  return result.content ?? "";
}

// ===== LIGHT CALLER: uses LIGHT_MODEL only (for PII, classify, memory, etc.) =====
export async function callGroqLight(
  messages: GroqMessage[],
  opts: GroqCallOptions = {},
): Promise<string> {
  const result = await callGroqRaw(messages, {
    ...opts,
    models: [LIGHT_MODEL],
    noRetry: false,
  });
  if (!result.ok) {
    throw new Error(result.error ?? "Groq light request failed");
  }
  return result.content ?? "";
}

// ===== SAFETY CALLER: uses SAFETY_MODEL only (for jailbreak, clinical safety) =====
export async function callGroqSafety(
  messages: GroqMessage[],
  opts: GroqCallOptions = {},
): Promise<string> {
  const result = await callGroqRaw(messages, {
    ...opts,
    models: [SAFETY_MODEL],
    noRetry: true,
  });
  if (!result.ok) {
    throw new Error(result.error ?? "Groq safety request failed");
  }
  return result.content ?? "";
}
