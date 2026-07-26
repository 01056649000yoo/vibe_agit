-- 학생 JWT의 app_metadata에 class_id가 없어도, students.auth_id 매핑으로
-- 같은 학급 학생 정보를 읽을 수 있게 한다.
--
-- 회의 안건 목록은 student_posts -> students inner join을 사용하므로
-- 이 정책이 오래된 app_metadata 전용 조건이면 게시글 자체가 조회 가능해도
-- 작성자 조인에서 탈락한다. post_reactions의 작성자 조인도 같은 영향을 받는다.

DROP POLICY IF EXISTS "Student_Select_V18" ON public.students;

CREATE POLICY "Student_Select_V18" ON public.students
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.teachers
            WHERE id = auth.uid()
        )
        OR class_id = public.auth_user_class_id()
    );

NOTIFY pgrst, 'reload schema';
