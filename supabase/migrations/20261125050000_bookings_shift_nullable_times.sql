-- accept_offer() inserts bookings.shift and does not provide start_time/end_time/hours, and the frontend Booking type
-- declares them optional. Prod bookings had NO `shift` column and start_time/end_time/hours were NOT NULL without default,
-- so accepting an offer failed with 42703 (column "shift" does not exist). Align the schema with the code.
-- Rollback: ALTER TABLE public.bookings DROP COLUMN shift; (and re-add NOT NULL only if every row has values)
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shift text;
ALTER TABLE public.bookings ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN end_time DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN hours DROP NOT NULL;
