-- ============================================================
-- RLS V19: 교사 접근 권한 복구
-- V18 정책에서 누락된 교사(teacher) 접근 조건 추가
-- 영향 테이블: students, student_posts, post_comments, point_logs
-- ============================================================

-- 1. students 테이블
-- V18 정책: ADMIN OR class_id = auth_user_class_id() (교사 접근 불가!)
-- V19 정책: ADMIN OR 교사(클래스 소유자) OR 학생(JWT class_id 매칭)
DROP POLICY IF EXISTS "Student_Select_V18" ON public.students;
DROP POLICY IF EXISTS "Student_Select_V19" ON public.students;

CREATE POLICY "Student_Select_V19" ON public.students FOR SELECT TO authenticated
USING (
    (public.auth_user_role() = 'ADMIN')
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (class_id = public.auth_user_class_id() AND auth_id IS NOT NULL)
);

-- 2. student_posts 테이블
DROP POLICY IF EXISTS "Post_Select_V18" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Select_V19" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Insert_V18" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Insert_V19" ON public.student_posts;

CREATE POLICY "Post_Select_V19" ON public.student_posts FOR SELECT TO authenticated
USING (
    (public.auth_user_role() = 'ADMIN')
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (class_id = public.auth_user_class_id())
);

CREATE POLICY "Post_Insert_V19" ON public.student_posts FOR INSERT TO authenticated
WITH CHECK (
    (public.auth_user_role() = 'ADMIN')
    OR (class_id = public.auth_user_class_id())
);

-- 3. student_posts UPDATE: 교사 승인/다시쓰기 요청 허용
DROP POLICY IF EXISTS "Post_Update_V18" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Update_V19" ON public.student_posts;

CREATE POLICY "Post_Update_V19" ON public.student_posts FOR UPDATE TO authenticated
USING (
    (public.auth_user_role() = 'ADMIN')
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (student_id = public.auth_student_id())
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN')
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (student_id = public.auth_student_id())
);

-- 4. post_comments 테이블
DROP POLICY IF EXISTS "Comment_Select_V18" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_V19" ON public.post_comments;

CREATE POLICY "Comment_Select_V19" ON public.post_comments FOR SELECT TO authenticated
USING (
    (public.auth_user_role() = 'ADMIN')
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (class_id = public.auth_user_class_id())
);

-- 4. point_logs 테이블
DROP POLICY IF EXISTS "Point_Logs_Select_V18" ON public.point_logs;
DROP POLICY IF EXISTS "Point_Logs_Select_V19" ON public.point_logs;
DROP POLICY IF EXISTS "Point_Logs_Insert_V18" ON public.point_logs;
DROP POLICY IF EXISTS "Point_Logs_Insert_V19" ON public.point_logs;

CREATE POLICY "Point_Logs_Select_V19" ON public.point_logs FOR SELECT TO authenticated
USING (
    (public.auth_user_role() = 'ADMIN')
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (class_id = public.auth_user_class_id())
);

CREATE POLICY "Point_Logs_Insert_V19" ON public.point_logs FOR INSERT TO authenticated
WITH CHECK (
    (public.auth_user_role() = 'ADMIN')
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (class_id = public.auth_user_class_id())
);
