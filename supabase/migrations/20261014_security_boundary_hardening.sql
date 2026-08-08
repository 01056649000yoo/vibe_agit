BEGIN;

-- 인증 판단은 운영 DB의 실제 연결/승인 상태만 신뢰한다.
-- JWT app_metadata는 오래된 값이 남거나 레거시 함수로 바뀔 수 있으므로 권한 근거로 쓰지 않는다.
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.profiles%ROWTYPE;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.auth_id = auth.uid()
          AND s.is_active IS DISTINCT FROM false
          AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ) THEN
        RETURN 'STUDENT';
    END IF;

    SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
    IF v_profile.role = 'ADMIN' THEN
        RETURN 'ADMIN';
    END IF;
    IF v_profile.role = 'TEACHER'
       AND v_profile.is_approved IS TRUE
       AND v_profile.approval_revoked_at IS NULL THEN
        RETURN 'TEACHER';
    END IF;
    RETURN '';
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_user_class_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT s.class_id
    FROM public.students s
    WHERE s.auth_id = auth.uid()
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.auth_student_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT s.id
    FROM public.students s
    WHERE s.auth_id = auth.uid()
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    LIMIT 1
$$;

-- role·승인 상태는 가입 RPC와 관리자 RPC만 바꿀 수 있다.
CREATE OR REPLACE FUNCTION public.guard_profile_authority_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_bypass BOOLEAN := false;
BEGIN
    BEGIN
        v_bypass := current_setting('app.bypass_profile_protection', true) = 'true';
    EXCEPTION WHEN OTHERS THEN
        v_bypass := false;
    END;

    IF v_bypass OR auth.role() = 'service_role' OR public.auth_user_role() = 'ADMIN' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_approved IS DISTINCT FROM OLD.is_approved
       OR NEW.approval_revoked_at IS DISTINCT FROM OLD.approval_revoked_at THEN
        RAISE EXCEPTION '역할과 승인 상태는 지정된 가입·관리자 기능으로만 변경할 수 있습니다.'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_authority_fields ON public.profiles;
CREATE TRIGGER trg_guard_profile_authority_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_authority_fields();

DROP POLICY IF EXISTS "Profiles_Insert_V18" ON public.profiles;
DROP POLICY IF EXISTS "Profiles_Insert_Secure_V20" ON public.profiles;
CREATE POLICY "Profiles_Insert_Secure_V20" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "Teachers_Insert_V18" ON public.teachers;
DROP POLICY IF EXISTS "Teachers_Insert_Secure_V20" ON public.teachers;
CREATE POLICY "Teachers_Insert_Secure_V20" ON public.teachers
FOR INSERT TO authenticated
WITH CHECK (
    id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('TEACHER', 'ADMIN')
    )
);

-- 학생 목록은 같은 반 또는 담당 학급으로만 읽고, 학생 행의 직접 수정은 교사/관리자만 허용한다.
DROP POLICY IF EXISTS "Student_Select_V18" ON public.students;
DROP POLICY IF EXISTS "Student_Select_Secure_V20" ON public.students;
CREATE POLICY "Student_Select_Secure_V20" ON public.students
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR (public.auth_user_role() = 'TEACHER' AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = students.class_id AND c.teacher_id = auth.uid()
    ))
    OR (public.auth_user_role() = 'STUDENT' AND students.class_id = public.auth_user_class_id())
);

DROP POLICY IF EXISTS "Student_Insert_V18" ON public.students;
DROP POLICY IF EXISTS "Student_Insert_Secure_V20" ON public.students;
CREATE POLICY "Student_Insert_Secure_V20" ON public.students
FOR INSERT TO authenticated
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR (public.auth_user_role() = 'TEACHER' AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = students.class_id AND c.teacher_id = auth.uid()
    ))
);

DROP POLICY IF EXISTS "Student_Update_V18" ON public.students;
DROP POLICY IF EXISTS "Student_Update_Secure_V20" ON public.students;
CREATE POLICY "Student_Update_Secure_V20" ON public.students
FOR UPDATE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR (public.auth_user_role() = 'TEACHER' AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = students.class_id AND c.teacher_id = auth.uid()
    ))
)
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR (public.auth_user_role() = 'TEACHER' AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = students.class_id AND c.teacher_id = auth.uid()
    ))
);

DROP POLICY IF EXISTS "Student_Delete_V18" ON public.students;
DROP POLICY IF EXISTS "Student_Delete_Secure_V20" ON public.students;
CREATE POLICY "Student_Delete_Secure_V20" ON public.students
FOR DELETE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR (public.auth_user_role() = 'TEACHER' AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = students.class_id AND c.teacher_id = auth.uid()
    ))
);

-- 승인 대기 화면도 자기 프로필은 읽을 수 있어야 하므로 bootstrap은 프로필 자체를 확인한다.
CREATE OR REPLACE FUNCTION public.get_teacher_app_bootstrap_v1(p_touch_login BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile_row public.profiles%ROWTYPE;
    v_profile JSONB;
    v_teacher JSONB;
    v_classes JSONB := '[]'::JSONB;
    v_announcements JSONB := '[]'::JSONB;
    v_can_operate BOOLEAN := false;
BEGIN
    SELECT * INTO v_profile_row FROM public.profiles WHERE id = v_user_id;
    IF v_user_id IS NULL OR v_profile_row.role NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION 'teacher authentication required' USING ERRCODE = '42501';
    END IF;
    v_can_operate := v_profile_row.role = 'ADMIN'
        OR (v_profile_row.is_approved IS TRUE AND v_profile_row.approval_revoked_at IS NULL);

    IF p_touch_login THEN
        UPDATE public.profiles SET last_login_at = NOW() WHERE id = v_user_id;
        SELECT * INTO v_profile_row FROM public.profiles WHERE id = v_user_id;
    END IF;

    v_profile := jsonb_build_object(
        'id', v_profile_row.id, 'role', v_profile_row.role,
        'full_name', v_profile_row.full_name, 'is_approved', v_profile_row.is_approved,
        'primary_class_id', v_profile_row.primary_class_id, 'api_mode', v_profile_row.api_mode,
        'created_at', v_profile_row.created_at, 'last_login_at', v_profile_row.last_login_at,
        'ai_prompt_template', v_profile_row.ai_prompt_template,
        'frequent_tags', COALESCE(v_profile_row.frequent_tags, '[]'::jsonb),
        'default_rubric', v_profile_row.default_rubric,
        'mission_default_settings', v_profile_row.mission_default_settings
    );
    SELECT jsonb_build_object('name', t.name, 'school_name', t.school_name, 'phone', t.phone)
    INTO v_teacher FROM public.teachers t WHERE t.id = v_user_id;

    IF v_can_operate THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
        INTO v_classes FROM (
            SELECT id, name, created_at, teacher_id FROM public.classes
            WHERE teacher_id = v_user_id AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 100
        ) c;
        SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
        INTO v_announcements FROM (
            SELECT id, title, content, created_at, target_role FROM public.announcements
            WHERE target_role IN ('TEACHER', 'ALL') ORDER BY created_at DESC LIMIT 50
        ) a;
    END IF;

    RETURN jsonb_build_object(
        'version', 1, 'profile', COALESCE(v_profile, '{}'::jsonb),
        'teacher', COALESCE(v_teacher, '{}'::jsonb), 'classes', v_classes,
        'announcements', v_announcements
    );
END;
$$;

-- 피드백은 승인 교사만, 검증·속도 제한을 거친 RPC 한 곳으로 접수한다.
DROP POLICY IF EXISTS "Feedback_Reports_Insert_V18" ON public.feedback_reports;
DROP POLICY IF EXISTS "Feedback_Reports_Insert_Secure_V20" ON public.feedback_reports;
CREATE POLICY "Feedback_Reports_Insert_Secure_V20" ON public.feedback_reports
FOR INSERT TO authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.submit_teacher_feedback_v1(p_title TEXT, p_content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_title TEXT := btrim(COALESCE(p_title, ''));
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_feedback_id UUID;
BEGIN
    IF public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '승인된 교사만 의견을 보낼 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF char_length(v_title) NOT BETWEEN 2 AND 120 THEN
        RAISE EXCEPTION '제목은 2~120자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_content) NOT BETWEEN 5 AND 5000 THEN
        RAISE EXCEPTION '내용은 5~5000자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM public.feedback_reports
        WHERE teacher_id = v_user_id AND created_at > NOW() - INTERVAL '1 hour') >= 3 THEN
        RAISE EXCEPTION '의견은 한 시간에 3번까지 보낼 수 있습니다.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.feedback_reports(teacher_id, title, content, status)
    VALUES(v_user_id, v_title, v_content, 'open') RETURNING id INTO v_feedback_id;
    RETURN jsonb_build_object('version', 1, 'feedback_id', v_feedback_id);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_teacher_feedback_v1(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_teacher_feedback_v1(TEXT, TEXT) TO authenticated, service_role;

-- AI 호출 속도 제한과 댓글 판정 선점은 DB 트랜잭션으로 원자적으로 처리한다.
CREATE TABLE IF NOT EXISTS public.ai_request_events (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    actor_id UUID NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('teacher_ai', 'comment_safety')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.ai_request_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_ai_request_events_actor_scope_created
    ON public.ai_request_events(actor_id, scope, created_at DESC);

ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS ai_review_token UUID;

CREATE OR REPLACE FUNCTION public.consume_ai_request_v1(p_actor_id UUID, p_scope TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER;
    v_count INTEGER;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF p_actor_id IS NULL OR p_scope NOT IN ('teacher_ai', 'comment_safety') THEN
        RAISE EXCEPTION 'invalid AI request scope' USING ERRCODE = '22023';
    END IF;
    v_limit := CASE WHEN p_scope = 'comment_safety' THEN 12 ELSE 20 END;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_id::TEXT || ':' || p_scope, 0));
    SELECT count(*) INTO v_count FROM public.ai_request_events
    WHERE actor_id = p_actor_id AND scope = p_scope AND created_at > NOW() - INTERVAL '1 minute';
    IF v_count >= v_limit THEN
        RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', 60);
    END IF;
    INSERT INTO public.ai_request_events(actor_id, scope) VALUES(p_actor_id, p_scope);
    RETURN jsonb_build_object('allowed', true, 'remaining', v_limit - v_count - 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_comment_ai_review_v1(p_comment_id UUID, p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_comment public.post_comments%ROWTYPE;
    v_rate JSONB;
    v_token UUID := gen_random_uuid();
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_comment FROM public.post_comments
    WHERE id = p_comment_id AND student_id = p_student_id FOR UPDATE;
    IF v_comment.id IS NULL THEN
        RAISE EXCEPTION '판정할 댓글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF v_comment.status <> 'pending' THEN
        RETURN jsonb_build_object(
            'claimed', false, 'status', v_comment.status,
            'moderation_reason', v_comment.moderation_reason
        );
    END IF;
    IF v_comment.ai_review_token IS NOT NULL
       AND v_comment.moderated_at > NOW() - INTERVAL '2 minutes' THEN
        RETURN jsonb_build_object('claimed', false, 'status', 'pending');
    END IF;
    v_rate := public.consume_ai_request_v1(p_student_id, 'comment_safety');
    IF COALESCE((v_rate->>'allowed')::BOOLEAN, false) IS NOT TRUE THEN
        RETURN v_rate || jsonb_build_object('claimed', false, 'status', 'rate_limited');
    END IF;
    UPDATE public.post_comments
    SET ai_review_token = v_token, moderated_by = 'ai_processing', moderated_at = NOW()
    WHERE id = v_comment.id;
    RETURN jsonb_build_object(
        'claimed', true, 'status', 'pending', 'comment_id', v_comment.id,
        'content', v_comment.content, 'review_token', v_token
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_request_v1(UUID, TEXT),
    public.claim_comment_ai_review_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_request_v1(UUID, TEXT),
    public.claim_comment_ai_review_v1(UUID, UUID) TO service_role;

REVOKE ALL ON TABLE public.ai_request_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.ai_request_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_request_events_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.auth_user_role(), public.auth_user_class_id(), public.auth_student_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_role(), public.auth_user_class_id(), public.auth_student_id()
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
