-- 표지 그림 지우기 권한·정리 목록 스모크 (롤백된다).
-- ① 담당 교사는 문집 줄이 없어진 폴더도 지울 수 있다 ② 다른 교사는 못 지운다
-- ③ 정리 목록에는 문집이 없어진 그림만 나오고, 살아 있는 문집의 그림은 나오지 않는다 ④ 브라우저 역할은 목록을 못 본다
DO $$
DECLARE
    v_class UUID; v_book UUID; v_teacher UUID; v_other UUID; v_gone UUID := gen_random_uuid();
    v_live TEXT; v_orphan TEXT; v_list TEXT[]; v_blocked BOOLEAN := FALSE;
BEGIN
    SELECT b.class_id, b.id, c.teacher_id INTO v_class, v_book, v_teacher
    FROM public.class_agit_books b JOIN public.classes c ON c.id = b.class_id AND c.deleted_at IS NULL
    WHERE NOT b.archived ORDER BY b.updated_at DESC LIMIT 1;
    SELECT id INTO v_other FROM public.profiles WHERE role = 'TEACHER' AND is_approved IS TRUE AND id <> v_teacher LIMIT 1;
    v_live := v_class || '/' || v_book || '/smoke-live-0001.png';
    v_orphan := v_class || '/' || v_gone || '/smoke-gone-0001.png';
    INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
        ('class-agit-covers', v_live, '{"size": 10, "mimetype": "image/png"}'),
        ('class-agit-covers', v_orphan, '{"size": 10, "mimetype": "image/png"}');

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    IF NOT public.can_delete_class_agit_cover_v1(v_orphan) THEN RAISE EXCEPTION '담당 교사가 지워진 문집 폴더를 못 지웁니다.'; END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::TEXT, true);
    IF public.can_delete_class_agit_cover_v1(v_orphan) THEN RAISE EXCEPTION '다른 교사가 표지를 지울 수 있습니다.'; END IF;
    BEGIN
        PERFORM public.class_agit_orphan_cover_paths_v1();
    EXCEPTION WHEN insufficient_privilege THEN v_blocked := TRUE;
    END;
    RESET ROLE;
    IF NOT v_blocked THEN RAISE EXCEPTION '브라우저 역할이 정리 목록을 봅니다.'; END IF;

    SELECT array_agg(p) INTO v_list FROM public.class_agit_orphan_cover_paths_v1() p;
    IF NOT v_orphan = ANY (COALESCE(v_list, '{}')) THEN RAISE EXCEPTION '문집이 없어진 그림이 정리 목록에 없습니다.'; END IF;
    IF v_live = ANY (COALESCE(v_list, '{}')) THEN RAISE EXCEPTION '살아 있는 문집의 그림이 정리 목록에 있습니다.'; END IF;
    RAISE NOTICE '표지 정리 스모크 통과';
END;
$$;
