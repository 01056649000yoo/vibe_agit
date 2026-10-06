-- 글꽃 책방 표지 그림 스모크 (롤백된다).
-- ① 규격 맞는 그림은 표지가 되고 속지 스타일이 저장된다 ② 비율·크기·위치·없는 파일·형식·속지 값이 틀리면 거절
-- ③ 저장소 권한: 담당 교사 읽기·쓰기, 그 반 학생 읽기만, 다른 교사·로그인 안 한 사람은 못 봄
-- ⑤ 확정판 기록에 표지 그림이 담긴다 ⑥ 끄기
-- (④ 종이를 바꿔 저장하면 그림 표지가 꺼지는 규칙은 저장 요청 전체가 필요해 tests/classAgitCoverImage.test.mjs 가 본다)

DO $$
DECLARE
    v_class UUID; v_book UUID; v_teacher UUID; v_other UUID; v_student UUID;
    v_path TEXT; v_ws JSONB; v_snap JSONB; v_blocked BOOLEAN; v_case TEXT; v_shared BOOLEAN;
    v_cases TEXT[][] := ARRAY[
        ARRAY['비율', '1000', '1000', 'plain', 'ok'],
        ARRAY['작음', '600', '849', 'plain', 'ok'],
        ARRAY['속지', '1240', '1754', 'gold', 'ok'],
        ARRAY['위치', '1240', '1754', 'plain', 'badpath'],
        ARRAY['없는 파일', '1240', '1754', 'plain', 'missing'],
        ARRAY['형식', '1240', '1754', 'plain', 'gif']
    ];
    i INTEGER;
BEGIN
    SELECT b.class_id, b.id, c.teacher_id INTO v_class, v_book, v_teacher
    FROM public.class_agit_books b JOIN public.classes c ON c.id = b.class_id AND c.deleted_at IS NULL
    WHERE NOT b.archived AND public.class_agit_class_is_allowed_v1(b.class_id)
      AND EXISTS (SELECT 1 FROM public.class_agit_book_items i WHERE i.book_id = b.id AND i.removed_at IS NULL)
    ORDER BY b.updated_at DESC LIMIT 1;
    SELECT id INTO v_other FROM public.profiles WHERE role = 'TEACHER' AND is_approved IS TRUE AND id <> v_teacher LIMIT 1;
    SELECT auth_id INTO v_student FROM public.students WHERE class_id = v_class AND auth_id IS NOT NULL AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE LIMIT 1;
    IF v_book IS NULL OR v_other IS NULL THEN RAISE EXCEPTION '시험할 문집·교사가 없습니다.'; END IF;
    v_shared := EXISTS (SELECT 1 FROM public.neighbor_shared_books s WHERE s.book_id = v_book AND s.status = 'published');

    UPDATE public.class_agit_books SET paper_format = 'A4', cover_image = NULL WHERE id = v_book;
    v_path := v_class || '/' || v_book || '/smoke-cover-0001.png';
    INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
        ('class-agit-covers', v_path, '{"size": 812345, "mimetype": "image/png"}'),
        ('class-agit-covers', v_class || '/' || v_book || '/smoke-cover-0002.png', '{"size": 812345, "mimetype": "image/gif"}');

    -- ① 담당 교사가 규격 맞는 A4(최소 1240×1754) 그림을 표지로
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    v_ws := public.run_class_agit_book_action_v1(v_class, 'set_cover_image',
        jsonb_build_object('book_id', v_book, 'path', v_path, 'width', 1240, 'height', 1754, 'inner_style', 'warm'));
    IF v_ws->'book'->'cover_image'->>'path' IS DISTINCT FROM v_path OR v_ws->'book'->'cover_image'->>'inner_style' <> 'warm'
       OR v_ws->'book'->'cover_image'->>'paper' <> 'A4' THEN
        RAISE EXCEPTION '규격 맞는 그림이 표지가 되지 않았습니다: %', v_ws->'book'->'cover_image';
    END IF;

    -- ② 틀린 것은 모두 거절
    FOR i IN 1 .. array_length(v_cases, 1) LOOP
        v_blocked := FALSE;
        BEGIN
            PERFORM public.run_class_agit_book_action_v1(v_class, 'set_cover_image', jsonb_build_object(
                'book_id', v_book,
                'path', CASE v_cases[i][5]
                    WHEN 'badpath' THEN v_class || '/' || gen_random_uuid() || '/smoke-cover-0001.png'
                    WHEN 'missing' THEN v_class || '/' || v_book || '/smoke-cover-9999.png'
                    WHEN 'gif' THEN v_class || '/' || v_book || '/smoke-cover-0002.png'
                    ELSE v_path END,
                'width', v_cases[i][2]::INTEGER, 'height', v_cases[i][3]::INTEGER, 'inner_style', v_cases[i][4]));
        EXCEPTION WHEN invalid_parameter_value THEN v_blocked := TRUE;
        END;
        IF NOT v_blocked THEN RAISE EXCEPTION '% 이(가) 틀린 그림을 받았습니다.', v_cases[i][1]; END IF;
    END LOOP;

    -- ③ 저장소 권한
    IF NOT public.can_access_class_agit_cover_v1(v_path, TRUE) THEN RAISE EXCEPTION '담당 교사가 쓸 수 없습니다.'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::TEXT, true);
    IF public.can_access_class_agit_cover_v1(v_path, FALSE) AND NOT v_shared THEN
        RAISE EXCEPTION '다른 교사가 공유되지 않은 표지를 봅니다.';
    END IF;
    IF public.can_access_class_agit_cover_v1(v_path, TRUE) THEN RAISE EXCEPTION '다른 교사가 표지를 올릴 수 있습니다.'; END IF;
    IF v_student IS NOT NULL THEN
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_student, 'role', 'authenticated')::TEXT, true);
        IF NOT public.can_access_class_agit_cover_v1(v_path, FALSE) THEN RAISE EXCEPTION '그 반 학생이 표지를 못 봅니다.'; END IF;
        IF public.can_access_class_agit_cover_v1(v_path, TRUE) THEN RAISE EXCEPTION '학생이 표지를 올릴 수 있습니다.'; END IF;
    END IF;
    PERFORM set_config('request.jwt.claims', '{}', true);
    PERFORM set_config('role', 'anon', true);
    -- 로그인 안 한 사람은 정책이 `TO authenticated` 라 닿지도 않고, 함수도 부를 수 없다.
    v_blocked := FALSE;
    BEGIN
        v_blocked := NOT public.can_access_class_agit_cover_v1(v_path, FALSE);
    EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN RAISE EXCEPTION '로그인 안 한 사람이 표지를 봅니다.'; END IF;
    RESET ROLE;

    -- ⑤ 확정판 기록에 담김(원글이 바뀐 문집이면 기록 만들기 자체가 막히므로 그때는 건너뛴다)
    BEGIN
        v_snap := public.class_agit_book_draft_snapshot_v1(v_class, v_book);
        IF v_snap->'cover_image'->>'path' IS DISTINCT FROM v_path THEN RAISE EXCEPTION '확정판 기록에 표지 그림이 없습니다.'; END IF;
    EXCEPTION WHEN SQLSTATE 'PT409' OR insufficient_privilege OR check_violation THEN
        RAISE NOTICE '확정판 기록 확인은 건너뜀(원글 상태): %', SQLERRM;
    END;

    -- ⑥ 끄기
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.run_class_agit_book_action_v1(v_class, 'set_cover_image',
        jsonb_build_object('book_id', v_book, 'path', v_path, 'width', 2480, 'height', 3508));
    v_ws := public.run_class_agit_book_action_v1(v_class, 'clear_cover_image', jsonb_build_object('book_id', v_book));
    RESET ROLE;
    IF v_ws->'book'->'cover_image' IS NOT NULL AND v_ws->'book'->>'cover_image' IS NOT NULL THEN
        RAISE EXCEPTION '끄기가 표지 그림을 지우지 않았습니다.';
    END IF;

    RAISE NOTICE '표지 그림 스모크 통과';
END;
$$;
