-- 학급 운영 메뉴에도 "처리할 댓글 있음" 배지 (2026-09-18)
--
-- 왜: 독서록·일기는 미확인 글이 있으면 메뉴에 NEW 가 뜨는데, 학생 댓글은 아무 표시가 없어
-- 교사가 [학급 운영 > 학생 댓글] 을 직접 열어 보기 전에는 막힌 댓글이 있는지 알 수 없었다.
-- 아이는 댓글을 남겼는데 친구에게 안 보이는 상태가 그대로 방치된다.
--
-- 세는 기준은 화면과 **같아야 한다**. `get_teacher_class_comments` 의 `todo`(blocked+pending)와
-- 같은 조인·같은 상태를 쓴다. 숫자가 갈리면 배지를 눌러 들어갔는데 아무것도 없는 일이 생긴다.
-- `tests/teacherCommentBadge.test.mjs` 가 두 곳의 기준이 같은지 본다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_comment_todo_badge_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- 배지는 메뉴를 그릴 때마다 불리므로, 권한이 없으면 오류 대신 0 을 준다(메뉴가 깨지지 않게).
    IF auth.uid() IS NULL
       OR NOT (public.auth_user_role() = 'ADMIN'
               OR EXISTS (SELECT 1 FROM public.classes c
                          WHERE c.id = p_class_id AND c.teacher_id = auth.uid())) THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT count(*)::INTEGER INTO v_count
    FROM public.post_comments c
    JOIN public.students writer
      ON writer.id = c.student_id AND writer.class_id = c.class_id
    JOIN public.student_posts p
      ON p.id = c.post_id AND p.class_id = c.class_id
    WHERE c.class_id = p_class_id
      AND c.status IN ('blocked', 'pending');

    RETURN jsonb_build_object('count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_comment_todo_badge_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_comment_todo_badge_v1(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
