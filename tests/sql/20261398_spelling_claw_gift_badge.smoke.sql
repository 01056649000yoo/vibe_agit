-- check-migrations의 바깥 트랜잭션에서 실행되고 마지막에 모두 롤백된다.
-- 배지 수가 뽑기 내역의 `아직 안 준 선물` 과 같고, `줬어요` 를 누르면 하나 줄며, 다른 교사에게는 0 인지 본다.

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.get_teacher_spelling_claw_gift_badge_v1(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION '선물 배지 RPC가 익명 역할에 노출됐습니다.';
    END IF;
END;
$$;

DO $$
DECLARE
    v_play RECORD;
    v_before INTEGER;
    v_after INTEGER;
    v_history INTEGER;
    v_other UUID;
BEGIN
    -- 선물이 한 번이라도 나온 판을 하나 고른다. 없으면 가장 최근 끝난 판에 시험 선물을 붙인다.
    SELECT play.id, play.class_id, class.teacher_id INTO v_play
    FROM public.spelling_claw_plays play
    JOIN public.classes class ON class.id = play.class_id
    WHERE play.status = 'done' AND class.teacher_id IS NOT NULL
    ORDER BY (SELECT COUNT(*) FROM jsonb_array_elements(play.prizes) p WHERE p ->> 'kind' = 'gift') DESC, play.finished_at DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION '선물 배지 스모크에 쓸 끝난 판이 없습니다.';
    END IF;

    UPDATE public.spelling_claw_plays
    SET prizes = '[{"kind": "gift", "gift_id": "smoke", "gift_name": "시험 선물", "plush_id": "cat", "plush_name": "고양이"}]'::JSONB
    WHERE id = v_play.id;

    PERFORM set_config('request.jwt.claim.sub', v_play.teacher_id::TEXT, TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_play.teacher_id, 'role', 'authenticated')::TEXT, TRUE);

    v_before := (public.get_teacher_spelling_claw_gift_badge_v1(v_play.class_id) ->> 'count')::INTEGER;
    v_history := jsonb_array_length(public.get_teacher_spelling_claw_history_v1(v_play.class_id, 100) -> 'pending_gifts');
    IF v_before < 1 OR (v_before <= 50 AND v_before <> v_history) THEN
        RAISE EXCEPTION '배지 수(%)가 아직 안 준 선물 목록(%)과 다릅니다.', v_before, v_history;
    END IF;

    PERFORM public.set_teacher_spelling_claw_gift_given_v1(v_play.class_id, v_play.id, 0, true);
    v_after := (public.get_teacher_spelling_claw_gift_badge_v1(v_play.class_id) ->> 'count')::INTEGER;
    IF v_after <> v_before - 1 THEN
        RAISE EXCEPTION '줬어요 뒤 배지가 하나 줄지 않았습니다: % → %', v_before, v_after;
    END IF;

    -- 그 학급 교사가 아니면 오류 대신 0.
    SELECT class.teacher_id INTO v_other FROM public.classes class
    WHERE class.teacher_id IS NOT NULL AND class.teacher_id <> v_play.teacher_id
      AND NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = class.teacher_id AND profile.role = 'ADMIN')
    LIMIT 1;
    IF v_other IS NOT NULL THEN
        PERFORM set_config('request.jwt.claim.sub', v_other::TEXT, TRUE);
        PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_other, 'role', 'authenticated')::TEXT, TRUE);
        IF (public.get_teacher_spelling_claw_gift_badge_v1(v_play.class_id) ->> 'count')::INTEGER <> 0 THEN
            RAISE EXCEPTION '다른 교사에게 선물 배지 수가 보입니다.';
        END IF;
    END IF;
END;
$$;
