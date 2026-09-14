-- 바깥 실행기가 전체 트랜잭션을 롤백하므로 운영 데이터는 바뀌지 않는다.
-- "최종 승인된 글은 회수 이력과 상관없이 실을 수 있다" 는 약속을 실제 스키마에서 확인한다.

-- [1] 자격 판정 여섯 곳에서 회수 조건이 사라졌는지 정의로 본다.
--     한 곳이라도 남으면 목록에는 떠도 발행이 거부되거나 실린 뒤 자동 철회된다.
DO $$
DECLARE
    v_name TEXT;
    v_def TEXT;
    v_left TEXT := '';
BEGIN
    FOR v_name IN SELECT unnest(ARRAY[
        'get_class_agit_candidates_v2', 'get_class_agit_missions_v1', 'class_agit_source_data_v1',
        'class_agit_revoke_changed_posts_v1', 'revoke_class_agit_source_v1', 'revoke_class_agit_releases_v1'
    ]) LOOP
        SELECT pg_get_functiondef(p.oid) INTO v_def
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name
        LIMIT 1;
        IF v_def IS NULL THEN
            RAISE EXCEPTION '% 함수를 찾지 못했습니다.', v_name;
        END IF;
        -- 자격 판정에 쓰이던 네 가지 표현만 본다. 변경 감지 지문은 대상이 아니다.
        IF v_def LIKE '%recalled_at IS NULL%' OR v_def LIKE '%recalled_at IS NOT NULL%' THEN
            v_left := v_left || v_name || ' ';
        END IF;
    END LOOP;
    IF v_left <> '' THEN
        RAISE EXCEPTION '아직 회수 자국으로 거르는 곳이 남았습니다: %', v_left;
    END IF;
END;
$$;

-- [2] 변경 감지 지문에는 회수 시각이 그대로 있어야 한다.
--     이건 자격이 아니라 "실은 뒤에 원글이 바뀌었는지" 를 알아보는 값이라 지우면 안 된다.
DO $$
DECLARE
    v_def TEXT := pg_get_functiondef('public.class_agit_source_data_v1'::regproc);
BEGIN
    IF v_def NOT LIKE '%p_post.recalled_at, p_mission.input_template%' THEN
        RAISE EXCEPTION '변경 감지 지문에서 회수 시각까지 지웠습니다.';
    END IF;
END;
$$;

-- [3] 승인되지 않은 글은 여전히 빠져야 한다. 회수만 풀고 승인 관문까지 풀면 안 된다.
DO $$
DECLARE
    v_def TEXT := pg_get_functiondef('public.get_class_agit_candidates_v2'::regproc);
BEGIN
    IF v_def NOT LIKE '%is_confirmed IS TRUE%' THEN
        RAISE EXCEPTION '승인 관문이 사라졌습니다 — 승인 안 한 글까지 실립니다.';
    END IF;
    IF v_def NOT LIKE '%is_returned IS NOT TRUE%' THEN
        RAISE EXCEPTION '반려 글 제외가 사라졌습니다.';
    END IF;
    IF v_def NOT LIKE '%visibility=''class''%' THEN
        RAISE EXCEPTION '학급 공개 범위 조건이 사라졌습니다.';
    END IF;
END;
$$;

-- [4] 실제 데이터로 본다: 회수된 뒤 승인된 글이 이제 후보에 들어오는가.
--     그런 글이 운영에 없으면 이 단계는 건너뛴다(검사 자체는 [1]~[3]으로 충분하다).
SELECT set_config('test.recalled_post', candidate.id::TEXT, true),
       set_config('test.recalled_class', candidate.class_id::TEXT, true)
FROM (
    SELECT post.id, post.class_id
    FROM public.student_posts post
    JOIN public.writing_missions mission ON mission.id = post.mission_id AND mission.class_id = post.class_id
    WHERE post.recalled_at IS NOT NULL
      AND post.writing_context = 'assignment'
      AND post.is_submitted IS TRUE
      AND post.is_confirmed IS TRUE
      AND post.is_returned IS NOT TRUE
      AND post.visibility = 'class'
    ORDER BY post.updated_at DESC
    LIMIT 1
) candidate;

DO $$
DECLARE
    v_post UUID := NULLIF(current_setting('test.recalled_post', true), '')::UUID;
    v_class UUID := NULLIF(current_setting('test.recalled_class', true), '')::UUID;
    v_row public.student_posts%ROWTYPE;
    v_mission public.writing_missions%ROWTYPE;
BEGIN
    IF v_post IS NULL THEN
        RAISE NOTICE '회수 뒤 승인된 글이 운영에 없어 [4]를 건너뜁니다.';
        RETURN;
    END IF;

    SELECT * INTO v_row FROM public.student_posts WHERE id = v_post;
    SELECT * INTO v_mission FROM public.writing_missions WHERE id = v_row.mission_id;

    -- 발행용 원본을 실제로 만들 수 있어야 한다. 예전에는 여기서 NULL 이 나와 실을 수 없었다.
    IF public.class_agit_source_data_v1(v_row, v_mission, '새싹 작가 01') IS NULL THEN
        RAISE EXCEPTION '회수 뒤 승인된 글의 발행용 원본이 여전히 만들어지지 않습니다.';
    END IF;
END;
$$;
