-- CSSPReviewPanel (admin) updates nurses.cssp_* from the client, but only "own row" UPDATE existed,
-- so admin manual verification silently affected 0 rows. Allow admins explicitly.
-- guard_nurses() already bypasses admins. Rollback: DROP POLICY "Admins can update nurses" ON public.nurses;
DROP POLICY IF EXISTS "Admins can update nurses" ON public.nurses;
CREATE POLICY "Admins can update nurses" ON public.nurses
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
