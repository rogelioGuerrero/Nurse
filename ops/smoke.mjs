// Smoke test for hardened endpoints. SAFE: sends NO valid credentials, so every protected function
// rejects before executing logic (no push/email can be sent). Run: node ops/smoke.mjs
// NOT covered on purpose: patient-wellness-check / patient-weekly-summary (no body is harmless if they ever
// regressed to open). Verify them statically: deployed source must contain the CRON_SECRET check
// (get_edge_function -> grep "x-cron-secret"), and cron job 5/6 run results must be 200 (ops/queries.sql).
// Writes ops/last-smoke.json so the result can be read from git.
import { writeFileSync } from 'node:fs';

const FN = 'https://zqgtkrqfyhcvgagjhbnv.supabase.co/functions/v1';
const SITE = 'https://biencuidar.agtisa.com';
const post = (path, headers = {}, body = '{}') => fetch(`${FN}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
const NO_SUCH_REMINDER = JSON.stringify({ mode: 'test', reminder_id: '00000000-0000-0000-0000-000000000000' });

const checks = [
  ['send-push no-auth -> 401', () => post('send-push'), 401],
  ['send-push bad-token -> 401', () => post('send-push', { Authorization: 'Bearer not-a-real-token' }), 401],
  ['send-push GET /vapid-key -> 200 (public by design)', () => fetch(`${FN}/send-push/vapid-key`), 200],
  ['send-nurse-email no-auth -> 401', () => post('send-nurse-email'), 401],
  ['send-nurse-email bad-token -> 401', () => post('send-nurse-email', { Authorization: 'Bearer not-a-real-token' }), 401],
  ['check-voice-reminders no-auth -> 401', () => post('check-voice-reminders', {}, NO_SUCH_REMINDER), 401],
  ['check-voice-reminders bad-token -> 401', () => post('check-voice-reminders', { Authorization: 'Bearer nope' }, NO_SUCH_REMINDER), 401],
  ['site landing -> 200', () => fetch(SITE), 200],
];

const results = [];
for (const [name, run, expected] of checks) {
  let status = null;
  try { status = (await run()).status; } catch (e) { status = `error: ${e.message}`; }
  results.push({ name, expected, status, ok: status === expected });
}
const out = { at: new Date().toISOString(), allOk: results.every(r => r.ok), results };
writeFileSync(new URL('./last-smoke.json', import.meta.url), JSON.stringify(out, null, 2));
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (got ${r.status})`);
console.log(out.allOk ? 'ALL OK' : 'FAILURES PRESENT');
process.exit(out.allOk ? 0 : 1);
