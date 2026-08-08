DO $$
DECLARE v_teacher UUID; v_class UUID; v_mission UUID; v_result JSONB; v_evaluation JSONB;
BEGIN
  SELECT c.teacher_id,c.id,m.id INTO v_teacher,v_class,v_mission FROM public.classes c JOIN public.writing_missions m ON m.class_id=c.id WHERE c.teacher_id IS NOT NULL AND c.deleted_at IS NULL LIMIT 1;
  IF v_mission IS NULL THEN RAISE EXCEPTION '활동 보고서 스모크 과제가 없습니다.'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_teacher::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_teacher,'role','authenticated')::text,true);
  v_result:=public.get_teacher_activity_report_workspace_v1(v_class,ARRAY[v_mission],1000,0);
  IF v_result->>'version'<>'1' OR v_result->'students' IS NULL OR v_result->'posts' IS NULL OR (v_result->>'total_count') IS NULL OR jsonb_array_length(v_result->'posts')>200 THEN RAISE EXCEPTION '활동 보고서 계약 오류: %',v_result; END IF;
  v_evaluation:=public.get_teacher_mission_evaluation_report_v1(v_mission,1000);
  IF v_evaluation->>'version'<>'1' OR v_evaluation->'items' IS NULL OR jsonb_array_length(v_evaluation->'items')>100 THEN RAISE EXCEPTION '평가 보고서 계약 오류: %',v_evaluation; END IF;
  IF has_function_privilege('anon','public.get_teacher_activity_report_workspace_v1(uuid,uuid[],integer,integer)','EXECUTE') THEN RAISE EXCEPTION '활동 보고서 RPC가 anon에 공개됨'; END IF;
END; $$;
