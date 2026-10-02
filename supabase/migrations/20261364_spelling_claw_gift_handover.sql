-- 수호룡의 인형뽑기 3단계 — 선생님 선물 `줬어요` (2026-10-02, OI-024)
--
-- 선생님 선물은 서버가 기록만 하고 교사가 직접 챙겨 준다. 준 뒤 `줬어요` 를 누르면 그 상품에 given_at 이 남고,
-- 학생에게 `선생님이 선물을 줬어요` 알림이 한 번 간다(다시 눌러 되돌려도 알림은 다시 가지 않는다).
-- 뽑기 내역은 최근 100판만 읽으므로, **아직 안 준 선물**은 오래된 것까지 따로 모아(최대 50개) 함께 돌려준다.

CREATE OR REPLACE FUNCTION public.set_teacher_spelling_claw_gift_given_v1(
    p_class_id UUID,
    p_play_id UUID,
    p_prize_index INTEGER,
    p_given BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_play public.spelling_claw_plays%ROWTYPE;
    v_prize JSONB;
BEGIN
    PERFORM public.spelling_claw_assert_teacher_v1(p_class_id);
    SELECT * INTO v_play FROM public.spelling_claw_plays
    WHERE id = p_play_id AND class_id = p_class_id AND status = 'done'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '이 뽑기 기록을 찾을 수 없어요.' USING ERRCODE = 'P0002';
    END IF;
    v_prize := v_play.prizes -> p_prize_index;
    IF p_prize_index IS NULL OR p_prize_index < 0 OR v_prize IS NULL OR v_prize ->> 'kind' <> 'gift' THEN
        RAISE EXCEPTION '선생님 선물이 아닌 상품입니다.' USING ERRCODE = '22023';
    END IF;

    v_prize := CASE WHEN COALESCE(p_given, false)
        THEN v_prize || jsonb_build_object('given_at', COALESCE(v_prize ->> 'given_at', to_jsonb(NOW()) #>> '{}'))
        ELSE v_prize - 'given_at'
    END;
    UPDATE public.spelling_claw_plays
    SET prizes = jsonb_set(prizes, ARRAY[p_prize_index::TEXT], v_prize)
    WHERE id = p_play_id;

    IF COALESCE(p_given, false) THEN
        PERFORM public.notification_emit_v1(
            v_play.student_id, 'spelling-claw', 'spelling-claw.gift_given', 'spelling_claw_play', p_play_id,
            jsonb_build_object('gift_name', v_prize ->> 'gift_name'),
            format('spelling-claw:gift-given:%s:%s', p_play_id, p_prize_index)
        );
    END IF;
    RETURN jsonb_build_object('play_id', p_play_id, 'prize_index', p_prize_index, 'prize', v_prize);
END;
$$;

/* 교사 `뽑기 내역` 탭 — 상품이 나온 판과 최소 포인트를 받은 판 최신 100건 + 아직 안 준 선생님 선물(최대 50개). */
CREATE OR REPLACE FUNCTION public.get_teacher_spelling_claw_history_v1(p_class_id UUID, p_limit INTEGER DEFAULT 100)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_rows JSONB;
    v_today_summary JSONB;
    v_pending JSONB;
BEGIN
    PERFORM public.spelling_claw_assert_teacher_v1(p_class_id);

    SELECT COALESCE(jsonb_agg(row_data ORDER BY finished_at DESC), '[]'::JSONB) INTO v_rows
    FROM (
        SELECT play.finished_at, jsonb_build_object(
            'play_id', play.id,
            'student_id', play.student_id,
            'student_name', student.name,
            'finished_at', play.finished_at,
            'caught', play.caught,
            'prizes', play.prizes,
            'consolation_points', play.consolation_points
        ) AS row_data
        FROM public.spelling_claw_plays play
        JOIN public.students student ON student.id = play.student_id
        WHERE play.class_id = p_class_id
          AND play.status = 'done'
          AND (jsonb_array_length(play.prizes) > 0 OR play.consolation_points > 0)
        ORDER BY play.finished_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100)
    ) latest;

    SELECT jsonb_build_object(
        'plays', COUNT(*) FILTER (WHERE play.status = 'done'),
        'players', COUNT(DISTINCT play.student_id),
        'gifts', COALESCE(SUM((SELECT COUNT(*) FROM jsonb_array_elements(play.prizes) prize WHERE prize ->> 'kind' = 'gift')), 0),
        'decor', COALESCE(SUM((SELECT COUNT(*) FROM jsonb_array_elements(play.prizes) prize WHERE prize ->> 'kind' = 'decor')), 0),
        'points', COALESCE(SUM((SELECT COUNT(*) FROM jsonb_array_elements(play.prizes) prize WHERE prize ->> 'kind' = 'points')), 0)
    ) INTO v_today_summary
    FROM public.spelling_claw_plays play
    WHERE play.class_id = p_class_id AND play.played_on = v_today;

    SELECT COALESCE(jsonb_agg(gift ORDER BY gift ->> 'finished_at'), '[]'::JSONB) INTO v_pending
    FROM (
        SELECT jsonb_build_object(
            'play_id', play.id, 'prize_index', prize.ordinality - 1, 'student_name', student.name,
            'finished_at', play.finished_at, 'gift_name', prize.value ->> 'gift_name'
        ) AS gift
        FROM public.spelling_claw_plays play
        JOIN public.students student ON student.id = play.student_id
        CROSS JOIN LATERAL jsonb_array_elements(play.prizes) WITH ORDINALITY prize(value, ordinality)
        WHERE play.class_id = p_class_id AND play.status = 'done'
          AND prize.value ->> 'kind' = 'gift' AND NOT (prize.value ? 'given_at')
        ORDER BY play.finished_at
        LIMIT 50
    ) pending;

    RETURN jsonb_build_object('rows', v_rows, 'today', v_today_summary, 'pending_gifts', v_pending);
END;
$$;

REVOKE ALL ON FUNCTION public.set_teacher_spelling_claw_gift_given_v1(UUID, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_spelling_claw_gift_given_v1(UUID, UUID, INTEGER, BOOLEAN) TO authenticated;
