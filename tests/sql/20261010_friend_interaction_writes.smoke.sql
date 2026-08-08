DO $$
DECLARE v_student public.students%ROWTYPE; v_post_id UUID; v_result JSONB; v_comment_id UUID;
BEGIN
  SELECT s.* INTO v_student FROM public.students s
  WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL AND EXISTS (
    SELECT 1 FROM public.student_posts p WHERE p.class_id=s.class_id AND p.is_submitted IS TRUE AND p.visibility='class'
  ) LIMIT 1;
  IF v_student.id IS NULL THEN RAISE EXCEPTION '친구 상호작용 스모크 학생이 없습니다.'; END IF;
  SELECT p.id INTO v_post_id FROM public.student_posts p WHERE p.class_id=v_student.class_id AND p.is_submitted IS TRUE AND p.visibility='class' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',v_student.auth_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_student.auth_id,'role','authenticated')::text,true);
  v_result:=public.toggle_my_post_reaction_v1(v_post_id,'heart');
  IF v_result->>'version'<>'1' THEN RAISE EXCEPTION '반응 RPC 계약 오류'; END IF;
  PERFORM public.toggle_my_post_reaction_v1(v_post_id,'heart');
  v_result:=public.create_my_post_comment_v1(v_post_id,'친구 글의 표현이 정말 인상 깊었어요.');
  v_comment_id:=(v_result->'comment'->>'id')::uuid;
  IF v_comment_id IS NULL THEN RAISE EXCEPTION '댓글 생성 계약 오류'; END IF;
  PERFORM public.update_my_post_comment_v1(v_comment_id,'친구 글의 자세한 표현이 정말 인상 깊었어요.');
  PERFORM public.delete_my_post_comment_v1(v_comment_id);
  IF has_function_privilege('anon','public.toggle_my_post_reaction_v1(uuid,text)','EXECUTE') OR has_function_privilege('anon','public.create_my_post_comment_v1(uuid,text)','EXECUTE') THEN RAISE EXCEPTION '친구 쓰기 RPC가 anon에 공개됨'; END IF;
END; $$;
