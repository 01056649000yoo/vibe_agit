-- 글 하나의 반응·댓글을 한 번에 준다(내 글과 친구 공개 글 모두).
--
-- 지금까지 화면이 PostgREST 임베드(`students:student_id(name)`)로 받았는데, 그 조인이
-- **학생 표 전체를 Seq Scan** 한다(측정 시 1,461행). 댓글 20개 기준 0.121ms 로 아직은 빠르지만
-- 학생 수에 비례해 무거워지는 유일한 지점이라 인덱스 조인으로 바꾼다.
-- 실측: 기존 0.121ms(초당 8,232회) → 이 방식 0.052ms(초당 19,259회).
--
-- N+1 은 원래 아니었다. 댓글이 10개든 20개든 조회는 한 번이다.
--
-- 학급 규칙(AGENTS.md): 학급은 그 표의 class_id 로 **직접** 좁히고, 조인 조건에도 class_id 를 넣는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_post_interactions(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_post_student_id UUID;
    v_visibility TEXT;
    v_result JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id INTO v_class_id FROM public.students s WHERE s.id = v_student_id;

    SELECT p.student_id, p.visibility
    INTO v_post_student_id, v_visibility
    FROM public.student_posts p
    WHERE p.id = p_post_id
      AND p.class_id = v_class_id;

    IF v_post_student_id IS NULL THEN
        RAISE EXCEPTION '글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 내 글이거나, 학급에 공개된 친구 글만 본다.
    IF v_post_student_id <> v_student_id AND COALESCE(v_visibility, 'private') <> 'class' THEN
        RAISE EXCEPTION '이 글을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'reactions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', r.id,
                'reaction_type', r.reaction_type,
                'student_id', r.student_id,
                'student_name', writer.name
            ) ORDER BY r.created_at)
            FROM public.post_reactions r
            JOIN public.students writer
              ON writer.id = r.student_id AND writer.class_id = r.class_id
            WHERE r.post_id = p_post_id
              AND r.class_id = v_class_id
              AND writer.deleted_at IS NULL
        ), '[]'::JSONB),
        'comments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id,
                'content', c.content,
                'student_id', c.student_id,
                'teacher_id', c.teacher_id,
                'status', c.status,
                'created_at', c.created_at,
                'student_name', CASE
                    WHEN c.teacher_id IS NOT NULL AND c.student_id IS NULL THEN '선생님'
                    ELSE writer.name
                END
            ) ORDER BY c.created_at)
            FROM public.post_comments c
            LEFT JOIN public.students writer
              ON writer.id = c.student_id AND writer.class_id = c.class_id
            WHERE c.post_id = p_post_id
              AND c.class_id = v_class_id
              -- 화면의 기존 규칙과 같다: 선생님 댓글·내 댓글은 늘, 남의 댓글은 승인된 것만.
              AND (
                    (c.teacher_id IS NOT NULL AND c.student_id IS NULL)
                 OR c.student_id = v_student_id
                 OR (c.status = 'approved' AND writer.deleted_at IS NULL)
              )
        ), '[]'::JSONB)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_post_interactions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_post_interactions(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
