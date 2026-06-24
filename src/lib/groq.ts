import { supabaseUrl, supabaseAnonKey } from './supabase';

const EDGE_FUNCTION_PATH = '/functions/v1/ai-chat';
const REQUEST_TIMEOUT_MS = 20000;

export interface GroqMessage {
  role: 'system' | 'user';
  content: string;
}

export async function groqChat(
  messages: GroqMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const { temperature = 0.6, maxTokens = 600 } = options || {};

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${supabaseUrl}${EDGE_FUNCTION_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ messages, temperature, maxTokens }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    return data.content;
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Groq request timed out');
    }
    throw err;
  }
}
