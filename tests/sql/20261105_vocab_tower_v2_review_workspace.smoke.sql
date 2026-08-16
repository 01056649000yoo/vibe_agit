-- 이 파일은 migrate:check의 바깥 트랜잭션 안에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF has_table_privilege('authenticated', 'public.vocab_tower_v2_review_decks', 'SELECT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_review_decks', 'INSERT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_review_decks', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_review_items', 'SELECT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_review_items', 'INSERT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_v2_review_items', 'UPDATE') THEN
        RAISE EXCEPTION '어휘 V2 검수표가 브라우저 역할에 직접 공개됐습니다.';
    END IF;
END;
$$;

SELECT set_config('test.vocab_admin_id', profile.id::TEXT, true)
FROM public.profiles profile
WHERE profile.role = 'ADMIN'
ORDER BY profile.created_at
LIMIT 1;

SELECT set_config('test.vocab_teacher_id', profile.id::TEXT, true)
FROM public.profiles profile
WHERE profile.role = 'TEACHER'
  AND profile.is_approved IS TRUE
  AND profile.approval_revoked_at IS NULL
ORDER BY profile.created_at
LIMIT 1;

SELECT set_config('test.vocab_student_auth_id', student.auth_id::TEXT, true)
FROM public.students student
WHERE student.auth_id IS NOT NULL
  AND student.is_active IS DISTINCT FROM FALSE
  AND student.deleted_at IS NULL
ORDER BY student.created_at
LIMIT 1;

DO $$
BEGIN
    IF current_setting('test.vocab_admin_id', true) IS NULL
       OR current_setting('test.vocab_teacher_id', true) IS NULL
       OR current_setting('test.vocab_student_auth_id', true) IS NULL THEN
        RAISE EXCEPTION '어휘 V2 검수 권한 스모크용 관리자·교사·학생 fixture가 없습니다.';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_admin_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_admin_id'), 'role', 'authenticated'
)::TEXT, true);

DO $$
DECLARE
    v_seed JSONB;
    v_item_version INTEGER;
    v_deck_version INTEGER;
    v_result JSONB;
BEGIN
    v_seed := public.admin_seed_vocab_tower_v2_review_deck_v1(
        6::SMALLINT,
        10::SMALLINT,
        'grade6-deck10',
        'smoke-fingerprint-20261105',
        jsonb_build_array(jsonb_build_object(
            'itemKey', 'vocab:g6:검수스모크',
            'itemOrder', 1,
            'word', '검수스모크',
            'partOfSpeech', '명사',
            'meaningNumber', 1,
            'level', 1,
            'category', '검사',
            'sourceDefinition', '검사용 원래 뜻이에요.',
            'sourceExample', '검수스모크 낱말을 확인해요.',
            'definition', '검사용으로 저장하는 뜻이에요.',
            'example', '검수스모크 낱말을 안전하게 확인해요.',
            'acceptedAnswers', jsonb_build_array('검수스모크'),
            'questions', jsonb_build_object(
                'meaningChoice', jsonb_build_object(
                    'status', 'reviewed', 'prompt', '뜻',
                    'options', jsonb_build_array(
                        jsonb_build_object('value', '검사용 뜻', 'isCorrect', TRUE),
                        jsonb_build_object('value', '다른 뜻', 'isCorrect', FALSE)
                    )
                ),
                'clozeChoice', jsonb_build_object(
                    'status', 'reviewed', 'prompt', '빈칸',
                    'options', jsonb_build_array(
                        jsonb_build_object('value', '검수스모크', 'isCorrect', TRUE),
                        jsonb_build_object('value', '다른답', 'isCorrect', FALSE)
                    )
                ),
                'definitionInput', jsonb_build_object('status', 'reviewed', 'prompt', '뜻 입력', 'acceptedAnswers', jsonb_build_array('검수스모크')),
                'clozeInput', jsonb_build_object('status', 'reviewed', 'prompt', '빈칸 입력', 'acceptedAnswers', jsonb_build_array('검수스모크')),
                'usageDistinction', jsonb_build_object(
                    'status', 'reviewed', 'prompt', '구별',
                    'options', jsonb_build_array(
                        jsonb_build_object('value', '알맞은 쓰임', 'isCorrect', TRUE),
                        jsonb_build_object('value', '다른 쓰임', 'isCorrect', FALSE)
                    ),
                    'explanation', '해설'
                )
            )
        )),
        'editorial_review'
    );

    IF jsonb_array_length(v_seed->'items') <> 1 THEN
        RAISE EXCEPTION '관리자 검수 덱 초기화 결과가 올바르지 않습니다.';
    END IF;

    v_item_version := (v_seed->'items'->0->>'version')::INTEGER;
    v_result := public.admin_save_vocab_tower_v2_review_item_v1(
        'vocab:g6:검수스모크',
        v_item_version,
        '명사',
        1::SMALLINT,
        2::SMALLINT,
        '수정한 검사용 뜻이에요.',
        '검수스모크 예문을 수정해 확인해요.',
        ARRAY['검수스모크'],
        v_seed->'items'->0->'questions',
        '롤백 스모크'
    );

    IF v_result->'item'->>'definition' <> '수정한 검사용 뜻이에요.' THEN
        RAISE EXCEPTION '관리자 검수 항목 저장이 반영되지 않았습니다.';
    END IF;

    v_item_version := (v_result->'item'->>'version')::INTEGER;
    v_deck_version := (v_result->>'deck_version')::INTEGER;
    v_result := public.admin_set_vocab_tower_v2_review_status_v1(
        'grade6-deck10', v_deck_version, 'teacher_confirmed'
    );
    v_deck_version := (v_result->'deck'->>'version')::INTEGER;
    v_result := public.admin_set_vocab_tower_v2_review_status_v1(
        'grade6-deck10', v_deck_version, 'locked'
    );

    IF v_result->'deck'->>'review_status' <> 'locked' THEN
        RAISE EXCEPTION '관리자 검수 덱 잠금이 반영되지 않았습니다.';
    END IF;

    BEGIN
        PERFORM public.admin_save_vocab_tower_v2_review_item_v1(
            'vocab:g6:검수스모크',
            v_item_version,
            '명사', 1::SMALLINT, 1::SMALLINT, '잠금 뒤 수정', '검수스모크 잠금 뒤 수정', ARRAY['검수스모크'],
            v_seed->'items'->0->'questions', NULL
        );
        RAISE EXCEPTION '잠긴 덱의 항목을 수정했습니다.';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        NULL;
    END;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_teacher_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_teacher_id'), 'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN')
)::TEXT, true);

DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.admin_get_vocab_tower_v2_review_deck_v1(6::SMALLINT, 10::SMALLINT, 50);
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '승인 교사가 오래된 ADMIN JWT로 공용 검수표를 조회했습니다.';
    END IF;
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.vocab_student_auth_id'), true);
SELECT set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('test.vocab_student_auth_id'), 'role', 'authenticated',
    'app_metadata', jsonb_build_object('role', 'ADMIN')
)::TEXT, true);

DO $$
DECLARE
    v_blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        PERFORM public.admin_get_vocab_tower_v2_review_deck_v1(6::SMALLINT, 10::SMALLINT, 50);
    EXCEPTION WHEN insufficient_privilege THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '학생이 오래된 ADMIN JWT로 공용 검수표를 조회했습니다.';
    END IF;
END;
$$;

RESET ROLE;
