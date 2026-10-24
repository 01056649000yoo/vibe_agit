-- 우리반 수호룡 아지트에서 친구의 어휘의 탑 정복 덱 보기(2026-10-25 선생님 결정).
--
-- 같은 반 친구가 **정복한 덱 번호만** 돌려준다 — 정답률·틀린 낱말·점수·횟수는 돌려주지 않는다(순위·비교용이 아님).
-- 정복 = 앱의 `정복 완료` 와 같은 뜻: 덱마스터 도전 자격(모든 낱말을 한 번 이상 보고 익힘 수가 학급 기준 이상) 이거나 이미 덱마스터 합격.
-- 학생 본인만, 자기 반 친구만. 새 표는 만들지 않는다(읽기 전용 함수 하나).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_class_vocab_conquests_v1()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_me UUID := public.auth_student_id();
    v_class UUID;
    v_grade SMALLINT;
    v_ratio NUMERIC;
    v_items JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_me IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT student.class_id INTO v_class FROM public.students student WHERE student.id = v_me;
    SELECT LEAST(6, GREATEST(3, COALESCE(class.vocab_tower_grade, 3)))::SMALLINT, class.vocab_master_required_mastered_ratio
    INTO v_grade, v_ratio
    FROM public.classes class WHERE class.id = v_class AND class.deleted_at IS NULL;
    IF v_grade IS NULL THEN
        RETURN jsonb_build_object('grade', NULL, 'students', '[]'::JSONB);
    END IF;

    SELECT COALESCE(jsonb_object_agg(deck.deck_number::TEXT, item_stats.item_count), '{}'::JSONB) INTO v_items
    FROM public.vocab_tower_v2_review_decks deck
    CROSS JOIN LATERAL (
        SELECT COUNT(*)::INTEGER AS item_count FROM public.vocab_tower_v2_review_items item WHERE item.deck_id = deck.deck_id
    ) item_stats
    WHERE deck.grade = v_grade AND deck.deck_number BETWEEN 1 AND 10;

    RETURN jsonb_build_object('grade', v_grade, 'students', COALESCE((
        WITH roster AS (
            SELECT student.id FROM public.students student
            WHERE student.class_id = v_class AND student.deleted_at IS NULL AND student.is_active IS DISTINCT FROM false
            LIMIT 100
        ),
        deck_keys AS (
            SELECT n AS deck_number, public.vocab_tower_v2_collection_key(v_grade, n::SMALLINT) AS collection_key
            FROM generate_series(1, 10) n
        ),
        learning AS (
            SELECT progress.student_id, keys.deck_number,
                   COUNT(*)::INTEGER AS seen_count,
                   COUNT(*) FILTER (WHERE progress.learning_state = 'mastered')::INTEGER AS mastered_count
            FROM public.learning_item_progress progress
            JOIN deck_keys keys ON keys.collection_key = progress.collection_key
            WHERE progress.class_id = v_class AND progress.content_type = 'vocab'
              AND progress.student_id IN (SELECT id FROM roster)
            GROUP BY progress.student_id, keys.deck_number
        ),
        passed AS (
            SELECT DISTINCT attempt.student_id, keys.deck_number
            FROM public.learning_challenge_attempts attempt
            JOIN deck_keys keys ON keys.collection_key = attempt.collection_key
            WHERE attempt.class_id = v_class AND attempt.content_type = 'vocab' AND attempt.challenge_kind = 'collection'
              AND attempt.status = 'completed' AND attempt.passed IS TRUE
              AND attempt.student_id IN (SELECT id FROM roster)
        ),
        conquered AS (
            SELECT roster.id AS student_id, keys.deck_number
            FROM roster CROSS JOIN deck_keys keys
            LEFT JOIN learning ON learning.student_id = roster.id AND learning.deck_number = keys.deck_number
            LEFT JOIN passed ON passed.student_id = roster.id AND passed.deck_number = keys.deck_number
            WHERE passed.deck_number IS NOT NULL
               OR (COALESCE((v_items ->> keys.deck_number::TEXT)::INTEGER, 0) > 0
                   AND COALESCE(learning.seen_count, 0) >= (v_items ->> keys.deck_number::TEXT)::INTEGER
                   AND COALESCE(learning.mastered_count, 0) >= CEIL((v_items ->> keys.deck_number::TEXT)::INTEGER * v_ratio)::INTEGER)
        )
        SELECT jsonb_agg(jsonb_build_object('student_id', grouped.student_id, 'decks', grouped.decks))
        FROM (SELECT student_id, jsonb_agg(deck_number ORDER BY deck_number) AS decks FROM conquered GROUP BY student_id) grouped
    ), '[]'::JSONB));
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_class_vocab_conquests_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_vocab_conquests_v1() TO authenticated, service_role;

COMMIT;
