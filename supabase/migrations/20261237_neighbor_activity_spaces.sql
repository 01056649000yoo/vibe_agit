BEGIN;

-- 한 이웃 아지트 안에서 개인 글 전시(기존 activity_id NULL), 공동 주제,
-- 두 학급 글짝 교환을 함께 운영한다. 활동 과제는 기존 글쓰기 편집기를 그대로 쓴다.
CREATE TABLE IF NOT EXISTS public.neighbor_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES public.neighbor_spaces(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('topic', 'exchange')),
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
    prompt TEXT NOT NULL CHECK (char_length(btrim(prompt)) BETWEEN 1 AND 1000),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'closed')),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    UNIQUE (id, space_id),
    CHECK (activity_type = 'exchange' OR status <> 'matched'),
    CHECK ((status = 'open') = (matched_at IS NULL AND closed_at IS NULL)
        OR (status = 'matched' AND matched_at IS NOT NULL AND closed_at IS NULL)
        OR (status = 'closed' AND closed_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_neighbor_activities_one_live_type
    ON public.neighbor_activities (space_id, activity_type)
    WHERE status IN ('open', 'matched');
CREATE INDEX IF NOT EXISTS idx_neighbor_activities_space_recent
    ON public.neighbor_activities (space_id, status, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS public.neighbor_activity_classes (
    activity_id UUID NOT NULL,
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    mission_id UUID NOT NULL REFERENCES public.writing_missions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (activity_id, class_id),
    UNIQUE (mission_id),
    CONSTRAINT neighbor_activity_classes_activity_fkey
        FOREIGN KEY (activity_id, space_id)
        REFERENCES public.neighbor_activities(id, space_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_activity_classes_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_neighbor_activity_classes_space_class
    ON public.neighbor_activity_classes (space_id, class_id, activity_id);

-- 한 쌍을 양방향 두 행으로 저장한다. 따라서 학생 화면은 자기 student_id 한 번으로
-- 상대를 찾고, 글 목록·상세 권한도 같은 조건을 재사용할 수 있다.
CREATE TABLE IF NOT EXISTS public.neighbor_exchange_matches (
    activity_id UUID NOT NULL,
    space_id UUID NOT NULL,
    student_id UUID NOT NULL,
    class_id UUID NOT NULL,
    partner_student_id UUID NOT NULL,
    partner_class_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (activity_id, student_id, partner_student_id),
    CONSTRAINT neighbor_exchange_matches_activity_fkey
        FOREIGN KEY (activity_id, space_id)
        REFERENCES public.neighbor_activities(id, space_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_exchange_matches_student_fkey
        FOREIGN KEY (student_id, class_id)
        REFERENCES public.students(id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_exchange_matches_partner_fkey
        FOREIGN KEY (partner_student_id, partner_class_id)
        REFERENCES public.students(id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_exchange_matches_class_fkey
        FOREIGN KEY (activity_id, class_id)
        REFERENCES public.neighbor_activity_classes(activity_id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_exchange_matches_partner_class_fkey
        FOREIGN KEY (activity_id, partner_class_id)
        REFERENCES public.neighbor_activity_classes(activity_id, class_id) ON DELETE CASCADE,
    CHECK (student_id <> partner_student_id),
    CHECK (class_id <> partner_class_id)
);

CREATE INDEX IF NOT EXISTS idx_neighbor_exchange_matches_student
    ON public.neighbor_exchange_matches (activity_id, student_id, partner_student_id);

ALTER TABLE public.neighbor_shared_posts
    ADD COLUMN IF NOT EXISTS activity_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'neighbor_shared_posts_activity_fkey'
    ) THEN
        ALTER TABLE public.neighbor_shared_posts
            ADD CONSTRAINT neighbor_shared_posts_activity_fkey
            FOREIGN KEY (activity_id, space_id)
            REFERENCES public.neighbor_activities(id, space_id) ON DELETE CASCADE;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_neighbor_shared_posts_activity_feed
    ON public.neighbor_shared_posts (activity_id, published_at DESC, id DESC)
    WHERE activity_id IS NOT NULL AND status = 'published';

ALTER TABLE public.neighbor_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_activity_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_exchange_matches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.neighbor_activities FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_activity_classes FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.neighbor_exchange_matches FROM PUBLIC, anon, authenticated, service_role;

-- 이미 저장된 별칭도 폐쇄된 교사 승인 공간에서 확인 가능한 등록 이름으로 맞춘다.
UPDATE public.neighbor_shared_posts shared
SET public_author_name = left(btrim(student.name), 30)
FROM public.students student
WHERE student.id = shared.student_id
  AND student.class_id = shared.class_id
  AND shared.public_author_name IS DISTINCT FROM left(btrim(student.name), 30);

CREATE OR REPLACE FUNCTION public.create_neighbor_activity_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_type TEXT,
    p_title TEXT,
    p_prompt TEXT,
    p_exchange_class_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_class_id UUID;
    v_mission_id UUID;
    v_class_ids UUID[];
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id
          AND space.status = 'active'
          AND space.host_class_id = p_actor_class_id
    ) AND public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '호스트 교사만 새 활동을 만들 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_activity_type NOT IN ('topic', 'exchange') THEN
        RAISE EXCEPTION '지원하지 않는 이웃 활동입니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 80
       OR char_length(btrim(COALESCE(p_prompt, ''))) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION '활동 제목과 글쓰기 안내를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    IF p_activity_type = 'exchange' THEN
        IF cardinality(p_exchange_class_ids) <> 2
           OR p_exchange_class_ids[1] = p_exchange_class_ids[2] THEN
            RAISE EXCEPTION '글짝 교환은 서로 다른 두 학급을 골라야 합니다.' USING ERRCODE = '22023';
        END IF;
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id
          AND membership.status = 'active'
          AND membership.class_id = ANY(p_exchange_class_ids);
        IF cardinality(v_class_ids) <> 2 THEN
            RAISE EXCEPTION '현재 참여 중인 두 학급만 글짝 교환에 넣을 수 있습니다.' USING ERRCODE = '42501';
        END IF;
    ELSE
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id AND membership.status = 'active';
        IF COALESCE(cardinality(v_class_ids), 0) < 2 THEN
            RAISE EXCEPTION '두 학급 이상 참여한 뒤 공동 주제를 열 수 있습니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    INSERT INTO public.neighbor_activities (
        space_id, activity_type, title, prompt, created_by
    ) VALUES (
        p_space_id, p_activity_type, btrim(p_title), btrim(p_prompt), v_user_id
    ) RETURNING * INTO v_activity;

    FOREACH v_class_id IN ARRAY v_class_ids LOOP
        INSERT INTO public.writing_missions (
            class_id, teacher_id, title, guide, genre, mission_type,
            min_chars, min_paragraphs, base_reward, bonus_threshold,
            bonus_reward, allow_comments, guide_questions, tags, is_archived
        )
        SELECT
            class.id, class.teacher_id, btrim(p_title), btrim(p_prompt), '글쓰기', '글쓰기',
            50, 1, 0, 0, 0, FALSE, '[]'::JSONB,
            jsonb_build_array('이웃 아지트', CASE WHEN p_activity_type = 'topic' THEN '같이 쓰는 주제' ELSE '글짝 교환' END),
            FALSE
        FROM public.classes class
        WHERE class.id = v_class_id AND class.deleted_at IS NULL
        RETURNING id INTO v_mission_id;

        IF v_mission_id IS NULL THEN
            RAISE EXCEPTION '참여 학급 글쓰기 과제를 만들 수 없습니다.' USING ERRCODE = '55000';
        END IF;
        INSERT INTO public.neighbor_activity_classes (activity_id, space_id, class_id, mission_id)
        VALUES (v_activity.id, p_space_id, v_class_id, v_mission_id);
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'activity_id', v_activity.id,
        'activity_type', v_activity.activity_type,
        'class_count', cardinality(v_class_ids)
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION '같은 종류의 진행 중인 활동을 먼저 마쳐 주세요.' USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION public.match_neighbor_exchange_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_class_ids UUID[];
    v_first UUID[];
    v_second UUID[];
    v_larger UUID[];
    v_smaller UUID[];
    v_larger_count INTEGER;
    v_smaller_count INTEGER;
    v_i INTEGER;
    v_left UUID;
    v_right UUID;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.host_class_id = p_actor_class_id
    ) AND public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '호스트 교사만 글짝을 정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT activity.* INTO v_activity
    FROM public.neighbor_activities activity
    WHERE activity.id = p_activity_id
      AND activity.space_id = p_space_id
      AND activity.activity_type = 'exchange'
    FOR UPDATE;
    IF v_activity.id IS NULL OR v_activity.status <> 'open' THEN
        RAISE EXCEPTION '지금 매칭할 수 있는 글짝 교환이 아닙니다.' USING ERRCODE = '55000';
    END IF;

    SELECT array_agg(link.class_id ORDER BY link.class_id) INTO v_class_ids
    FROM public.neighbor_activity_classes link
    WHERE link.activity_id = p_activity_id;
    IF cardinality(v_class_ids) <> 2 THEN
        RAISE EXCEPTION '글짝 교환 참여 학급 구성이 올바르지 않습니다.' USING ERRCODE = '55000';
    END IF;

    SELECT array_agg(post.student_id ORDER BY post.student_id) INTO v_first
    FROM public.neighbor_activity_classes link
    JOIN public.student_posts post
      ON post.mission_id = link.mission_id
     AND post.class_id = link.class_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND student.deleted_at IS NULL
    WHERE link.activity_id = p_activity_id AND link.class_id = v_class_ids[1];

    SELECT array_agg(post.student_id ORDER BY post.student_id) INTO v_second
    FROM public.neighbor_activity_classes link
    JOIN public.student_posts post
      ON post.mission_id = link.mission_id
     AND post.class_id = link.class_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
     AND student.auth_id IS NOT NULL
     AND student.is_active IS DISTINCT FROM FALSE
     AND student.deleted_at IS NULL
    WHERE link.activity_id = p_activity_id AND link.class_id = v_class_ids[2];

    IF COALESCE(cardinality(v_first), 0) = 0 OR COALESCE(cardinality(v_second), 0) = 0 THEN
        RAISE EXCEPTION '두 학급 모두 한 편 이상 제출한 뒤 글짝을 정해 주세요.' USING ERRCODE = '55000';
    END IF;
    IF cardinality(v_first) >= cardinality(v_second) THEN
        v_larger := v_first;
        v_smaller := v_second;
    ELSE
        v_larger := v_second;
        v_smaller := v_first;
    END IF;
    v_larger_count := cardinality(v_larger);
    v_smaller_count := cardinality(v_smaller);
    IF v_larger_count > v_smaller_count * 2 THEN
        RAISE EXCEPTION '현재 제출 인원 차이로는 한 학생당 최대 두 명 규칙을 지킬 수 없습니다.' USING ERRCODE = '55000';
    END IF;

    FOR v_i IN 1..v_larger_count LOOP
        v_left := v_larger[v_i];
        v_right := v_smaller[((v_i - 1) % v_smaller_count) + 1];
        INSERT INTO public.neighbor_exchange_matches (
            activity_id, space_id, student_id, class_id, partner_student_id, partner_class_id
        )
        SELECT p_activity_id, p_space_id, v_left, left_student.class_id, v_right, right_student.class_id
        FROM public.students left_student, public.students right_student
        WHERE left_student.id = v_left AND right_student.id = v_right;
        INSERT INTO public.neighbor_exchange_matches (
            activity_id, space_id, student_id, class_id, partner_student_id, partner_class_id
        )
        SELECT p_activity_id, p_space_id, v_right, right_student.class_id, v_left, left_student.class_id
        FROM public.students left_student, public.students right_student
        WHERE left_student.id = v_left AND right_student.id = v_right;
    END LOOP;

    INSERT INTO public.neighbor_shared_posts (
        space_id, class_id, post_id, student_id, public_author_name, activity_id
    )
    SELECT DISTINCT
        p_space_id, post.class_id, post.id, post.student_id,
        left(btrim(student.name), 30), p_activity_id
    FROM public.neighbor_activity_classes link
    JOIN public.student_posts post
      ON post.mission_id = link.mission_id
     AND post.class_id = link.class_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    JOIN public.students student ON student.id = post.student_id AND student.class_id = post.class_id
    JOIN public.neighbor_exchange_matches match
      ON match.activity_id = p_activity_id AND match.student_id = post.student_id
    WHERE link.activity_id = p_activity_id
    ON CONFLICT (space_id, post_id) DO UPDATE
    SET activity_id = EXCLUDED.activity_id,
        public_author_name = EXCLUDED.public_author_name,
        status = 'pending', requested_at = NOW(), reviewed_at = NULL,
        reviewed_by = NULL, review_note = '', published_at = NULL,
        hidden_at = NULL, hidden_by = NULL, hidden_by_class_id = NULL, hidden_reason = '';

    UPDATE public.neighbor_activities
    SET status = 'matched', matched_at = NOW()
    WHERE id = p_activity_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'activity_id', p_activity_id,
        'pair_count', v_larger_count,
        'matched_student_count', v_larger_count + v_smaller_count
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.close_neighbor_activity_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed INTEGER;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.host_class_id = p_actor_class_id
    ) AND public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '호스트 교사만 활동을 마칠 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.neighbor_activities
    SET status = 'closed', closed_at = NOW()
    WHERE id = p_activity_id AND space_id = p_space_id AND status <> 'closed';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF v_changed = 0 THEN
        RAISE EXCEPTION '마칠 수 있는 활동이 없습니다.' USING ERRCODE = '55000';
    END IF;
    UPDATE public.writing_missions mission
    SET is_archived = TRUE
    FROM public.neighbor_activity_classes link
    WHERE link.activity_id = p_activity_id AND mission.id = link.mission_id;
    RETURN jsonb_build_object('success', TRUE, 'activity_id', p_activity_id, 'status', 'closed');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_activities_v1(
    p_space_id UUID,
    p_actor_class_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(activity_row.item ORDER BY activity_row.created_at DESC, activity_row.id DESC), '[]'::JSONB)
    FROM (
        SELECT activity.id, activity.created_at,
            jsonb_build_object(
                'id', activity.id,
                'type', activity.activity_type,
                'title', activity.title,
                'prompt', activity.prompt,
                'status', activity.status,
                'created_at', activity.created_at,
                'matched_at', activity.matched_at,
                'closed_at', activity.closed_at,
                'mission_id', mine.mission_id,
                'pair_count', (
                    SELECT count(*)::INTEGER / 2
                    FROM public.neighbor_exchange_matches match
                    WHERE match.activity_id = activity.id
                ),
                'class_stats', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'class_id', link.class_id,
                        'class_name', membership.public_class_name,
                        'mission_id', link.mission_id,
                        'submitted_count', (
                            SELECT count(*)::INTEGER FROM public.student_posts post
                            WHERE post.class_id = link.class_id
                              AND post.mission_id = link.mission_id
                              AND post.is_submitted IS TRUE
                              AND post.recalled_at IS NULL
                        ),
                        'review_count', (
                            SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared
                            WHERE shared.activity_id = activity.id
                              AND shared.class_id = link.class_id
                              AND shared.status = 'pending'
                        ),
                        'published_count', (
                            SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared
                            WHERE shared.activity_id = activity.id
                              AND shared.class_id = link.class_id
                              AND shared.status = 'published'
                        )
                    ) ORDER BY link.class_id)
                    FROM public.neighbor_activity_classes link
                    JOIN public.neighbor_space_classes membership
                      ON membership.space_id = link.space_id
                     AND membership.class_id = link.class_id
                    WHERE link.activity_id = activity.id
                ), '[]'::JSONB)
            ) AS item
        FROM public.neighbor_activities activity
        LEFT JOIN public.neighbor_activity_classes mine
          ON mine.activity_id = activity.id AND mine.class_id = p_actor_class_id
        WHERE activity.space_id = p_space_id
        ORDER BY activity.created_at DESC, activity.id DESC
        LIMIT 20
    ) activity_row;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_student_activities_v1(
    p_space_id UUID,
    p_student_id UUID,
    p_class_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(activity_row.item ORDER BY activity_row.created_at DESC, activity_row.id DESC), '[]'::JSONB)
    FROM (
        SELECT activity.id, activity.created_at,
            jsonb_build_object(
                'id', activity.id,
                'type', activity.activity_type,
                'title', activity.title,
                'prompt', activity.prompt,
                'status', activity.status,
                'created_at', activity.created_at,
                'matched_at', activity.matched_at,
                'closed_at', activity.closed_at,
                'mission_id', link.mission_id,
                'my_post_id', post.id,
                'is_submitted', COALESCE(post.is_submitted, FALSE) AND post.recalled_at IS NULL,
                'shared_post_id', shared.id,
                'share_status', shared.status,
                'review_note', shared.review_note,
                'partner_names', COALESCE((
                    SELECT jsonb_agg(partner.name ORDER BY partner.name, partner.id)
                    FROM public.neighbor_exchange_matches match
                    JOIN public.students partner
                      ON partner.id = match.partner_student_id
                     AND partner.class_id = match.partner_class_id
                    WHERE match.activity_id = activity.id
                      AND match.student_id = p_student_id
                ), '[]'::JSONB),
                'published_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_shared_posts published
                    WHERE published.activity_id = activity.id
                      AND published.status = 'published'
                      AND (
                          activity.activity_type = 'topic'
                          OR published.student_id = p_student_id
                          OR EXISTS (
                              SELECT 1
                              FROM public.neighbor_exchange_matches match
                              WHERE match.activity_id = activity.id
                                AND match.student_id = p_student_id
                                AND match.partner_student_id = published.student_id
                          )
                      )
                )
            ) AS item
        FROM public.neighbor_activities activity
        JOIN public.neighbor_activity_classes link
          ON link.activity_id = activity.id
         AND link.space_id = activity.space_id
         AND link.class_id = p_class_id
        LEFT JOIN public.student_posts post
          ON post.mission_id = link.mission_id
         AND post.class_id = p_class_id
         AND post.student_id = p_student_id
        LEFT JOIN public.neighbor_shared_posts shared
          ON shared.activity_id = activity.id
         AND shared.post_id = post.id
         AND shared.student_id = p_student_id
        WHERE activity.space_id = p_space_id
        ORDER BY activity.created_at DESC, activity.id DESC
        LIMIT 20
    ) activity_row;
$$;

-- 공동 주제 글은 학생이 제출 후 공개 확인을 요청한다. 글짝 글은 매칭 시 자동으로 요청된다.
CREATE OR REPLACE FUNCTION public.request_neighbor_activity_post_v1(
    p_space_id UUID,
    p_activity_id UUID
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
    v_post_id UUID;
    v_student_name TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT post.id, left(btrim(student.name), 30)
    INTO v_post_id, v_student_name
    FROM public.neighbor_activities activity
    JOIN public.neighbor_activity_classes link
      ON link.activity_id = activity.id AND link.class_id = v_class_id
    JOIN public.student_posts post
      ON post.mission_id = link.mission_id
     AND post.class_id = link.class_id
     AND post.student_id = v_student_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    JOIN public.students student ON student.id = post.student_id AND student.class_id = post.class_id
    WHERE activity.id = p_activity_id
      AND activity.space_id = p_space_id
      AND activity.activity_type = 'topic'
      AND activity.status = 'open';
    IF v_post_id IS NULL THEN
        RAISE EXCEPTION '공동 주제 글을 먼저 제출해 주세요.' USING ERRCODE = '55000';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_shared_posts shared
        WHERE shared.space_id = p_space_id AND shared.post_id = v_post_id AND shared.status = 'hidden'
    ) THEN
        RAISE EXCEPTION '숨김 처리된 글은 교사 확인 전 다시 신청할 수 없습니다.' USING ERRCODE = '55000';
    END IF;

    INSERT INTO public.neighbor_shared_posts (
        space_id, class_id, post_id, student_id, public_author_name, activity_id
    ) VALUES (
        p_space_id, v_class_id, v_post_id, v_student_id, v_student_name, p_activity_id
    )
    ON CONFLICT (space_id, post_id) DO UPDATE
    SET activity_id = EXCLUDED.activity_id,
        public_author_name = EXCLUDED.public_author_name,
        status = CASE WHEN neighbor_shared_posts.status IN ('pending', 'published')
            THEN neighbor_shared_posts.status ELSE 'pending' END,
        requested_at = CASE WHEN neighbor_shared_posts.status IN ('pending', 'published')
            THEN neighbor_shared_posts.requested_at ELSE NOW() END,
        reviewed_at = CASE WHEN neighbor_shared_posts.status = 'published'
            THEN neighbor_shared_posts.reviewed_at ELSE NULL END,
        reviewed_by = CASE WHEN neighbor_shared_posts.status = 'published'
            THEN neighbor_shared_posts.reviewed_by ELSE NULL END,
        review_note = CASE WHEN neighbor_shared_posts.status = 'published'
            THEN neighbor_shared_posts.review_note ELSE '' END,
        published_at = CASE WHEN neighbor_shared_posts.status = 'published'
            THEN neighbor_shared_posts.published_at ELSE NULL END,
        hidden_at = NULL, hidden_by = NULL, hidden_by_class_id = NULL, hidden_reason = ''
    RETURNING * INTO v_shared;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, v_user_id, 'student', 'post_requested', 'post', v_shared.id
    );
    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', p_activity_id,
        'shared_post_id', v_shared.id, 'status', v_shared.status
    );
END;
$$;

-- 개인 글 전시와 활동 글을 섞어 잘못 신청하지 않도록 후보·신청 경계를 분리한다.
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
    v_student_name TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT left(btrim(student.name), 30) INTO v_student_name
    FROM public.student_posts post
    JOIN public.students student ON student.id = post.student_id AND student.class_id = post.class_id
    WHERE post.id = p_post_id
      AND post.student_id = v_student_id
      AND post.class_id = v_class_id
      AND post.is_submitted IS TRUE
      AND post.recalled_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
      );
    IF v_student_name IS NULL THEN
        RAISE EXCEPTION '전시할 수 있는 본인 제출 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.space_id = p_space_id AND shared.post_id = p_post_id
    FOR UPDATE;
    IF FOUND AND v_shared.status = 'hidden' THEN
        RAISE EXCEPTION '숨김 처리된 글은 교사 확인 전 다시 신청할 수 없습니다.' USING ERRCODE = '55000';
    ELSIF FOUND AND v_shared.status IN ('pending', 'published') THEN
        RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
    ELSIF FOUND THEN
        UPDATE public.neighbor_shared_posts
        SET activity_id = NULL, public_author_name = v_student_name, status = 'pending',
            requested_at = NOW(), reviewed_at = NULL, reviewed_by = NULL, review_note = '',
            published_at = NULL, hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_shared.id RETURNING * INTO v_shared;
    ELSE
        INSERT INTO public.neighbor_shared_posts (
            space_id, class_id, post_id, student_id, public_author_name, activity_id
        ) VALUES (p_space_id, v_class_id, p_post_id, v_student_id, v_student_name, NULL)
        RETURNING * INTO v_shared;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (p_space_id, v_class_id, v_user_id, 'student', 'post_requested', 'post', v_shared.id);
    RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_my_share_candidates_v1(
    p_space_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
    v_items JSONB := '[]'::JSONB;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    SELECT COALESCE(jsonb_agg(post_row.item ORDER BY post_row.updated_at DESC, post_row.post_id DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT post.id AS post_id, post.updated_at,
            jsonb_build_object(
                'post_id', post.id, 'title', post.title, 'updated_at', post.updated_at,
                'shared_post_id', shared.id, 'share_status', shared.status, 'review_note', shared.review_note
            ) AS item
        FROM public.student_posts post
        LEFT JOIN public.neighbor_shared_posts shared
          ON shared.space_id = p_space_id AND shared.post_id = post.id
         AND shared.class_id = post.class_id AND shared.student_id = post.student_id
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND post.is_submitted IS TRUE
          AND post.recalled_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
          )
        ORDER BY post.updated_at DESC, post.id DESC
        LIMIT v_limit
    ) post_row;
    RETURN jsonb_build_object('version', 1, 'max_rows', 50, 'items', v_items);
END;
$$;

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
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_activity_type TEXT;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    JOIN public.student_posts post
      ON post.id = shared.post_id
     AND post.class_id = shared.class_id
     AND post.student_id = shared.student_id
     AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    WHERE shared.id = p_shared_post_id
      AND shared.space_id = p_space_id
      AND shared.status = 'published';
    IF v_shared.id IS NULL THEN
        RAISE EXCEPTION '현재 공개 중인 이웃 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    SELECT activity.activity_type INTO v_activity_type
    FROM public.neighbor_activities activity
    WHERE activity.id = v_shared.activity_id AND activity.space_id = p_space_id;

    IF v_shared.activity_id IS NOT NULL AND v_activity_type = 'topic' AND NOT EXISTS (
        SELECT 1 FROM public.neighbor_activity_classes link
        WHERE link.activity_id = v_shared.activity_id AND link.class_id = v_class_id
    ) THEN
        RAISE EXCEPTION '참여 학급의 공동 주제 글이 아닙니다.' USING ERRCODE = '42501';
    ELSIF v_shared.activity_id IS NOT NULL AND v_activity_type = 'exchange'
      AND v_shared.student_id <> v_student_id
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_exchange_matches match
          WHERE match.activity_id = v_shared.activity_id
            AND match.student_id = v_student_id
            AND match.partner_student_id = v_shared.student_id
      ) THEN
        RAISE EXCEPTION '배정된 글짝의 글만 읽을 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT v_student_id, v_class_id, v_shared.student_id;
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
    v_activities JSONB := '[]'::JSONB;
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
      ON membership.space_id = space.id AND membership.status = 'active'
    WHERE space.id = p_space_id AND space.status = 'active'
    GROUP BY space.id, space.name;

    WITH candidates AS MATERIALIZED (
        SELECT shared.id, shared.published_at, shared.public_author_name,
            membership.public_class_name, post.title,
            left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180) AS excerpt,
            post.writing_context, post.self_writing_type,
            shared.student_id = v_student_id AS is_mine,
            (SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                WHERE comment.shared_post_id = shared.id AND comment.status = 'visible') AS comment_count,
            (SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                WHERE reaction.shared_post_id = shared.id) AS reaction_count,
            EXISTS (SELECT 1 FROM public.neighbor_reactions mine
                WHERE mine.shared_post_id = shared.id AND mine.student_id = v_student_id) AS my_reaction,
            EXISTS (SELECT 1 FROM public.neighbor_saves saved
                WHERE saved.shared_post_id = shared.id AND saved.student_id = v_student_id) AS my_saved
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id
         AND membership.class_id = shared.class_id AND membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id AND post.is_submitted IS TRUE
         AND post.recalled_at IS NULL
        WHERE shared.space_id = p_space_id
          AND shared.activity_id IS NULL
          AND shared.status = 'published'
          AND (p_cursor_at IS NULL OR (shared.published_at, shared.id) < (p_cursor_at, p_cursor_id))
        ORDER BY shared.published_at DESC, shared.id DESC
        LIMIT v_limit + 1
    ), page AS (
        SELECT * FROM candidates ORDER BY published_at DESC, id DESC LIMIT v_limit
    ), serialized AS (
        SELECT page.published_at, page.id, jsonb_build_object(
            'shared_post_id', page.id, 'title', page.title, 'excerpt', page.excerpt,
            'author_name', page.public_author_name, 'class_name', page.public_class_name,
            'published_at', page.published_at, 'writing_context', page.writing_context,
            'self_writing_type', page.self_writing_type, 'is_mine', page.is_mine,
            'comment_count', page.comment_count, 'reaction_count', page.reaction_count,
            'my_reaction', page.my_reaction, 'my_saved', page.my_saved
        ) AS item FROM page
    )
    SELECT COALESCE(jsonb_agg(serialized.item ORDER BY serialized.published_at DESC, serialized.id DESC), '[]'::JSONB),
        (SELECT count(*) > v_limit FROM candidates),
        (SELECT page.published_at FROM page ORDER BY page.published_at, page.id LIMIT 1),
        (SELECT page.id FROM page ORDER BY page.published_at, page.id LIMIT 1)
    INTO v_items, v_has_more, v_next_at, v_next_id FROM serialized;

    v_activities := public.get_neighbor_student_activities_v1(p_space_id, v_student_id, v_class_id);
    INSERT INTO public.neighbor_feed_visits (space_id, class_id, student_id, last_seen_at)
    VALUES (p_space_id, v_class_id, v_student_id, NOW())
    ON CONFLICT (space_id, student_id) DO UPDATE
    SET class_id = EXCLUDED.class_id, last_seen_at = EXCLUDED.last_seen_at;

    RETURN jsonb_build_object(
        'version', 1,
        'space', jsonb_build_object('id', p_space_id, 'name', v_space_name,
            'active_class_count', COALESCE(v_active_class_count, 0)),
        'activities', v_activities,
        'items', COALESCE(v_items, '[]'::JSONB),
        'has_more', COALESCE(v_has_more, FALSE),
        'next_cursor_at', CASE WHEN v_has_more THEN v_next_at ELSE NULL END,
        'next_cursor_id', CASE WHEN v_has_more THEN v_next_id ELSE NULL END,
        'max_rows', 50
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_activity_feed_v1(
    p_space_id UUID,
    p_activity_id UUID,
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
    v_activity public.neighbor_activities%ROWTYPE;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_items JSONB := '[]'::JSONB;
    v_has_more BOOLEAN := FALSE;
    v_next_at TIMESTAMPTZ;
    v_next_id UUID;
BEGIN
    IF (p_cursor_at IS NULL) IS DISTINCT FROM (p_cursor_id IS NULL) THEN
        RAISE EXCEPTION '페이지 커서는 시각과 글 ID를 함께 보내야 합니다.' USING ERRCODE = '22023';
    END IF;
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    SELECT activity.* INTO v_activity FROM public.neighbor_activities activity
    JOIN public.neighbor_activity_classes link
      ON link.activity_id = activity.id AND link.class_id = v_class_id
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id;
    IF v_activity.id IS NULL THEN
        RAISE EXCEPTION '참여 중인 이웃 활동이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    WITH candidates AS MATERIALIZED (
        SELECT shared.id, shared.published_at, shared.public_author_name,
            membership.public_class_name, post.title,
            left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180) AS excerpt,
            post.writing_context, post.self_writing_type,
            shared.student_id = v_student_id AS is_mine,
            (SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                WHERE comment.shared_post_id = shared.id AND comment.status = 'visible') AS comment_count,
            (SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                WHERE reaction.shared_post_id = shared.id) AS reaction_count,
            EXISTS (SELECT 1 FROM public.neighbor_reactions mine
                WHERE mine.shared_post_id = shared.id AND mine.student_id = v_student_id) AS my_reaction,
            EXISTS (SELECT 1 FROM public.neighbor_saves saved
                WHERE saved.shared_post_id = shared.id AND saved.student_id = v_student_id) AS my_saved
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
         AND membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id AND post.is_submitted IS TRUE
         AND post.recalled_at IS NULL
        WHERE shared.space_id = p_space_id
          AND shared.activity_id = p_activity_id
          AND shared.status = 'published'
          AND (
              v_activity.activity_type = 'topic'
              OR shared.student_id = v_student_id
              OR EXISTS (
                  SELECT 1 FROM public.neighbor_exchange_matches match
                  WHERE match.activity_id = p_activity_id
                    AND match.student_id = v_student_id
                    AND match.partner_student_id = shared.student_id
              )
          )
          AND (p_cursor_at IS NULL OR (shared.published_at, shared.id) < (p_cursor_at, p_cursor_id))
        ORDER BY shared.published_at DESC, shared.id DESC
        LIMIT v_limit + 1
    ), page AS (
        SELECT * FROM candidates ORDER BY published_at DESC, id DESC LIMIT v_limit
    ), serialized AS (
        SELECT page.published_at, page.id, jsonb_build_object(
            'shared_post_id', page.id, 'activity_id', p_activity_id,
            'title', page.title, 'excerpt', page.excerpt,
            'author_name', page.public_author_name, 'class_name', page.public_class_name,
            'published_at', page.published_at, 'writing_context', page.writing_context,
            'self_writing_type', page.self_writing_type, 'is_mine', page.is_mine,
            'comment_count', page.comment_count, 'reaction_count', page.reaction_count,
            'my_reaction', page.my_reaction, 'my_saved', page.my_saved
        ) AS item FROM page
    )
    SELECT COALESCE(jsonb_agg(serialized.item ORDER BY serialized.published_at DESC, serialized.id DESC), '[]'::JSONB),
        (SELECT count(*) > v_limit FROM candidates),
        (SELECT page.published_at FROM page ORDER BY page.published_at, page.id LIMIT 1),
        (SELECT page.id FROM page ORDER BY page.published_at, page.id LIMIT 1)
    INTO v_items, v_has_more, v_next_at, v_next_id FROM serialized;

    RETURN jsonb_build_object(
        'version', 1,
        'activity', jsonb_build_object('id', v_activity.id, 'type', v_activity.activity_type,
            'title', v_activity.title, 'prompt', v_activity.prompt, 'status', v_activity.status),
        'items', v_items, 'has_more', COALESCE(v_has_more, FALSE),
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
        'version', 1, 'shared_post_id', shared.id, 'activity_id', shared.activity_id,
        'title', post.title, 'content', post.content, 'structured_content', post.structured_content,
        'writing_context', post.writing_context, 'self_writing_type', post.self_writing_type,
        'author_name', shared.public_author_name, 'class_name', membership.public_class_name,
        'published_at', shared.published_at, 'is_mine', shared.student_id = v_student_id
    ) INTO v_result
    FROM public.neighbor_shared_posts shared
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
     AND membership.status = 'active'
    JOIN public.student_posts post
      ON post.id = shared.post_id AND post.class_id = shared.class_id
     AND post.student_id = shared.student_id AND post.is_submitted IS TRUE
     AND post.recalled_at IS NULL
    WHERE shared.id = p_shared_post_id AND shared.space_id = p_space_id AND shared.status = 'published';
    IF v_result IS NULL THEN
        RAISE EXCEPTION '현재 공개 중인 이웃 글을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*)::INTEGER INTO v_comment_count
    FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible';

    SELECT COALESCE(jsonb_agg(comment_row.item ORDER BY comment_row.created_at, comment_row.id), '[]'::JSONB)
    INTO v_comments
    FROM (
        SELECT comment.created_at, comment.id,
            jsonb_build_object(
                'comment_id', comment.id, 'content', comment.content,
                'author_name', left(btrim(comment_student.name), 30),
                'class_name', membership.public_class_name,
                'created_at', comment.created_at, 'updated_at', comment.updated_at,
                'is_mine', comment.student_id = v_student_id
            ) AS item
        FROM public.neighbor_comments comment
        JOIN public.students comment_student
          ON comment_student.id = comment.student_id AND comment_student.class_id = comment.class_id
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = comment.space_id AND membership.class_id = comment.class_id
         AND membership.status = 'active'
        WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible'
        ORDER BY comment.created_at DESC, comment.id DESC LIMIT 100
    ) comment_row;

    SELECT count(*)::INTEGER INTO v_reaction_count
    FROM public.neighbor_reactions reaction WHERE reaction.shared_post_id = p_shared_post_id;
    SELECT EXISTS (SELECT 1 FROM public.neighbor_reactions reaction
        WHERE reaction.shared_post_id = p_shared_post_id AND reaction.student_id = v_student_id),
        EXISTS (SELECT 1 FROM public.neighbor_saves saved
        WHERE saved.shared_post_id = p_shared_post_id AND saved.student_id = v_student_id)
    INTO v_my_reaction, v_my_saved;

    RETURN v_result || jsonb_build_object(
        'comments', v_comments, 'comment_count', v_comment_count,
        'comments_truncated', v_comment_count > 100, 'reaction_count', v_reaction_count,
        'my_reaction', v_my_reaction, 'my_saved', v_my_saved
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
    v_student_name TEXT;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_comment public.neighbor_comments%ROWTYPE;
    v_public_class_name TEXT;
    v_comment_count INTEGER;
BEGIN
    IF p_action NOT IN ('save', 'delete') THEN
        RAISE EXCEPTION '댓글 작업이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'save' AND (char_length(v_content) NOT BETWEEN 1 AND 300 OR v_content ~ E'[\r\n]') THEN
        RAISE EXCEPTION '댓글은 줄바꿈 없이 1~300자로 작성해 주세요.' USING ERRCODE = '22023';
    END IF;
    SELECT access.requester_student_id, access.requester_class_id, access.owner_student_id
    INTO v_student_id, v_class_id, v_owner_student_id
    FROM public.assert_neighbor_student_post_access_v1(p_space_id, p_shared_post_id) access;
    SELECT left(btrim(student.name), 30) INTO v_student_name
    FROM public.students student WHERE student.id = v_student_id AND student.class_id = v_class_id;

    SELECT comment.* INTO v_comment FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.student_id = v_student_id FOR UPDATE;
    IF p_action = 'delete' THEN
        IF v_comment.id IS NULL OR v_comment.status <> 'visible' THEN
            RAISE EXCEPTION '삭제할 내 댓글이 없습니다.' USING ERRCODE = '55000';
        END IF;
        UPDATE public.neighbor_comments
        SET content = '', status = 'deleted', hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_comment.id RETURNING * INTO v_comment;
    ELSIF v_comment.id IS NULL THEN
        INSERT INTO public.neighbor_comments (shared_post_id, space_id, class_id, student_id, content)
        VALUES (p_shared_post_id, p_space_id, v_class_id, v_student_id, v_content)
        RETURNING * INTO v_comment;
    ELSE
        IF v_comment.status = 'hidden' THEN
            RAISE EXCEPTION '선생님이 숨긴 댓글은 직접 다시 공개할 수 없습니다.' USING ERRCODE = '42501';
        END IF;
        UPDATE public.neighbor_comments
        SET content = v_content, status = 'visible', hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_comment.id RETURNING * INTO v_comment;
    END IF;

    SELECT membership.public_class_name INTO v_public_class_name
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.class_id = v_class_id
      AND membership.status = 'active';
    SELECT count(*)::INTEGER INTO v_comment_count FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible';
    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (p_space_id, v_class_id, v_user_id, 'student', 'comment_changed', 'comment', v_comment.id);

    RETURN jsonb_build_object(
        'success', TRUE, 'status', v_comment.status, 'comment_id', v_comment.id,
        'comment_count', v_comment_count,
        'comment', CASE WHEN v_comment.status = 'visible' THEN jsonb_build_object(
            'comment_id', v_comment.id, 'content', v_comment.content,
            'author_name', v_student_name, 'class_name', v_public_class_name,
            'created_at', v_comment.created_at, 'updated_at', v_comment.updated_at, 'is_mine', TRUE
        ) ELSE NULL END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_post_detail_v1(
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
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_result JSONB;
    v_comments JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT shared.* INTO v_shared FROM public.neighbor_shared_posts shared
    WHERE shared.id = p_shared_post_id AND shared.space_id = p_space_id
      AND shared.status IN ('published', 'hidden');
    IF v_shared.id IS NULL THEN
        RAISE EXCEPTION '확인할 수 있는 이웃 글이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_build_object(
        'version', 1, 'shared_post_id', shared.id, 'activity_id', shared.activity_id,
        'title', post.title, 'content', post.content, 'author_name', shared.public_author_name,
        'class_name', membership.public_class_name, 'status', shared.status,
        'is_own_class', shared.class_id = p_actor_class_id, 'published_at', shared.published_at
    ) INTO v_result
    FROM public.neighbor_shared_posts shared
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
    JOIN public.student_posts post
      ON post.id = shared.post_id AND post.class_id = shared.class_id AND post.student_id = shared.student_id
    WHERE shared.id = p_shared_post_id;

    SELECT COALESCE(jsonb_agg(comment_row.item ORDER BY comment_row.created_at, comment_row.comment_id), '[]'::JSONB)
    INTO v_comments
    FROM (
        SELECT comment.id AS comment_id, comment.created_at,
            jsonb_build_object(
                'comment_id', comment.id, 'content', comment.content, 'status', comment.status,
                'author_name', left(btrim(comment_student.name), 30),
                'class_name', membership.public_class_name,
                'is_own_class', comment.class_id = p_actor_class_id,
                'created_at', comment.created_at
            ) AS item
        FROM public.neighbor_comments comment
        JOIN public.students comment_student
          ON comment_student.id = comment.student_id AND comment_student.class_id = comment.class_id
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = comment.space_id AND membership.class_id = comment.class_id
        WHERE comment.shared_post_id = p_shared_post_id
          AND (comment.status = 'visible' OR (comment.status = 'hidden' AND comment.class_id = p_actor_class_id))
        ORDER BY comment.created_at, comment.id LIMIT 100
    ) comment_row;
    RETURN v_result || jsonb_build_object('comments', v_comments);
END;
$$;

-- 제한 공개용 기존 작업공간 응답을 보존하면서 활동 요약만 같은 왕복에 합친다.
DO $$
BEGIN
    IF to_regprocedure('public.get_neighbor_teacher_workspace_core_20261237(uuid)') IS NULL THEN
        ALTER FUNCTION public.get_neighbor_teacher_workspace_v1(UUID)
            RENAME TO get_neighbor_teacher_workspace_core_20261237;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_teacher_workspace_core_20261237(UUID)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_workspace_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_space_id UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    v_base := public.get_neighbor_teacher_workspace_core_20261237(p_class_id);
    v_space_id := NULLIF(v_base #>> '{space,id}', '')::UUID;
    RETURN v_base || jsonb_build_object(
        'activities', CASE WHEN v_space_id IS NULL THEN '[]'::JSONB
            ELSE public.get_neighbor_teacher_activities_v1(v_space_id, p_class_id) END
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.run_neighbor_teacher_action_v1(
    p_class_id UUID,
    p_action TEXT,
    p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_space_id UUID := NULLIF(p_payload->>'space_id', '')::UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    IF p_action = 'create_space' THEN
        v_result := public.create_neighbor_space_v1(
            p_class_id, p_payload->>'name', p_payload->>'public_class_name',
            COALESCE(p_payload->>'description', '')
        );
    ELSIF p_action = 'join_space' THEN
        v_result := public.request_neighbor_join_v1(
            p_payload->>'invite_key', p_class_id, p_payload->>'public_class_name'
        );
    ELSIF p_action = 'create_invite' THEN
        v_result := public.create_neighbor_invite_v1(v_space_id);
    ELSIF p_action = 'review_join' THEN
        v_result := public.review_neighbor_join_v1(
            v_space_id, NULLIF(p_payload->>'target_class_id', '')::UUID,
            COALESCE((p_payload->>'approve')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'set_access' THEN
        v_result := public.set_neighbor_class_access_v1(
            v_space_id, p_class_id, COALESCE((p_payload->>'enabled')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'review_post' THEN
        v_result := public.review_neighbor_shared_post_v1(
            v_space_id, NULLIF(p_payload->>'shared_post_id', '')::UUID,
            p_payload->>'decision', COALESCE(p_payload->>'review_note', '')
        );
    ELSIF p_action = 'create_activity' THEN
        v_result := public.create_neighbor_activity_v1(
            v_space_id, p_class_id, p_payload->>'type', p_payload->>'title', p_payload->>'prompt',
            CASE WHEN jsonb_typeof(p_payload->'exchange_class_ids') = 'array' THEN
                ARRAY(SELECT jsonb_array_elements_text(p_payload->'exchange_class_ids')::UUID)
            ELSE NULL END
        );
    ELSIF p_action = 'match_exchange' THEN
        v_result := public.match_neighbor_exchange_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'activity_id', '')::UUID
        );
    ELSIF p_action = 'close_activity' THEN
        v_result := public.close_neighbor_activity_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'activity_id', '')::UUID
        );
    ELSIF p_action IN ('hide_post', 'restore_post', 'hide_comment', 'restore_comment') THEN
        v_result := public.moderate_neighbor_item_v1(
            v_space_id, p_class_id,
            CASE WHEN p_action LIKE '%post' THEN 'post' ELSE 'comment' END,
            NULLIF(p_payload->>'item_id', '')::UUID,
            CASE WHEN p_action LIKE 'hide%' THEN 'hide' ELSE 'restore' END,
            COALESCE(p_payload->>'reason', '')
        );
    ELSIF p_action = 'leave_space' THEN
        v_result := public.leave_neighbor_space_v1(v_space_id, p_class_id);
    ELSIF p_action = 'transfer_host' THEN
        v_result := public.transfer_neighbor_host_v1(
            v_space_id, NULLIF(p_payload->>'target_class_id', '')::UUID
        );
    ELSIF p_action = 'close_space' THEN
        v_result := public.close_neighbor_space_v1(v_space_id);
    ELSE
        RAISE EXCEPTION '지원하지 않는 이웃 아지트 교사 동작입니다.' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE, 'action_result', v_result,
        'workspace', public.get_neighbor_teacher_workspace_v1(p_class_id)
    );
END;
$$;

-- 관리자 미리보기도 학생·교사 화면과 같은 등록 이름을 쓴다.
DO $$
BEGIN
    IF to_regprocedure('public.get_neighbor_admin_dashboard_core_20261237(uuid)') IS NULL THEN
        ALTER FUNCTION public.get_neighbor_admin_dashboard_v1(UUID)
            RENAME TO get_neighbor_admin_dashboard_core_20261237;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_admin_dashboard_core_20261237(UUID)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_neighbor_admin_dashboard_v1(p_space_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_preview JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_admin_v1();
    v_base := public.get_neighbor_admin_dashboard_core_20261237(p_space_id);
    SELECT COALESCE(jsonb_agg(feed.item || jsonb_build_object(
        'author_name', left(btrim(student.name), 30)
    ) ORDER BY feed.ordinality), '[]'::JSONB)
    INTO v_preview
    FROM jsonb_array_elements(COALESCE(v_base->'preview_feed', '[]'::JSONB)) WITH ORDINALITY AS feed(item, ordinality)
    JOIN public.neighbor_shared_posts shared ON shared.id = (feed.item->>'shared_post_id')::UUID
    JOIN public.students student ON student.id = shared.student_id AND student.class_id = shared.class_id;
    RETURN jsonb_set(v_base, '{preview_feed}', v_preview, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.create_neighbor_activity_v1(UUID, UUID, TEXT, TEXT, TEXT, UUID[])
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.match_neighbor_exchange_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_neighbor_activity_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_activities_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_student_activities_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_neighbor_activity_post_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.request_neighbor_post_share_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_my_share_candidates_v1(UUID, INTEGER)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.assert_neighbor_student_post_access_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_space_feed_v1(UUID, INTEGER, TIMESTAMPTZ, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_activity_feed_v1(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_shared_post_v1(UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_neighbor_comment_v1(UUID, UUID, TEXT, TEXT)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_post_detail_v1(UUID, UUID, UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_workspace_v1(UUID)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_admin_dashboard_v1(UUID)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.request_neighbor_activity_post_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_neighbor_post_share_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_my_share_candidates_v1(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_space_feed_v1(UUID, INTEGER, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_activity_feed_v1(UUID, UUID, INTEGER, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_shared_post_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_neighbor_comment_v1(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_post_detail_v1(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_workspace_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_neighbor_teacher_action_v1(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_admin_dashboard_v1(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
