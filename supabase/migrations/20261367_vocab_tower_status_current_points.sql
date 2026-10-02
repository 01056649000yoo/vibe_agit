-- 어휘의 탑 교사 학생 현황 — `받은 포인트` 를 지금 탑의 층 익힘 보상만으로 (2026-10-02 선생님 제보)
--
-- [원인] activity_type='vocab_tower' 를 모두 더해, 개편 전(5~7월) 예전 탑의 `어휘의 탑 일일 미션 보상 🏰` 까지 합쳐졌다
--        (한 반 80건 11,600P). 선생님 눈에는 다른 곳에서 받은 포인트까지 합친 것처럼 보였다.
-- 지금 탑 보상은 이벤트 키 `vocab-v2-progress:…`/`vocab-v2-perfect:…`(학생 지도가 읽는 키와 같음)만 세고, 예전 것은 legacy_vocab_points 로 따로 준다.

CREATE OR REPLACE FUNCTION public.get_teacher_vocab_tower_student_status_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_grade SMALLINT;
    v_items JSONB;
    v_students JSONB;
BEGIN
    SELECT LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3)))::SMALLINT INTO v_grade
    FROM public.classes class
    WHERE class.id = p_class_id
      AND class.deleted_at IS NULL
      AND auth.uid() IS NOT NULL
      AND ((class.teacher_id = auth.uid() AND public.auth_user_role() = 'TEACHER') OR public.auth_user_role() = 'ADMIN');
    IF v_grade IS NULL THEN
        RAISE EXCEPTION '이 학급의 어휘의 탑 현황을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    -- 층마다 낱말 수(잠긴 현재 덱).
    SELECT COALESCE(jsonb_object_agg(deck.deck_number::TEXT, item_stats.item_count), '{}'::JSONB) INTO v_items
    FROM public.vocab_tower_v2_review_decks deck
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::INTEGER AS item_count FROM public.vocab_tower_v2_review_items item WHERE item.deck_id = deck.deck_id
    ) item_stats
    WHERE deck.grade = v_grade AND deck.deck_number BETWEEN 1 AND 10;

    WITH roster AS (
        SELECT student.id, student.name
        FROM public.students student
        WHERE student.class_id = p_class_id
          AND student.deleted_at IS NULL
          AND student.is_active IS DISTINCT FROM false
        ORDER BY student.name, student.id
        LIMIT 100
    ),
    deck_keys AS (
        SELECT deck_number, public.vocab_tower_v2_collection_key(v_grade, deck_number::SMALLINT) AS collection_key
        FROM generate_series(1, 10) deck_number
    ),
    learning AS (
        SELECT progress.student_id, keys.deck_number,
               COUNT(*)::INTEGER AS seen_count,
               COUNT(*) FILTER (WHERE progress.learning_state = 'mastered')::INTEGER AS mastered_count,
               COUNT(*) FILTER (WHERE progress.learning_state = 'needs_review')::INTEGER AS needs_review_count
        FROM public.learning_item_progress progress
        JOIN deck_keys keys ON keys.collection_key = progress.collection_key
        WHERE progress.class_id = p_class_id AND progress.content_type = 'vocab'
          AND progress.student_id IN (SELECT id FROM roster)
        GROUP BY progress.student_id, keys.deck_number
    ),
    practice AS (
        SELECT progress.student_id, keys.deck_number, progress.practice_runs, progress.best_accuracy, progress.last_practiced_at
        FROM public.learning_collection_progress progress
        JOIN deck_keys keys ON keys.collection_key = progress.collection_key
        WHERE progress.class_id = p_class_id AND progress.content_type = 'vocab'
          AND progress.student_id IN (SELECT id FROM roster)
    ),
    passed AS (
        SELECT DISTINCT attempt.student_id, keys.deck_number
        FROM public.learning_challenge_attempts attempt
        JOIN deck_keys keys ON keys.collection_key = attempt.collection_key
        WHERE attempt.class_id = p_class_id AND attempt.content_type = 'vocab' AND attempt.challenge_kind = 'collection'
          AND attempt.status = 'completed' AND attempt.passed IS TRUE
          AND attempt.student_id IN (SELECT id FROM roster)
    ),
    recent AS (
        SELECT run.student_id, COUNT(*)::INTEGER AS runs_7d
        FROM public.vocab_tower_runs run
        WHERE run.class_id = p_class_id AND run.created_at >= NOW() - INTERVAL '7 days'
          AND run.student_id IN (SELECT id FROM roster)
        GROUP BY run.student_id
    ),
    points AS (
        -- 지금 탑(층 익힘 보상, 2026-08-24 개편 뒤)은 이벤트 키가 vocab-v2-… 다. 예전 탑의 `일일 미션 보상` 은 따로 센다.
        SELECT point_log.student_id,
               COALESCE(SUM(point_log.amount) FILTER (WHERE point_log.event_key LIKE 'vocab-v2-%'), 0)::INTEGER AS vocab_points,
               COALESCE(SUM(point_log.amount) FILTER (WHERE point_log.event_key IS NULL OR point_log.event_key NOT LIKE 'vocab-v2-%'), 0)::INTEGER AS legacy_points
        FROM public.point_logs point_log
        WHERE point_log.activity_type = 'vocab_tower' AND point_log.amount > 0
          AND point_log.student_id IN (SELECT id FROM roster)
        GROUP BY point_log.student_id
    )
    SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_name, sort_id), '[]'::JSONB) INTO v_students
    FROM (
        SELECT roster.name AS sort_name, roster.id AS sort_id, jsonb_build_object(
            'student_id', roster.id,
            'name', roster.name,
            'unlocked_deck', public.vocab_tower_v2_highest_unlocked_deck_v1(roster.id, p_class_id, v_grade),
            'summit_level', COALESCE((public.vocab_tower_v2_summit_status_v1(roster.id, p_class_id, v_grade) ->> 'level')::INTEGER, 0),
            'runs_7d', COALESCE(recent.runs_7d, 0),
            'vocab_points', COALESCE(points.vocab_points, 0),
            'legacy_vocab_points', COALESCE(points.legacy_points, 0),
            'decks', (
                SELECT jsonb_agg(jsonb_build_object(
                    'deck_number', keys.deck_number,
                    'item_count', COALESCE((v_items ->> keys.deck_number::TEXT)::INTEGER, 0),
                    'seen_count', COALESCE(learning.seen_count, 0),
                    'mastered_count', COALESCE(learning.mastered_count, 0),
                    'needs_review_count', COALESCE(learning.needs_review_count, 0),
                    'practice_runs', COALESCE(practice.practice_runs, 0),
                    'best_accuracy', COALESCE(practice.best_accuracy, 0),
                    'last_practiced_at', practice.last_practiced_at,
                    'master_passed', passed.deck_number IS NOT NULL
                ) ORDER BY keys.deck_number)
                FROM deck_keys keys
                LEFT JOIN learning ON learning.student_id = roster.id AND learning.deck_number = keys.deck_number
                LEFT JOIN practice ON practice.student_id = roster.id AND practice.deck_number = keys.deck_number
                LEFT JOIN passed ON passed.student_id = roster.id AND passed.deck_number = keys.deck_number
            )
        ) AS row_data
        FROM roster
        LEFT JOIN recent ON recent.student_id = roster.id
        LEFT JOIN points ON points.student_id = roster.id
    ) rows_out;

    RETURN jsonb_build_object('grade', v_grade, 'generated_at', NOW(), 'students', v_students);
END;
$$;

