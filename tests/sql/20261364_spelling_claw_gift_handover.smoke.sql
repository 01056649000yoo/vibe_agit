-- 선생님 선물 `줬어요` 스모크 (전부 롤백된다).
-- ① 아직 안 준 선물이 내역에 따로 모인다 ② 교사가 줬어요 → given_at·학생 알림 1건, 목록에서 빠짐 ③ 되돌리면 다시 모인다(알림은 그대로 1건)
-- ④ 선물이 아닌 상품·다른 사람은 막힌다

DO $$
DECLARE
    v_class UUID;
    v_teacher UUID;
    v_student UUID;
    v_attempt UUID;
    v_play UUID;
    v_result JSONB;
BEGIN
    SELECT class.id, class.teacher_id INTO v_class, v_teacher
    FROM public.classes class
    JOIN public.profiles profile ON profile.id = class.teacher_id AND profile.role = 'TEACHER' AND profile.is_approved IS TRUE
         AND profile.approval_revoked_at IS NULL
    WHERE class.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM public.students student WHERE student.class_id = class.id AND student.deleted_at IS NULL
                  AND student.is_active IS DISTINCT FROM false)
    ORDER BY class.created_at DESC LIMIT 1;
    SELECT id INTO v_student FROM public.students
    WHERE class_id = v_class AND deleted_at IS NULL AND is_active IS DISTINCT FROM false ORDER BY id LIMIT 1;
    UPDATE public.classes SET enabled_modules = array_append(COALESCE(enabled_modules, ARRAY[]::TEXT[]), 'spelling-claw')
    WHERE id = v_class AND NOT ('spelling-claw' = ANY(COALESCE(enabled_modules, ARRAY[]::TEXT[])));

    v_attempt := public.spelling_claw_issue_quiz_v1(v_student, '[{"id":"q1","answer":"정답"}]'::JSONB, 1::SMALLINT);
    PERFORM public.spelling_claw_answer_v1(v_attempt, v_student, 0, '정답', true, 5::SMALLINT);
    UPDATE public.spelling_claw_plays SET status = 'playing' WHERE attempt_id = v_attempt RETURNING id INTO v_play;
    PERFORM public.spelling_claw_finish_play_v1(v_play, v_student, '["shiba","cat"]'::JSONB,
        '[{"kind":"points","points":10,"plush_id":"shiba","plush_name":"시바견"},{"kind":"gift","gift_id":"seat","gift_name":"자리 고르기권","plush_id":"cat","plush_name":"고양이"}]'::JSONB,
        1, 1, 5::SMALLINT, 20::SMALLINT, false);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_result := public.get_teacher_spelling_claw_history_v1(v_class, 100);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_result -> 'pending_gifts') gift
                   WHERE (gift ->> 'play_id')::UUID = v_play AND (gift ->> 'prize_index')::INTEGER = 1) THEN
        RAISE EXCEPTION '아직 안 준 선물 목록에 없습니다: %', v_result -> 'pending_gifts';
    END IF;
    BEGIN
        PERFORM public.set_teacher_spelling_claw_gift_given_v1(v_class, v_play, 0, true);
        RAISE EXCEPTION '포인트 상품에 줬어요가 남았습니다.';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
    v_result := public.set_teacher_spelling_claw_gift_given_v1(v_class, v_play, 1, true);
    IF v_result -> 'prize' ->> 'given_at' IS NULL THEN
        RAISE EXCEPTION '줬어요 시각이 남지 않았습니다.';
    END IF;
    v_result := public.get_teacher_spelling_claw_history_v1(v_class, 100);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_result -> 'pending_gifts') gift WHERE (gift ->> 'play_id')::UUID = v_play) THEN
        RAISE EXCEPTION '준 선물이 아직 안 준 목록에 남아 있습니다.';
    END IF;
    PERFORM public.set_teacher_spelling_claw_gift_given_v1(v_class, v_play, 1, false);
    PERFORM public.set_teacher_spelling_claw_gift_given_v1(v_class, v_play, 1, true);
    v_result := public.get_teacher_spelling_claw_history_v1(v_class, 100);
    RESET ROLE;
    IF (SELECT COUNT(*) FROM public.student_notification_events
        WHERE student_id = v_student AND event_type = 'spelling-claw.gift_given' AND entity_id = v_play) <> 1 THEN
        RAISE EXCEPTION '선물 알림이 한 건이 아닙니다.';
    END IF;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    BEGIN
        PERFORM public.set_teacher_spelling_claw_gift_given_v1(v_class, v_play, 1, false);
        RAISE EXCEPTION '다른 사람이 줬어요를 바꿨습니다.';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RESET ROLE;
    IF has_function_privilege('anon', 'public.set_teacher_spelling_claw_gift_given_v1(uuid,uuid,integer,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION '로그인하지 않은 사용자가 줬어요를 부를 수 있습니다.';
    END IF;
END;
$$;
