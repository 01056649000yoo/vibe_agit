-- 보관함 미션 목록 RPC가 표시용 genre 문자열뿐 아니라 기술 식별자 input_template도 함께 반환하도록 보강한다.
-- PDF 내보내기의 장르별 선택지(예: 보고서 질문 포함형/완성본) 노출 여부를 프런트가 매니페스트로 판정하려면
-- writing_missions.input_template 값이 필요하다. genre 표시 문구 매칭은 문구가 바뀌면 조용히 깨진다.
CREATE OR REPLACE FUNCTION public.get_teacher_archived_missions_page(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_total INTEGER;
    v_items JSONB;
BEGIN
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes class
            WHERE class.id = p_class_id AND class.teacher_id = auth.uid() AND class.deleted_at IS NULL
        )
    ) THEN
        RAISE EXCEPTION '이 학급의 보관함을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::INTEGER INTO v_total
    FROM public.writing_missions mission
    WHERE mission.class_id = p_class_id AND mission.is_archived IS TRUE;

    WITH page AS MATERIALIZED (
        SELECT mission.id, mission.title, mission.archived_at, mission.genre, mission.input_template,
               mission.allow_comments, mission.tags, mission.min_chars, mission.max_chars
        FROM public.writing_missions mission
        WHERE mission.class_id = p_class_id AND mission.is_archived IS TRUE
        ORDER BY mission.archived_at DESC NULLS LAST, mission.id DESC
        LIMIT v_limit OFFSET v_offset
    ), student_count AS (
        SELECT count(*)::INTEGER AS total
        FROM public.students student
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM false
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    ), submission_counts AS (
        SELECT post.mission_id, count(DISTINCT post.student_id)::INTEGER AS submitted
        FROM public.student_posts post
        JOIN page ON page.id = post.mission_id
        WHERE post.class_id = p_class_id AND post.is_submitted IS TRUE
        GROUP BY post.mission_id
    )
    SELECT COALESCE(jsonb_agg(
        to_jsonb(page)
        || jsonb_build_object(
            'totalStudents', student_count.total,
            'submittedCount', COALESCE(submission_counts.submitted, 0)
        )
        ORDER BY page.archived_at DESC NULLS LAST, page.id DESC
    ), '[]'::JSONB)
    INTO v_items
    FROM page
    CROSS JOIN student_count
    LEFT JOIN submission_counts ON submission_counts.mission_id = page.id;

    RETURN jsonb_build_object(
        'items', COALESCE(v_items, '[]'::JSONB),
        'total', COALESCE(v_total, 0),
        'limit', v_limit,
        'offset', v_offset,
        'has_more', v_offset + jsonb_array_length(COALESCE(v_items, '[]'::JSONB)) < COALESCE(v_total, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_archived_missions_page(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_archived_missions_page(UUID, INTEGER, INTEGER) TO authenticated, service_role;
