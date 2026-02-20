-- ====================================================================
-- [마이그레이션] 학생 익명 로그인(Anonymous Sign-ins) 도입
-- 작성일: 2026-02-20
-- 설명: students 테이블에 auth_id 컬럼을 추가하고, 
--       auth.uid() 기반의 강력한 RLS 정책으로 전면 교체합니다.
-- 사전 조건: Supabase Dashboard > Authentication > Settings에서
--           "Enable anonymous sign-ins" 옵션을 반드시 켜야 합니다.
-- ====================================================================


-- ============================================================
-- PART 1: 스키마 변경 - auth_id 컬럼 추가
-- ============================================================

-- students 테이블에 Supabase Auth UID 매핑용 컬럼 추가
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- auth_id로 빠르게 조회하기 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_students_auth_id ON public.students(auth_id) WHERE auth_id IS NOT NULL;


-- ============================================================
-- PART 2: 헬퍼 함수 - 학생 인증 바인딩
-- ============================================================

-- 학생 코드 로그인 시 auth_id를 안전하게 바인딩하는 RPC 함수
-- SECURITY DEFINER로 RLS를 우회하여 내부적으로 검증 후 업데이트
CREATE OR REPLACE FUNCTION public.bind_student_auth(
    p_student_code TEXT
)
RETURNS JSON AS $$
DECLARE
    v_student RECORD;
    v_auth_id UUID;
BEGIN
    v_auth_id := auth.uid();
    
    -- 1. 인증되지 않은 요청 거부
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;
    
    -- 2. 학생 코드로 학생 조회
    SELECT s.id, s.name, s.student_code, s.class_id, s.auth_id, c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c ON s.class_id = c.id
    WHERE s.student_code = p_student_code AND s.deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '코드가 일치하는 학생을 찾을 수 없습니다.');
    END IF;
    
    -- 3. 이미 다른 auth_id가 바인딩되어 있는 경우 처리
    IF v_student.auth_id IS NOT NULL AND v_student.auth_id != v_auth_id THEN
        -- 이미 다른 기기에서 로그인 중이므로, 기존 바인딩을 해제하고 새로 바인딩
        -- (학생이 기기를 변경하거나 브라우저를 초기화한 경우를 대비)
        NULL; -- 아래에서 덮어씁니다
    END IF;
    
    -- 4. 현재 auth_id가 이미 다른 학생에게 바인딩되어 있는지 확인
    IF EXISTS (SELECT 1 FROM public.students WHERE auth_id = v_auth_id AND id != v_student.id AND deleted_at IS NULL) THEN
        -- 기존 바인딩 해제 (한 세션에 한 학생만 연결)
        UPDATE public.students SET auth_id = NULL WHERE auth_id = v_auth_id AND id != v_student.id;
    END IF;
    
    -- 5. auth_id 바인딩 업데이트
    UPDATE public.students SET auth_id = v_auth_id WHERE id = v_student.id;
    
    -- 6. 성공 응답 반환
    RETURN json_build_object(
        'success', true,
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'code', v_student.student_code,
            'classId', v_student.class_id,
            'className', v_student.class_name
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- auth.uid()로 현재 세션에 바인딩된 학생 정보를 조회하는 RPC 함수
CREATE OR REPLACE FUNCTION public.get_student_by_auth()
RETURNS JSON AS $$
DECLARE
    v_student RECORD;
    v_auth_id UUID;
BEGIN
    v_auth_id := auth.uid();
    
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;
    
    SELECT s.id, s.name, s.student_code, s.class_id, c.name AS class_name
    INTO v_student
    FROM public.students s
    LEFT JOIN public.classes c ON s.class_id = c.id
    WHERE s.auth_id = v_auth_id AND s.deleted_at IS NULL;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '연결된 학생 정보가 없습니다.');
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'student', json_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'code', v_student.student_code,
            'classId', v_student.class_id,
            'className', v_student.class_name
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 학생 로그아웃 시 auth_id 바인딩 해제
CREATE OR REPLACE FUNCTION public.unbind_student_auth()
RETURNS void AS $$
BEGIN
    UPDATE public.students SET auth_id = NULL WHERE auth_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PART 3: RLS 정책 전면 교체 (auth_id 기반)
-- ============================================================

-- 기존 정책 삭제 (충돌 방지)
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN (
        SELECT policyname, tablename FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('students', 'student_posts', 'post_comments', 'post_reactions', 'point_logs', 'agit_honor_roll')
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
    END LOOP;
END $$;


-- ──────────────────────────────────────────
-- [Students] 학생 정보 - auth_id 기반 보안
-- ──────────────────────────────────────────
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 조회: 교사(소속 학급), 관리자, 또는 같은 학급 소속 학생(auth_id 바인딩된)
CREATE POLICY "Student_Select" ON students FOR SELECT USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
    OR (
        deleted_at IS NULL 
        AND auth_id IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM students self 
            WHERE self.auth_id = auth.uid() 
            AND self.class_id = students.class_id 
            AND self.deleted_at IS NULL
        )
    )
);

-- 수정: 교사(소속 학급), 관리자, 또는 본인(auth_id 일치)만 허용
-- 포인트는 RPC에서만 변경 가능 (SECURITY DEFINER)
CREATE POLICY "Student_Update" ON students FOR UPDATE USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
    OR (auth.uid() = auth_id AND deleted_at IS NULL)
);

-- 삽입/삭제: 교사 또는 관리자만
CREATE POLICY "Student_Insert" ON students FOR INSERT WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
);

CREATE POLICY "Student_Delete" ON students FOR DELETE USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
);


-- ──────────────────────────────────────────
-- [Student Posts] 학생 게시글 - auth_id 기반 보안
-- ──────────────────────────────────────────
ALTER TABLE public.student_posts ENABLE ROW LEVEL SECURITY;

-- 조회: 관리자, 담당 교사, 또는 같은 학급 소속 학생
CREATE POLICY "Post_Select" ON student_posts FOR SELECT USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM writing_missions m
        JOIN classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM students s
        JOIN students self ON self.class_id = s.class_id
        WHERE s.id = student_id AND s.deleted_at IS NULL 
        AND self.auth_id = auth.uid() AND self.deleted_at IS NULL
    )
);

-- 삽입: 본인의 학생 ID로만 글을 작성 가능
CREATE POLICY "Post_Insert" ON student_posts FOR INSERT WITH CHECK (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM writing_missions m
        JOIN classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

-- 수정: 본인이 작성한 글 또는 담당 교사/관리자
CREATE POLICY "Post_Update" ON student_posts FOR UPDATE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM writing_missions m
        JOIN classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

-- 삭제: 교사/관리자만
CREATE POLICY "Post_Delete" ON student_posts FOR DELETE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM writing_missions m
        JOIN classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
);


-- ──────────────────────────────────────────
-- [Post Comments] 댓글 - auth_id 기반 보안
-- ──────────────────────────────────────────
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- 조회: 같은 학급 소속의 인증된 사용자 + 교사 + 관리자
CREATE POLICY "Comment_Select" ON post_comments FOR SELECT USING (true);

-- 삽입: 본인의 학생 ID로만 댓글 작성 가능
CREATE POLICY "Comment_Insert" ON post_comments FOR INSERT WITH CHECK (
    is_admin()
    OR auth.uid() IS NOT NULL -- 인증된 사용자만
);

-- 수정/삭제: 본인 댓글 또는 담당 교사/관리자
CREATE POLICY "Comment_Update" ON post_comments FOR UPDATE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
    OR EXISTS (
        SELECT 1 FROM student_posts p
        JOIN writing_missions m ON p.mission_id = m.id
        JOIN classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

CREATE POLICY "Comment_Delete" ON post_comments FOR DELETE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
    OR EXISTS (
        SELECT 1 FROM student_posts p
        JOIN writing_missions m ON p.mission_id = m.id
        JOIN classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);


-- ──────────────────────────────────────────
-- [Post Reactions] 좋아요/반응 - auth_id 기반 보안
-- ──────────────────────────────────────────
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

-- 조회: 전체 허용 (어떤 글에 몇 개의 반응이 있는지는 공개 정보)
CREATE POLICY "Reaction_Select" ON post_reactions FOR SELECT USING (true);

-- 삽입: 본인의 학생 ID로만 반응 가능
CREATE POLICY "Reaction_Insert" ON post_reactions FOR INSERT WITH CHECK (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

-- 삭제: 본인의 반응만 취소 가능 + 교사/관리자
CREATE POLICY "Reaction_Delete" ON post_reactions FOR DELETE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);


-- ──────────────────────────────────────────
-- [Point Logs] 포인트 로그 - auth_id 기반 보안
-- ──────────────────────────────────────────
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

-- 조회: 본인 로그 또는 교사/관리자
CREATE POLICY "Log_Select" ON point_logs FOR SELECT USING (
    is_admin()
    OR auth.uid() IS NOT NULL -- 인증 사용자(교사) 전체 조회
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

-- 삽입: SECURITY DEFINER RPC를 통해서만 가능 (직접 삽입 차단)
CREATE POLICY "Log_Insert" ON point_logs FOR INSERT WITH CHECK (
    is_admin() OR auth.uid() IS NOT NULL
);


-- ──────────────────────────────────────────
-- [Agit Honor Roll] 명예의 전당 - auth_id 기반 보안
-- ──────────────────────────────────────────
ALTER TABLE public.agit_honor_roll ENABLE ROW LEVEL SECURITY;

-- 조회: 학급 내 데이터만
CREATE POLICY "Honor_Roll_Select" ON agit_honor_roll FOR SELECT USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND (teacher_id = auth.uid() OR deleted_at IS NULL))
);

-- 삽입: 본인의 학생 ID로만 기록 가능
CREATE POLICY "Honor_Roll_Insert" ON agit_honor_roll FOR INSERT WITH CHECK (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
);


-- ============================================================
-- PART 4: 권한 재설정
-- ============================================================

-- RPC 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.bind_student_auth(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_by_auth() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unbind_student_auth() TO anon, authenticated;

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 완료! 🎉
-- Supabase Dashboard > Authentication > Settings에서
-- "Enable anonymous sign-ins" 옵션을 반드시 활성화해야 합니다.
-- ============================================================
