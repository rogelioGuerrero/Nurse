const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;

export interface GroqMessage {
  role: 'system' | 'user';
  content: string;
}

// Only retry on rate-limit (429) and server errors (5xx)
function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export async function groqChat(
  messages: GroqMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const { temperature = 0.6, maxTokens = 600 } = options || {};

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (attempt < MAX_RETRIES && isRetryable(response.status)) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      clearTimeout(timeoutId);

      // Don't retry on abort (timeout) or non-retryable errors
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error('Groq request timed out');
      }

      // Network errors are retryable
      const isNetworkError = err instanceof TypeError;
      if (attempt < MAX_RETRIES && isNetworkError) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Groq request failed after retries');
}
