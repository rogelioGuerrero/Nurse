-- bookings only had participant policies, so the admin payment confirmation (AdminPanel -> confirmPayment) and the admin
-- pending-payments list silently saw/affected 0 rows. Admins need SELECT and UPDATE (guard_bookings bypasses admins).
-- Rollback: DROP POLICY "Admins can view bookings" ON public.bookings; DROP POLICY "Admins can update bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can view bookings" ON public.bookings;
CREATE POLICY "Admins can view bookings" ON public.bookings FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can update bookings" ON public.bookings;
CREATE POLICY "Admins can update bookings" ON public.bookings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
