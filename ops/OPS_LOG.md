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

Redeploy previous function version: `git show <commit-before>:supabase/functions/<slug>/index.ts` and deploy it with verify_jwt=false.
Commits before each function change: send-push/send-nurse-email -> ef66c76; check-voice-reminders -> f1d5d3b; wellness/weekly -> ef66c76.

Known residual risks (not yet fixed): payment_status editable by booking participants; benni-escalate & stt unauthenticated (patient mode uses patient-token);
email-inbound-handler lacks webhook signature check; is_phone_registered/resolve_login_identifier callable by anon (login by phone needs it; rate-limit is a product decision);
old browser tabs (pre-H3/H4) fail silently on push/test until reload.
