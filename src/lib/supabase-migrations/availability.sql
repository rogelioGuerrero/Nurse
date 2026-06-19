/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

-- Availability table for nurse schedules
CREATE TABLE IF NOT EXISTS availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nurse_id UUID NOT NULL REFERENCES nurses(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nurse_id, date, start_time)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_availability_nurse_date ON availability(nurse_id, date);
CREATE INDEX IF NOT EXISTS idx_availability_date_range ON availability(date);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_availability_updated_at
  BEFORE UPDATE ON availability
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

-- Nurses can manage their own availability
CREATE POLICY "Nurses can manage their own availability"
  ON availability
  FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM nurses WHERE id = nurse_id))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM nurses WHERE id = nurse_id));

-- Users can view availability of nurses
CREATE POLICY "Users can view availability"
  ON availability
  FOR SELECT
  USING (true);

-- Insert default availability for demo nurses
INSERT INTO availability (nurse_id, date, start_time, end_time, is_available)
SELECT 
  n.id,
  (CURRENT_DATE + (random() * 14)::integer)::date,
  '08:00'::time,
  '18:00'::time,
  true
FROM nurses n
CROSS JOIN generate_series(0, 13)
WHERE n.id IN (
  SELECT id FROM nurses LIMIT 5
)
ON CONFLICT (nurse_id, date, start_time) DO NOTHING;
