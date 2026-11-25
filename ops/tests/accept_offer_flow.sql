-- Regression test for the marketplace core (accept_offer). Run via Supabase SQL / MCP execute_sql.
-- ALWAYS ends with RAISE EXCEPTION so nothing is persisted (and nothing is sent: no triggers/notifications exist in DB).
-- Expected output (message of the exception):
--   stranger=Not authorized | A invoice: {"success": true, ...} | B direct slot0: {"success": true, ...} |
--   bookings(shift/status/price)=day/confirmed/20.00,day/pending_payment/25.65 | r2 after slot0=open | ... |
--   C direct slot1: {"success": true, ...} | r2 after both=matched | r1=matched
DO $$
DECLARE fam uuid; nurse_user uuid; stranger uuid; nid uuid; nid2 uuid;
 r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid(); o1 uuid := gen_random_uuid(); o2a uuid := gen_random_uuid(); o2b uuid := gen_random_uuid(); o3 uuid := gen_random_uuid(); o4 uuid := gen_random_uuid();
 out text := ''; res jsonb; s text;
BEGIN
  SELECT id INTO fam FROM profiles WHERE role='user' LIMIT 1;
  SELECT n.id, n.user_id INTO nid, nurse_user FROM nurses n LIMIT 1;
  SELECT n.id INTO nid2 FROM nurses n WHERE n.id<>nid LIMIT 1;
  SELECT id INTO stranger FROM profiles WHERE role='nurse' AND id<>nurse_user LIMIT 1;
  INSERT INTO care_requests (id,user_id,patient_name,patient_condition,specialization_needed,slots,location_name,status,wants_invoice) VALUES (r1,fam,'T','T','Geriatría','[{"date":"2027-02-01","shift":"day"}]'::jsonb,'T','open',true);
  INSERT INTO care_requests (id,user_id,patient_name,patient_condition,specialization_needed,slots,location_name,status,wants_invoice) VALUES (r2,fam,'T','T','Geriatría','[{"date":"2027-02-02","shift":"day"},{"date":"2027-02-03","shift":"night"}]'::jsonb,'T','open',false);
  INSERT INTO care_offers (id,request_id,nurse_id,slot_index,offered_rate) VALUES (o1,r1,nid,0,20),(o2a,r2,nid,0,20),(o2b,r2,nid2,0,22),(o3,r2,nid,1,30),(o4,r1,nid2,0,19);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN res := public.accept_offer(o1); out := out||'stranger=OK?! '; EXCEPTION WHEN OTHERS THEN out := out||'stranger='||SQLERRM||' | '; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', fam, 'role','authenticated')::text, true);
  BEGIN
    res := public.accept_offer(o1); out := out||'A invoice: '||res::text||' | ';
    res := public.accept_offer(o2a); out := out||'B direct slot0: '||res::text||' | ';
  EXCEPTION WHEN OTHERS THEN out := out||'ERR '||SQLSTATE||' '||SQLERRM||' | '; END;
  RESET ROLE;
  SELECT string_agg(format('%s/%s/%s', shift, status, total_price), ',' ORDER BY total_price) INTO s FROM bookings WHERE request_id IN (r1,r2);
  out := out||'bookings(shift/status/price)='||coalesce(s,'none')||' | ';
  SELECT status INTO s FROM care_requests WHERE id=r2; out := out||'r2 after slot0='||s||' | ';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', fam, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN res := public.accept_offer(o3); out := out||'C direct slot1: '||res::text||' | '; EXCEPTION WHEN OTHERS THEN out := out||'ERR '||SQLERRM||' | '; END;
  RESET ROLE;
  SELECT status INTO s FROM care_requests WHERE id=r2; out := out||'r2 after both='||s||' | ';
  SELECT status INTO s FROM care_requests WHERE id=r1; out := out||'r1='||s;
  RAISE EXCEPTION 'ROLLBACK_TEST %', out;
END $$;
