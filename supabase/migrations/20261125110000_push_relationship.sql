-- send-push hardening: a user JWT may only target themselves, or users with a real marketplace relationship
-- (offer on their request, or shared booking, either direction). Service role and admins unrestricted (checked in the function).
-- Rollback: DROP FUNCTION public._push_relationship_exists(uuid, uuid);
CREATE OR REPLACE FUNCTION public._push_relationship_exists(p_caller uuid, p_recipient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM care_offers o
    JOIN care_requests r ON r.id = o.request_id
    JOIN nurses n ON n.id = o.nurse_id
    WHERE (n.user_id = p_caller AND r.user_id = p_recipient)
       OR (n.user_id = p_recipient AND r.user_id = p_caller)
  ) OR EXISTS (
    SELECT 1 FROM bookings b
    JOIN nurses n ON n.id = b.nurse_id
    WHERE (b.user_id = p_caller AND n.user_id = p_recipient)
       OR (b.user_id = p_recipient AND n.user_id = p_caller)
  )
$$;
REVOKE ALL ON FUNCTION public._push_relationship_exists(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._push_relationship_exists(uuid, uuid) TO service_role;
