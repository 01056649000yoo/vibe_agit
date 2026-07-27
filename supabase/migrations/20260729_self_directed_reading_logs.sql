-- ==========================================================================
-- 학생 자율 독서록 기반 + 글/댓글/반응 소유권 보강
--
-- 기존 과제 글(student_posts)을 그대로 보존하면서 mission_id가 없는 자율 글을
-- 같은 글쓰기 저장소에 수용한다. 자율 글의 첫 유형은 reading_log 하나뿐이다.
-- ==========================================================================

BEGIN;

ALTER TABLE public.student_posts
    ADD COLUMN IF NOT EXISTS writing_context TEXT NOT NULL DEFAULT 'assignment',
    ADD COLUMN IF NOT EXISTS self_writing_type TEXT,
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'class',
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS show_original BOOLEAN NOT NULL DEFAULT false;

UPDATE public.student_posts
SET writing_context = 'assignment',
    self_writing_type = NULL,
    visibility = 'class',
    published_at = COALESCE(first_submitted_at, created_at)
WHERE mission_id IS NOT NULL;

ALTER TABLE public.student_posts
    DROP CONSTRAINT IF EXISTS student_posts_writing_context_check,
    DROP CONSTRAINT IF EXISTS student_posts_self_writing_type_check,
    DROP CONSTRAINT IF EXISTS student_posts_visibility_check,
    DROP CONSTRAINT IF EXISTS student_posts_source_shape_check;

ALTER TABLE public.student_posts
    ADD CONSTRAINT student_posts_writing_context_check
        CHECK (writing_context IN ('assignment', 'self')),
    ADD CONSTRAINT student_posts_self_writing_type_check
        CHECK (self_writing_type IS NULL OR self_writing_type IN ('reading_log')),
    ADD CONSTRAINT student_posts_visibility_check
        CHECK (visibility IN ('private', 'class')),
    ADD CONSTRAINT student_posts_source_shape_check
        CHECK (
            (writing_context = 'assignment'
                AND mission_id IS NOT NULL
                AND self_writing_type IS NULL
                AND visibility = 'class')
            OR
            (writing_context = 'self'
                AND mission_id IS NULL
                AND self_writing_type = 'reading_log')
        );

CREATE INDEX IF NOT EXISTS idx_student_posts_self_writing_list
    ON public.student_posts (student_id, self_writing_type, updated_at DESC)
    WHERE writing_context = 'self';

CREATE INDEX IF NOT EXISTS idx_student_posts_public_bookshelf
    ON public.student_posts (class_id, published_at DESC)
    WHERE writing_context = 'self'
      AND visibility = 'class'
      AND is_submitted = true;

-- 작성 학생의 실제 학급을 유일한 기준으로 사용한다. 과제 글은 미션 학급도
-- 함께 검증하고, 자율 글은 mission_id 없이 학생 학급을 자동으로 채운다.
CREATE OR REPLACE FUNCTION public.fn_fill_class_id_for_student_posts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_class_id UUID;
    v_mission_class_id UUID;
BEGIN
    SELECT s.class_id
    INTO v_student_class_id
    FROM public.students s
    WHERE s.id = NEW.student_id
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());

    IF v_student_class_id IS NULL THEN
        RAISE EXCEPTION '활성 학생의 학급 정보를 찾을 수 없습니다.'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.mission_id IS NOT NULL THEN
        SELECT m.class_id
        INTO v_mission_class_id
        FROM public.writing_missions m
        WHERE m.id = NEW.mission_id;

        IF v_mission_class_id IS NULL THEN
            RAISE EXCEPTION '글쓰기 미션을 찾을 수 없습니다.'
                USING ERRCODE = '23503';
        END IF;

        IF v_mission_class_id IS DISTINCT FROM v_student_class_id THEN
            RAISE EXCEPTION '학생과 글쓰기 미션의 학급이 일치하지 않습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    NEW.class_id := v_student_class_id;
    RETURN NEW;
END;
$$;

-- 댓글/반응은 미션이 아니라 글 자체의 class_id를 상속한다. 따라서
-- mission_id가 없는 독서록에도 같은 상호작용 구조를 그대로 쓸 수 있다.
CREATE OR REPLACE FUNCTION public.fn_fill_class_id_from_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    SELECT p.class_id
    INTO NEW.class_id
    FROM public.student_posts p
    WHERE p.id = NEW.post_id;

    IF NEW.class_id IS NULL THEN
        RAISE EXCEPTION '상호작용 대상 글을 찾을 수 없습니다.'
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_student_post_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.class_id IS DISTINCT FROM OLD.class_id
       OR NEW.mission_id IS DISTINCT FROM OLD.mission_id
       OR NEW.writing_context IS DISTINCT FROM OLD.writing_context
       OR NEW.self_writing_type IS DISTINCT FROM OLD.self_writing_type THEN
        RAISE EXCEPTION '글의 작성자, 학급, 출처는 변경할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_student_post_identity ON public.student_posts;
CREATE TRIGGER trg_guard_student_post_identity
BEFORE UPDATE ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.guard_student_post_identity();

CREATE OR REPLACE FUNCTION public.normalize_student_post_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.writing_context = 'assignment' THEN
        NEW.visibility := 'class';
    ELSIF NEW.visibility = 'class' AND NEW.is_submitted = true THEN
        NEW.published_at := COALESCE(NEW.published_at, NOW());
    ELSIF NEW.visibility = 'private' THEN
        NEW.published_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_student_post_visibility ON public.student_posts;
CREATE TRIGGER trg_normalize_student_post_visibility
BEFORE INSERT OR UPDATE OF visibility, is_submitted, writing_context
ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.normalize_student_post_visibility();

CREATE OR REPLACE FUNCTION public.guard_post_interaction_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_TABLE_NAME = 'post_comments' THEN
        IF NEW.post_id IS DISTINCT FROM OLD.post_id
           OR NEW.student_id IS DISTINCT FROM OLD.student_id
           OR NEW.teacher_id IS DISTINCT FROM OLD.teacher_id
           OR NEW.class_id IS DISTINCT FROM OLD.class_id THEN
            RAISE EXCEPTION '댓글의 작성자와 대상 글은 변경할 수 없습니다.'
                USING ERRCODE = '42501';
        END IF;
    ELSIF TG_TABLE_NAME = 'post_reactions' THEN
        IF NEW.post_id IS DISTINCT FROM OLD.post_id
           OR NEW.student_id IS DISTINCT FROM OLD.student_id
           OR NEW.class_id IS DISTINCT FROM OLD.class_id THEN
            RAISE EXCEPTION '반응의 작성자와 대상 글은 변경할 수 없습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_comment_identity ON public.post_comments;
CREATE TRIGGER trg_guard_comment_identity
BEFORE UPDATE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.guard_post_interaction_identity();

DROP TRIGGER IF EXISTS trg_guard_reaction_identity ON public.post_reactions;
CREATE TRIGGER trg_guard_reaction_identity
BEFORE UPDATE ON public.post_reactions
FOR EACH ROW EXECUTE FUNCTION public.guard_post_interaction_identity();

-- SECURITY DEFINER 함수에서 auth.uid()가 NULL이라는 이유만으로 통과시키지 않는다.
-- 서버 작업은 JWT의 service_role 또는 기존 명시적 우회 설정만 허용한다.
CREATE OR REPLACE FUNCTION public.protect_student_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin BOOLEAN := false;
    v_is_teacher BOOLEAN := false;
    v_bypass BOOLEAN := false;
BEGIN
    BEGIN
        v_bypass := current_setting('app.bypass_student_trigger', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        v_bypass := false;
    END;

    IF v_bypass OR auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION '[보안] 인증되지 않은 호출은 학생 정보를 수정할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = v_caller_id AND role = 'ADMIN'
    ) INTO v_is_admin;

    IF v_is_admin THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = OLD.class_id AND teacher_id = v_caller_id
    ) INTO v_is_teacher;

    IF v_is_teacher THEN
        RETURN NEW;
    END IF;

    IF NEW.total_points IS DISTINCT FROM OLD.total_points THEN
        RAISE EXCEPTION '[보안] 포인트(total_points)는 직접 수정할 수 없습니다. 지정된 RPC를 이용하세요.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.auth_id IS DISTINCT FROM OLD.auth_id
       OR NEW.class_id IS DISTINCT FROM OLD.class_id
       OR NEW.student_code IS DISTINCT FROM OLD.student_code THEN
        RAISE EXCEPTION '[보안] 민감한 계정 정보는 직접 수정할 수 없습니다.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- -------------------------------------------------------------------------
-- RLS: 행의 class_id만 맞추는 것으로는 충분하지 않다. 학생 행에는 반드시
-- 현재 인증 학생의 id가 들어가야 하며, 친구는 공개·완료된 글만 볼 수 있다.
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Post_Select_V18" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Insert_V18" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Update_V18" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Delete_V18" ON public.student_posts;

CREATE POLICY "Post_Select_V19" ON public.student_posts
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = student_posts.class_id AND c.teacher_id = auth.uid()
    )
    OR (
        class_id = public.auth_user_class_id()
        AND is_submitted = true
        AND visibility = 'class'
    )
);

CREATE POLICY "Post_Insert_V19" ON public.student_posts
FOR INSERT TO authenticated
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR (
        student_id = public.auth_student_id()
        AND class_id = public.auth_user_class_id()
    )
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = student_posts.class_id AND c.teacher_id = auth.uid()
    )
);

CREATE POLICY "Post_Update_V19" ON public.student_posts
FOR UPDATE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = student_posts.class_id AND c.teacher_id = auth.uid()
    )
)
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = student_posts.class_id AND c.teacher_id = auth.uid()
    )
);

CREATE POLICY "Post_Delete_V19" ON public.student_posts
FOR DELETE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = student_posts.class_id AND c.teacher_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Comment_Select_V18" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Insert_V18" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Update_V18" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Delete_V18" ON public.post_comments;

CREATE POLICY "Comment_Select_V19" ON public.post_comments
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = post_comments.class_id AND c.teacher_id = auth.uid()
    )
    OR (
        status = 'approved'
        AND class_id = public.auth_user_class_id()
        AND EXISTS (
            SELECT 1 FROM public.student_posts p
            WHERE p.id = post_comments.post_id
              AND p.class_id = post_comments.class_id
              AND p.is_submitted = true
              AND p.visibility = 'class'
        )
    )
);

CREATE POLICY "Comment_Insert_V19" ON public.post_comments
FOR INSERT TO authenticated
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR (
        student_id = public.auth_student_id()
        AND teacher_id IS NULL
        AND class_id = public.auth_user_class_id()
        AND EXISTS (
            SELECT 1 FROM public.student_posts p
            WHERE p.id = post_comments.post_id
              AND p.class_id = post_comments.class_id
              AND p.is_submitted = true
              AND p.visibility = 'class'
        )
    )
    OR (
        student_id IS NULL
        AND teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = post_comments.class_id AND c.teacher_id = auth.uid()
        )
    )
);

CREATE POLICY "Comment_Update_V19" ON public.post_comments
FOR UPDATE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = post_comments.class_id AND c.teacher_id = auth.uid()
    )
)
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = post_comments.class_id AND c.teacher_id = auth.uid()
    )
);

CREATE POLICY "Comment_Delete_V19" ON public.post_comments
FOR DELETE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = post_comments.class_id AND c.teacher_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Reaction_Select_V18" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Insert_V18" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Update_V18" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Delete_V18" ON public.post_reactions;

CREATE POLICY "Reaction_Select_V19" ON public.post_reactions
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = post_reactions.class_id AND c.teacher_id = auth.uid()
    )
    OR (
        class_id = public.auth_user_class_id()
        AND EXISTS (
            SELECT 1 FROM public.student_posts p
            WHERE p.id = post_reactions.post_id
              AND p.class_id = post_reactions.class_id
              AND p.is_submitted = true
              AND p.visibility = 'class'
        )
    )
);

CREATE POLICY "Reaction_Insert_V19" ON public.post_reactions
FOR INSERT TO authenticated
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR (
        student_id = public.auth_student_id()
        AND class_id = public.auth_user_class_id()
        AND EXISTS (
            SELECT 1 FROM public.student_posts p
            WHERE p.id = post_reactions.post_id
              AND p.class_id = post_reactions.class_id
              AND p.is_submitted = true
              AND p.visibility = 'class'
        )
    )
);

CREATE POLICY "Reaction_Update_V19" ON public.post_reactions
FOR UPDATE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
)
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
);

CREATE POLICY "Reaction_Delete_V19" ON public.post_reactions
FOR DELETE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = post_reactions.class_id AND c.teacher_id = auth.uid()
    )
);

COMMIT;
