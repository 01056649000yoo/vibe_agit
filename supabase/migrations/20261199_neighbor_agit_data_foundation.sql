-- 이웃 아지트 Step 1: 관리자 내부 공개를 기본으로 둔 데이터·권한 기반.
-- 브라우저 역할은 모든 전용 표를 직접 읽고 쓰지 못하며, 후속 단계의 전용 RPC만 사용한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.neighbor_rollout_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    mode TEXT NOT NULL DEFAULT 'internal' CHECK (mode IN ('internal', 'public_beta', 'paused')),
    acceptance_checks JSONB NOT NULL DEFAULT jsonb_build_object(
        'permissions', FALSE,
        'desktop', FALSE,
        'tablet', FALSE,
        'mobile', FALSE,
        'performance', FALSE,
        'operations', FALSE
    ),
    acceptance_checked_at TIMESTAMPTZ,
    acceptance_checked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.neighbor_rollout_state (singleton, mode)
VALUES (TRUE, 'internal')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.neighbor_rollout_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_mode TEXT NOT NULL CHECK (from_mode IN ('internal', 'public_beta', 'paused')),
    to_mode TEXT NOT NULL CHECK (to_mode IN ('internal', 'public_beta', 'paused')),
    checks_snapshot JSONB NOT NULL,
    confirmation_used BOOLEAN NOT NULL DEFAULT FALSE,
    changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (from_mode <> to_mode),
    CHECK (to_mode <> 'public_beta' OR confirmation_used IS TRUE)
);

CREATE INDEX IF NOT EXISTS idx_neighbor_rollout_events_recent
    ON public.neighbor_rollout_events (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.neighbor_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
    public_description TEXT NOT NULL DEFAULT '' CHECK (char_length(public_description) <= 240),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
    UNIQUE (id, host_class_id)
);

CREATE INDEX IF NOT EXISTS idx_neighbor_spaces_host_status
    ON public.neighbor_spaces (host_class_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_neighbor_spaces_status_updated
    ON public.neighbor_spaces (status, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.neighbor_space_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES public.neighbor_spaces(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('host', 'guest')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'left')),
    public_class_name TEXT NOT NULL CHECK (char_length(btrim(public_class_name)) BETWEEN 1 AND 40),
    student_access_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (status <> 'active' OR joined_at IS NOT NULL),
    CHECK (status = 'active' OR student_access_enabled = FALSE),
    CHECK (status <> 'left' OR left_at IS NOT NULL),
    UNIQUE (space_id, class_id),
    UNIQUE (id, space_id, class_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_neighbor_space_classes_one_active_space
    ON public.neighbor_space_classes (class_id)
    WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_neighbor_space_classes_one_active_host
    ON public.neighbor_space_classes (space_id)
    WHERE role = 'host' AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_neighbor_space_classes_space_status
    ON public.neighbor_space_classes (space_id, status, joined_at, class_id);
CREATE INDEX IF NOT EXISTS idx_neighbor_space_classes_class_history
    ON public.neighbor_space_classes (class_id, updated_at DESC, space_id);

CREATE TABLE IF NOT EXISTS public.neighbor_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    invite_hash TEXT NOT NULL UNIQUE CHECK (invite_hash ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'cancelled', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    used_by_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    CONSTRAINT neighbor_invites_issuer_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CHECK (expires_at > created_at),
    CHECK (
        (status = 'used' AND used_at IS NOT NULL AND used_by_class_id IS NOT NULL)
        OR (status <> 'used' AND used_at IS NULL AND used_by_class_id IS NULL)
    ),
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_neighbor_invites_active_expiry
    ON public.neighbor_invites (expires_at, id)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_neighbor_invites_space_created
    ON public.neighbor_invites (space_id, created_at DESC, id DESC);

-- 초대키 추측 실패는 예외를 던져 트랜잭션을 되돌리지 않고 이 원장에 남긴 뒤
-- 동일한 일반 오류 응답을 돌려준다. 인증된 승인 교사 계정별로만 집계한다.
CREATE TABLE IF NOT EXISTS public.neighbor_invite_attempts (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    window_started_at TIMESTAMPTZ NOT NULL,
    failure_count SMALLINT NOT NULL DEFAULT 0 CHECK (failure_count BETWEEN 0 AND 100),
    blocked_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 이웃 공개 연결은 원글 ID뿐 아니라 원래 학급·학생까지 같은 키로 묶는다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_posts_id_class_student_unique
    ON public.student_posts (id, class_id, student_id);

CREATE TABLE IF NOT EXISTS public.neighbor_shared_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    post_id UUID NOT NULL,
    student_id UUID NOT NULL,
    public_author_name TEXT NOT NULL CHECK (char_length(btrim(public_author_name)) BETWEEN 1 AND 30),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'published', 'returned', 'hidden', 'recalled')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    review_note TEXT NOT NULL DEFAULT '' CHECK (char_length(review_note) <= 240),
    published_at TIMESTAMPTZ,
    hidden_at TIMESTAMPTZ,
    hidden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hidden_by_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    hidden_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(hidden_reason) <= 240),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT neighbor_shared_posts_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_shared_posts_source_scope_fkey
        FOREIGN KEY (post_id, class_id, student_id)
        REFERENCES public.student_posts(id, class_id, student_id) ON DELETE CASCADE,
    CHECK (status <> 'pending' OR (reviewed_at IS NULL AND reviewed_by IS NULL AND published_at IS NULL)),
    CHECK (status <> 'published' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND published_at IS NOT NULL)),
    CHECK (status <> 'hidden' OR (hidden_at IS NOT NULL AND hidden_by IS NOT NULL AND hidden_by_class_id IS NOT NULL)),
    UNIQUE (space_id, post_id),
    UNIQUE (id, space_id)
);

CREATE INDEX IF NOT EXISTS idx_neighbor_shared_posts_feed
    ON public.neighbor_shared_posts (space_id, published_at DESC, id DESC)
    WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_neighbor_shared_posts_class_review
    ON public.neighbor_shared_posts (class_id, status, requested_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_neighbor_shared_posts_student_history
    ON public.neighbor_shared_posts (student_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.neighbor_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_post_id UUID NOT NULL,
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hidden_at TIMESTAMPTZ,
    hidden_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hidden_by_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    hidden_reason TEXT NOT NULL DEFAULT '' CHECK (char_length(hidden_reason) <= 240),
    CONSTRAINT neighbor_comments_post_space_fkey
        FOREIGN KEY (shared_post_id, space_id)
        REFERENCES public.neighbor_shared_posts(id, space_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_comments_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_comments_student_scope_fkey
        FOREIGN KEY (student_id, class_id)
        REFERENCES public.students(id, class_id) ON DELETE CASCADE,
    CHECK (
        (status = 'deleted' AND content = '')
        OR (
            status IN ('visible', 'hidden')
            AND char_length(btrim(content)) BETWEEN 1 AND 300
            AND content !~ E'[\\r\\n]'
        )
    ),
    CHECK (status <> 'hidden' OR (hidden_at IS NOT NULL AND hidden_by IS NOT NULL AND hidden_by_class_id IS NOT NULL)),
    UNIQUE (shared_post_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_neighbor_comments_post_visible
    ON public.neighbor_comments (shared_post_id, created_at, id)
    WHERE status = 'visible';
CREATE INDEX IF NOT EXISTS idx_neighbor_comments_space_recent
    ON public.neighbor_comments (space_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.neighbor_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_post_id UUID NOT NULL,
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    reaction_type TEXT NOT NULL DEFAULT 'empathy' CHECK (reaction_type = 'empathy'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT neighbor_reactions_post_space_fkey
        FOREIGN KEY (shared_post_id, space_id)
        REFERENCES public.neighbor_shared_posts(id, space_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_reactions_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_reactions_student_scope_fkey
        FOREIGN KEY (student_id, class_id)
        REFERENCES public.students(id, class_id) ON DELETE CASCADE,
    UNIQUE (shared_post_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_neighbor_reactions_post
    ON public.neighbor_reactions (shared_post_id, created_at, id);

CREATE TABLE IF NOT EXISTS public.neighbor_saves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_post_id UUID NOT NULL,
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT neighbor_saves_post_space_fkey
        FOREIGN KEY (shared_post_id, space_id)
        REFERENCES public.neighbor_shared_posts(id, space_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_saves_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_saves_student_scope_fkey
        FOREIGN KEY (student_id, class_id)
        REFERENCES public.students(id, class_id) ON DELETE CASCADE,
    UNIQUE (shared_post_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_neighbor_saves_student_recent
    ON public.neighbor_saves (student_id, created_at DESC, id DESC);

-- 학생 홈의 `새 글` 수는 마지막으로 피드를 연 시각 이후만 센다. 글 본문이나
-- 상대 학생 정보는 저장하지 않고 공간·본인 학생·시각만 남긴다.
CREATE TABLE IF NOT EXISTS public.neighbor_feed_visits (
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (space_id, student_id),
    CONSTRAINT neighbor_feed_visits_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_feed_visits_student_scope_fkey
        FOREIGN KEY (student_id, class_id)
        REFERENCES public.students(id, class_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_neighbor_feed_visits_student_recent
    ON public.neighbor_feed_visits (student_id, last_seen_at DESC, space_id);

CREATE TABLE IF NOT EXISTS public.neighbor_space_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES public.neighbor_spaces(id) ON DELETE CASCADE,
    class_id UUID,
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_role TEXT NOT NULL CHECK (actor_role IN ('admin', 'host', 'guest', 'student', 'system')),
    event_type TEXT NOT NULL CHECK (event_type IN (
        'space_created', 'invite_created', 'invite_cancelled', 'join_requested',
        'join_approved', 'join_rejected', 'class_left', 'host_transferred',
        'space_paused', 'space_resumed', 'space_closed', 'class_access_changed',
        'post_requested', 'post_published', 'post_returned', 'post_recalled', 'item_hidden',
        'item_restored', 'comment_changed', 'reaction_changed', 'save_changed',
        'rollout_changed'
    )),
    target_type TEXT CHECK (target_type IS NULL OR target_type IN ('space', 'class', 'invite', 'post', 'comment')),
    target_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT neighbor_space_events_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CHECK ((target_type IS NULL) = (target_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_neighbor_space_events_space_recent
    ON public.neighbor_space_events (space_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_neighbor_space_events_class_recent
    ON public.neighbor_space_events (class_id, created_at DESC, id DESC)
    WHERE class_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_neighbor_updated_at_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

-- 글과 댓글이 같은 학생을 같은 공개 이름으로 표시하도록 필명 생성은 한 곳에 둔다.
CREATE OR REPLACE FUNCTION public.neighbor_public_author_name_v1(
    p_space_id UUID,
    p_student_id UUID
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
    SELECT '이웃 작가 ' || substring(
        upper(encode(extensions.digest(
            convert_to(p_space_id::TEXT || ':' || p_student_id::TEXT, 'UTF8'),
            'sha256'
        ), 'hex')),
        1,
        4
    );
$$;

CREATE OR REPLACE FUNCTION public.guard_neighbor_space_class_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space public.neighbor_spaces%ROWTYPE;
    v_active_count INTEGER;
BEGIN
    SELECT space.* INTO v_space
    FROM public.neighbor_spaces space
    WHERE space.id = NEW.space_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Neighbor space not found' USING ERRCODE = '23503';
    END IF;
    -- 호스트 이전은 공간의 host_class_id와 두 참여 행의 role을 한 트랜잭션에서
    -- 바꾼다. 중간 상태를 막지 않고 DEFERRABLE 호스트 제약이 최종 상태를 검사한다.
    IF v_space.status = 'closed' AND NEW.status = 'active'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
        RAISE EXCEPTION 'Closed neighbor space cannot accept an active class' USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'active' THEN
        SELECT count(*)::INTEGER INTO v_active_count
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = NEW.space_id
          AND membership.status = 'active'
          AND membership.id <> NEW.id;
        IF v_active_count >= 4 THEN
            RAISE EXCEPTION 'Neighbor space supports at most four active classes' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_neighbor_space_host_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space_id UUID;
    v_space public.neighbor_spaces%ROWTYPE;
    v_host_count INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'neighbor_spaces' THEN
        v_space_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
    ELSE
        v_space_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.space_id ELSE NEW.space_id END;
    END IF;

    SELECT space.* INTO v_space FROM public.neighbor_spaces space WHERE space.id = v_space_id;
    IF NOT FOUND OR v_space.status NOT IN ('active', 'paused') THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    SELECT count(*)::INTEGER INTO v_host_count
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = v_space.id
      AND membership.class_id = v_space.host_class_id
      AND membership.role = 'host'
      AND membership.status = 'active';
    IF v_host_count <> 1 THEN
        RAISE EXCEPTION 'Active neighbor space must have one matching active host class' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_neighbor_shared_post_source_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'published' AND NOT EXISTS (
        SELECT 1
        FROM public.student_posts post
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = NEW.space_id
         AND membership.class_id = NEW.class_id
         AND membership.status = 'active'
        JOIN public.neighbor_spaces space
          ON space.id = membership.space_id
         AND space.status = 'active'
        WHERE post.id = NEW.post_id
          AND post.class_id = NEW.class_id
          AND post.student_id = NEW.student_id
          AND post.is_submitted IS TRUE
          AND post.recalled_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Only a current submitted source post can be published' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

-- 원글은 복사하지 않는다. 제출 취소·회수는 모든 이웃 공개를 회수하고, 공개 뒤
-- 내용이 달라지면 다시 원학급 교사 검토 대기로 돌린다.
CREATE OR REPLACE FUNCTION public.sync_neighbor_shared_post_source_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.is_submitted IS NOT TRUE OR NEW.recalled_at IS NOT NULL THEN
        UPDATE public.neighbor_shared_posts shared
        SET status = 'recalled',
            reviewed_at = NULL,
            reviewed_by = NULL,
            review_note = '',
            published_at = NULL,
            hidden_at = NULL,
            hidden_by = NULL,
            hidden_by_class_id = NULL,
            hidden_reason = ''
        WHERE shared.post_id = NEW.id
          AND shared.class_id = NEW.class_id
          AND shared.student_id = NEW.student_id
          AND shared.status <> 'recalled';
    ELSIF OLD.title IS DISTINCT FROM NEW.title
       OR OLD.content IS DISTINCT FROM NEW.content
       OR OLD.structured_content IS DISTINCT FROM NEW.structured_content
       OR OLD.teacher_edited_title IS DISTINCT FROM NEW.teacher_edited_title
       OR OLD.teacher_edited_content IS DISTINCT FROM NEW.teacher_edited_content
       OR OLD.show_original IS DISTINCT FROM NEW.show_original THEN
        UPDATE public.neighbor_shared_posts shared
        SET status = 'pending',
            requested_at = NOW(),
            reviewed_at = NULL,
            reviewed_by = NULL,
            review_note = '',
            published_at = NULL,
            hidden_at = NULL,
            hidden_by = NULL,
            hidden_by_class_id = NULL,
            hidden_reason = ''
        WHERE shared.post_id = NEW.id
          AND shared.class_id = NEW.class_id
          AND shared.student_id = NEW.student_id
          AND shared.status IN ('published', 'hidden');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_admin_v1()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles profile
        WHERE profile.id = v_user_id AND profile.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION '이웃 아지트 관리자 권한이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.neighbor_acceptance_ready_v1(p_checks JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT COALESCE((p_checks->>'permissions')::BOOLEAN, FALSE)
       AND COALESCE((p_checks->>'desktop')::BOOLEAN, FALSE)
       AND COALESCE((p_checks->>'tablet')::BOOLEAN, FALSE)
       AND COALESCE((p_checks->>'mobile')::BOOLEAN, FALSE)
       AND COALESCE((p_checks->>'performance')::BOOLEAN, FALSE)
       AND COALESCE((p_checks->>'operations')::BOOLEAN, FALSE);
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_teacher_class_v1(p_class_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile public.profiles%ROWTYPE;
    v_mode TEXT;
BEGIN
    IF v_user_id IS NULL OR p_class_id IS NULL THEN
        RAISE EXCEPTION '이웃 아지트 교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT profile.* INTO v_profile
    FROM public.profiles profile
    WHERE profile.id = v_user_id;

    SELECT rollout.mode INTO v_mode
    FROM public.neighbor_rollout_state rollout
    WHERE rollout.singleton IS TRUE;

    IF v_profile.role = 'ADMIN' THEN
        IF v_mode = 'paused' THEN
            RAISE EXCEPTION '이웃 아지트가 점검 중입니다.' USING ERRCODE = '55000';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.classes class
            WHERE class.id = p_class_id AND class.deleted_at IS NULL
        ) THEN
            RAISE EXCEPTION '사용 가능한 학급이 아닙니다.' USING ERRCODE = '22023';
        END IF;
        RETURN 'admin';
    END IF;

    IF v_mode <> 'public_beta'
       OR v_profile.role <> 'TEACHER'
       OR v_profile.is_approved IS NOT TRUE
       OR v_profile.approval_revoked_at IS NOT NULL
       OR NOT EXISTS (
            SELECT 1 FROM public.classes class
            WHERE class.id = p_class_id
              AND class.teacher_id = v_user_id
              AND class.deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION '승인된 담당 교사만 이웃 아지트를 관리할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN 'teacher';
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_space_host_v1(p_space_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_host_class_id UUID;
    v_status TEXT;
    v_actor TEXT;
BEGIN
    SELECT space.host_class_id, space.status
    INTO v_host_class_id, v_status
    FROM public.neighbor_spaces space
    WHERE space.id = p_space_id;

    IF v_host_class_id IS NULL OR v_status NOT IN ('active', 'paused') THEN
        RAISE EXCEPTION '운영 중인 이웃 아지트 공간이 아닙니다.' USING ERRCODE = '22023';
    END IF;

    v_actor := public.assert_neighbor_teacher_class_v1(v_host_class_id);
    IF v_actor <> 'admin' AND NOT EXISTS (
        SELECT 1
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id
          AND membership.class_id = v_host_class_id
          AND membership.role = 'host'
          AND membership.status = 'active'
    ) THEN
        RAISE EXCEPTION '공간 호스트만 관리할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN CASE WHEN v_actor = 'admin' THEN 'admin' ELSE 'host' END;
END;
$$;

-- 글 공개·학생 접근은 관리자 내부 미리보기 우회 권한과 분리한다. 실제 담당 교사만
-- 자기 학급의 글을 승인하며, 다른 참여 학급 교사는 긴급 숨김만 할 수 있다.
CREATE OR REPLACE FUNCTION public.assert_neighbor_participating_teacher_v1(
    p_space_id UUID,
    p_class_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor_role TEXT;
BEGIN
    IF v_user_id IS NULL OR p_space_id IS NULL OR p_class_id IS NULL THEN
        RAISE EXCEPTION '이웃 아지트 교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF (SELECT rollout.mode FROM public.neighbor_rollout_state rollout WHERE rollout.singleton) <> 'public_beta'
       OR NOT EXISTS (
            SELECT 1
            FROM public.profiles profile
            JOIN public.classes class
              ON class.teacher_id = profile.id
             AND class.id = p_class_id
             AND class.deleted_at IS NULL
            WHERE profile.id = v_user_id
              AND profile.role = 'TEACHER'
              AND profile.is_approved IS TRUE
              AND profile.approval_revoked_at IS NULL
       ) THEN
        RAISE EXCEPTION '승인된 담당 교사만 이웃 글을 관리할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT membership.role INTO v_actor_role
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.space_id = p_space_id
      AND membership.class_id = p_class_id
      AND membership.status = 'active'
      AND space.status = 'active';

    IF v_actor_role IS NULL THEN
        RAISE EXCEPTION '현재 참여 중인 학급이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    RETURN v_actor_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_student_access_v1(p_space_id UUID)
RETURNS TABLE(student_id UUID, class_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
BEGIN
    IF v_user_id IS NULL
       OR public.auth_user_role() <> 'STUDENT'
       OR (SELECT rollout.mode FROM public.neighbor_rollout_state rollout WHERE rollout.singleton) <> 'public_beta' THEN
        RAISE EXCEPTION '이웃 아지트를 사용할 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.id, student.class_id INTO v_student_id, v_class_id
    FROM public.students student
    JOIN public.classes class
      ON class.id = student.class_id
     AND class.deleted_at IS NULL
    WHERE student.auth_id = v_user_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL
      AND 'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
    LIMIT 1;

    IF v_student_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.neighbor_space_classes membership
        JOIN public.neighbor_spaces space ON space.id = membership.space_id
        WHERE membership.space_id = p_space_id
          AND membership.class_id = v_class_id
          AND membership.status = 'active'
          AND membership.student_access_enabled IS TRUE
          AND space.status = 'active'
          AND (
              SELECT count(*)
              FROM public.neighbor_space_classes active_membership
              WHERE active_membership.space_id = p_space_id
                AND active_membership.status = 'active'
          ) >= 2
    ) THEN
        RAISE EXCEPTION '학급에서 이웃 아지트를 아직 열지 않았습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT v_student_id, v_class_id;
END;
$$;

-- 댓글·공감·간직하기는 모두 같은 현재 공개 글 경계를 통과한다. 화면에서 받은
-- 공간·공유 글 ID만 믿지 않고 실제 학생 학급과 원글 제출 상태를 함께 확인한다.
CREATE OR REPLACE FUNCTION public.assert_neighbor_student_post_access_v1(
    p_space_id UUID,
    p_shared_post_id UUID
)
RETURNS TABLE(requester_student_id UUID, requester_class_id UUID, owner_student_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_owner_student_id UUID;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT shared.student_id INTO v_owner_student_id
    FROM public.neighbor_shared_posts shared
    JOIN public.neighbor_space_classes source_membership
      ON source_membership.space_id = shared.space_id
     AND source_membership.class_id = shared.class_id
     AND source_membership.status = 'active'
    JOIN public.student_posts post
      ON post.id = shared.post_id
     AND post.class_id = shared.class_id
     AND post.student_id = shared.student_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    WHERE shared.id = p_shared_post_id
      AND shared.space_id = p_space_id
      AND shared.status = 'published';

    IF v_owner_student_id IS NULL THEN
        RAISE EXCEPTION '현재 공개 중인 이웃 글을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_student_id, v_class_id, v_owner_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_neighbor_invite_key_v1()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    v_bytes BYTEA := extensions.gen_random_bytes(16);
    v_key TEXT := '';
    v_index INTEGER;
BEGIN
    FOR v_index IN 0..15 LOOP
        v_key := v_key || substr(
            v_alphabet,
            (get_byte(v_bytes, v_index) % char_length(v_alphabet)) + 1,
            1
        );
    END LOOP;
    RETURN substr(v_key, 1, 4) || '-' || substr(v_key, 5, 4) || '-'
        || substr(v_key, 9, 4) || '-' || substr(v_key, 13, 4);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_neighbor_space_v1(
    p_class_id UUID,
    p_name TEXT,
    p_public_class_name TEXT,
    p_public_description TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_space_id UUID;
    v_name TEXT := btrim(COALESCE(p_name, ''));
    v_class_name TEXT := btrim(COALESCE(p_public_class_name, ''));
    v_description TEXT := btrim(COALESCE(p_public_description, ''));
BEGIN
    v_actor := public.assert_neighbor_teacher_class_v1(p_class_id);
    IF char_length(v_name) NOT BETWEEN 1 AND 60
       OR char_length(v_class_name) NOT BETWEEN 1 AND 40
       OR char_length(v_description) > 240 THEN
        RAISE EXCEPTION '공간명·공개 학급명·설명 길이를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.class_id = p_class_id AND membership.status = 'active'
    ) THEN
        RAISE EXCEPTION '이 학급은 이미 활성 이웃 아지트에 참여 중입니다.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.neighbor_spaces (
        host_class_id, created_by, name, public_description, status
    ) VALUES (
        p_class_id, v_user_id, v_name, v_description, 'draft'
    ) RETURNING id INTO v_space_id;

    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name,
        requested_at, reviewed_at, reviewed_by, joined_at
    ) VALUES (
        v_space_id, p_class_id, 'host', 'active', v_class_name,
        NOW(), NOW(), v_user_id, NOW()
    );
    UPDATE public.neighbor_spaces SET status = 'active' WHERE id = v_space_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        v_space_id, p_class_id, v_user_id,
        CASE WHEN v_actor = 'admin' THEN 'admin' ELSE 'host' END,
        'space_created', 'space', v_space_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'space_id', v_space_id,
        'status', 'active',
        'active_class_count', 1
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_neighbor_invite_v1(p_space_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_host_class_id UUID;
    v_invite_id UUID;
    v_key TEXT;
    v_normalized TEXT;
    v_hash TEXT;
    v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '24 hours';
BEGIN
    v_actor := public.assert_neighbor_space_host_v1(p_space_id);
    SELECT space.host_class_id INTO v_host_class_id
    FROM public.neighbor_spaces space
    WHERE space.id = p_space_id AND space.status = 'active'
    FOR UPDATE;
    IF v_host_class_id IS NULL THEN
        RAISE EXCEPTION '활성 공간에서만 초대키를 만들 수 있습니다.' USING ERRCODE = '55000';
    END IF;

    UPDATE public.neighbor_invites
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE space_id = p_space_id AND status = 'active';

    LOOP
        v_key := public.generate_neighbor_invite_key_v1();
        v_normalized := replace(v_key, '-', '');
        v_hash := encode(extensions.digest(convert_to(v_normalized, 'UTF8'), 'sha256'), 'hex');
        BEGIN
            INSERT INTO public.neighbor_invites (
                space_id, class_id, invite_hash, expires_at, created_by
            ) VALUES (
                p_space_id, v_host_class_id, v_hash, v_expires_at, v_user_id
            ) RETURNING id INTO v_invite_id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;
    END LOOP;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_host_class_id, v_user_id, v_actor,
        'invite_created', 'invite', v_invite_id
    );

    -- 원문 키는 이 응답 한 번에만 포함되고 표·이벤트에는 해시만 남는다.
    RETURN jsonb_build_object(
        'success', TRUE,
        'invite_key', v_key,
        'expires_at', v_expires_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_neighbor_invite_failure_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_now TIMESTAMPTZ := clock_timestamp();
    v_failures SMALLINT;
    v_blocked_until TIMESTAMPTZ;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '이웃 아지트 교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.neighbor_invite_attempts (
        user_id, window_started_at, failure_count, blocked_until, updated_at
    ) VALUES (
        v_user_id, v_now, 1, NULL, v_now
    )
    ON CONFLICT (user_id) DO UPDATE SET
        window_started_at = CASE
            WHEN neighbor_invite_attempts.window_started_at < v_now - INTERVAL '10 minutes'
                THEN v_now
            ELSE neighbor_invite_attempts.window_started_at
        END,
        failure_count = CASE
            WHEN neighbor_invite_attempts.window_started_at < v_now - INTERVAL '10 minutes'
                THEN 1
            ELSE LEAST(100, neighbor_invite_attempts.failure_count + 1)
        END,
        blocked_until = CASE
            WHEN (
                CASE
                    WHEN neighbor_invite_attempts.window_started_at < v_now - INTERVAL '10 minutes'
                        THEN 1
                    ELSE neighbor_invite_attempts.failure_count + 1
                END
            ) >= 5 THEN v_now + INTERVAL '30 seconds'
            ELSE NULL
        END,
        updated_at = v_now
    RETURNING failure_count, blocked_until INTO v_failures, v_blocked_until;

    RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'invalid_or_expired_invite',
        'retry_after_seconds', CASE
            WHEN v_blocked_until IS NULL THEN 0
            ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_blocked_until - v_now)))::INTEGER)
        END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_neighbor_join_v1(
    p_invite_key TEXT,
    p_class_id UUID,
    p_public_class_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_class_name TEXT := btrim(COALESCE(p_public_class_name, ''));
    v_normalized TEXT := regexp_replace(upper(COALESCE(p_invite_key, '')), '[-[:space:]]', '', 'g');
    v_hash TEXT;
    v_invite public.neighbor_invites%ROWTYPE;
    v_space public.neighbor_spaces%ROWTYPE;
    v_attempt public.neighbor_invite_attempts%ROWTYPE;
    v_membership_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    v_actor := public.assert_neighbor_teacher_class_v1(p_class_id);
    IF char_length(v_class_name) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION '공개 학급명은 1~40자로 입력해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.class_id = p_class_id AND membership.status = 'active'
    ) THEN
        RAISE EXCEPTION '이 학급은 이미 활성 이웃 아지트에 참여 중입니다.' USING ERRCODE = '23505';
    END IF;

    SELECT attempt.* INTO v_attempt
    FROM public.neighbor_invite_attempts attempt
    WHERE attempt.user_id = v_user_id;
    IF v_attempt.blocked_until > v_now THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'rate_limited',
            'retry_after_seconds', GREATEST(
                1,
                CEIL(EXTRACT(EPOCH FROM (v_attempt.blocked_until - v_now)))::INTEGER
            )
        );
    END IF;

    IF v_normalized !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{16}$' THEN
        RETURN public.record_neighbor_invite_failure_v1();
    END IF;
    v_hash := encode(extensions.digest(convert_to(v_normalized, 'UTF8'), 'sha256'), 'hex');

    SELECT invite.* INTO v_invite
    FROM public.neighbor_invites invite
    WHERE invite.invite_hash = v_hash
    FOR UPDATE;

    IF v_invite.id IS NULL OR v_invite.status <> 'active' OR v_invite.expires_at <= v_now THEN
        IF v_invite.id IS NOT NULL AND v_invite.status = 'active' AND v_invite.expires_at <= v_now THEN
            UPDATE public.neighbor_invites SET status = 'expired' WHERE id = v_invite.id;
        END IF;
        RETURN public.record_neighbor_invite_failure_v1();
    END IF;

    SELECT space.* INTO v_space
    FROM public.neighbor_spaces space
    WHERE space.id = v_invite.space_id
    FOR UPDATE;
    IF v_space.status <> 'active' THEN
        RETURN public.record_neighbor_invite_failure_v1();
    END IF;
    IF v_space.host_class_id = p_class_id THEN
        RAISE EXCEPTION '호스트 학급은 자기 초대로 참여할 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space.id
          AND membership.class_id = p_class_id
          AND membership.status IN ('pending', 'active')
    ) THEN
        RAISE EXCEPTION '이미 참여 신청했거나 참여 중인 학급입니다.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name,
        student_access_enabled, requested_at, reviewed_at, reviewed_by, joined_at, left_at
    ) VALUES (
        v_space.id, p_class_id, 'guest', 'pending', v_class_name,
        FALSE, v_now, NULL, NULL, NULL, NULL
    )
    ON CONFLICT (space_id, class_id) DO UPDATE SET
        role = 'guest',
        status = 'pending',
        public_class_name = EXCLUDED.public_class_name,
        student_access_enabled = FALSE,
        requested_at = v_now,
        reviewed_at = NULL,
        reviewed_by = NULL,
        joined_at = NULL,
        left_at = NULL
    WHERE neighbor_space_classes.status IN ('rejected', 'left')
    RETURNING id INTO v_membership_id;

    IF v_membership_id IS NULL THEN
        RAISE EXCEPTION '이 학급의 참여 상태를 갱신할 수 없습니다.' USING ERRCODE = '55000';
    END IF;

    UPDATE public.neighbor_invites
    SET status = 'used', used_at = v_now, used_by_class_id = p_class_id
    WHERE id = v_invite.id;
    DELETE FROM public.neighbor_invite_attempts WHERE user_id = v_user_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        v_space.id, p_class_id, v_user_id,
        CASE WHEN v_actor = 'admin' THEN 'admin' ELSE 'guest' END,
        'join_requested', 'class', p_class_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'space_id', v_space.id,
        'membership_id', v_membership_id,
        'status', 'pending'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_neighbor_join_v1(
    p_space_id UUID,
    p_class_id UUID,
    p_approve BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_status TEXT;
    v_active_count INTEGER;
BEGIN
    v_actor := public.assert_neighbor_space_host_v1(p_space_id);
    IF p_class_id IS NULL OR p_approve IS NULL THEN
        RAISE EXCEPTION '참여 신청과 승인 여부가 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.status = 'active'
    ) THEN
        RAISE EXCEPTION '활성 공간에서만 참여 신청을 처리할 수 있습니다.' USING ERRCODE = '55000';
    END IF;

    UPDATE public.neighbor_space_classes
    SET status = CASE WHEN p_approve THEN 'active' ELSE 'rejected' END,
        reviewed_at = NOW(),
        reviewed_by = v_user_id,
        joined_at = CASE WHEN p_approve THEN NOW() ELSE NULL END,
        left_at = NULL,
        student_access_enabled = FALSE
    WHERE space_id = p_space_id
      AND class_id = p_class_id
      AND role = 'guest'
      AND status = 'pending'
    RETURNING status INTO v_status;

    IF v_status IS NULL THEN
        RAISE EXCEPTION '대기 중인 참여 신청을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_class_id, v_user_id, v_actor,
        CASE WHEN p_approve THEN 'join_approved' ELSE 'join_rejected' END,
        'class', p_class_id
    );

    SELECT count(*)::INTEGER INTO v_active_count
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.status = 'active';

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', v_status,
        'active_class_count', v_active_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_neighbor_space_v1(
    p_space_id UUID,
    p_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_role TEXT;
    v_status TEXT;
    v_active_count INTEGER;
BEGIN
    v_actor := public.assert_neighbor_teacher_class_v1(p_class_id);
    SELECT membership.role, membership.status
    INTO v_role, v_status
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.space_id = p_space_id
      AND membership.class_id = p_class_id
      AND space.status IN ('active', 'paused')
    FOR UPDATE OF membership;

    IF v_role IS NULL OR v_status NOT IN ('pending', 'active') THEN
        RAISE EXCEPTION '나갈 수 있는 참여 상태가 아닙니다.' USING ERRCODE = '22023';
    END IF;
    IF v_role = 'host' THEN
        RAISE EXCEPTION '호스트는 먼저 권한을 이전하거나 공간을 종료해야 합니다.' USING ERRCODE = '55000';
    END IF;

    UPDATE public.neighbor_space_classes
    SET status = 'left', left_at = NOW(), student_access_enabled = FALSE
    WHERE space_id = p_space_id AND class_id = p_class_id;

    SELECT count(*)::INTEGER INTO v_active_count
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.status = 'active';
    IF v_active_count < 2 THEN
        UPDATE public.neighbor_space_classes
        SET student_access_enabled = FALSE
        WHERE space_id = p_space_id AND student_access_enabled IS TRUE;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_class_id, v_user_id,
        CASE WHEN v_actor = 'admin' THEN 'admin' ELSE 'guest' END,
        'class_left', 'class', p_class_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'left',
        'active_class_count', v_active_count,
        'student_access_paused', v_active_count < 2
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_neighbor_host_v1(
    p_space_id UUID,
    p_new_host_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_old_host_class_id UUID;
BEGIN
    v_actor := public.assert_neighbor_space_host_v1(p_space_id);
    SELECT space.host_class_id INTO v_old_host_class_id
    FROM public.neighbor_spaces space
    WHERE space.id = p_space_id
    FOR UPDATE;

    IF p_new_host_class_id IS NULL OR p_new_host_class_id = v_old_host_class_id THEN
        RAISE EXCEPTION '다른 활성 게스트 학급을 새 호스트로 선택해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id
          AND membership.class_id = p_new_host_class_id
          AND membership.role = 'guest'
          AND membership.status = 'active'
    ) THEN
        RAISE EXCEPTION '활성 게스트 학급만 호스트가 될 수 있습니다.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.neighbor_space_classes
    SET role = 'guest'
    WHERE space_id = p_space_id AND class_id = v_old_host_class_id;
    UPDATE public.neighbor_space_classes
    SET role = 'host'
    WHERE space_id = p_space_id AND class_id = p_new_host_class_id;
    UPDATE public.neighbor_spaces
    SET host_class_id = p_new_host_class_id
    WHERE id = p_space_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_new_host_class_id, v_user_id, v_actor,
        'host_transferred', 'class', p_new_host_class_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'previous_host_class_id', v_old_host_class_id,
        'host_class_id', p_new_host_class_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_neighbor_space_v1(p_space_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_host_class_id UUID;
BEGIN
    v_actor := public.assert_neighbor_space_host_v1(p_space_id);
    SELECT space.host_class_id INTO v_host_class_id
    FROM public.neighbor_spaces space
    WHERE space.id = p_space_id
    FOR UPDATE;

    UPDATE public.neighbor_invites
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE space_id = p_space_id AND status = 'active';

    UPDATE public.neighbor_space_classes
    SET status = CASE WHEN status = 'pending' THEN 'rejected' ELSE 'left' END,
        student_access_enabled = FALSE,
        left_at = CASE WHEN status = 'active' THEN NOW() ELSE left_at END,
        reviewed_at = CASE WHEN status = 'pending' THEN NOW() ELSE reviewed_at END,
        reviewed_by = CASE WHEN status = 'pending' THEN v_user_id ELSE reviewed_by END
    WHERE space_id = p_space_id AND status IN ('pending', 'active');

    UPDATE public.neighbor_spaces
    SET status = 'closed', closed_at = NOW()
    WHERE id = p_space_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_host_class_id, v_user_id, v_actor,
        'space_closed', 'space', p_space_id
    );

    RETURN jsonb_build_object('success', TRUE, 'status', 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_neighbor_class_access_v1(
    p_space_id UUID,
    p_class_id UUID,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_active_count INTEGER;
BEGIN
    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_class_id);
    SELECT count(*)::INTEGER INTO v_active_count
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.status = 'active';

    IF COALESCE(p_enabled, FALSE) AND v_active_count < 2 THEN
        RAISE EXCEPTION '두 학급 이상 참여한 뒤 학생에게 열 수 있습니다.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.neighbor_space_classes
    SET student_access_enabled = COALESCE(p_enabled, FALSE)
    WHERE space_id = p_space_id AND class_id = p_class_id AND status = 'active';

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_class_id, v_user_id, v_actor,
        'class_access_changed', 'class', p_class_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'student_access_enabled', COALESCE(p_enabled, FALSE)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.request_neighbor_post_share_v1(
    p_space_id UUID,
    p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    IF NOT EXISTS (
        SELECT 1 FROM public.student_posts post
        WHERE post.id = p_post_id
          AND post.student_id = v_student_id
          AND post.class_id = v_class_id
          AND post.is_submitted IS TRUE
          AND post.recalled_at IS NULL
    ) THEN
        RAISE EXCEPTION '공유할 수 있는 본인 제출 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.space_id = p_space_id AND shared.post_id = p_post_id
    FOR UPDATE;

    IF FOUND AND v_shared.status = 'hidden' THEN
        RAISE EXCEPTION '숨김 처리된 글은 교사 확인 전 다시 신청할 수 없습니다.' USING ERRCODE = '55000';
    ELSIF FOUND AND v_shared.status IN ('pending', 'published') THEN
        RETURN jsonb_build_object(
            'success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status
        );
    ELSIF FOUND THEN
        UPDATE public.neighbor_shared_posts
        SET status = 'pending',
            requested_at = NOW(),
            reviewed_at = NULL,
            reviewed_by = NULL,
            review_note = '',
            published_at = NULL,
            hidden_at = NULL,
            hidden_by = NULL,
            hidden_by_class_id = NULL,
            hidden_reason = ''
        WHERE id = v_shared.id
        RETURNING * INTO v_shared;
    ELSE
        INSERT INTO public.neighbor_shared_posts (
            space_id, class_id, post_id, student_id, public_author_name
        ) VALUES (
            p_space_id,
            v_class_id,
            p_post_id,
            v_student_id,
            public.neighbor_public_author_name_v1(p_space_id, v_student_id)
        )
        RETURNING * INTO v_shared;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, v_user_id, 'student',
        'post_requested', 'post', v_shared.id
    );

    RETURN jsonb_build_object(
        'success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.recall_my_neighbor_shared_post_v1(
    p_space_id UUID,
    p_shared_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    SELECT student.id, student.class_id INTO v_student_id, v_class_id
    FROM public.students student
    WHERE student.auth_id = v_user_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL
    LIMIT 1;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.id = p_shared_post_id
      AND shared.space_id = p_space_id
      AND shared.student_id = v_student_id
      AND shared.class_id = v_class_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '본인이 공유한 이웃 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    IF v_shared.status = 'recalled' THEN
        RETURN jsonb_build_object('success', TRUE, 'status', 'recalled');
    END IF;

    UPDATE public.neighbor_shared_posts
    SET status = 'recalled',
        reviewed_at = NULL,
        reviewed_by = NULL,
        review_note = '',
        published_at = NULL,
        hidden_at = NULL,
        hidden_by = NULL,
        hidden_by_class_id = NULL,
        hidden_reason = ''
    WHERE id = p_shared_post_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, v_user_id, 'student',
        'post_recalled', 'post', p_shared_post_id
    );
    RETURN jsonb_build_object('success', TRUE, 'status', 'recalled');
END;
$$;

CREATE OR REPLACE FUNCTION public.review_neighbor_shared_post_v1(
    p_space_id UUID,
    p_shared_post_id UUID,
    p_decision TEXT,
    p_review_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_status TEXT;
    v_event_type TEXT;
BEGIN
    IF p_decision NOT IN ('publish', 'return', 'recall')
       OR char_length(COALESCE(p_review_note, '')) > 240 THEN
        RAISE EXCEPTION '검토 결정 또는 메모가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.id = p_shared_post_id AND shared.space_id = p_space_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '검토할 이웃 글이 없습니다.' USING ERRCODE = '22023';
    END IF;

    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, v_shared.class_id);

    IF p_decision = 'publish' THEN
        IF v_shared.status <> 'pending' THEN
            RAISE EXCEPTION '검토 대기 글만 공개할 수 있습니다.' USING ERRCODE = '55000';
        END IF;
        v_status := 'published';
        v_event_type := 'post_published';
        UPDATE public.neighbor_shared_posts
        SET status = v_status,
            reviewed_at = NOW(),
            reviewed_by = v_user_id,
            review_note = COALESCE(p_review_note, ''),
            published_at = NOW(),
            hidden_at = NULL,
            hidden_by = NULL,
            hidden_by_class_id = NULL,
            hidden_reason = ''
        WHERE id = p_shared_post_id;
    ELSIF p_decision = 'return' THEN
        IF v_shared.status <> 'pending' THEN
            RAISE EXCEPTION '검토 대기 글만 돌려보낼 수 있습니다.' USING ERRCODE = '55000';
        END IF;
        v_status := 'returned';
        v_event_type := 'post_returned';
        UPDATE public.neighbor_shared_posts
        SET status = v_status,
            reviewed_at = NOW(),
            reviewed_by = v_user_id,
            review_note = COALESCE(p_review_note, ''),
            published_at = NULL
        WHERE id = p_shared_post_id;
    ELSE
        v_status := 'recalled';
        v_event_type := 'post_recalled';
        UPDATE public.neighbor_shared_posts
        SET status = v_status,
            reviewed_at = NOW(),
            reviewed_by = v_user_id,
            review_note = COALESCE(p_review_note, ''),
            published_at = NULL,
            hidden_at = NULL,
            hidden_by = NULL,
            hidden_by_class_id = NULL,
            hidden_reason = ''
        WHERE id = p_shared_post_id;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_shared.class_id, v_user_id, v_actor,
        v_event_type, 'post', p_shared_post_id
    );
    RETURN jsonb_build_object('success', TRUE, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_neighbor_item_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_item_type TEXT,
    p_item_id UUID,
    p_action TEXT,
    p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_comment public.neighbor_comments%ROWTYPE;
    v_status TEXT;
BEGIN
    IF p_item_type NOT IN ('post', 'comment')
       OR p_action NOT IN ('hide', 'restore')
       OR char_length(COALESCE(p_reason, '')) > 240 THEN
        RAISE EXCEPTION '숨김 대상 또는 사유가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);

    IF p_item_type = 'post' THEN
        SELECT shared.* INTO v_shared
        FROM public.neighbor_shared_posts shared
        WHERE shared.id = p_item_id AND shared.space_id = p_space_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION '관리할 이웃 글이 없습니다.' USING ERRCODE = '22023';
        END IF;

        IF p_action = 'hide' THEN
            IF v_shared.status <> 'published' THEN
                RAISE EXCEPTION '공개 중인 글만 긴급 숨김할 수 있습니다.' USING ERRCODE = '55000';
            END IF;
            UPDATE public.neighbor_shared_posts
            SET status = 'hidden',
                hidden_at = NOW(),
                hidden_by = v_user_id,
                hidden_by_class_id = p_actor_class_id,
                hidden_reason = COALESCE(p_reason, '')
            WHERE id = p_item_id;
            v_status := 'hidden';
        ELSE
            IF v_shared.status <> 'hidden' OR v_shared.class_id <> p_actor_class_id THEN
                RAISE EXCEPTION '원래 학급 교사만 숨긴 글을 복원할 수 있습니다.' USING ERRCODE = '42501';
            END IF;
            UPDATE public.neighbor_shared_posts
            SET status = 'published',
                hidden_at = NULL,
                hidden_by = NULL,
                hidden_by_class_id = NULL,
                hidden_reason = ''
            WHERE id = p_item_id;
            v_status := 'published';
        END IF;
    ELSE
        SELECT comment.* INTO v_comment
        FROM public.neighbor_comments comment
        JOIN public.neighbor_shared_posts shared
          ON shared.id = comment.shared_post_id
         AND shared.space_id = comment.space_id
        WHERE comment.id = p_item_id
          AND comment.space_id = p_space_id
          AND shared.status IN ('published', 'hidden')
        FOR UPDATE OF comment;
        IF NOT FOUND THEN
            RAISE EXCEPTION '관리할 이웃 댓글이 없습니다.' USING ERRCODE = '22023';
        END IF;

        IF p_action = 'hide' THEN
            IF v_comment.status <> 'visible' THEN
                RAISE EXCEPTION '보이는 댓글만 긴급 숨김할 수 있습니다.' USING ERRCODE = '55000';
            END IF;
            UPDATE public.neighbor_comments
            SET status = 'hidden',
                hidden_at = NOW(),
                hidden_by = v_user_id,
                hidden_by_class_id = p_actor_class_id,
                hidden_reason = COALESCE(p_reason, '')
            WHERE id = p_item_id;
            v_status := 'hidden';
        ELSE
            IF v_comment.status <> 'hidden' OR v_comment.class_id <> p_actor_class_id THEN
                RAISE EXCEPTION '댓글 작성 학급 교사만 숨긴 댓글을 복원할 수 있습니다.' USING ERRCODE = '42501';
            END IF;
            UPDATE public.neighbor_comments
            SET status = 'visible',
                hidden_at = NULL,
                hidden_by = NULL,
                hidden_by_class_id = NULL,
                hidden_reason = ''
            WHERE id = p_item_id;
            v_status := 'visible';
        END IF;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_actor_class_id, v_user_id, v_actor,
        CASE WHEN p_action = 'hide' THEN 'item_hidden' ELSE 'item_restored' END,
        p_item_type, p_item_id
    );
    RETURN jsonb_build_object(
        'success', TRUE,
        'status', v_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_neighbor_comment_v1(
    p_space_id UUID,
    p_shared_post_id UUID,
    p_content TEXT,
    p_action TEXT DEFAULT 'save'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
    v_owner_student_id UUID;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_comment public.neighbor_comments%ROWTYPE;
    v_public_class_name TEXT;
    v_comment_count INTEGER;
BEGIN
    IF p_action NOT IN ('save', 'delete') THEN
        RAISE EXCEPTION '댓글 작업이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'save' AND (
        char_length(v_content) NOT BETWEEN 1 AND 300 OR v_content ~ E'[\r\n]'
    ) THEN
        RAISE EXCEPTION '댓글은 줄바꿈 없이 1~300자로 작성해 주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT access.requester_student_id, access.requester_class_id, access.owner_student_id
    INTO v_student_id, v_class_id, v_owner_student_id
    FROM public.assert_neighbor_student_post_access_v1(p_space_id, p_shared_post_id) access;

    SELECT comment.* INTO v_comment
    FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id
      AND comment.student_id = v_student_id
    FOR UPDATE;

    IF p_action = 'delete' THEN
        IF v_comment.id IS NULL OR v_comment.status <> 'visible' THEN
            RAISE EXCEPTION '삭제할 내 댓글이 없습니다.' USING ERRCODE = '55000';
        END IF;
        UPDATE public.neighbor_comments
        SET content = '', status = 'deleted', hidden_at = NULL,
            hidden_by = NULL, hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_comment.id
        RETURNING * INTO v_comment;
    ELSIF v_comment.id IS NULL THEN
        INSERT INTO public.neighbor_comments (
            shared_post_id, space_id, class_id, student_id, content
        ) VALUES (
            p_shared_post_id, p_space_id, v_class_id, v_student_id, v_content
        ) RETURNING * INTO v_comment;
    ELSE
        IF v_comment.status = 'hidden' THEN
            RAISE EXCEPTION '선생님이 숨긴 댓글은 직접 다시 공개할 수 없습니다.' USING ERRCODE = '42501';
        END IF;
        UPDATE public.neighbor_comments
        SET content = v_content, status = 'visible', hidden_at = NULL,
            hidden_by = NULL, hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_comment.id
        RETURNING * INTO v_comment;
    END IF;

    SELECT membership.public_class_name INTO v_public_class_name
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id
      AND membership.class_id = v_class_id
      AND membership.status = 'active';

    SELECT count(*)::INTEGER INTO v_comment_count
    FROM public.neighbor_comments comment
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = comment.space_id
     AND membership.class_id = comment.class_id
     AND membership.status = 'active'
    WHERE comment.shared_post_id = p_shared_post_id
      AND comment.status = 'visible';

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, v_user_id, 'student', 'comment_changed', 'comment', v_comment.id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', v_comment.status,
        'comment_id', v_comment.id,
        'comment_count', v_comment_count,
        'comment', CASE WHEN v_comment.status = 'visible' THEN jsonb_build_object(
            'comment_id', v_comment.id,
            'content', v_comment.content,
            'author_name', public.neighbor_public_author_name_v1(p_space_id, v_student_id),
            'class_name', v_public_class_name,
            'created_at', v_comment.created_at,
            'updated_at', v_comment.updated_at,
            'is_mine', TRUE
        ) ELSE NULL END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_neighbor_reaction_v1(
    p_space_id UUID,
    p_shared_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
    v_owner_student_id UUID;
    v_reaction_id UUID;
    v_active BOOLEAN;
    v_reaction_count INTEGER;
BEGIN
    SELECT access.requester_student_id, access.requester_class_id, access.owner_student_id
    INTO v_student_id, v_class_id, v_owner_student_id
    FROM public.assert_neighbor_student_post_access_v1(p_space_id, p_shared_post_id) access;

    DELETE FROM public.neighbor_reactions reaction
    WHERE reaction.shared_post_id = p_shared_post_id
      AND reaction.student_id = v_student_id
    RETURNING reaction.id INTO v_reaction_id;

    IF v_reaction_id IS NULL THEN
        INSERT INTO public.neighbor_reactions (
            shared_post_id, space_id, class_id, student_id, reaction_type
        ) VALUES (
            p_shared_post_id, p_space_id, v_class_id, v_student_id, 'empathy'
        );
        v_active := TRUE;
    ELSE
        v_active := FALSE;
    END IF;

    SELECT count(*)::INTEGER INTO v_reaction_count
    FROM public.neighbor_reactions reaction
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = reaction.space_id
     AND membership.class_id = reaction.class_id
     AND membership.status = 'active'
    WHERE reaction.shared_post_id = p_shared_post_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, v_user_id, 'student', 'reaction_changed', 'post', p_shared_post_id
    );
    RETURN jsonb_build_object(
        'success', TRUE, 'active', v_active, 'reaction_type', 'empathy',
        'reaction_count', v_reaction_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_neighbor_save_v1(
    p_space_id UUID,
    p_shared_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
    v_owner_student_id UUID;
    v_save_id UUID;
    v_saved BOOLEAN;
BEGIN
    SELECT access.requester_student_id, access.requester_class_id, access.owner_student_id
    INTO v_student_id, v_class_id, v_owner_student_id
    FROM public.assert_neighbor_student_post_access_v1(p_space_id, p_shared_post_id) access;

    IF v_owner_student_id = v_student_id THEN
        RAISE EXCEPTION '내 글은 이미 내 아지트에 보관되어 있습니다.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.neighbor_saves saved
    WHERE saved.shared_post_id = p_shared_post_id
      AND saved.student_id = v_student_id
    RETURNING saved.id INTO v_save_id;

    IF v_save_id IS NULL THEN
        INSERT INTO public.neighbor_saves (shared_post_id, space_id, class_id, student_id)
        VALUES (p_shared_post_id, p_space_id, v_class_id, v_student_id);
        v_saved := TRUE;
    ELSE
        v_saved := FALSE;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, v_user_id, 'student', 'save_changed', 'post', p_shared_post_id
    );
    RETURN jsonb_build_object('success', TRUE, 'saved', v_saved);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_post_engagement_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_shared_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_breakdown JSONB := '[]'::JSONB;
    v_post_status TEXT;
    v_comment_count INTEGER;
    v_reaction_count INTEGER;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT shared.status INTO v_post_status
    FROM public.neighbor_shared_posts shared
    WHERE shared.id = p_shared_post_id AND shared.space_id = p_space_id;
    IF v_post_status IS NULL THEN
        RAISE EXCEPTION '집계할 이웃 글이 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*)::INTEGER INTO v_comment_count
    FROM public.neighbor_comments comment
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = comment.space_id
     AND membership.class_id = comment.class_id
     AND membership.status = 'active'
    WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible';

    SELECT count(*)::INTEGER INTO v_reaction_count
    FROM public.neighbor_reactions reaction
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = reaction.space_id
     AND membership.class_id = reaction.class_id
     AND membership.status = 'active'
    WHERE reaction.shared_post_id = p_shared_post_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'class_name', membership.public_class_name,
        'visible_comment_count', (
            SELECT count(*) FROM public.neighbor_comments comment
            WHERE comment.shared_post_id = p_shared_post_id
              AND comment.class_id = membership.class_id
              AND comment.status = 'visible'
        ),
        'reaction_count', (
            SELECT count(*) FROM public.neighbor_reactions reaction
            WHERE reaction.shared_post_id = p_shared_post_id
              AND reaction.class_id = membership.class_id
        )
    ) ORDER BY membership.joined_at, membership.class_id), '[]'::JSONB)
    INTO v_breakdown
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.status = 'active';

    RETURN jsonb_build_object(
        'version', 1,
        'shared_post_id', p_shared_post_id,
        'post_status', v_post_status,
        'visible_comment_count', v_comment_count,
        'reaction_count', v_reaction_count,
        'classes', v_breakdown
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_admin_dashboard_v1(
    p_space_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rollout public.neighbor_rollout_state%ROWTYPE;
    v_summary JSONB;
    v_classes JSONB := '[]'::JSONB;
    v_spaces JSONB := '[]'::JSONB;
    v_preview_feed JSONB := '[]'::JSONB;
    v_preview_space_id UUID := p_space_id;
BEGIN
    PERFORM public.assert_neighbor_admin_v1();
    SELECT rollout.* INTO v_rollout
    FROM public.neighbor_rollout_state rollout
    WHERE rollout.singleton IS TRUE;

    SELECT jsonb_build_object(
        'space_count', count(*)::INTEGER,
        'active_space_count', count(*) FILTER (WHERE space.status = 'active')::INTEGER,
        'paused_space_count', count(*) FILTER (WHERE space.status = 'paused')::INTEGER,
        'closed_space_count', count(*) FILTER (WHERE space.status = 'closed')::INTEGER,
        'active_class_count', (SELECT count(*)::INTEGER FROM public.neighbor_space_classes membership WHERE membership.status = 'active'),
        'published_post_count', (SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared WHERE shared.status = 'published'),
        'visible_comment_count', (SELECT count(*)::INTEGER FROM public.neighbor_comments comment WHERE comment.status = 'visible'),
        'hidden_comment_count', (SELECT count(*)::INTEGER FROM public.neighbor_comments comment WHERE comment.status = 'hidden'),
        'reaction_count', (SELECT count(*)::INTEGER FROM public.neighbor_reactions),
        'save_count', (SELECT count(*)::INTEGER FROM public.neighbor_saves)
    ) INTO v_summary
    FROM public.neighbor_spaces space;

    SELECT COALESCE(jsonb_agg(class_row.item ORDER BY class_row.created_at DESC, class_row.class_id), '[]'::JSONB)
    INTO v_classes
    FROM (
        SELECT
            class.id AS class_id,
            class.created_at,
            jsonb_build_object(
                'class_id', class.id,
                'class_name', class.name,
                'teacher_name', COALESCE(NULLIF(teacher.name, ''), NULLIF(profile.full_name, ''), '선생님'),
                'available', NOT EXISTS (
                    SELECT 1 FROM public.neighbor_space_classes membership
                    WHERE membership.class_id = class.id AND membership.status IN ('pending', 'active')
                )
            ) AS item
        FROM public.classes class
        JOIN public.profiles profile
          ON profile.id = class.teacher_id
         AND profile.role = 'TEACHER'
         AND profile.is_approved IS TRUE
         AND profile.approval_revoked_at IS NULL
        LEFT JOIN public.teachers teacher ON teacher.id = profile.id
        WHERE class.deleted_at IS NULL
        ORDER BY class.created_at DESC, class.id
        LIMIT 100
    ) class_row;

    SELECT COALESCE(jsonb_agg(space_row.item ORDER BY space_row.updated_at DESC, space_row.space_id), '[]'::JSONB)
    INTO v_spaces
    FROM (
        SELECT
            space.id AS space_id,
            space.updated_at,
            jsonb_build_object(
                'space_id', space.id,
                'name', space.name,
                'description', space.public_description,
                'status', space.status,
                'host_class_id', space.host_class_id,
                'created_at', space.created_at,
                'updated_at', space.updated_at,
                'memberships', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'class_id', membership.class_id,
                        'class_name', membership.public_class_name,
                        'role', membership.role,
                        'status', membership.status,
                        'student_access_enabled', membership.student_access_enabled
                    ) ORDER BY membership.role, membership.joined_at, membership.class_id)
                    FROM public.neighbor_space_classes membership
                    WHERE membership.space_id = space.id
                ), '[]'::JSONB),
                'published_post_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared
                    WHERE shared.space_id = space.id AND shared.status = 'published'
                ),
                'pending_post_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared
                    WHERE shared.space_id = space.id AND shared.status = 'pending'
                ),
                'visible_comment_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                    WHERE comment.space_id = space.id AND comment.status = 'visible'
                ),
                'hidden_comment_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                    WHERE comment.space_id = space.id AND comment.status = 'hidden'
                ),
                'reaction_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                    WHERE reaction.space_id = space.id
                ),
                'save_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_saves saved
                    WHERE saved.space_id = space.id
                )
            ) AS item
        FROM public.neighbor_spaces space
        ORDER BY space.updated_at DESC, space.id
        LIMIT 20
    ) space_row;

    IF v_preview_space_id IS NULL THEN
        SELECT space.id INTO v_preview_space_id
        FROM public.neighbor_spaces space
        ORDER BY (space.status = 'active') DESC, space.updated_at DESC, space.id
        LIMIT 1;
    END IF;

    IF v_preview_space_id IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(feed_row.item ORDER BY feed_row.published_at DESC, feed_row.shared_post_id DESC), '[]'::JSONB)
        INTO v_preview_feed
        FROM (
            SELECT
                shared.id AS shared_post_id,
                shared.published_at,
                jsonb_build_object(
                    'shared_post_id', shared.id,
                    'title', post.title,
                    'excerpt', left(regexp_replace(COALESCE(post.content, ''), '[[:space:]]+', ' ', 'g'), 180),
                    'author_name', public.neighbor_public_author_name_v1(shared.space_id, shared.student_id),
                    'class_name', membership.public_class_name,
                    'published_at', shared.published_at,
                    'comment_count', (
                        SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                        WHERE comment.shared_post_id = shared.id AND comment.status = 'visible'
                    ),
                    'reaction_count', (
                        SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                        WHERE reaction.shared_post_id = shared.id
                    )
                ) AS item
            FROM public.neighbor_shared_posts shared
            JOIN public.neighbor_space_classes membership
              ON membership.space_id = shared.space_id
             AND membership.class_id = shared.class_id
             AND membership.status = 'active'
            JOIN public.student_posts post
              ON post.id = shared.post_id
             AND post.class_id = shared.class_id
             AND post.student_id = shared.student_id
             AND post.is_submitted IS TRUE
             AND post.recalled_at IS NULL
            WHERE shared.space_id = v_preview_space_id AND shared.status = 'published'
            ORDER BY shared.published_at DESC, shared.id DESC
            LIMIT 20
        ) feed_row;
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
        'rollout', jsonb_build_object(
            'mode', v_rollout.mode,
            'updated_at', v_rollout.updated_at,
            'acceptance_checks', v_rollout.acceptance_checks,
            'ready_for_public_beta', public.neighbor_acceptance_ready_v1(v_rollout.acceptance_checks),
            'required_check_count', 6
        ),
        'summary', v_summary,
        'eligible_classes', v_classes,
        'spaces', v_spaces,
        'preview_space_id', v_preview_space_id,
        'preview_feed', v_preview_feed
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_neighbor_internal_trial_v1(
    p_name TEXT,
    p_class_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_mode TEXT;
    v_name TEXT := btrim(COALESCE(p_name, ''));
    v_class_count INTEGER := COALESCE(cardinality(p_class_ids), 0);
    v_space_id UUID;
BEGIN
    v_user_id := public.assert_neighbor_admin_v1();
    SELECT rollout.mode INTO v_mode FROM public.neighbor_rollout_state rollout WHERE rollout.singleton;
    IF v_mode <> 'internal' THEN
        RAISE EXCEPTION '내부 시험 공간은 관리자 내부 단계에서만 만들 수 있습니다.' USING ERRCODE = '55000';
    END IF;
    IF char_length(v_name) NOT BETWEEN 1 AND 60 OR v_class_count NOT BETWEEN 2 AND 4 THEN
        RAISE EXCEPTION '공간명과 2~4개 시험 학급을 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(DISTINCT class_id) FROM unnest(p_class_ids) class_id) <> v_class_count THEN
        RAISE EXCEPTION '시험 학급은 중복해서 선택할 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*)
        FROM public.classes class
        JOIN public.profiles profile
          ON profile.id = class.teacher_id
         AND profile.role = 'TEACHER'
         AND profile.is_approved IS TRUE
         AND profile.approval_revoked_at IS NULL
        WHERE class.id = ANY(p_class_ids) AND class.deleted_at IS NULL) <> v_class_count THEN
        RAISE EXCEPTION '승인 교사의 사용 가능한 학급만 선택할 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.class_id = ANY(p_class_ids) AND membership.status IN ('pending', 'active')
    ) THEN
        RAISE EXCEPTION '선택한 학급 중 이미 참여 중이거나 신청 중인 학급이 있습니다.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.neighbor_spaces (host_class_id, created_by, name, public_description, status)
    VALUES (p_class_ids[1], v_user_id, v_name, '관리자 내부 시험 공간', 'draft')
    RETURNING id INTO v_space_id;

    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name,
        student_access_enabled, requested_at, reviewed_at, reviewed_by, joined_at
    )
    SELECT
        v_space_id,
        class.id,
        CASE WHEN selected.position = 1 THEN 'host' ELSE 'guest' END,
        'active',
        left(COALESCE(NULLIF(btrim(class.name), ''), '시험 학급 ' || selected.position), 40),
        FALSE,
        NOW(), NOW(), v_user_id, NOW()
    FROM unnest(p_class_ids) WITH ORDINALITY selected(class_id, position)
    JOIN public.classes class ON class.id = selected.class_id;

    UPDATE public.neighbor_spaces SET status = 'active' WHERE id = v_space_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    )
    SELECT
        v_space_id,
        selected.class_id,
        v_user_id,
        'admin',
        CASE WHEN selected.position = 1 THEN 'space_created' ELSE 'join_approved' END,
        CASE WHEN selected.position = 1 THEN 'space' ELSE 'class' END,
        CASE WHEN selected.position = 1 THEN v_space_id ELSE selected.class_id END
    FROM unnest(p_class_ids) WITH ORDINALITY selected(class_id, position);

    RETURN jsonb_build_object(
        'success', TRUE,
        'space_id', v_space_id,
        'status', 'active',
        'active_class_count', v_class_count,
        'student_access_enabled', FALSE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_neighbor_acceptance_check_v1(
    p_check_key TEXT,
    p_checked BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_checks JSONB;
BEGIN
    v_user_id := public.assert_neighbor_admin_v1();
    IF p_check_key IS NULL OR p_check_key <> ALL(ARRAY[
        'permissions', 'desktop', 'tablet', 'mobile', 'performance', 'operations'
    ]) OR p_checked IS NULL THEN
        RAISE EXCEPTION '지원하지 않는 인수 점검 항목입니다.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.neighbor_rollout_state
    SET acceptance_checks = jsonb_set(acceptance_checks, ARRAY[p_check_key], to_jsonb(p_checked), TRUE),
        acceptance_checked_at = NOW(),
        acceptance_checked_by = v_user_id,
        updated_by = v_user_id
    WHERE singleton IS TRUE
    RETURNING acceptance_checks INTO v_checks;

    RETURN jsonb_build_object(
        'success', TRUE,
        'acceptance_checks', v_checks,
        'ready_for_public_beta', public.neighbor_acceptance_ready_v1(v_checks)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.change_neighbor_rollout_v1(
    p_mode TEXT,
    p_confirmation TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_rollout public.neighbor_rollout_state%ROWTYPE;
BEGIN
    v_user_id := public.assert_neighbor_admin_v1();
    IF p_mode NOT IN ('internal', 'public_beta', 'paused') THEN
        RAISE EXCEPTION '지원하지 않는 공개 단계입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT rollout.* INTO v_rollout
    FROM public.neighbor_rollout_state rollout
    WHERE rollout.singleton IS TRUE
    FOR UPDATE;

    IF p_mode = v_rollout.mode THEN
        RETURN jsonb_build_object('success', TRUE, 'mode', v_rollout.mode, 'changed', FALSE);
    END IF;
    IF p_mode = 'public_beta' AND NOT public.neighbor_acceptance_ready_v1(v_rollout.acceptance_checks) THEN
        RAISE EXCEPTION '인수 점검 여섯 항목을 모두 확인한 뒤 공개할 수 있습니다.' USING ERRCODE = '55000';
    END IF;
    IF p_mode = 'public_beta' AND p_confirmation <> '전체 교사 Beta 공개' THEN
        RAISE EXCEPTION '전체 교사 공개 확인 문구가 일치하지 않습니다.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.neighbor_rollout_events (
        from_mode, to_mode, checks_snapshot, confirmation_used, changed_by
    ) VALUES (
        v_rollout.mode, p_mode, v_rollout.acceptance_checks,
        p_mode = 'public_beta', v_user_id
    );
    UPDATE public.neighbor_rollout_state
    SET mode = p_mode, updated_by = v_user_id
    WHERE singleton IS TRUE;

    RETURN jsonb_build_object('success', TRUE, 'mode', p_mode, 'changed', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_space_feed_v1(
    p_space_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_cursor_at TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_items JSONB := '[]'::JSONB;
    v_has_more BOOLEAN := FALSE;
    v_next_at TIMESTAMPTZ;
    v_next_id UUID;
    v_space_name TEXT;
    v_active_class_count INTEGER;
BEGIN
    IF (p_cursor_at IS NULL) IS DISTINCT FROM (p_cursor_id IS NULL) THEN
        RAISE EXCEPTION '페이지 커서는 시각과 글 ID를 함께 보내야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT space.name, count(membership.id)::INTEGER
    INTO v_space_name, v_active_class_count
    FROM public.neighbor_spaces space
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = space.id
     AND membership.status = 'active'
    WHERE space.id = p_space_id AND space.status = 'active'
    GROUP BY space.id, space.name;

    WITH candidates AS MATERIALIZED (
        SELECT
            shared.id,
            shared.published_at,
            shared.public_author_name,
            membership.public_class_name,
            post.title,
            left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180) AS excerpt,
            post.writing_context,
            post.self_writing_type,
            shared.student_id = v_student_id AS is_mine,
            (
                SELECT count(*)::INTEGER
                FROM public.neighbor_comments comment
                JOIN public.neighbor_space_classes comment_membership
                  ON comment_membership.space_id = comment.space_id
                 AND comment_membership.class_id = comment.class_id
                 AND comment_membership.status = 'active'
                WHERE comment.shared_post_id = shared.id AND comment.status = 'visible'
            ) AS comment_count,
            (
                SELECT count(*)::INTEGER
                FROM public.neighbor_reactions reaction
                JOIN public.neighbor_space_classes reaction_membership
                  ON reaction_membership.space_id = reaction.space_id
                 AND reaction_membership.class_id = reaction.class_id
                 AND reaction_membership.status = 'active'
                WHERE reaction.shared_post_id = shared.id
            ) AS reaction_count,
            EXISTS (
                SELECT 1 FROM public.neighbor_reactions mine
                WHERE mine.shared_post_id = shared.id AND mine.student_id = v_student_id
            ) AS my_reaction,
            EXISTS (
                SELECT 1 FROM public.neighbor_saves saved
                WHERE saved.shared_post_id = shared.id AND saved.student_id = v_student_id
            ) AS my_saved
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id
         AND membership.class_id = shared.class_id
         AND membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id
         AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id
         AND post.is_submitted IS TRUE
         AND post.recalled_at IS NULL
        WHERE shared.space_id = p_space_id
          AND shared.status = 'published'
          AND (
              p_cursor_at IS NULL
              OR (shared.published_at, shared.id) < (p_cursor_at, p_cursor_id)
          )
        ORDER BY shared.published_at DESC, shared.id DESC
        LIMIT v_limit + 1
    ), page AS (
        SELECT candidate.*
        FROM candidates candidate
        ORDER BY candidate.published_at DESC, candidate.id DESC
        LIMIT v_limit
    ), serialized AS (
        SELECT
            page.published_at,
            page.id,
            jsonb_build_object(
                'shared_post_id', page.id,
                'title', page.title,
                'excerpt', page.excerpt,
                'author_name', page.public_author_name,
                'class_name', page.public_class_name,
                'published_at', page.published_at,
                'writing_context', page.writing_context,
                'self_writing_type', page.self_writing_type,
                'is_mine', page.is_mine,
                'comment_count', page.comment_count,
                'reaction_count', page.reaction_count,
                'my_reaction', page.my_reaction,
                'my_saved', page.my_saved
            ) AS item
        FROM page
    )
    SELECT
        COALESCE(jsonb_agg(serialized.item ORDER BY serialized.published_at DESC, serialized.id DESC), '[]'::JSONB),
        (SELECT count(*) > v_limit FROM candidates),
        (SELECT page.published_at FROM page ORDER BY page.published_at, page.id LIMIT 1),
        (SELECT page.id FROM page ORDER BY page.published_at, page.id LIMIT 1)
    INTO v_items, v_has_more, v_next_at, v_next_id
    FROM serialized;

    INSERT INTO public.neighbor_feed_visits (space_id, class_id, student_id, last_seen_at)
    VALUES (p_space_id, v_class_id, v_student_id, NOW())
    ON CONFLICT (space_id, student_id) DO UPDATE
    SET class_id = EXCLUDED.class_id, last_seen_at = EXCLUDED.last_seen_at;

    RETURN jsonb_build_object(
        'version', 1,
        'space', jsonb_build_object(
            'id', p_space_id,
            'name', v_space_name,
            'active_class_count', COALESCE(v_active_class_count, 0)
        ),
        'items', COALESCE(v_items, '[]'::JSONB),
        'has_more', COALESCE(v_has_more, FALSE),
        'next_cursor_at', CASE WHEN v_has_more THEN v_next_at ELSE NULL END,
        'next_cursor_id', CASE WHEN v_has_more THEN v_next_id ELSE NULL END,
        'max_rows', 50
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_shared_post_v1(
    p_space_id UUID,
    p_shared_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_owner_student_id UUID;
    v_result JSONB;
    v_comments JSONB := '[]'::JSONB;
    v_comment_count INTEGER := 0;
    v_reaction_count INTEGER := 0;
    v_my_reaction BOOLEAN := FALSE;
    v_my_saved BOOLEAN := FALSE;
BEGIN
    SELECT access.requester_student_id, access.requester_class_id, access.owner_student_id
    INTO v_student_id, v_class_id, v_owner_student_id
    FROM public.assert_neighbor_student_post_access_v1(p_space_id, p_shared_post_id) access;

    SELECT jsonb_build_object(
        'version', 1,
        'shared_post_id', shared.id,
        'title', post.title,
        'content', post.content,
        'structured_content', post.structured_content,
        'writing_context', post.writing_context,
        'self_writing_type', post.self_writing_type,
        'author_name', shared.public_author_name,
        'class_name', membership.public_class_name,
        'published_at', shared.published_at,
        'is_mine', shared.student_id = v_student_id
    ) INTO v_result
    FROM public.neighbor_shared_posts shared
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = shared.space_id
     AND membership.class_id = shared.class_id
     AND membership.status = 'active'
    JOIN public.student_posts post
      ON post.id = shared.post_id
     AND post.class_id = shared.class_id
     AND post.student_id = shared.student_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    WHERE shared.id = p_shared_post_id
      AND shared.space_id = p_space_id
      AND shared.status = 'published';

    IF v_result IS NULL THEN
        RAISE EXCEPTION '현재 공개 중인 이웃 글을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*)::INTEGER INTO v_comment_count
    FROM public.neighbor_comments comment
    JOIN public.neighbor_space_classes comment_membership
      ON comment_membership.space_id = comment.space_id
     AND comment_membership.class_id = comment.class_id
     AND comment_membership.status = 'active'
    WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible';

    SELECT COALESCE(jsonb_agg(comment_row.item ORDER BY comment_row.created_at, comment_row.id), '[]'::JSONB)
    INTO v_comments
    FROM (
        SELECT
            comment.created_at,
            comment.id,
            jsonb_build_object(
                'comment_id', comment.id,
                'content', comment.content,
                'author_name', public.neighbor_public_author_name_v1(p_space_id, comment.student_id),
                'class_name', comment_membership.public_class_name,
                'created_at', comment.created_at,
                'updated_at', comment.updated_at,
                'is_mine', comment.student_id = v_student_id
            ) AS item
        FROM public.neighbor_comments comment
        JOIN public.neighbor_space_classes comment_membership
          ON comment_membership.space_id = comment.space_id
         AND comment_membership.class_id = comment.class_id
         AND comment_membership.status = 'active'
        WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible'
        ORDER BY comment.created_at DESC, comment.id DESC
        LIMIT 100
    ) comment_row;

    SELECT count(*)::INTEGER INTO v_reaction_count
    FROM public.neighbor_reactions reaction
    JOIN public.neighbor_space_classes reaction_membership
      ON reaction_membership.space_id = reaction.space_id
     AND reaction_membership.class_id = reaction.class_id
     AND reaction_membership.status = 'active'
    WHERE reaction.shared_post_id = p_shared_post_id;

    SELECT EXISTS (
        SELECT 1 FROM public.neighbor_reactions reaction
        WHERE reaction.shared_post_id = p_shared_post_id AND reaction.student_id = v_student_id
    ), EXISTS (
        SELECT 1 FROM public.neighbor_saves saved
        WHERE saved.shared_post_id = p_shared_post_id AND saved.student_id = v_student_id
    ) INTO v_my_reaction, v_my_saved;

    RETURN v_result || jsonb_build_object(
        'comments', v_comments,
        'comment_count', v_comment_count,
        'comments_truncated', v_comment_count > 100,
        'reaction_count', v_reaction_count,
        'my_reaction', v_my_reaction,
        'my_saved', v_my_saved
    );
END;
$$;

-- 학생 홈은 계속 RPC 한 번만 호출한다. 기존 최신 wrapper 결과에 이웃 아지트의
-- 접근 가능 여부·공간 ID·마지막 피드 방문 이후 새 글 수만 작게 합친다.
DO $$
BEGIN
    IF to_regprocedure('public.get_student_home_bootstrap_core_20261199()') IS NULL THEN
        ALTER FUNCTION public.get_student_home_bootstrap_v1()
            RENAME TO get_student_home_bootstrap_core_20261199;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_core_20261199()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_core_20261199() TO service_role;

CREATE OR REPLACE FUNCTION public.get_student_home_bootstrap_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_student_id UUID;
    v_class_id UUID;
    v_space_id UUID;
    v_new_count INTEGER := 0;
    v_home JSONB;
BEGIN
    v_base := public.get_student_home_bootstrap_core_20261199();
    v_student_id := NULLIF(v_base #>> '{student,id}', '')::UUID;
    v_class_id := NULLIF(v_base #>> '{student,class_id}', '')::UUID;

    SELECT membership.space_id INTO v_space_id
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space
      ON space.id = membership.space_id
     AND space.status = 'active'
    JOIN public.classes class
      ON class.id = membership.class_id
     AND class.deleted_at IS NULL
     AND 'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
    JOIN public.neighbor_rollout_state rollout
      ON rollout.singleton IS TRUE
     AND rollout.mode = 'public_beta'
    WHERE membership.class_id = v_class_id
      AND membership.status = 'active'
      AND membership.student_access_enabled IS TRUE
      AND (
          SELECT count(*)
          FROM public.neighbor_space_classes active_membership
          WHERE active_membership.space_id = membership.space_id
            AND active_membership.status = 'active'
      ) >= 2
    LIMIT 1;

    IF v_space_id IS NOT NULL THEN
        SELECT LEAST(count(*)::INTEGER, 99) INTO v_new_count
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes source_membership
          ON source_membership.space_id = shared.space_id
         AND source_membership.class_id = shared.class_id
         AND source_membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id
         AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id
         AND post.is_submitted IS TRUE
         AND post.recalled_at IS NULL
        LEFT JOIN public.neighbor_feed_visits visit
          ON visit.space_id = shared.space_id
         AND visit.student_id = v_student_id
         AND visit.class_id = v_class_id
        WHERE shared.space_id = v_space_id
          AND shared.status = 'published'
          AND shared.published_at > COALESCE(visit.last_seen_at, '-infinity'::TIMESTAMPTZ);
    END IF;

    v_home := COALESCE(v_base->'home', '{}'::JSONB) || jsonb_build_object(
        'neighbor_agit_available', v_space_id IS NOT NULL,
        'neighbor_agit_space_id', v_space_id,
        'neighbor_agit_new_count', COALESCE(v_new_count, 0)
    );
    RETURN jsonb_set(v_base, '{home}', v_home, TRUE);
END;
$$;

DROP TRIGGER IF EXISTS neighbor_rollout_state_updated_at ON public.neighbor_rollout_state;
CREATE TRIGGER neighbor_rollout_state_updated_at
BEFORE UPDATE ON public.neighbor_rollout_state
FOR EACH ROW EXECUTE FUNCTION public.set_neighbor_updated_at_v1();

DROP TRIGGER IF EXISTS neighbor_spaces_updated_at ON public.neighbor_spaces;
CREATE TRIGGER neighbor_spaces_updated_at
BEFORE UPDATE ON public.neighbor_spaces
FOR EACH ROW EXECUTE FUNCTION public.set_neighbor_updated_at_v1();

DROP TRIGGER IF EXISTS neighbor_space_classes_updated_at ON public.neighbor_space_classes;
CREATE TRIGGER neighbor_space_classes_updated_at
BEFORE UPDATE ON public.neighbor_space_classes
FOR EACH ROW EXECUTE FUNCTION public.set_neighbor_updated_at_v1();

DROP TRIGGER IF EXISTS neighbor_space_classes_guard ON public.neighbor_space_classes;
CREATE TRIGGER neighbor_space_classes_guard
BEFORE INSERT OR UPDATE OF space_id, class_id, role, status ON public.neighbor_space_classes
FOR EACH ROW EXECUTE FUNCTION public.guard_neighbor_space_class_v1();

DROP TRIGGER IF EXISTS neighbor_spaces_host_constraint ON public.neighbor_spaces;
CREATE CONSTRAINT TRIGGER neighbor_spaces_host_constraint
AFTER INSERT OR UPDATE OF host_class_id, status ON public.neighbor_spaces
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_neighbor_space_host_v1();

DROP TRIGGER IF EXISTS neighbor_space_classes_host_constraint ON public.neighbor_space_classes;
CREATE CONSTRAINT TRIGGER neighbor_space_classes_host_constraint
AFTER INSERT OR UPDATE OR DELETE ON public.neighbor_space_classes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_neighbor_space_host_v1();

DROP TRIGGER IF EXISTS neighbor_shared_posts_updated_at ON public.neighbor_shared_posts;
CREATE TRIGGER neighbor_shared_posts_updated_at
BEFORE UPDATE ON public.neighbor_shared_posts
FOR EACH ROW EXECUTE FUNCTION public.set_neighbor_updated_at_v1();

DROP TRIGGER IF EXISTS neighbor_shared_posts_source_guard ON public.neighbor_shared_posts;
CREATE TRIGGER neighbor_shared_posts_source_guard
BEFORE INSERT OR UPDATE OF post_id, class_id, student_id, status ON public.neighbor_shared_posts
FOR EACH ROW EXECUTE FUNCTION public.guard_neighbor_shared_post_source_v1();

DROP TRIGGER IF EXISTS neighbor_shared_posts_source_sync ON public.student_posts;
CREATE TRIGGER neighbor_shared_posts_source_sync
AFTER UPDATE OF is_submitted, recalled_at, title, content, structured_content,
    teacher_edited_title, teacher_edited_content, show_original
ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.sync_neighbor_shared_post_source_v1();

DROP TRIGGER IF EXISTS neighbor_comments_updated_at ON public.neighbor_comments;
CREATE TRIGGER neighbor_comments_updated_at
BEFORE UPDATE ON public.neighbor_comments
FOR EACH ROW EXECUTE FUNCTION public.set_neighbor_updated_at_v1();

ALTER TABLE public.neighbor_rollout_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_rollout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_space_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_invite_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_shared_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_feed_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_space_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.neighbor_rollout_state FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_rollout_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_spaces FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_space_classes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_invites FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_invite_attempts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_shared_posts FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_comments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_reactions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_saves FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_feed_visits FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_space_events FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_neighbor_updated_at_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neighbor_public_author_name_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_neighbor_space_class_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_neighbor_space_host_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_neighbor_shared_post_source_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_neighbor_shared_post_source_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_neighbor_admin_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neighbor_acceptance_ready_v1(JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_neighbor_teacher_class_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_neighbor_space_host_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_neighbor_participating_teacher_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_neighbor_student_access_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_neighbor_student_post_access_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.generate_neighbor_invite_key_v1() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_neighbor_invite_failure_v1() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_neighbor_space_v1(UUID, TEXT, TEXT, TEXT)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_neighbor_invite_v1(UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.request_neighbor_join_v1(TEXT, UUID, TEXT)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.review_neighbor_join_v1(UUID, UUID, BOOLEAN)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.leave_neighbor_space_v1(UUID, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.transfer_neighbor_host_v1(UUID, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.close_neighbor_space_v1(UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_neighbor_class_access_v1(UUID, UUID, BOOLEAN)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.request_neighbor_post_share_v1(UUID, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.recall_my_neighbor_shared_post_v1(UUID, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.review_neighbor_shared_post_v1(UUID, UUID, TEXT, TEXT)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.moderate_neighbor_item_v1(UUID, UUID, TEXT, UUID, TEXT, TEXT)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_space_feed_v1(UUID, INTEGER, TIMESTAMPTZ, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_shared_post_v1(UUID, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.save_neighbor_comment_v1(UUID, UUID, TEXT, TEXT)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.toggle_neighbor_reaction_v1(UUID, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.toggle_neighbor_save_v1(UUID, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_post_engagement_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_admin_dashboard_v1(UUID)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.create_neighbor_internal_trial_v1(TEXT, UUID[])
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.set_neighbor_acceptance_check_v1(TEXT, BOOLEAN)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.change_neighbor_rollout_v1(TEXT, TEXT)
FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_v1() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_neighbor_space_v1(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_neighbor_invite_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_neighbor_join_v1(TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_neighbor_join_v1(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_neighbor_space_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_neighbor_host_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_neighbor_space_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_neighbor_class_access_v1(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_neighbor_post_share_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recall_my_neighbor_shared_post_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_neighbor_shared_post_v1(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_neighbor_item_v1(UUID, UUID, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_space_feed_v1(UUID, INTEGER, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_shared_post_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_neighbor_comment_v1(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_neighbor_reaction_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_neighbor_save_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_post_engagement_v1(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_admin_dashboard_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_neighbor_internal_trial_v1(TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_neighbor_acceptance_check_v1(TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_neighbor_rollout_v1(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_v1() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
