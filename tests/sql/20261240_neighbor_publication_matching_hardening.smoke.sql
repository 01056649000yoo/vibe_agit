-- 역할별 공개/매칭 전체 흐름은 20261201 제한 공개 스모크의 합성 자료로 검증한다.
-- 여기서는 migrate:check에서도 새 원글 계약과 직접 실행 권한을 검증한다.
DO $$
DECLARE v_post public.student_posts%ROWTYPE; v_revision TEXT;
BEGIN
    SELECT * INTO v_post FROM jsonb_populate_record(NULL::public.student_posts,
        '{"is_submitted":true,"writing_context":"self","visibility":"private","content":"합성 본문"}'::JSONB);
    IF public.neighbor_source_is_shareable_v1(v_post) IS NOT FALSE THEN
        RAISE EXCEPTION 'private self writing must be excluded';
    END IF;
    v_post.visibility := 'class';
    IF public.neighbor_source_is_shareable_v1(v_post) IS NOT TRUE THEN
        RAISE EXCEPTION 'class-visible self writing must remain shareable';
    END IF;
    v_revision := public.neighbor_source_revision_v1(v_post);
    v_post.content := '바뀐 합성 본문';
    IF v_revision = public.neighbor_source_revision_v1(v_post) THEN
        RAISE EXCEPTION 'revision did not change with source content';
    END IF;
    v_post.recalled_at := NOW();
    IF public.neighbor_source_is_shareable_v1(v_post) IS NOT FALSE THEN
        RAISE EXCEPTION 'recalled source must be excluded';
    END IF;
    IF has_function_privilege('authenticated', 'public.review_neighbor_shared_post_v1(uuid,uuid,text,text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_neighbor_teacher_source_post_v1(uuid,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.get_neighbor_teacher_source_post_v1(uuid,uuid,uuid)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.get_neighbor_teacher_source_post_v1(uuid,uuid,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.neighbor_source_revision_v1(public.student_posts)', 'EXECUTE') THEN
        RAISE EXCEPTION 'source review privilege boundary failed';
    END IF;
END;
$$;
