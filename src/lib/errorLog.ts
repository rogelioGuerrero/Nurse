import { supabase } from './supabase';

const MAX_DISTINCT_MESSAGES = 20;
const IGNORED_PATTERNS = ['ResizeObserver loop', 'Non-Error promise rejection'];

const seenMessages = new Set<string>();

export function logClientError(err: unknown, source: string): void {
  if (!import.meta.env.PROD) return;

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  if (IGNORED_PATTERNS.some((pattern) => message.includes(pattern))) return;
  if (seenMessages.has(message) || seenMessages.size >= MAX_DISTINCT_MESSAGES) return;
  seenMessages.add(message);

  const path = window.location.pathname;
  const appVersion = import.meta.env.MODE;

  void supabase
    .rpc('log_client_error', {
      p_source: source,
      p_path: path,
      p_message: message.slice(0, 500),
      p_stack: (stack || '').slice(0, 2000),
      p_app_version: appVersion,
    })
    .then(() => {}, () => {});
}
