-- 과제 임시저장 RPC가 학생 값만 저장하고 서버 값은 지키는지 확인한다.
-- 반드시 ROLLBACK 트랜잭션에서 돌린다.
DO $$
DECLARE
  v_student public.students%ROWTYPE;
  v_mission public.writing_missions%ROWTYPE;
  v_post public.student_posts%ROWTYPE;
  v_res JSONB;
  v_row public.student_posts%ROWTYPE;
  v_archived UUID;
BEGIN
  SELECT s.* INTO v_student
  FROM public.students s
  JOIN public.writing_missions m ON m.class_id = s.class_id AND m.is_archived IS FALSE
  WHERE s.auth_id IS NOT NULL AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
  LIMIT 1;
  IF v_student.id IS NULL THEN RAISE EXCEPTION '스모크 대상 학생을 찾지 못했습니다.'; END IF;

  SELECT m.* INTO v_mission FROM public.writing_missions m
  WHERE m.class_id = v_student.class_id AND m.is_archived IS FALSE LIMIT 1;

  PERFORM set_config('request.jwt.claim.sub', v_student.auth_id::text, true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_student.auth_id, 'role', 'authenticated')::text, true);

  -- 기존 글이 있으면 비켜 둔다(이 과제로 새 초안을 만드는 경로를 보기 위함).
  DELETE FROM public.student_posts
  WHERE student_id = v_student.id AND mission_id = v_mission.id;

  -- ① 새 초안 저장 — 학생 값은 들어가고 보상은 비어 있어야 한다
  SET LOCAL ROLE authenticated;
  v_res := public.save_my_assignment_draft_v1(
    v_mission.id, '  임시 제목  ', '첫 문단입니다.

둘째 문단입니다.', '[]'::jsonb, NULL);
  RESET ROLE;

  IF v_res->>'version' <> '1' OR (v_res->>'post_id') IS NULL THEN
    RAISE EXCEPTION '① 임시저장 응답 계약 오류: %', v_res;
  END IF;
  SELECT * INTO v_row FROM public.student_posts WHERE id = (v_res->>'post_id')::uuid;
  IF v_row.title <> '임시 제목' THEN RAISE EXCEPTION '① 제목 앞뒤 공백이 정리되지 않았습니다: [%]', v_row.title; END IF;
  IF v_row.awarded_base_reward IS NOT NULL OR v_row.awarded_bonus_reward IS NOT NULL THEN
    RAISE EXCEPTION '① 새 초안에 보상 금액이 들어갔습니다: %', v_row.awarded_base_reward;
  END IF;
  IF v_row.is_submitted IS TRUE OR v_row.is_confirmed IS TRUE THEN
    RAISE EXCEPTION '① 새 초안이 제출 상태로 저장되었습니다.';
  END IF;
  IF v_row.char_count <> public.writing_content_char_count(v_row.content) THEN
    RAISE EXCEPTION '① 글자 수가 서버 기준과 다릅니다: %', v_row.char_count;
  END IF;
  IF v_row.writing_context <> 'assignment' THEN
    RAISE EXCEPTION '① 글 출처가 assignment 가 아닙니다: %', v_row.writing_context;
  END IF;

  -- ② 같은 과제에 다시 저장하면 새 글이 생기지 않고 갱신된다
  SET LOCAL ROLE authenticated;
  v_res := public.save_my_assignment_draft_v1(v_mission.id, '고친 제목', '고친 본문입니다.', '[]'::jsonb, NULL);
  RESET ROLE;
  IF (v_res->>'post_id')::uuid <> v_row.id THEN
    RAISE EXCEPTION '② 같은 과제에 글이 새로 생겼습니다.';
  END IF;
  SELECT * INTO v_row FROM public.student_posts WHERE id = v_row.id;
  IF v_row.title <> '고친 제목' THEN RAISE EXCEPTION '② 갱신이 반영되지 않았습니다.'; END IF;

  -- ③ 교사가 고쳐 준 표시는 학생이 이어 쓰면 서버가 정리한다
  UPDATE public.student_posts
  SET is_teacher_edited = true, teacher_edited_title = '교사본', teacher_edited_at = NOW()
  WHERE id = v_row.id;
  SET LOCAL ROLE authenticated;
  PERFORM public.save_my_assignment_draft_v1(v_mission.id, '학생이 이어 씀', '이어서 쓴 본문입니다.', '[]'::jsonb, NULL);
  RESET ROLE;
  SELECT * INTO v_row FROM public.student_posts WHERE id = v_row.id;
  IF v_row.is_teacher_edited IS TRUE OR v_row.teacher_edited_title IS NOT NULL THEN
    RAISE EXCEPTION '③ 교사 수정 표시가 정리되지 않았습니다.';
  END IF;

  -- ④ 제출되어 확인 중인 글은 임시저장으로 못 고친다
  UPDATE public.student_posts
  SET is_submitted = true, is_returned = false, is_confirmed = false WHERE id = v_row.id;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.save_my_assignment_draft_v1(v_mission.id, '몰래 고치기', '몰래 고친 본문', '[]'::jsonb, NULL);
    RESET ROLE;
    RAISE EXCEPTION '④ 제출된 글이 임시저장으로 수정되었습니다.';
  EXCEPTION WHEN sqlstate '23505' THEN
    RESET ROLE;
  END;

  -- ⑤ 다시쓰기를 받은 글은 다시 저장할 수 있어야 한다
  UPDATE public.student_posts
  SET is_submitted = false, is_returned = true WHERE id = v_row.id;
  SET LOCAL ROLE authenticated;
  PERFORM public.save_my_assignment_draft_v1(v_mission.id, '다시 쓴 제목', '다시 쓴 본문입니다.', '[]'::jsonb, NULL);
  RESET ROLE;
  SELECT * INTO v_row FROM public.student_posts WHERE id = v_row.id;
  IF v_row.title <> '다시 쓴 제목' THEN RAISE EXCEPTION '⑤ 다시쓰기 저장이 막혔습니다.'; END IF;
  IF v_row.is_returned IS NOT TRUE THEN RAISE EXCEPTION '⑤ 임시저장이 다시쓰기 상태를 바꿨습니다.'; END IF;

  -- ⑥ 다른 학급 과제에는 저장할 수 없다
  SELECT m.id INTO v_archived FROM public.writing_missions m
  WHERE m.class_id <> v_student.class_id LIMIT 1;
  IF v_archived IS NOT NULL THEN
    BEGIN
      SET LOCAL ROLE authenticated;
      PERFORM public.save_my_assignment_draft_v1(v_archived, '남의 학급', '남의 학급 본문', '[]'::jsonb, NULL);
      RESET ROLE;
      RAISE EXCEPTION '⑥ 다른 학급 과제에 글을 저장할 수 있습니다.';
    EXCEPTION WHEN sqlstate '22023' THEN
      RESET ROLE;
    END;
  END IF;

  RAISE NOTICE '과제 임시저장 RPC 스모크 6개 통과 (학생 %, 과제 %)', v_student.id, v_mission.id;
END; $$;

DO $$
BEGIN
  IF has_function_privilege('anon',
      'public.save_my_assignment_draft_v1(uuid,text,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '임시저장 RPC가 비로그인에 공개되었습니다.';
  END IF;
  RAISE NOTICE '권한 경계 통과';
END; $$;
