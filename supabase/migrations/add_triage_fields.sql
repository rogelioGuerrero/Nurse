-- Add triage AI fields to care_requests
-- nurse_summary: AI-generated summary for nurses (from Groq triage)
-- urgency: AI-classified urgency level (low | medium | high)
-- patient_age_range: age range selected by family
-- patient_gender: gender selected by family
-- patient_data: structured JSON with diagnosis, autonomy, allergies, medications

ALTER TABLE care_requests
  ADD COLUMN IF NOT EXISTS nurse_summary TEXT,
  ADD COLUMN IF NOT EXISTS urgency TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS patient_age_range TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS patient_gender TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS patient_data JSONB DEFAULT NULL;

-- Create index on urgency for filtering high-priority requests
CREATE INDEX IF NOT EXISTS idx_care_requests_urgency ON care_requests(urgency) WHERE urgency = 'high';
