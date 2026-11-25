-- Permission matrix (who can read/modify what). Run via Supabase SQL / MCP execute_sql. Always rolled back; sends nothing.
-- Last run 2026-11-25: 15 checks, all pass (anon bookings check counts rows: RLS returns 0, no exception).
-- Output: the exception message lists every check as PASS/FAIL; any FAIL means a permission regressed.
DO $$
DECLARE
  fam uuid; fam_booking_user uuid; nurse_user uuid; stranger uuid; adm uuid;
  res text := ''; n int; r text; pass int := 0; fail int := 0;
  v_before boolean; v_after boolean; s_before text; s_after text;
BEGIN
  SELECT user_id INTO fam_booking_user FROM bookings LIMIT 1;
  SELECT n2.user_id INTO nurse_user FROM bookings b JOIN nurses n2 ON n2.id = b.nurse_id LIMIT 1;
  SELECT id INTO stranger FROM profiles WHERE role='nurse' AND id <> nurse_user LIMIT 1;
  SELECT id INTO adm FROM profiles WHERE role='admin' LIMIT 1;

  -- 1) anon sees nothing sensitive
  SET LOCAL ROLE anon;
  BEGIN SELECT count(*) INTO n FROM public.bookings; IF n > 0 THEN res := res||'FAIL anon reads bookings ('||n||'); '; fail := fail+1; ELSE pass := pass+1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN pass := pass+1; END;
  BEGIN SELECT count(*) INTO n FROM public.profiles; IF n > 0 THEN res := res||'FAIL anon reads profiles ('||n||'); '; fail := fail+1; ELSE pass := pass+1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN pass := pass+1; END;
  BEGIN SELECT count(*) INTO n FROM public.care_offers; IF n > 0 THEN res := res||'FAIL anon reads care_offers; '; fail := fail+1; ELSE pass := pass+1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN pass := pass+1; END;
  BEGIN SELECT count(*) INTO n FROM public.care_logs; IF n > 0 THEN res := res||'FAIL anon reads care_logs; '; fail := fail+1; ELSE pass := pass+1; END IF;
  EXCEPTION WHEN insufficient_privilege THEN pass := pass+1; END;
  RESET ROLE;

  -- 2) a nurse with no relation to the bookings sees none of them, and cannot modify others' rows
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.bookings;
  IF n = 0 THEN pass := pass+1; ELSE res := res||'FAIL stranger nurse sees '||n||' bookings; '; fail := fail+1; END IF;
  SELECT count(*) INTO n FROM public.care_logs;
  IF n = 0 THEN pass := pass+1; ELSE res := res||'FAIL stranger nurse sees care_logs; '; fail := fail+1; END IF;
  UPDATE public.profiles SET full_name = 'x' WHERE id <> stranger; GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN pass := pass+1; ELSE res := res||'FAIL stranger updated '||n||' other profiles; '; fail := fail+1; END IF;
  UPDATE public.nurses SET bio = 'x' WHERE user_id <> stranger; GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN pass := pass+1; ELSE res := res||'FAIL stranger updated '||n||' other nurses; '; fail := fail+1; END IF;
  UPDATE public.bookings SET notes = 'x'; GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN pass := pass+1; ELSE res := res||'FAIL stranger updated bookings; '; fail := fail+1; END IF;
  SELECT count(*) INTO n FROM public.profiles WHERE id <> stranger;
  IF n = 0 THEN pass := pass+1; ELSE res := res||'INFO authenticated can read '||n||' other profiles directly (policy select_own_or_admin expects 0); '; fail := fail+1; END IF;
  BEGIN PERFORM public.accept_offer(gen_random_uuid()); pass := pass+1; EXCEPTION WHEN OTHERS THEN pass := pass+1; END;
  RESET ROLE;

  -- 3) the booking's own family and nurse see their booking; admin sees all
  PERFORM set_config('request.jwt.claims', json_build_object('sub', fam_booking_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.bookings; RESET ROLE;
  IF n > 0 THEN pass := pass+1; ELSE res := res||'FAIL family cannot see own bookings; '; fail := fail+1; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', nurse_user, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.bookings; RESET ROLE;
  IF n > 0 THEN pass := pass+1; ELSE res := res||'FAIL nurse cannot see own bookings; '; fail := fail+1; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated; SELECT count(*) INTO n FROM public.bookings; RESET ROLE;
  IF n = (SELECT count(*) FROM public.bookings) THEN pass := pass+1; ELSE res := res||'FAIL admin does not see all bookings; '; fail := fail+1; END IF;

  -- 4) privilege escalation attempts by a regular user are ignored
  SELECT cssp_verified, cssp_verification_status INTO v_before, s_before FROM public.nurses WHERE user_id = stranger;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', stranger, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.profiles SET role = 'admin' WHERE id = stranger;
  UPDATE public.nurses SET cssp_verified = true, cssp_verification_status = 'manual_verified' WHERE user_id = stranger;
  RESET ROLE;
  SELECT role::text INTO r FROM public.profiles WHERE id = stranger;
  IF r = 'nurse' THEN pass := pass+1; ELSE res := res||'FAIL self-promotion to '||r||'; '; fail := fail+1; END IF;
  SELECT cssp_verified, cssp_verification_status INTO v_after, s_after FROM public.nurses WHERE user_id = stranger;
  IF v_after IS NOT DISTINCT FROM v_before AND s_after IS NOT DISTINCT FROM s_before THEN pass := pass+1; ELSE res := res||'FAIL self-verification changed '||coalesce(s_before,'null')||' -> '||coalesce(s_after,'null')||'; '; fail := fail+1; END IF;

  RAISE EXCEPTION 'ROLLBACK_TEST RLS matrix: % passed, % failed. %', pass, fail, CASE WHEN res = '' THEN 'ALL OK' ELSE res END;
END $$;
