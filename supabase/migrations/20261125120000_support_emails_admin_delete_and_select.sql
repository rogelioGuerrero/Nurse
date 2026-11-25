-- Support emails: admin can delete rows (panel copy is not the source of truth;
-- original mail remains in the Hostinger mailbox). Also tighten SELECT:
-- it was open to ANY authenticated user, leaking inbound email contents
-- (may contain personal data) to any registered account. Only the admin panel reads this table;
-- the edge function uses the service role which bypasses RLS.
-- Rollback:
--   DROP POLICY "Admin can delete support emails" ON support_emails;
--   DROP POLICY "Admin can read support emails" ON support_emails;
--   CREATE POLICY "Admin can read support emails" ON support_emails FOR SELECT TO authenticated USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can delete support emails"
ON support_emails FOR DELETE
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY "Admin can read support emails" ON support_emails;
CREATE POLICY "Admin can read support emails"
ON support_emails FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
