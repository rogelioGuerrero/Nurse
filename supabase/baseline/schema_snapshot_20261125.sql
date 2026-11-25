-- BASELINE SNAPSHOT of production schema (public) taken 2026-11-25 via catalog queries.
-- REFERENCE ONLY: do not apply to production. Use to bootstrap a local/staging DB; order may need manual tweaks (extensions: vector, pg_cron, pg_net).
-- Source of truth for applied history: supabase_migrations.schema_migrations in prod.

-- ===== ENUMS =====
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled', 'pending_payment');

CREATE TYPE public.user_role AS ENUM ('user', 'nurse', 'admin');


-- ===== TABLES =====
CREATE TABLE public.ai_cache (id bigint NOT NULL DEFAULT nextval('ai_cache_id_seq'::regclass), prompt_hash text NOT NULL, model text NOT NULL, content text NOT NULL, created_at timestamp with time zone DEFAULT now(), expires_at timestamp with time zone NOT NULL, hit_count integer DEFAULT 1);

CREATE TABLE public.availability (id uuid NOT NULL DEFAULT gen_random_uuid(), nurse_id uuid NOT NULL, date date NOT NULL, shift text NOT NULL, is_available boolean DEFAULT true, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()), updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()));

CREATE TABLE public.benni_messages (id uuid NOT NULL DEFAULT gen_random_uuid(), family_user_id uuid NOT NULL, patient_user_id uuid, direction text NOT NULL, message text NOT NULL, context text, status text NOT NULL DEFAULT 'pending'::text, responded_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now(), updated_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.benni_session_log (id uuid NOT NULL DEFAULT gen_random_uuid(), patient_user_id uuid, family_user_id uuid, session_started_at timestamp with time zone NOT NULL DEFAULT now(), session_ended_at timestamp with time zone, session_duration_sec integer, turns_count integer NOT NULL DEFAULT 0, tools_called text[] NOT NULL DEFAULT '{}'::text[], escalated boolean NOT NULL DEFAULT false, created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.bookings (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, nurse_id uuid NOT NULL, date date NOT NULL, start_time time without time zone NOT NULL, end_time time without time zone NOT NULL, hours numeric(4,2) NOT NULL, status booking_status NOT NULL DEFAULT 'pending'::booking_status, total_price numeric(10,2) NOT NULL, notes text, patient_name text NOT NULL, patient_condition text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()), updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()), check_in_at timestamp with time zone, check_in_lat double precision, check_in_lng double precision, check_in_address text, check_out_at timestamp with time zone, check_out_lat double precision, check_out_lng double precision, address_mismatch boolean DEFAULT false, lat double precision, lng double precision, payment_status text DEFAULT 'pending'::text, wants_invoice boolean DEFAULT false, location_name text, emergency_contact text, patient_age text, request_id uuid, offer_id uuid);

CREATE TABLE public.care_logs (id uuid NOT NULL DEFAULT gen_random_uuid(), booking_id text NOT NULL, service_type text NOT NULL DEFAULT 'clinical'::text, arrival_time text, departure_time text, patient_condition_on_arrival text, patient_condition_on_departure text, activities jsonb DEFAULT '[]'::jsonb, observations text, narrative_report text, vital_signs jsonb DEFAULT '{}'::jsonb, updated_at timestamp with time zone DEFAULT now(), family_report text DEFAULT ''::text);

CREATE TABLE public.care_offers (id uuid NOT NULL DEFAULT gen_random_uuid(), request_id uuid NOT NULL, nurse_id uuid NOT NULL, slot_index integer NOT NULL, offered_rate numeric NOT NULL, status text DEFAULT 'pending'::text, notes text, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()), reject_reason text);

CREATE TABLE public.care_requests (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, patient_name text NOT NULL, patient_condition text NOT NULL, specialization_needed text NOT NULL, slots jsonb NOT NULL DEFAULT '[]'::jsonb, location_name text NOT NULL, notes text, status text DEFAULT 'open'::text, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()), response_deadline timestamp with time zone, lat double precision, lng double precision, wants_invoice boolean DEFAULT false, expected_duration text DEFAULT 'shifts'::text, nurse_summary text, urgency text, patient_age_range text, patient_gender text, patient_data jsonb, preferred_nurse_id uuid);

CREATE TABLE public.chat_rooms (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, nurse_id uuid NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()));

CREATE TABLE public.chat_sessions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_role text NOT NULL DEFAULT 'visitor'::text, summary text, topics text[], resolved boolean DEFAULT false, message_count integer DEFAULT 0, created_at timestamp with time zone NOT NULL DEFAULT now(), closed_at timestamp with time zone, user_id uuid);

CREATE TABLE public.content_history (id bigint NOT NULL, topic text NOT NULL, article_text text, teaser text, next_topic text, status text NOT NULL DEFAULT 'generated'::text, series_position integer, fb_post_id text, image_path text, published_at timestamp with time zone, created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.cssp_portal_status (id integer NOT NULL DEFAULT 1, is_online boolean NOT NULL DEFAULT true, first_down_at timestamp with time zone, last_checked_at timestamp with time zone);

CREATE TABLE public.family_reviews (id uuid NOT NULL DEFAULT gen_random_uuid(), booking_id uuid NOT NULL, nurse_id uuid NOT NULL, user_id uuid NOT NULL, rating integer NOT NULL, comment text, created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.health_log (id uuid NOT NULL DEFAULT gen_random_uuid(), patient_user_id uuid, family_user_id uuid, symptom text NOT NULL, intensity integer, location text, notes text, logged_by text NOT NULL DEFAULT 'benni'::text, created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.knowledge_base (id uuid NOT NULL DEFAULT gen_random_uuid(), source text NOT NULL, title text NOT NULL, content text NOT NULL, chunk_index integer NOT NULL DEFAULT 0, embedding vector(1536), metadata jsonb DEFAULT '{}'::jsonb, created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.messages (id uuid NOT NULL DEFAULT gen_random_uuid(), chat_room_id uuid NOT NULL, sender_id uuid NOT NULL, content text NOT NULL, created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()));

CREATE TABLE public.monitor_incidents (id uuid NOT NULL DEFAULT gen_random_uuid(), incident_type text NOT NULL, severity text NOT NULL DEFAULT 'info'::text, source text, message text NOT NULL, details jsonb, resolved boolean DEFAULT false, resolved_by text, resolved_at timestamp with time zone, created_at timestamp with time zone DEFAULT now());

CREATE TABLE public.notification_logs (id uuid NOT NULL DEFAULT gen_random_uuid(), family_user_id uuid, reminder_id uuid, notification_type text NOT NULL, channel text NOT NULL DEFAULT 'push'::text, recipient_user_id uuid, title text, body text, payload jsonb, push_endpoint text, push_status text, push_response_code integer, error_message text, created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.notifications_log (id uuid NOT NULL DEFAULT gen_random_uuid(), event_type text NOT NULL, entity_id uuid, entity_table text, admin_user_id uuid NOT NULL, sent_at timestamp with time zone NOT NULL DEFAULT now(), payload jsonb);

CREATE TABLE public.nurse_reviews (id uuid NOT NULL DEFAULT gen_random_uuid(), booking_id uuid, nurse_id uuid, user_id uuid, rating integer NOT NULL, comment text, created_at timestamp with time zone DEFAULT timezone('utc'::text, now()));

CREATE TABLE public.nurses (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, specialization text[] NOT NULL DEFAULT '{}'::text[], coverage_radius integer NOT NULL DEFAULT 5, rating numeric(3,2) DEFAULT 5.0, review_count integer DEFAULT 0, lat double precision NOT NULL, lng double precision NOT NULL, bio text NOT NULL, experience_years integer NOT NULL DEFAULT 0, certifications text[] NOT NULL DEFAULT '{}'::text[], created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()), updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()), shift_rate numeric, available_shifts text[] DEFAULT '{morning}'::text[], available_days integer[] DEFAULT '{1,2,3,4,5}'::integer[], cssp_registration text, cssp_level text, cssp_verification_status text DEFAULT 'unverified'::text, cssp_verified boolean DEFAULT false, cssp_verification_date timestamp with time zone, cssp_verification_notes text, dui text DEFAULT ''::text, assignment_availability text DEFAULT 'shifts_only'::text, payment_preference text DEFAULT 'per_shift'::text, cssp_email_sent_at timestamp with time zone, cssp_email_count integer DEFAULT 0, is_active boolean DEFAULT true, inactivity_email_count integer DEFAULT 0, inactivity_email_sent_at timestamp with time zone, verifications jsonb DEFAULT '{}'::jsonb, portal_down_notified boolean DEFAULT false);

CREATE TABLE public.patient_activity (family_user_id uuid NOT NULL, last_seen_at timestamp with time zone NOT NULL DEFAULT now(), last_interaction_type text, created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.profiles (id uuid NOT NULL, email text NOT NULL, role user_role NOT NULL DEFAULT 'user'::user_role, full_name text NOT NULL, avatar_url text, phone text, location_name text, created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()), updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()), last_sign_in_at timestamp with time zone, is_demo boolean DEFAULT false, agent_memory jsonb DEFAULT '{}'::jsonb, country text DEFAULT 'SV'::text);

CREATE TABLE public.push_subscriptions (id uuid NOT NULL DEFAULT gen_random_uuid(), user_id uuid NOT NULL, endpoint text NOT NULL, p256dh_key text NOT NULL, auth_key text NOT NULL, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now());

CREATE TABLE public.rag_documents (id uuid NOT NULL DEFAULT gen_random_uuid(), project text NOT NULL DEFAULT 'default'::text, source_url text NOT NULL, source_type text NOT NULL DEFAULT 'html'::text, chunk_index integer NOT NULL, chunk_text text NOT NULL, embedding vector(1024), metadata jsonb DEFAULT '{}'::jsonb, created_at timestamp with time zone NOT NULL DEFAULT now());

CREATE TABLE public.support_emails (id uuid NOT NULL DEFAULT gen_random_uuid(), from_email text NOT NULL, to_email text NOT NULL, subject text, body text, classification text, is_biencuidar boolean DEFAULT false, auto_replied boolean DEFAULT false, auto_reply_body text, needs_human boolean DEFAULT false, created_at timestamp with time zone DEFAULT now(), notified_at timestamp with time zone, resend_email_id text);

CREATE TABLE public.voice_reminders (id uuid NOT NULL DEFAULT gen_random_uuid(), family_user_id uuid NOT NULL, patient_user_id uuid, type text NOT NULL DEFAULT 'medicine'::text, label text NOT NULL, message text NOT NULL, scheduled_time time without time zone NOT NULL, days_of_week integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'::integer[], active boolean NOT NULL DEFAULT true, last_sent_at timestamp with time zone, created_at timestamp with time zone DEFAULT now(), updated_at timestamp with time zone DEFAULT now(), is_morning_briefing boolean NOT NULL DEFAULT false);


-- ===== CONSTRAINTS =====
ALTER TABLE ai_cache ADD CONSTRAINT ai_cache_pkey PRIMARY KEY (id);

ALTER TABLE ai_cache ADD CONSTRAINT ai_cache_prompt_hash_key UNIQUE (prompt_hash);

ALTER TABLE availability ADD CONSTRAINT availability_nurse_id_date_shift_key UNIQUE (nurse_id, date, shift);

ALTER TABLE availability ADD CONSTRAINT availability_pkey PRIMARY KEY (id);

ALTER TABLE availability ADD CONSTRAINT availability_shift_check CHECK ((shift = ANY (ARRAY['morning'::text, 'afternoon'::text, 'night'::text])));

ALTER TABLE benni_messages ADD CONSTRAINT companero_messages_direction_check CHECK ((direction = ANY (ARRAY['patient_to_family'::text, 'family_to_patient'::text])));

ALTER TABLE benni_messages ADD CONSTRAINT companero_messages_pkey PRIMARY KEY (id);

ALTER TABLE benni_messages ADD CONSTRAINT companero_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'answered'::text, 'expired'::text])));

ALTER TABLE benni_session_log ADD CONSTRAINT benni_session_log_pkey PRIMARY KEY (id);

ALTER TABLE bookings ADD CONSTRAINT bookings_hours_check CHECK ((hours > (0)::numeric));

ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text])));

ALTER TABLE bookings ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);

ALTER TABLE bookings ADD CONSTRAINT bookings_total_price_check CHECK ((total_price >= (0)::numeric));

ALTER TABLE care_logs ADD CONSTRAINT care_logs_booking_id_key UNIQUE (booking_id);

ALTER TABLE care_logs ADD CONSTRAINT care_logs_pkey PRIMARY KEY (id);

ALTER TABLE care_offers ADD CONSTRAINT care_offers_offered_rate_check CHECK ((offered_rate > (0)::numeric));

ALTER TABLE care_offers ADD CONSTRAINT care_offers_pkey PRIMARY KEY (id);

ALTER TABLE care_offers ADD CONSTRAINT care_offers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text])));

ALTER TABLE care_requests ADD CONSTRAINT care_requests_pkey PRIMARY KEY (id);

ALTER TABLE care_requests ADD CONSTRAINT care_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'matched'::text, 'closed'::text, 'expired'::text, 'cancelled'::text])));

ALTER TABLE chat_rooms ADD CONSTRAINT chat_rooms_pkey PRIMARY KEY (id);

ALTER TABLE chat_rooms ADD CONSTRAINT chat_rooms_user_id_nurse_id_key UNIQUE (user_id, nurse_id);

ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);

ALTER TABLE content_history ADD CONSTRAINT content_history_pkey PRIMARY KEY (id);

ALTER TABLE cssp_portal_status ADD CONSTRAINT cssp_portal_status_pkey PRIMARY KEY (id);

ALTER TABLE cssp_portal_status ADD CONSTRAINT single_row CHECK ((id = 1));

ALTER TABLE family_reviews ADD CONSTRAINT family_reviews_booking_id_nurse_id_key UNIQUE (booking_id, nurse_id);

ALTER TABLE family_reviews ADD CONSTRAINT family_reviews_pkey PRIMARY KEY (id);

ALTER TABLE family_reviews ADD CONSTRAINT family_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));

ALTER TABLE health_log ADD CONSTRAINT health_log_intensity_check CHECK (((intensity >= 1) AND (intensity <= 10)));

ALTER TABLE health_log ADD CONSTRAINT health_log_pkey PRIMARY KEY (id);

ALTER TABLE knowledge_base ADD CONSTRAINT knowledge_base_pkey PRIMARY KEY (id);

ALTER TABLE messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

ALTER TABLE monitor_incidents ADD CONSTRAINT monitor_incidents_pkey PRIMARY KEY (id);

ALTER TABLE monitor_incidents ADD CONSTRAINT monitor_incidents_severity_check CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text])));

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_channel_check CHECK ((channel = ANY (ARRAY['push'::text, 'in_app'::text])));

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_notification_type_check CHECK ((notification_type = ANY (ARRAY['reminder'::text, 'test'::text, 'escalate'::text, 'family_reply'::text, 'wellness_alert'::text, 'unread_reminders'::text, 'weekly_summary'::text])));

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_push_status_check CHECK ((push_status = ANY (ARRAY['sent'::text, 'failed'::text, 'no_subscription'::text])));

ALTER TABLE notifications_log ADD CONSTRAINT notifications_log_event_type_entity_id_admin_user_id_key UNIQUE (event_type, entity_id, admin_user_id);

ALTER TABLE notifications_log ADD CONSTRAINT notifications_log_pkey PRIMARY KEY (id);

ALTER TABLE nurse_reviews ADD CONSTRAINT nurse_reviews_booking_id_key UNIQUE (booking_id);

ALTER TABLE nurse_reviews ADD CONSTRAINT nurse_reviews_pkey PRIMARY KEY (id);

ALTER TABLE nurse_reviews ADD CONSTRAINT nurse_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));

ALTER TABLE nurses ADD CONSTRAINT nurses_coverage_radius_check CHECK ((coverage_radius > 0));

ALTER TABLE nurses ADD CONSTRAINT nurses_cssp_level_check CHECK ((cssp_level = ANY (ARRAY['Licenciada'::text, 'Tecnóloga'::text, 'Técnica'::text, 'Auxiliar'::text])));

ALTER TABLE nurses ADD CONSTRAINT nurses_cssp_verification_status_check CHECK ((cssp_verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'auto_verified'::text, 'manual_verified'::text, 'rejected'::text])));

ALTER TABLE nurses ADD CONSTRAINT nurses_pkey PRIMARY KEY (id);

ALTER TABLE nurses ADD CONSTRAINT nurses_rating_check CHECK (((rating >= 1.0) AND (rating <= 5.0)));

ALTER TABLE nurses ADD CONSTRAINT nurses_review_count_check CHECK ((review_count >= 0));

ALTER TABLE nurses ADD CONSTRAINT nurses_shift_rate_check CHECK ((shift_rate > (0)::numeric));

ALTER TABLE nurses ADD CONSTRAINT nurses_user_id_key UNIQUE (user_id);

ALTER TABLE patient_activity ADD CONSTRAINT patient_activity_pkey PRIMARY KEY (family_user_id);

ALTER TABLE profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);

ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_user_id_key UNIQUE (endpoint, user_id);

ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_pkey PRIMARY KEY (id);

ALTER TABLE support_emails ADD CONSTRAINT support_emails_pkey PRIMARY KEY (id);

ALTER TABLE voice_reminders ADD CONSTRAINT voice_reminders_pkey PRIMARY KEY (id);


-- ===== FOREIGN KEYS =====
ALTER TABLE availability ADD CONSTRAINT availability_nurse_id_fkey FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE;

ALTER TABLE benni_messages ADD CONSTRAINT companero_messages_family_user_id_fkey FOREIGN KEY (family_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE benni_messages ADD CONSTRAINT companero_messages_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE benni_session_log ADD CONSTRAINT benni_session_log_family_user_id_fkey FOREIGN KEY (family_user_id) REFERENCES profiles(id);

ALTER TABLE benni_session_log ADD CONSTRAINT benni_session_log_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES profiles(id);

ALTER TABLE bookings ADD CONSTRAINT bookings_nurse_id_fkey FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE;

ALTER TABLE bookings ADD CONSTRAINT bookings_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES care_offers(id) ON DELETE SET NULL;

ALTER TABLE bookings ADD CONSTRAINT bookings_request_id_fkey FOREIGN KEY (request_id) REFERENCES care_requests(id) ON DELETE SET NULL;

ALTER TABLE bookings ADD CONSTRAINT bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE care_offers ADD CONSTRAINT care_offers_nurse_id_fkey FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE;

ALTER TABLE care_offers ADD CONSTRAINT care_offers_request_id_fkey FOREIGN KEY (request_id) REFERENCES care_requests(id) ON DELETE CASCADE;

ALTER TABLE care_requests ADD CONSTRAINT care_requests_preferred_nurse_id_fkey FOREIGN KEY (preferred_nurse_id) REFERENCES nurses(id);

ALTER TABLE care_requests ADD CONSTRAINT care_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE chat_rooms ADD CONSTRAINT chat_rooms_nurse_id_fkey FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE;

ALTER TABLE chat_rooms ADD CONSTRAINT chat_rooms_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

ALTER TABLE family_reviews ADD CONSTRAINT family_reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

ALTER TABLE family_reviews ADD CONSTRAINT family_reviews_nurse_id_fkey FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE;

ALTER TABLE family_reviews ADD CONSTRAINT family_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE health_log ADD CONSTRAINT health_log_family_user_id_fkey FOREIGN KEY (family_user_id) REFERENCES profiles(id);

ALTER TABLE health_log ADD CONSTRAINT health_log_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES profiles(id);

ALTER TABLE messages ADD CONSTRAINT messages_chat_room_id_fkey FOREIGN KEY (chat_room_id) REFERENCES chat_rooms(id) ON DELETE CASCADE;

ALTER TABLE messages ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_family_user_id_fkey FOREIGN KEY (family_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_reminder_id_fkey FOREIGN KEY (reminder_id) REFERENCES voice_reminders(id) ON DELETE SET NULL;

ALTER TABLE nurse_reviews ADD CONSTRAINT nurse_reviews_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

ALTER TABLE nurse_reviews ADD CONSTRAINT nurse_reviews_nurse_id_fkey FOREIGN KEY (nurse_id) REFERENCES nurses(id) ON DELETE CASCADE;

ALTER TABLE nurse_reviews ADD CONSTRAINT nurse_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE nurses ADD CONSTRAINT nurses_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE patient_activity ADD CONSTRAINT patient_activity_family_user_id_fkey FOREIGN KEY (family_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE voice_reminders ADD CONSTRAINT voice_reminders_family_user_id_fkey FOREIGN KEY (family_user_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE voice_reminders ADD CONSTRAINT voice_reminders_patient_user_id_fkey FOREIGN KEY (patient_user_id) REFERENCES profiles(id) ON DELETE SET NULL;


-- ===== INDEXES =====
CREATE INDEX idx_ai_cache_expires ON public.ai_cache USING btree (expires_at);

CREATE INDEX idx_ai_cache_hash ON public.ai_cache USING btree (prompt_hash);

CREATE INDEX idx_benni_messages_family_status ON public.benni_messages USING btree (family_user_id, direction, status);

CREATE INDEX idx_benni_session_log_family_user_id ON public.benni_session_log USING btree (family_user_id);

CREATE INDEX idx_benni_session_log_started_at ON public.benni_session_log USING btree (session_started_at DESC);

CREATE INDEX idx_benni_session_patient ON public.benni_session_log USING btree (patient_user_id);

CREATE INDEX idx_benni_session_started ON public.benni_session_log USING btree (session_started_at DESC);

CREATE INDEX idx_bookings_nurse_id_date ON public.bookings USING btree (nurse_id, date DESC);

CREATE INDEX idx_bookings_offer_id ON public.bookings USING btree (offer_id);

CREATE INDEX idx_bookings_request_id ON public.bookings USING btree (request_id);

CREATE INDEX idx_bookings_status_created ON public.bookings USING btree (status, created_at);

CREATE INDEX idx_bookings_user_id_date ON public.bookings USING btree (user_id, date DESC);

CREATE INDEX idx_care_logs_booking_id ON public.care_logs USING btree (booking_id);

CREATE INDEX idx_care_offers_nurse_status ON public.care_offers USING btree (nurse_id, status);

CREATE INDEX idx_care_offers_request_status ON public.care_offers USING btree (request_id, status);

CREATE INDEX idx_care_requests_preferred_nurse ON public.care_requests USING btree (preferred_nurse_id) WHERE (preferred_nurse_id IS NOT NULL);

CREATE INDEX idx_care_requests_status_deadline ON public.care_requests USING btree (status, response_deadline);

CREATE INDEX idx_care_requests_urgency ON public.care_requests USING btree (urgency) WHERE (urgency = 'high'::text);

CREATE INDEX idx_care_requests_user_status ON public.care_requests USING btree (user_id, status);

CREATE INDEX idx_companero_messages_family ON public.benni_messages USING btree (family_user_id);

CREATE INDEX idx_companero_messages_status ON public.benni_messages USING btree (status);

CREATE INDEX idx_health_log_created ON public.health_log USING btree (created_at DESC);

CREATE INDEX idx_health_log_created_at ON public.health_log USING btree (created_at DESC);

CREATE INDEX idx_health_log_family_user_id ON public.health_log USING btree (family_user_id);

CREATE INDEX idx_health_log_patient ON public.health_log USING btree (patient_user_id);

CREATE INDEX idx_monitor_incidents_created_at ON public.monitor_incidents USING btree (created_at DESC);

CREATE INDEX idx_monitor_incidents_type_resolved ON public.monitor_incidents USING btree (incident_type, resolved);

CREATE INDEX idx_notification_logs_created ON public.notification_logs USING btree (created_at DESC);

CREATE INDEX idx_notification_logs_family ON public.notification_logs USING btree (family_user_id);

CREATE INDEX idx_notification_logs_type ON public.notification_logs USING btree (notification_type);

CREATE INDEX idx_nurses_user_id ON public.nurses USING btree (user_id);

CREATE INDEX idx_profiles_phone_digits ON public.profiles USING btree (phone_digits(phone));

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);

CREATE INDEX idx_support_emails_resend_id ON public.support_emails USING btree (resend_email_id);

CREATE INDEX idx_voice_reminders_active ON public.voice_reminders USING btree (active) WHERE (active = true);

CREATE INDEX idx_voice_reminders_active_time ON public.voice_reminders USING btree (active, scheduled_time);

CREATE INDEX idx_voice_reminders_time ON public.voice_reminders USING btree (scheduled_time);

CREATE INDEX knowledge_base_content_fts_idx ON public.knowledge_base USING gin (to_tsvector('spanish'::regconfig, content));

CREATE INDEX knowledge_base_embedding_idx ON public.knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');

CREATE INDEX rag_documents_embedding_idx ON public.rag_documents USING ivfflat (embedding vector_cosine_ops) WITH (lists='100');

CREATE INDEX rag_documents_project_idx ON public.rag_documents USING btree (project);

CREATE INDEX rag_documents_source_url_idx ON public.rag_documents USING btree (source_url);


-- ===== ROW LEVEL SECURITY =====
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.benni_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.benni_session_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.care_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.care_offers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.care_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.content_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cssp_portal_status ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.family_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.health_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.monitor_incidents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nurse_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.nurses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_activity ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rag_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.support_emails ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.voice_reminders ENABLE ROW LEVEL SECURITY;


-- ===== FUNCTIONS =====
CREATE OR REPLACE FUNCTION public._is_client_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ SELECT current_user IN ('authenticated', 'anon') AND NOT public.is_admin() $function$
;

CREATE OR REPLACE FUNCTION public.accept_offer(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer RECORD;
  v_request RECORD;
  v_slot JSONB;
  v_total_price NUMERIC;
  v_booking_id UUID;
  v_booking_status TEXT;
  -- Pricing constants — must match src/data/standardRates.ts
  v_platform_commission NUMERIC := 5.00;
  v_iva_rate NUMERIC := 0.13;
BEGIN
  -- Lock the offer row to prevent concurrent acceptance
  SELECT * INTO v_offer
  FROM care_offers
  WHERE id = p_offer_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'offer_not_found_or_not_pending');
  END IF;

  -- Lock the request
  SELECT * INTO v_request
  FROM care_requests
  WHERE id = v_offer.request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'request_not_found');
  END IF;

  -- AUTH CHECK: only the request owner can accept offers
  IF auth.uid() IS NULL OR v_request.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_request.status != 'open' THEN
    RETURN jsonb_build_object('error', 'request_not_open', 'current_status', v_request.status);
  END IF;

  -- Extract the slot from the JSON array
  v_slot := v_request.slots::jsonb -> v_offer.slot_index;
  IF v_slot IS NULL THEN
    RETURN jsonb_build_object('error', 'slot_not_found', 'slot_index', v_offer.slot_index);
  END IF;

  -- Calculate family price: commission + IVA when invoicing
  -- Must match calculateFamilyPrice() in src/data/standardRates.ts
  v_total_price := CASE WHEN v_request.wants_invoice
    THEN v_offer.offered_rate + v_platform_commission * (1 + v_iva_rate)
    ELSE v_offer.offered_rate END;

  v_booking_status := CASE WHEN v_request.wants_invoice
    THEN 'pending_payment'
    ELSE 'confirmed' END;

  -- Create booking with marketplace lineage (request_id / offer_id)
  INSERT INTO bookings (
    user_id, nurse_id, date, shift, total_price, notes,
    patient_name, patient_condition, wants_invoice,
    location_name, lat, lng, status,
    request_id, offer_id
  ) VALUES (
    v_request.user_id, v_offer.nurse_id,
    (v_slot ->> 'date')::date, v_slot ->> 'shift',
    v_total_price, v_request.notes,
    v_request.patient_name, v_request.patient_condition,
    v_request.wants_invoice,
    v_request.location_name, v_request.lat, v_request.lng,
    v_booking_status,
    v_offer.request_id, v_offer.id
  ) RETURNING id INTO v_booking_id;

  -- Accept the offer
  UPDATE care_offers SET status = 'accepted' WHERE id = p_offer_id;

  -- Reject pending siblings for the SAME slot only (multi-turno support)
  UPDATE care_offers
  SET status = 'rejected', reject_reason = 'auto'
  WHERE request_id = v_offer.request_id
    AND slot_index = v_offer.slot_index
    AND id != p_offer_id
    AND status = 'pending';

  -- Mark request 'matched' ONLY when every slot index has an accepted offer
  IF NOT EXISTS (
    SELECT 1
    FROM generate_series(0, jsonb_array_length(v_request.slots::jsonb) - 1) AS s(i)
    WHERE NOT EXISTS (
      SELECT 1
      FROM care_offers o
      WHERE o.request_id = v_offer.request_id
        AND o.slot_index = s.i
        AND o.status = 'accepted'
    )
  ) THEN
    UPDATE care_requests SET status = 'matched' WHERE id = v_offer.request_id;
  END IF;

  -- Auto-withdraw the nurse's pending offers on OTHER requests when the slot
  -- conflicts on date AND shift ('full_day' conflicts with any shift).
  WITH conflicting AS (
    SELECT o.id
    FROM care_offers o
    JOIN care_requests r ON r.id = o.request_id
    WHERE o.nurse_id = v_offer.nurse_id
      AND o.status = 'pending'
      AND o.id != p_offer_id
      AND r.slots::jsonb -> o.slot_index ->> 'date' = v_slot ->> 'date'
      AND (
        r.slots::jsonb -> o.slot_index ->> 'shift' = v_slot ->> 'shift'
        OR r.slots::jsonb -> o.slot_index ->> 'shift' = 'full_day'
        OR v_slot ->> 'shift' = 'full_day'
      )
  )
  UPDATE care_offers
  SET status = 'rejected', reject_reason = 'auto'
  WHERE id IN (SELECT id FROM conflicting);

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.demo_profile_ids()
 RETURNS TABLE(id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id FROM profiles WHERE is_demo;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_bookings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  NEW.user_id := OLD.user_id;
  NEW.nurse_id := OLD.nurse_id;
  NEW.total_price := OLD.total_price;
  NEW.request_id := OLD.request_id;
  NEW.offer_id := OLD.offer_id;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.guard_care_offers()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text = 'accepted' THEN NEW.status := 'pending'; END IF;
  ELSE
    NEW.nurse_id := OLD.nurse_id;
    NEW.request_id := OLD.request_id;
    NEW.slot_index := OLD.slot_index;
    NEW.offered_rate := OLD.offered_rate;
    IF NEW.status::text = 'accepted' AND OLD.status::text <> 'accepted' THEN NEW.status := OLD.status; END IF;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.guard_nurses()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.cssp_verified := false;
    NEW.cssp_verification_date := NULL;
    NEW.cssp_verification_notes := NULL;
    IF NEW.cssp_verification_status IS NOT NULL AND NEW.cssp_verification_status NOT IN ('unverified', 'n/a', 'pending') THEN
      NEW.cssp_verification_status := 'unverified';
    END IF;
  ELSE
    NEW.user_id := OLD.user_id;
    NEW.cssp_verified := OLD.cssp_verified;
    NEW.cssp_verification_status := OLD.cssp_verification_status;
    NEW.cssp_verification_date := OLD.cssp_verification_date;
    NEW.cssp_verification_notes := OLD.cssp_verification_notes;
    NEW.cssp_email_sent_at := OLD.cssp_email_sent_at;
    NEW.cssp_email_count := OLD.cssp_email_count;
    NEW.inactivity_email_count := OLD.inactivity_email_count;
    NEW.inactivity_email_sent_at := OLD.inactivity_email_sent_at;
    NEW.portal_down_notified := OLD.portal_down_notified;
    NEW.verifications := OLD.verifications;
    NEW.rating := OLD.rating;
    NEW.review_count := OLD.review_count;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.guard_profiles()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public._is_client_role() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.role::text NOT IN ('user', 'nurse') THEN NEW.role := 'user'; END IF;
    NEW.is_demo := false;
  ELSE
    NEW.role := OLD.role;
    NEW.is_demo := OLD.is_demo;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$ BEGIN INSERT INTO public.profiles (id, email, full_name, role, phone, location_name, avatar_url) VALUES ( new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', 'Nuevo Usuario'), (CASE WHEN new.raw_user_meta_data->>'role' = 'nurse' THEN 'nurse' ELSE 'user' END)::user_role, COALESCE(new.raw_user_meta_data->>'phone', NULL), COALESCE(new.raw_user_meta_data->>'location_name', NULL), COALESCE(new.raw_user_meta_data->>'avatar_url', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100') ) ON CONFLICT (id) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, profiles.phone), full_name = COALESCE(EXCLUDED.full_name, profiles.full_name), role = EXCLUDED.role, location_name = COALESCE(EXCLUDED.location_name, profiles.location_name); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.has_service_contact(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p_profile_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.nurses n ON n.id = b.nurse_id
      WHERE b.status IN ('confirmed', 'pending_payment', 'completed')
        AND (
          (b.user_id = auth.uid() AND n.user_id = p_profile_id)
          OR (n.user_id = auth.uid() AND b.user_id = p_profile_id)
        )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.is_phone_registered(p_phone text, p_country text DEFAULT 'SV'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_digits TEXT := public.phone_digits(p_phone);
  v_dial TEXT;
  v_local_digits TEXT;
  v_e164_digits TEXT;
BEGIN
  IF length(v_digits) = 0 THEN
    RETURN false;
  END IF;

  v_dial := CASE upper(COALESCE(p_country, 'SV'))
    WHEN 'SV' THEN '503'
    WHEN 'GT' THEN '502'
    WHEN 'HN' THEN '504'
    WHEN 'NI' THEN '505'
    WHEN 'CR' THEN '506'
    WHEN 'PA' THEN '507'
    WHEN 'MX' THEN '52'
    WHEN 'CO' THEN '57'
    WHEN 'PE' THEN '51'
    WHEN 'EC' THEN '593'
    WHEN 'CL' THEN '56'
    WHEN 'AR' THEN '54'
    WHEN 'DO' THEN '1'
    ELSE '503'
  END;

  IF v_digits LIKE v_dial || '%' AND length(v_digits) > length(v_dial) + 6 THEN
    v_e164_digits := v_digits;
    v_local_digits := substr(v_digits, length(v_dial) + 1);
  ELSE
    v_local_digits := v_digits;
    v_e164_digits := v_dial || v_digits;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE public.phone_digits(p.phone) IN (v_local_digits, v_e164_digits)
      AND COALESCE(p.is_demo, false) = false
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.phone_digits(p_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$function$
;

CREATE OR REPLACE FUNCTION public.rag_search(query_embedding vector, match_count integer DEFAULT 10, filter_project text DEFAULT 'default'::text)
 RETURNS TABLE(id uuid, source_url text, source_type text, chunk_index integer, chunk_text text, metadata jsonb, similarity double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    id,
    source_url,
    source_type,
    chunk_index,
    chunk_text,
    metadata,
    1 - (embedding <=> query_embedding) as similarity
  from rag_documents
  where project = filter_project
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_login_identifier(p_identifier text, p_country text DEFAULT 'SV'::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clean TEXT := lower(trim(COALESCE(p_identifier, '')));
  v_digits TEXT;
  v_dial TEXT;
  v_local_digits TEXT;
  v_e164_digits TEXT;
  v_found_email TEXT;
BEGIN
  IF position('@' IN v_clean) > 0 THEN
    RETURN v_clean;
  END IF;

  v_digits := public.phone_digits(v_clean);
  IF length(v_digits) = 0 THEN
    RETURN '';
  END IF;

  v_dial := CASE upper(COALESCE(p_country, 'SV'))
    WHEN 'SV' THEN '503'
    WHEN 'GT' THEN '502'
    WHEN 'HN' THEN '504'
    WHEN 'NI' THEN '505'
    WHEN 'CR' THEN '506'
    WHEN 'PA' THEN '507'
    WHEN 'MX' THEN '52'
    WHEN 'CO' THEN '57'
    WHEN 'PE' THEN '51'
    WHEN 'EC' THEN '593'
    WHEN 'CL' THEN '56'
    WHEN 'AR' THEN '54'
    WHEN 'DO' THEN '1'
    ELSE '503'
  END;

  IF v_digits LIKE v_dial || '%' AND length(v_digits) > length(v_dial) + 6 THEN
    v_e164_digits := v_digits;
    v_local_digits := substr(v_digits, length(v_dial) + 1);
  ELSE
    v_local_digits := v_digits;
    v_e164_digits := v_dial || v_digits;
  END IF;

  SELECT p.email INTO v_found_email
  FROM public.profiles p
  WHERE public.phone_digits(p.phone) IN (v_local_digits, v_e164_digits)
  ORDER BY COALESCE(p.is_demo, false) ASC, p.created_at DESC
  LIMIT 1;

  IF v_found_email IS NOT NULL AND length(v_found_email) > 0 THEN
    RETURN lower(v_found_email);
  END IF;

  RETURN v_e164_digits || '@tel.biencuidar.com';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.search_knowledge_base(query_text text, query_embedding vector, match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, source text, title text, content text, chunk_index integer, similarity double precision)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    kb.id,
    kb.source,
    kb.title,
    kb.content,
    kb.chunk_index,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  WHERE kb.embedding IS NOT NULL
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_last_sign_in()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.profiles 
  SET last_sign_in_at = NOW() 
  WHERE id = NEW.id;
  RETURN NEW;
END;
$function$
;


-- ===== VIEWS =====
CREATE OR REPLACE VIEW public.care_requests_public AS  SELECT cr.id,
    cr.user_id,
    cr.specialization_needed,
    cr.slots,
    cr.location_name,
    cr.status,
    cr.created_at,
    cr.response_deadline,
    cr.lat,
    cr.lng,
    cr.wants_invoice,
    cr.expected_duration,
    cr.urgency,
    cr.patient_age_range,
    cr.patient_gender,
    cr.patient_condition,
    cr.nurse_summary,
    cr.preferred_nurse_id,
        CASE
            WHEN ((cr.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN cr.patient_name
            ELSE NULL::text
        END AS patient_name,
        CASE
            WHEN ((cr.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN cr.patient_data
            ELSE NULL::jsonb
        END AS patient_data,
        CASE
            WHEN ((cr.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN cr.notes
            ELSE NULL::text
        END AS notes
   FROM (care_requests cr
     LEFT JOIN profiles caller ON ((caller.id = auth.uid())))
  WHERE ((auth.uid() IS NOT NULL) AND ((cr.user_id = auth.uid()) OR (cr.status = 'open'::text) OR (caller.role = 'admin'::user_role)));

CREATE OR REPLACE VIEW public.nurses_public AS  SELECT n.id,
    n.user_id,
    n.specialization,
    n.coverage_radius,
    n.rating,
    n.review_count,
    n.lat,
    n.lng,
    n.bio,
    n.experience_years,
    n.certifications,
    n.created_at,
    n.updated_at,
    n.shift_rate,
    n.available_shifts,
    n.available_days,
    n.cssp_level,
    n.cssp_verified,
    n.cssp_verification_status,
    n.cssp_verification_date,
    n.assignment_availability,
    n.payment_preference,
    n.is_active,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.dui
            ELSE NULL::text
        END AS dui,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.cssp_registration
            ELSE NULL::text
        END AS cssp_registration,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.cssp_verification_notes
            ELSE NULL::text
        END AS cssp_verification_notes,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.cssp_email_sent_at
            ELSE NULL::timestamp with time zone
        END AS cssp_email_sent_at,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.cssp_email_count
            ELSE NULL::integer
        END AS cssp_email_count,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.inactivity_email_count
            ELSE NULL::integer
        END AS inactivity_email_count,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.inactivity_email_sent_at
            ELSE NULL::timestamp with time zone
        END AS inactivity_email_sent_at,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.verifications
            ELSE NULL::jsonb
        END AS verifications,
        CASE
            WHEN ((n.user_id = auth.uid()) OR (caller.role = 'admin'::user_role)) THEN n.portal_down_notified
            ELSE NULL::boolean
        END AS portal_down_notified
   FROM (nurses n
     LEFT JOIN profiles caller ON ((caller.id = auth.uid())))
  WHERE (auth.uid() IS NOT NULL);

CREATE OR REPLACE VIEW public.profiles_public AS  SELECT id,
    full_name,
    avatar_url,
    location_name,
    role,
    country,
        CASE
            WHEN has_service_contact(id) THEN phone
            ELSE NULL::text
        END AS phone,
    created_at,
    updated_at
   FROM profiles p
  WHERE (auth.uid() IS NOT NULL);


-- ===== TRIGGERS =====
CREATE TRIGGER trg_guard_bookings BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION guard_bookings();

CREATE TRIGGER trg_guard_care_offers BEFORE INSERT OR UPDATE ON public.care_offers FOR EACH ROW EXECUTE FUNCTION guard_care_offers();

CREATE TRIGGER trg_guard_nurses BEFORE INSERT OR UPDATE ON public.nurses FOR EACH ROW EXECUTE FUNCTION guard_nurses();

CREATE TRIGGER trg_guard_profiles BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profiles();


-- ===== POLICIES =====
CREATE POLICY "Authenticated can view availability" ON public.availability AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Nurses can create own availability" ON public.availability AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = availability.nurse_id) AND (n.user_id = auth.uid())))));

CREATE POLICY "Nurses can delete own availability" ON public.availability AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = availability.nurse_id) AND (n.user_id = auth.uid())))));

CREATE POLICY "Nurses can update own availability" ON public.availability AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = availability.nurse_id) AND (n.user_id = auth.uid())))));

CREATE POLICY "Family can manage their messages" ON public.benni_messages AS PERMISSIVE FOR ALL TO public USING ((family_user_id = auth.uid()));

CREATE POLICY "Patient can read messages directed to them" ON public.benni_messages AS PERMISSIVE FOR SELECT TO public USING ((patient_user_id = auth.uid()));

CREATE POLICY "Admin can read benni_session_log" ON public.benni_session_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));

CREATE POLICY "Family can read benni_session_log" ON public.benni_session_log AS PERMISSIVE FOR SELECT TO public USING ((family_user_id = auth.uid()));

CREATE POLICY "Service role can update benni_session_log" ON public.benni_session_log AS PERMISSIVE FOR UPDATE TO public USING (true);

CREATE POLICY "Service role can write benni_session_log" ON public.benni_session_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Users can create bookings" ON public.bookings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update booking status" ON public.bookings AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = bookings.nurse_id) AND (n.user_id = auth.uid()))))));

CREATE POLICY "Users can view their own bookings" ON public.bookings AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = bookings.nurse_id) AND (n.user_id = auth.uid()))))));

CREATE POLICY "Nurses can insert care logs" ON public.care_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE (((b.id)::text = care_logs.booking_id) AND (EXISTS ( SELECT 1
           FROM nurses n
          WHERE ((n.id = b.nurse_id) AND (n.user_id = auth.uid()))))))));

CREATE POLICY "Nurses can update care logs" ON public.care_logs AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE (((b.id)::text = care_logs.booking_id) AND (EXISTS ( SELECT 1
           FROM nurses n
          WHERE ((n.id = b.nurse_id) AND (n.user_id = auth.uid()))))))));

CREATE POLICY "Users can read own care logs" ON public.care_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM bookings b
  WHERE (((b.id)::text = care_logs.booking_id) AND ((b.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM nurses n
          WHERE ((n.id = b.nurse_id) AND (n.user_id = auth.uid())))))))));

CREATE POLICY "Nurses can create care offers" ON public.care_offers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = care_offers.nurse_id) AND (n.user_id = auth.uid())))));

CREATE POLICY "Nurses can delete own care offers" ON public.care_offers AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = care_offers.nurse_id) AND (n.user_id = auth.uid())))));

CREATE POLICY "Users can update relevant care offers" ON public.care_offers AS PERMISSIVE FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = care_offers.nurse_id) AND (n.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM care_requests cr
  WHERE ((cr.id = care_offers.request_id) AND (cr.user_id = auth.uid()))))));

CREATE POLICY "Users can view relevant care offers" ON public.care_offers AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = care_offers.nurse_id) AND (n.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM care_requests cr
  WHERE ((cr.id = care_offers.request_id) AND (cr.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));

CREATE POLICY "Users can create own care requests" ON public.care_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'user'::user_role))))));

CREATE POLICY "Users can delete own care requests" ON public.care_requests AS PERMISSIVE FOR DELETE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Users can update own care requests" ON public.care_requests AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can view relevant care requests" ON public.care_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (status = 'open'::text) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));

CREATE POLICY "View own chat rooms" ON public.chat_rooms AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM nurses n
  WHERE ((n.id = chat_rooms.nurse_id) AND (n.user_id = auth.uid()))))));

CREATE POLICY "Authenticated can insert chat sessions" ON public.chat_sessions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Authenticated can read chat sessions" ON public.chat_sessions AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Authenticated can update chat sessions" ON public.chat_sessions AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY content_history_anon_insert ON public.content_history AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY content_history_anon_select ON public.content_history AS PERMISSIVE FOR SELECT TO anon USING (true);

CREATE POLICY content_history_anon_update ON public.content_history AS PERMISSIVE FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY service_role_all_cssp_portal_status ON public.cssp_portal_status AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read family reviews" ON public.family_reviews AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own family reviews" ON public.family_reviews AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own family reviews" ON public.family_reviews AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Admin can read health_log" ON public.health_log AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));

CREATE POLICY "Family can read health_log" ON public.health_log AS PERMISSIVE FOR SELECT TO public USING ((family_user_id = auth.uid()));

CREATE POLICY "Service role can update health_log" ON public.health_log AS PERMISSIVE FOR UPDATE TO public USING (true);

CREATE POLICY "Service role can write health_log" ON public.health_log AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);

CREATE POLICY service_role_all_kb ON public.knowledge_base AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Insert messages in own rooms" ON public.messages AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((auth.uid() = sender_id) AND (EXISTS ( SELECT 1
   FROM chat_rooms cr
  WHERE ((cr.id = messages.chat_room_id) AND ((cr.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM nurses n
          WHERE ((n.id = cr.nurse_id) AND (n.user_id = auth.uid()))))))))));

CREATE POLICY "View chat room messages" ON public.messages AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM chat_rooms cr
  WHERE ((cr.id = messages.chat_room_id) AND ((cr.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM nurses n
          WHERE ((n.id = cr.nurse_id) AND (n.user_id = auth.uid())))))))));

CREATE POLICY service_role_all_monitor ON public.monitor_incidents AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Family can view their notification logs" ON public.notification_logs AS PERMISSIVE FOR SELECT TO public USING (((family_user_id = auth.uid()) OR (recipient_user_id = auth.uid())));

CREATE POLICY service_role_all_notifications_log ON public.notifications_log AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read reviews" ON public.nurse_reviews AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Families can insert own reviews" ON public.nurse_reviews AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Authenticated can view nurses list" ON public.nurses AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY "Nurses can insert own nurse data" ON public.nurses AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Nurses can update own nurse data" ON public.nurses AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id));

CREATE POLICY "Family can insert own patient activity" ON public.patient_activity AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((family_user_id = auth.uid()));

CREATE POLICY "Family can read own patient activity" ON public.patient_activity AS PERMISSIVE FOR SELECT TO public USING ((family_user_id = auth.uid()));

CREATE POLICY "Family can update own patient activity" ON public.patient_activity AS PERMISSIVE FOR UPDATE TO authenticated USING ((family_user_id = auth.uid())) WITH CHECK ((family_user_id = auth.uid()));

CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));

CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id));

CREATE POLICY profiles_select_own_or_admin ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = id) OR is_admin()));

CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY rag_documents_read_authenticated ON public.rag_documents AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY rag_documents_write_service_only ON public.rag_documents AS PERMISSIVE FOR ALL TO public USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY "Admin can read support emails" ON public.support_emails AS PERMISSIVE FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Admin can update support emails" ON public.support_emails AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));

CREATE POLICY "Service role can insert support emails" ON public.support_emails AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Users can manage own voice reminders" ON public.voice_reminders AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = family_user_id)) WITH CHECK ((auth.uid() = family_user_id));

