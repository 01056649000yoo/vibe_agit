-- 학생이 자기 글의 서버 소유 값을 고칠 수 없는지, 그러면서 정상 경로는 그대로 도는지 확인한다.
-- 반드시 ROLLBACK 트랜잭션에서 돌린다(실제 글과 포인트를 건드린다).
DO $$
DECLARE
  v_student public.students%ROWTYPE;
  v_post public.student_posts%ROWTYPE;
  v_teacher UUID;
  v_row public.student_posts%ROWTYPE;
  v_res JSONB;
  v_paid INTEGER;
  v_expected INTEGER;
  v_mission public.writing_missions%ROWTYPE;
BEGIN
  SELECT s.* INTO v_student
  FROM public.students s
  JOIN public.student_posts p ON p.student_id = s.id
  JOIN public.classes c ON c.id = s.class_id AND c.teacher_id IS NOT NULL AND c.deleted_at IS NULL
  WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
    AND p.is_submitted IS TRUE AND p.is_confirmed IS FALSE AND p.is_returned IS FALSE
    AND p.mission_id IS NOT NULL
  LIMIT 1;
  IF v_student.id IS NULL THEN RAISE EXCEPTION '스모크 대상 학생을 찾지 못했습니다.'; END IF;

  SELECT p.* INTO v_post FROM public.student_posts p
  WHERE p.student_id = v_student.id AND p.is_submitted IS TRUE AND p.is_confirmed IS FALSE
    AND p.is_returned IS FALSE AND p.mission_id IS NOT NULL LIMIT 1;
  SELECT c.teacher_id INTO v_teacher FROM public.classes c WHERE c.id = v_student.class_id;
  SELECT m.* INTO v_mission FROM public.writing_missions m WHERE m.id = v_post.mission_id;

  PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_student.auth_id, 'role', 'authenticated')::text, true);

  -- ① 보상 금액을 부풀리려는 직접 UPDATE 는 조용히 무시된다
  SET LOCAL ROLE authenticated;
  UPDATE public.student_posts
  SET awarded_base_reward = 50000, awarded_bonus_reward = 50000, awarded_bonus_threshold = 1
  WHERE id = v_post.id;
  RESET ROLE;

  SELECT * INTO v_row FROM public.student_posts WHERE id = v_post.id;
  IF v_row.awarded_base_reward IS DISTINCT FROM v_post.awarded_base_reward
     OR v_row.awarded_bonus_reward IS DISTINCT FROM v_post.awarded_bonus_reward
     OR v_row.awarded_bonus_threshold IS DISTINCT FROM v_post.awarded_bonus_threshold THEN
    RAISE EXCEPTION '① 학생이 보상 금액을 바꿀 수 있습니다: base % → %',
      v_post.awarded_base_reward, v_row.awarded_base_reward;
  END IF;

  -- ② 승인 도장을 직접 찍을 수 없다 (찍히면 교사 대기 목록에서 사라져 채점이 누락된다)
  SET LOCAL ROLE authenticated;
  UPDATE public.student_posts SET is_confirmed = true, is_submitted = false WHERE id = v_post.id;
  RESET ROLE;
  SELECT * INTO v_row FROM public.student_posts WHERE id = v_post.id;
  IF v_row.is_confirmed IS TRUE OR v_row.is_submitted IS FALSE THEN
    RAISE EXCEPTION '② 학생이 승인·제출 상태를 바꿀 수 있습니다(confirmed=%, submitted=%)',
      v_row.is_confirmed, v_row.is_submitted;
  END IF;

  -- ③ 글자 수를 부풀려 보너스를 타려는 시도는 서버 재계산으로 무력화된다
  SET LOCAL ROLE authenticated;
  UPDATE public.student_posts SET char_count = 999999 WHERE id = v_post.id;
  RESET ROLE;
  SELECT * INTO v_row FROM public.student_posts WHERE id = v_post.id;
  IF v_row.char_count <> public.writing_content_char_count(COALESCE(v_row.content, '')) THEN
    RAISE EXCEPTION '③ 글자 수가 클라이언트 값으로 저장되었습니다: %', v_row.char_count;
  END IF;

  -- ④ 정상 경로는 그대로 돈다 — 제목·본문 임시저장은 여전히 저장된다
  SET LOCAL ROLE authenticated;
  UPDATE public.student_posts SET title = '스모크 제목 확인' WHERE id = v_post.id;
  RESET ROLE;
  SELECT * INTO v_row FROM public.student_posts WHERE id = v_post.id;
  IF v_row.title <> '스모크 제목 확인' THEN
    RAISE EXCEPTION '④ 정상 임시저장이 막혔습니다.';
  END IF;

  -- ⑤ 교사 승인은 미션에 설정된 금액(기본 + 조건 충족 시 보너스)만 지급한다
  v_expected := GREATEST(0, COALESCE(v_row.awarded_base_reward, v_mission.base_reward, 0))
              + GREATEST(0, COALESCE(v_row.awarded_bonus_reward, v_mission.bonus_reward, 0));
  PERFORM set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_teacher, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  v_res := public.approve_assignment_post(v_post.id, '스모크 승인');
  RESET ROLE;

  SELECT amount INTO v_paid FROM public.point_logs
  WHERE student_id = v_student.id AND post_id = v_post.id ORDER BY created_at DESC LIMIT 1;
  IF v_paid > v_expected THEN
    RAISE EXCEPTION '⑤ 승인이 설정보다 많은 %점을 지급했습니다(기대 %점 이하)', v_paid, v_expected;
  END IF;
  IF v_paid >= 50000 THEN
    RAISE EXCEPTION '⑤ 부풀린 금액이 지급되었습니다: %', v_paid;
  END IF;

  RAISE NOTICE '학생 글 서버 컬럼 가드 스모크 5개 통과 (지급 %점, 상한 %점)', v_paid, v_expected;
END; $$;

-- 교사 경로가 이 가드에 막히지 않는지 확인한다. 막히면 승인·반려 화면이 통째로 죽는다.
DO $$
DECLARE
  v_teacher UUID; v_post public.student_posts%ROWTYPE; v_row public.student_posts%ROWTYPE;
BEGIN
  -- 다시쓰기 요청이 가능한 상태(제출됨·미승인)의 글을 고른다. 상태 제약이 있어 아무 글이나 쓰면 안 된다.
  SELECT p.* INTO v_post
  FROM public.student_posts p
  JOIN public.classes c ON c.id = p.class_id AND c.teacher_id IS NOT NULL AND c.deleted_at IS NULL
  WHERE p.mission_id IS NOT NULL
    AND p.is_submitted IS TRUE AND p.is_confirmed IS FALSE AND p.is_returned IS FALSE
  LIMIT 1;
  IF v_post.id IS NULL THEN RAISE EXCEPTION '교사 경로 스모크 대상을 찾지 못했습니다.'; END IF;
  SELECT c.teacher_id INTO v_teacher FROM public.classes c WHERE c.id = v_post.class_id;

  PERFORM set_config('request.jwt.claim.sub', v_teacher::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_teacher, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.student_posts SET is_returned = true, is_submitted = false WHERE id = v_post.id;
  RESET ROLE;

  SELECT * INTO v_row FROM public.student_posts WHERE id = v_post.id;
  IF v_row.is_returned IS NOT TRUE THEN
    RAISE EXCEPTION '교사의 다시쓰기 요청이 가드에 막혔습니다.';
  END IF;
  RAISE NOTICE '교사 경로 통과 확인';
END; $$;
