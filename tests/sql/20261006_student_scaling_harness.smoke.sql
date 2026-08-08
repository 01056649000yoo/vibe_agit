DO $$
DECLARE
  v_student public.students%ROWTYPE;
  v_mission public.writing_missions%ROWTYPE;
  v_teacher_id UUID;
  v_home JSONB;
  v_submission JSONB;
  v_archive JSONB;
  v_duplicate_blocked BOOLEAN := false;
BEGIN
  SELECT student.* INTO v_student
  FROM public.students student
  JOIN public.classes class ON class.id = student.class_id
  WHERE student.auth_id IS NOT NULL
    AND student.is_active IS DISTINCT FROM false
    AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    AND class.deleted_at IS NULL
  ORDER BY student.created_at
  LIMIT 1;

  IF v_student.id IS NULL THEN
    RAISE EXCEPTION '성능 스모크에 사용할 활성 학생이 없습니다.';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::TEXT, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_student.auth_id, 'role', 'authenticated'
  )::TEXT, true);

  v_home := public.get_student_home_bootstrap_v1();
  IF v_home->>'version' <> '1'
     OR v_home->'student'->>'id' <> v_student.id::TEXT
     OR v_home->'class_config' IS NULL
     OR v_home->'home' IS NULL THEN
    RAISE EXCEPTION '학생 홈 bootstrap 응답 계약이 다릅니다: %', v_home;
  END IF;

  SELECT mission.* INTO v_mission
  FROM public.writing_missions mission
  WHERE mission.class_id = v_student.class_id
    AND mission.is_archived IS FALSE
    AND COALESCE(mission.mission_type, 'writing') <> 'meeting'
  ORDER BY mission.created_at
  LIMIT 1;

  IF v_mission.id IS NULL THEN
    RAISE EXCEPTION '제출 스모크에 사용할 활성 일반 과제가 없습니다.';
  END IF;

  -- 실제 행 변경은 바깥 트랜잭션에서 전부 롤백된다.
  DELETE FROM public.student_posts
  WHERE class_id = v_student.class_id
    AND student_id = v_student.id
    AND mission_id = v_mission.id;
  UPDATE public.writing_missions
  SET min_chars = 0, min_paragraphs = 0, base_reward = 0
  WHERE id = v_mission.id AND class_id = v_student.class_id;

  v_submission := public.submit_assignment_post_v1(
    v_mission.id, '성능 스모크 제목', '성능 스모크 본문', '[]'::JSONB, NULL
  );
  IF v_submission->>'success' <> 'true'
     OR v_submission->>'student_id' <> v_student.id::TEXT
     OR v_submission->>'is_first_time' <> 'true' THEN
    RAISE EXCEPTION '통합 제출 RPC 응답 계약이 다릅니다: %', v_submission;
  END IF;

  BEGIN
    PERFORM public.submit_assignment_post_v1(
      v_mission.id, '중복 제목', '중복 본문', '[]'::JSONB, NULL
    );
  EXCEPTION WHEN unique_violation THEN
    v_duplicate_blocked := true;
  END;
  IF NOT v_duplicate_blocked THEN
    RAISE EXCEPTION '제출 직후 중복 제출이 차단되지 않았습니다.';
  END IF;

  IF has_function_privilege('authenticated',
      'public.writing_engine_submit_assignment(uuid,uuid,text,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '내부 쓰기 엔진이 authenticated에 공개되어 있습니다.';
  END IF;

  SELECT class.teacher_id INTO v_teacher_id
  FROM public.classes class
  WHERE class.id = v_student.class_id;
  IF v_teacher_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub', v_teacher_id::TEXT, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object(
      'sub', v_teacher_id, 'role', 'authenticated'
    )::TEXT, true);
    v_archive := public.get_teacher_archived_missions_page(v_student.class_id, 10, 0);
    IF v_archive->'items' IS NULL OR v_archive->'has_more' IS NULL THEN
      RAISE EXCEPTION '보관함 페이지 응답 계약이 다릅니다: %', v_archive;
    END IF;
  END IF;
END;
$$;
