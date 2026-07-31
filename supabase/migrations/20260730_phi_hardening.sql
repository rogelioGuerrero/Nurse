-- Migration: PHI hardening — switch views to security_definer and revoke direct table SELECT
-- Date: 2026-07-30
-- P0-2 Step 3: Block direct SELECT on nurses/care_requests for authenticated/anon
-- Views now use security_definer (run as view owner = postgres) with embedded row-level filtering

-- ============================================================
-- nurses_public: security_definer + row-level filter + column masking
-- Row-level: all authenticated users see all rows (matches original RLS)
-- Column-level: sensitive columns masked for non-owners/non-admin
-- ============================================================

drop view if exists nurses_public;

create or replace view nurses_public as
select
  n.id, n.user_id, n.specialization, n.coverage_radius, n.rating, n.review_count,
  n.lat, n.lng, n.bio, n.experience_years, n.certifications, n.created_at, n.updated_at,
  n.shift_rate, n.available_shifts, n.available_days, n.cssp_level, n.cssp_verified,
  n.cssp_verification_status, n.cssp_verification_date, n.assignment_availability,
  n.payment_preference, n.is_active,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.dui else null end as dui,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.cssp_registration else null end as cssp_registration,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.cssp_verification_notes else null end as cssp_verification_notes,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.cssp_email_sent_at else null end as cssp_email_sent_at,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.cssp_email_count else null end as cssp_email_count,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.inactivity_email_count else null end as inactivity_email_count,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.inactivity_email_sent_at else null end as inactivity_email_sent_at,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.verifications else null end as verifications,
  case when n.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then n.portal_down_notified else null end as portal_down_notified
from nurses n
where auth.uid() is not null;

grant select on nurses_public to authenticated;

-- ============================================================
-- care_requests_public: security_definer + row-level filter + column masking
-- Row-level: owner sees own, all see open, admin sees all (matches original RLS)
-- Column-level: PHI (patient_name, patient_data, notes) masked for non-owners/non-admin
-- ============================================================

drop view if exists care_requests_public;

create or replace view care_requests_public as
select
  cr.id, cr.user_id, cr.specialization_needed, cr.slots, cr.location_name,
  cr.status, cr.created_at, cr.response_deadline, cr.lat, cr.lng,
  cr.wants_invoice, cr.expected_duration, cr.urgency,
  cr.patient_age_range, cr.patient_gender, cr.patient_condition, cr.nurse_summary,
  case when cr.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then cr.patient_name else null end as patient_name,
  case when cr.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then cr.patient_data else null end as patient_data,
  case when cr.user_id = auth.uid() or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
    then cr.notes else null end as notes
from care_requests cr
where auth.uid() is not null
  and (
    cr.user_id = auth.uid()
    or cr.status = 'open'
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

grant select on care_requests_public to authenticated;

-- ============================================================
-- Revoke direct SELECT on underlying tables from authenticated and anon
-- service_role bypasses GRANTs, so Edge Functions are unaffected
-- RLS SELECT policies remain on the tables for Realtime to work
-- (Realtime uses supabase_realtime_admin role + RLS check, not user GRANTs)
-- ============================================================

revoke select on nurses from authenticated, anon;
revoke select on care_requests from authenticated, anon;
