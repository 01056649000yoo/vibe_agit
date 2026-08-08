DO $$
DECLARE v_teacher UUID; v_post UUID; v_result JSONB;
BEGIN
  SELECT c.teacher_id,p.id INTO v_teacher,v_post FROM public.classes c JOIN public.student_posts p ON p.class_id=c.id WHERE c.teacher_id IS NOT NULL AND c.deleted_at IS NULL LIMIT 1;
  IF v_post IS NULL THEN RAISE EXCEPTION '교사 글 상세 스모크 글이 없습니다.'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_teacher::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_teacher,'role','authenticated')::text,true);
  v_result:=public.get_teacher_post_detail_v1(v_post);
  IF v_result->>'version'<>'1' OR v_result->'post'->>'id'<>v_post::text OR v_result->'reactions' IS NULL OR v_result->'comments' IS NULL THEN RAISE EXCEPTION '교사 글 상세 계약 오류: %',v_result; END IF;
  IF has_function_privilege('anon','public.get_teacher_post_detail_v1(uuid)','EXECUTE') THEN RAISE EXCEPTION '교사 글 상세 RPC가 anon에 공개됨'; END IF;
END; $$;
