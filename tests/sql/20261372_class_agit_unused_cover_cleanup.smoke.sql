-- 안 쓰는 표지 그림 스모크 (롤백된다).
-- ① 지금 표지·확정판이 쓰는 표지는 남기고, 나머지만 "안 씀" 목록에 ② 다른 교사는 목록을 못 본다
-- ③ 매주 정리는 안 쓰는 그림 중 하루 지난 것만(올리는 중인 새 그림은 건드리지 않음)
DO $$
DECLARE
    v_class UUID; v_book UUID; v_teacher UUID; v_other UUID; v_prefix TEXT;
    v_list TEXT[]; v_sweep TEXT[]; v_blocked BOOLEAN := FALSE; v_number INTEGER;
BEGIN
    SELECT b.class_id, b.id, c.teacher_id INTO v_class, v_book, v_teacher
    FROM public.class_agit_books b JOIN public.classes c ON c.id = b.class_id AND c.deleted_at IS NULL
    WHERE NOT b.archived AND public.class_agit_class_is_allowed_v1(b.class_id)
      AND (SELECT count(*) FROM public.class_agit_book_editions e WHERE e.book_id = b.id) < 20
    ORDER BY b.updated_at DESC LIMIT 1;
    SELECT id INTO v_other FROM public.profiles WHERE role = 'TEACHER' AND is_approved IS TRUE AND id <> v_teacher LIMIT 1;
    v_prefix := v_class || '/' || v_book || '/';
    INSERT INTO storage.objects (bucket_id, name, metadata, created_at) VALUES
        ('class-agit-covers', v_prefix || 'smoke-current.png', '{"size": 10, "mimetype": "image/png"}', NOW() - INTERVAL '3 days'),
        ('class-agit-covers', v_prefix || 'smoke-edition.png', '{"size": 10, "mimetype": "image/png"}', NOW() - INTERVAL '3 days'),
        ('class-agit-covers', v_prefix || 'smoke-old-unused.png', '{"size": 10, "mimetype": "image/png"}', NOW() - INTERVAL '3 days'),
        ('class-agit-covers', v_prefix || 'smoke-just-uploaded.png', '{"size": 10, "mimetype": "image/png"}', NOW());
    UPDATE public.class_agit_books SET cover_image = jsonb_build_object('path', v_prefix || 'smoke-current.png', 'paper', paper_format) WHERE id = v_book;
    SELECT COALESCE(max(number), 0) + 1 INTO v_number FROM public.class_agit_book_editions WHERE book_id = v_book;
    INSERT INTO public.class_agit_book_editions (class_id, book_id, number, snapshot)
    VALUES (v_class, v_book, v_number, jsonb_build_object('title', 'smoke', 'cover_image', jsonb_build_object('path', v_prefix || 'smoke-edition.png')));

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    SELECT array_agg(p) INTO v_list FROM public.get_class_agit_unused_cover_paths_v1(v_class, v_book) p;
    IF v_prefix || 'smoke-current.png' = ANY (COALESCE(v_list, '{}')) THEN RAISE EXCEPTION '지금 표지를 지우려 합니다.'; END IF;
    IF v_prefix || 'smoke-edition.png' = ANY (COALESCE(v_list, '{}')) THEN RAISE EXCEPTION '확정판 표지를 지우려 합니다.'; END IF;
    IF NOT (v_prefix || 'smoke-old-unused.png' = ANY (COALESCE(v_list, '{}'))) OR NOT (v_prefix || 'smoke-just-uploaded.png' = ANY (COALESCE(v_list, '{}'))) THEN
        RAISE EXCEPTION '안 쓰는 그림이 목록에 없습니다: %', v_list;
    END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::TEXT, true);
    BEGIN
        PERFORM public.get_class_agit_unused_cover_paths_v1(v_class, v_book);
    EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE;
    END;
    RESET ROLE;
    IF NOT v_blocked THEN RAISE EXCEPTION '다른 교사가 목록을 봅니다.'; END IF;

    SELECT array_agg(p) INTO v_sweep FROM public.class_agit_orphan_cover_paths_v1() p;
    IF NOT (v_prefix || 'smoke-old-unused.png' = ANY (COALESCE(v_sweep, '{}'))) THEN RAISE EXCEPTION '매주 정리가 하루 지난 안 쓰는 그림을 못 찾습니다.'; END IF;
    IF v_prefix || 'smoke-just-uploaded.png' = ANY (COALESCE(v_sweep, '{}')) THEN RAISE EXCEPTION '매주 정리가 방금 올린 그림을 지우려 합니다.'; END IF;
    IF v_prefix || 'smoke-current.png' = ANY (COALESCE(v_sweep, '{}')) OR v_prefix || 'smoke-edition.png' = ANY (COALESCE(v_sweep, '{}')) THEN
        RAISE EXCEPTION '매주 정리가 쓰는 표지를 지우려 합니다.';
    END IF;
    RAISE NOTICE '안 쓰는 표지 스모크 통과';
END;
$$;
