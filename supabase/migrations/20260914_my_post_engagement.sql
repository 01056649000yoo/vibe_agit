-- 학생이 자기 글 한 편에서 보는 세 가지를 유형과 무관하게 한 번에 준다.
--   ① 제출·확인 상태  ② 교사 의견  ③ 친구 댓글
--
-- 지금까지 이 셋이 유형마다 다른 자리에 있었다.
--   * 과제  — 상태는 `student_posts.is_confirmed`/`approved_at`, 교사 의견은 `student_posts.ai_feedback`
--   * 자율 글(독서록·일기) — 상태·의견 모두 `reading_log_teacher_reviews`
-- 그래서 화면이 저장소를 직접 알아야 했고, 새 유형이 생길 때마다 화면 세 곳을 다시 고쳐야 했다.
-- 실제로 독서록·일기는 **본인 글에서 친구 댓글을 볼 길이 아예 없었다**(댓글은 달리고 알림도 갔는데 볼 화면이 없었다).
--
-- 저장소는 옮기지 않는다. 과제 댓글 8,000여 건과 기존 피드백이 걸려 있어 이사 위험이 크다.
-- 대신 **읽는 시점에 서버가 흡수**한다. 화면은 어느 표에서 왔는지 몰라도 된다.
-- 나중에 저장소를 합치더라도 이 함수만 고치면 화면은 그대로다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_post_engagement(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_post public.student_posts%ROWTYPE;
    v_type_label TEXT;
    v_teacher JSONB;
    v_status TEXT;
    v_status_label TEXT;
    v_result JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    -- 본인 글만. 남의 글은 친구 아지트의 공개 글 경로로 본다.
    SELECT * INTO v_post
    FROM public.student_posts p
    WHERE p.id = p_post_id
      AND p.student_id = v_student_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '내 글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(wt.label, '선생님 과제')
    INTO v_type_label
    FROM (SELECT 1) one
    LEFT JOIN public.writing_types wt ON wt.id = v_post.self_writing_type;

    -- 교사 의견·확인은 유형에 따라 사는 곳이 다르다. 그 차이를 여기서 흡수한다.
    IF v_post.writing_context = 'self' THEN
        SELECT jsonb_build_object(
            'has_comment', NULLIF(BTRIM(COALESCE(review.teacher_comment, '')), '') IS NOT NULL,
            'comment', NULLIF(BTRIM(COALESCE(review.teacher_comment, '')), ''),
            'checked', review.post_id IS NOT NULL,
            'checked_at', review.reviewed_at
        )
        INTO v_teacher
        FROM public.reading_log_teacher_reviews review
        WHERE review.post_id = v_post.id
          AND review.class_id = v_post.class_id;

        v_teacher := COALESCE(v_teacher, jsonb_build_object(
            'has_comment', false, 'comment', NULL, 'checked', false, 'checked_at', NULL
        ));

        v_status := CASE
            WHEN NOT COALESCE(v_post.is_submitted, false) THEN 'draft'
            WHEN (v_teacher ->> 'checked')::BOOLEAN THEN 'reviewed'
            ELSE 'submitted'
        END;
        v_status_label := CASE v_status
            WHEN 'draft' THEN '아직 완료하지 않았어요'
            WHEN 'reviewed' THEN '선생님이 확인했어요'
            ELSE '작성 완료했어요'
        END;
    ELSE
        v_teacher := jsonb_build_object(
            'has_comment', NULLIF(BTRIM(COALESCE(v_post.ai_feedback, '')), '') IS NOT NULL,
            'comment', NULLIF(BTRIM(COALESCE(v_post.ai_feedback, '')), ''),
            'checked', COALESCE(v_post.is_confirmed, false),
            'checked_at', v_post.approved_at
        );

        v_status := CASE
            WHEN COALESCE(v_post.is_confirmed, false) THEN 'approved'
            WHEN COALESCE(v_post.is_returned, false) THEN 'returned'
            WHEN COALESCE(v_post.is_submitted, false) THEN 'submitted'
            ELSE 'draft'
        END;
        v_status_label := CASE v_status
            WHEN 'approved' THEN '선생님이 승인했어요'
            WHEN 'returned' THEN '다시 쓰기를 받았어요'
            WHEN 'submitted' THEN '냈어요. 선생님 확인을 기다려요'
            ELSE '아직 내지 않았어요'
        END;
    END IF;

    SELECT jsonb_build_object(
        'post_id', v_post.id,
        'writing_context', v_post.writing_context,
        'self_writing_type', v_post.self_writing_type,
        'type_label', CASE WHEN v_post.writing_context = 'self' THEN v_type_label ELSE '선생님 과제' END,
        'visibility', v_post.visibility,
        'submission', jsonb_build_object(
            'is_submitted', COALESCE(v_post.is_submitted, false),
            'submitted_at', v_post.first_submitted_at,
            'status', v_status,
            'status_label', v_status_label
        ),
        'teacher', v_teacher,
        'comments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id,
                'content', c.content,
                'created_at', c.created_at,
                'is_teacher', c.teacher_id IS NOT NULL AND c.student_id IS NULL,
                'author_name', CASE
                    WHEN c.teacher_id IS NOT NULL AND c.student_id IS NULL THEN '선생님'
                    ELSE COALESCE(writer.name, '알 수 없는 친구')
                END
            ) ORDER BY c.created_at)
            FROM public.post_comments c
            LEFT JOIN public.students writer
              ON writer.id = c.student_id AND writer.class_id = c.class_id
            WHERE c.post_id = v_post.id
              AND c.class_id = v_post.class_id
              -- 선생님 댓글은 늘 보이고, 학생 댓글은 승인된 것만 보인다(친구 아지트와 같은 규칙).
              AND ((c.teacher_id IS NOT NULL AND c.student_id IS NULL) OR c.status = 'approved')
              AND (writer.id IS NULL OR writer.deleted_at IS NULL)
        ), '[]'::JSONB),
        'reaction_count', (
            SELECT count(*)::INTEGER FROM public.post_reactions r
            WHERE r.post_id = v_post.id AND r.class_id = v_post.class_id
        )
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_post_engagement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_post_engagement(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_post_engagement(UUID) IS
    '학생 본인 글의 제출·확인 상태, 교사 의견, 친구 댓글을 글 유형과 무관하게 한 번에 준다.';

NOTIFY pgrst, 'reload schema';

COMMIT;
