-- ==========================================================================
-- 친구 공개 책장: 공개 취소 뒤 댓글 직접 조회 차단
--
-- 기존 V19는 댓글 작성자가 자신의 댓글을 부모 글 공개 여부와 관계없이
-- 직접 조회할 수 있었다. 공개 글에서만 본인 대기 댓글을 볼 수 있게 하고,
-- 글 작성자는 공개를 취소해도 이미 승인된 댓글을 자기 글 기록으로 본다.
-- ==========================================================================

BEGIN;

DROP POLICY IF EXISTS "Comment_Select_V19" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_V20" ON public.post_comments;

CREATE POLICY "Comment_Select_V20" ON public.post_comments
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = post_comments.class_id
          AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1
        FROM public.student_posts p
        WHERE p.id = post_comments.post_id
          AND p.class_id = post_comments.class_id
          AND (
              (
                  p.student_id = public.auth_student_id()
                  AND post_comments.status = 'approved'
              )
              OR (
                  p.class_id = public.auth_user_class_id()
                  AND p.is_submitted = true
                  AND p.visibility = 'class'
                  AND (
                      post_comments.status = 'approved'
                      OR post_comments.student_id = public.auth_student_id()
                  )
              )
          )
    )
);

COMMIT;
