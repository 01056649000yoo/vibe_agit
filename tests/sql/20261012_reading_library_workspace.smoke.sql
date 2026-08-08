DO $$
DECLARE v_auth UUID; v_result JSONB;
BEGIN
  SELECT auth_id INTO v_auth FROM public.students WHERE auth_id IS NOT NULL AND deleted_at IS NULL LIMIT 1;
  IF v_auth IS NULL THEN RAISE EXCEPTION '독서 책장 스모크 학생이 없습니다.'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_auth::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_auth,'role','authenticated')::text,true);
  v_result:=public.get_my_reading_library_v1(1000);
  IF v_result->>'version'<>'1' OR v_result->'logs' IS NULL OR v_result->'library_items' IS NULL OR v_result->'links' IS NULL OR v_result->'reviews' IS NULL OR v_result->'draft_statuses' IS NULL OR jsonb_array_length(v_result->'library_items')>100 THEN RAISE EXCEPTION '독서 책장 계약 오류: %',v_result; END IF;
  IF has_function_privilege('anon','public.get_my_reading_library_v1(integer)','EXECUTE') THEN RAISE EXCEPTION '독서 책장 RPC가 anon에 공개됨'; END IF;
END; $$;
