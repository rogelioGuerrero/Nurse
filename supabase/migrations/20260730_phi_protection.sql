-- Migration: PHI protection and RAG access restriction
-- Date: 2026-07-30
-- P1-6: Restrict RAG to authenticated only (was using(true) = public)
-- P0-2: Create security_invoker views that mask sensitive/PHI columns for non-owners

-- ============================================================
-- P1-6: RAG — restrict read access to authenticated users
-- ============================================================

-- Drop the public read policy
drop policy if exists "rag_documents_read_all" on rag_documents;

-- Create new policy requiring authentication
create policy "rag_documents_read_authenticated"
  on rag_documents for select
  to authenticated
  using (true);

-- Revoke execute on rag_search from anon (keep authenticated)
revoke execute on function rag_search(vector, integer, text) from anon;

-- ============================================================
-- P0-2: nurses_public view — masks sensitive columns for non-owners
-- Sensitive: dui, cssp_registration, cssp_verification_notes,
--   cssp_email_sent_at, cssp_email_count, inactivity_email_count,
--   inactivity_email_sent_at, verifications, portal_down_notified
-- Visible to: owner (nurse.user_id = auth.uid()) or admin
-- ============================================================

create or replace view nurses_public with (security_invoker = true) as
select
  n.id, n.user_id, n.specialization, n.coverage_radius, n.rating, n.review_count,
  n.lat, n.lng, n.bio, n.experience_years, n.certifications, n.created_at, n.updated_at,
  n.shift_rate, n.available_shifts, n.available_days, n.cssp_level, n.cssp_verified,
  n.cssp_verification_status, n.cssp_verification_date, n.assignment_availability,
  n.payment_preference, n.is_active,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.dui else null end as dui,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.cssp_registration else null end as cssp_registration,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.cssp_verification_notes else null end as cssp_verification_notes,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.cssp_email_sent_at else null end as cssp_email_sent_at,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.cssp_email_count else null end as cssp_email_count,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.inactivity_email_count else null end as inactivity_email_count,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.inactivity_email_sent_at else null end as inactivity_email_sent_at,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.verifications else null end as verifications,
  case when n.user_id = auth.uid() or p.role = 'admin'
    then n.portal_down_notified else null end as portal_down_notified
from nurses n
left join profiles p on p.id = auth.uid();

grant select on nurses_public to authenticated;

-- ============================================================
-- P0-2: care_requests_public view — masks PHI for non-owners
-- PHI (masked): patient_name, patient_data, notes
-- Marketplace-visible: patient_condition, nurse_summary,
--   patient_age_range, patient_gender (needed for offers)
-- ============================================================

create or replace view care_requests_public with (security_invoker = true) as
select
  cr.id, cr.user_id, cr.specialization_needed, cr.slots, cr.location_name,
  cr.status, cr.created_at, cr.response_deadline, cr.lat, cr.lng,
  cr.wants_invoice, cr.expected_duration, cr.urgency,
  cr.patient_age_range, cr.patient_gender, cr.patient_condition, cr.nurse_summary,
  case when cr.user_id = auth.uid() or p.role = 'admin'
    then cr.patient_name else null end as patient_name,
  case when cr.user_id = auth.uid() or p.role = 'admin'
    then cr.patient_data else null end as patient_data,
  case when cr.user_id = auth.uid() or p.role = 'admin'
    then cr.notes else null end as notes
from care_requests cr
left join profiles p on p.id = auth.uid();

grant select on care_requests_public to authenticated;
