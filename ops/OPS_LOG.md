# OPS LOG — hardening of production (BienCuidar)

Principles
1. Hard rule: never invoke an Edge Function/cron that can notify real users. Tests = unauthenticated calls (rejected before logic), rolled-back DB transactions, or on-demand run of non-notifying cron commands.
2. Order: frontend change live first -> then function deploy -> then smoke. Every change has a rollback below.
3. Don't wait for the clock: verify with `ops/smoke.mjs`, `ops/queries.sql`, and on-demand runs. Failures get written to `ops/INCIDENTS.md` (append, commit) so the cause is readable from git.

| ID | Date | Commit | Change | Verify | Rollback |
|----|------|--------|--------|--------|----------|
| H1 | 2026-11-25 | ef66c76 | Triggers guard role/is_demo/cssp_*/price/offer status for client roles; handle_new_user only user/nurse | rolled-back txn (role stays nurse) | `ops/rollback/H1_guard_triggers.sql` |
| H2 | 2026-11-25 | 698d29e | patient-wellness-check / patient-weekly-summary require x-cron-secret; cron 5/6 send it | smoke 401 + cron run 200 `{"checked":1,"alerted":0}` | redeploy previous version (see below) |
| H3 | 2026-11-25 | f1d5d3b | send-nurse-email service-role only; send-push service-role or user JWT; push.ts sends session token | smoke 401 | redeploy previous version |
| H4 | 2026-11-25 | d50485e | check-voice-reminders: test mode owner-only, cron mode internal | smoke 401 | redeploy previous version |
| H5 | 2026-11-25 | (migration) | Policy "Admins can update nurses" | rolled-back txn admin=1 row, other nurse=0 | `ops/rollback/H5_admin_nurses_policy.sql` |
| H6 | 2026-11-25 | 882e1df | *_public views read-only for anon/authenticated | select ok (54/47 rows), update -> insufficient_privilege | `ops/rollback/H6_views_grants.sql` |
| H7 | 2026-11-25 | a514a28 | Cron jobs 5,6,10,11,12 read secrets from Vault | job 10 on-demand run -> 200 | see INVENTORY.md (rotate via vault.update_secret) |
| H8 | 2026-11-25 | (this commit) | guard_bookings v2: wants_invoice immutable; payment_status only by booking's nurse on direct-pay; pending_payment->confirmed admin-only | rolled-back txn cases A-D | `ops/rollback/H8_guard_bookings_v1.sql` |
| H9 | 2026-11-25 | (this commit) | Admin SELECT/UPDATE policies on bookings (admin payment confirmation was a silent no-op) | rolled-back txn admin sees 6, update=1 row | `ops/rollback/H9_admin_bookings_policies.sql` |

| H10 | 2026-11-25 | 3bbb363 | patient-token `issue` requires the family's JWT; benni-escalate and stt accept service role, user JWT or signed `x-patient-token`; frontend sends them | smoke 401 (see ops/last-smoke.json) | redeploy previous: benni-escalate/patient-token from 732fa24, stt from `ops/rollback/stt_v8_deployed_before_2026-11-25.ts` |

| H11 | 2026-11-25 | 384bd62 | monitor-agent: requires cron secret/service key (cron job 12 now sends x-cron-secret from Vault); removed fix_verify_jwt tool; trigger_cron_now allowlist = marketplace-cron; admin push alerts resolve admin ids | smoke 401; on-demand job 12 run: LLM tried to trigger cssp-reminders -> "not allowed" -> admin alert sent | redeploy previous monitor-agent (git show 384bd62^:supabase/functions/monitor-agent/index.ts is the repo version; deployed v11 was an older compact build) |
| H12 | 2026-11-25 | 384bd62 | cssp-reminders: `_health_check` body returns 200 without running (monitor-agent's daily probe used to run the full job) | deployed==repo (byte compare) | redeploy v27 from 384bd62^ |
| H13 | 2026-11-25 | 384bd62 | cv-review, groq-news, fb-info retired (410 stubs; unauthenticated Groq/FB proxies, unused) | smoke 410 | `ops/rollback/<slug>.original.ts` |
| H14 | 2026-11-25 | (this commit) | tsconfig excludes ops/rollback (Deno files broke CI tsc) | tsc exit 0 | n/a |

| H15 | 2026-11-25 | (this commit) | **accept_offer was broken in prod** (42703: bookings had no `shift` column; then 42804: text->enum status). Added bookings.shift, made start_time/end_time/hours nullable, cast status. | `ops/tests/accept_offer_flow.sql` (rolled back): stranger=Not authorized; invoice 25.65 pending_payment; direct 20.00 confirmed; 2-slot request open->matched | drop column/re-add NOT NULL (see migration comments) |
| H16 | 2026-11-25 | (this commit) | monitor-agent cron health uses cssp_portal_status.last_checked_at (run stamp) instead of emails sent; voice-reminders miss is INFO | deployed==repo byte compare | redeploy v12 |

| H17 | 2026-11-25 | (this commit) | Trigger normalizes care_requests.slots/patient_data when the app sends them double-encoded (JSON.stringify into jsonb); fixed existing rows | rolled-back txn: string input stored as array/object, accept_offer success, 0 string rows left | `DROP TRIGGER trg_normalize_care_requests ON public.care_requests;` |

Follow-ups: monitor-agent reports "CRON FAILURE: cssp-reminders" daily because it measures cssp_email_sent_at (emails sent) instead of job runs -> false alarm push to admin; switch it to cron.job_run_details/net._http_response. fb-insights & fb-post-metrics stay public on purpose (local scripts call them with the anon key; data is public page metrics). chat-summary stays open (used by anonymous SupportChat visitors).

NOTE (H10): deployed `stt` v8 was OLDER than the repo (no prompt/temperature, no retries). v9 now deployed = repo version (+auth). Positive path (real transcription / escalation) cannot be tested without sending/real audio; watch Edge logs for stt/benni-escalate 5xx and 401 from real users after deploy (ops/queries.sql).

Redeploy previous function version: `git show <commit-before>:supabase/functions/<slug>/index.ts` and deploy it with verify_jwt=false.
Commits before each function change: send-push/send-nurse-email -> ef66c76; check-voice-reminders -> f1d5d3b; wellness/weekly -> ef66c76.

Known residual risks (not yet fixed): benni-escalate & stt unauthenticated (patient mode uses patient-token);
email-inbound-handler lacks webhook signature check; is_phone_registered/resolve_login_identifier callable by anon (login by phone needs it; rate-limit is a product decision);
old browser tabs (pre-H3/H4) fail silently on push/test until reload.
