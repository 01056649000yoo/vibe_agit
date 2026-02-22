-- ============================================================================
-- 🚀 [긴급 보안 패치 보완] 학생간 게시글 참조(읽기) 권한 복구
-- 작성일: 2026-02-25
--
-- 문제:
--   20260224_fix_mission_visibility_final.sql에서 student_posts_final_v1 정책을
--   FOR ALL로 설정하면서 학생 본인만 자신의 글을 볼 수 있게 됨.
--   이로 인해 '우리반 아지트'에서 다른 친구들의 글을 읽거나 랭킹 통계에 집계되는
--   기능(같은 class_id 내 SELECT)이 차단되어 글자수나 활동내역이 0으로 노출됨.
--
-- 해결:
--   SELECT 권한에 한해서 같은 반(class_id) 친구들의 제출된 글을 읽을 수 있도록 허용.
--   INSERT, UPDATE, DELETE는 여전히 본인(혹은 교사)만 가능함.
-- ============================================================================

DROP POLICY IF EXISTS "student_posts_final_v1" ON public.student_posts;

-- 1. 모든 작업(INSERT, UPDATE, DELETE)에 대한 기본 권한 (본인 및 교사, 관리자)
CREATE POLICY "student_posts_all_v2" ON public.student_posts
FOR ALL USING (
    public.is_admin()
    -- 학생 본인
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL)
    -- 담당 교사 (미션 소유자 또는 학급 담당자)
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id 
          AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- 2. "읽기(SELECT)" 전용 정책: 같은 반 친구의 글 읽기 허용
-- (아지트 온 클래스 등에서 조회 목적)
CREATE POLICY "student_posts_class_read_v2" ON public.student_posts
FOR SELECT USING (
    -- 본인이 '우리 반'의 학생이며, 다른 학생(student_id)도 '우리 반'인 경우에 읽기 허용
    EXISTS (
        SELECT 1 FROM public.students my_s
        JOIN public.students peer_s ON peer_s.class_id = my_s.class_id
        WHERE my_s.auth_id = auth.uid() 
          AND peer_s.id = public.student_posts.student_id
          AND my_s.deleted_at IS NULL
          AND peer_s.deleted_at IS NULL
    )
);

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
