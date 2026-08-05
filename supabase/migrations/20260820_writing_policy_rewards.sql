-- ============================================================================
-- 글 유형별 분량·보상 정책 + 독서록 최초 완료 원자 보상
--
-- 과제의 교사 승인 흐름은 그대로 둔다. 자율 글쓰기는 완료 저장 RPC 안에서
-- 분량 검증·글 저장·보상 원장 기록·포인트 지급을 한 트랜잭션으로 처리한다.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.writing_types (
    id TEXT PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_]{1,49}$'),
    label TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
    completion_flow TEXT NOT NULL CHECK (completion_flow IN ('teacher_approval', 'student_complete')),
    default_policy JSONB NOT NULL DEFAULT '{}'::JSONB,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.writing_types (id, label, completion_flow, default_policy)
VALUES (
    'reading_log',
    '독서록',
    'student_complete',
    '{"min_chars":100,"min_paragraphs":1,"base_reward":50,"bonus_enabled":false,"bonus_threshold":0,"bonus_reward":0,"daily_reward_limit":3}'::JSONB
)
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    completion_flow = EXCLUDED.completion_flow,
    default_policy = EXCLUDED.default_policy,
    is_active = true;

-- 자율 글 유형을 새로 추가할 때 student_posts 제약을 매번 고치지 않는다.
ALTER TABLE public.student_posts
    DROP CONSTRAINT IF EXISTS student_posts_source_shape_check,
    DROP CONSTRAINT IF EXISTS student_posts_self_writing_type_check,
    DROP CONSTRAINT IF EXISTS student_posts_self_writing_type_fkey;

ALTER TABLE public.student_posts
    ADD CONSTRAINT student_posts_self_writing_type_fkey
        FOREIGN KEY (self_writing_type) REFERENCES public.writing_types(id),
    ADD CONSTRAINT student_posts_source_shape_check
        CHECK (
            (writing_context = 'assignment'
                AND mission_id IS NOT NULL
                AND self_writing_type IS NULL
                AND visibility = 'class')
            OR
            (writing_context = 'self'
                AND mission_id IS NULL
                AND self_writing_type IS NOT NULL)
        );

CREATE TABLE IF NOT EXISTS public.class_writing_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    writing_type TEXT NOT NULL REFERENCES public.writing_types(id),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    min_chars INTEGER NOT NULL DEFAULT 0 CHECK (min_chars BETWEEN 0 AND 20000),
    min_paragraphs INTEGER NOT NULL DEFAULT 0 CHECK (min_paragraphs BETWEEN 0 AND 100),
    base_reward INTEGER NOT NULL DEFAULT 0 CHECK (base_reward BETWEEN 0 AND 10000),
    bonus_enabled BOOLEAN NOT NULL DEFAULT false,
    bonus_threshold INTEGER NOT NULL DEFAULT 0 CHECK (bonus_threshold BETWEEN 0 AND 20000),
    bonus_reward INTEGER NOT NULL DEFAULT 0 CHECK (bonus_reward BETWEEN 0 AND 10000),
    daily_reward_limit INTEGER NOT NULL DEFAULT 3 CHECK (daily_reward_limit BETWEEN 1 AND 20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (class_id, writing_type)
);

CREATE INDEX IF NOT EXISTS idx_class_writing_policies_class_type
    ON public.class_writing_policies (class_id, writing_type);

INSERT INTO public.class_writing_policies (
    class_id, writing_type, min_chars, min_paragraphs, base_reward,
    bonus_enabled, bonus_threshold, bonus_reward, daily_reward_limit
)
SELECT c.id, 'reading_log', 100, 1, 50, false, 0, 0, 3
FROM public.classes c
ON CONFLICT (class_id, writing_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_writing_policy_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_class_writing_policy_updated_at ON public.class_writing_policies;
CREATE TRIGGER trg_class_writing_policy_updated_at
BEFORE UPDATE ON public.class_writing_policies
FOR EACH ROW EXECUTE FUNCTION public.set_writing_policy_updated_at();

CREATE OR REPLACE FUNCTION public.seed_class_writing_policies()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.class_writing_policies (
        class_id, writing_type, min_chars, min_paragraphs, base_reward,
        bonus_enabled, bonus_threshold, bonus_reward, daily_reward_limit
    )
    SELECT
        NEW.id,
        wt.id,
        COALESCE((wt.default_policy ->> 'min_chars')::INTEGER, 0),
        COALESCE((wt.default_policy ->> 'min_paragraphs')::INTEGER, 0),
        COALESCE((wt.default_policy ->> 'base_reward')::INTEGER, 0),
        COALESCE((wt.default_policy ->> 'bonus_enabled')::BOOLEAN, false),
        COALESCE((wt.default_policy ->> 'bonus_threshold')::INTEGER, 0),
        COALESCE((wt.default_policy ->> 'bonus_reward')::INTEGER, 0),
        GREATEST(1, COALESCE((wt.default_policy ->> 'daily_reward_limit')::INTEGER, 3))
    FROM public.writing_types wt
    WHERE wt.is_active = true
    ON CONFLICT (class_id, writing_type) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_class_writing_policies ON public.classes;
CREATE TRIGGER trg_seed_class_writing_policies
AFTER INSERT ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.seed_class_writing_policies();

CREATE TABLE IF NOT EXISTS public.writing_reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    writing_type TEXT NOT NULL REFERENCES public.writing_types(id),
    source_key TEXT NOT NULL CHECK (char_length(source_key) BETWEEN 1 AND 200),
    source_post_id UUID REFERENCES public.student_posts(id) ON DELETE SET NULL,
    reward_kind TEXT NOT NULL DEFAULT 'completion' CHECK (reward_kind IN ('completion', 'bonus')),
    awarded_points INTEGER NOT NULL DEFAULT 0 CHECK (awarded_points BETWEEN 0 AND 20000),
    reward_status TEXT NOT NULL CHECK (reward_status IN ('awarded', 'daily_limit', 'no_reward', 'policy_disabled')),
    policy_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, writing_type, source_key, reward_kind)
);

CREATE INDEX IF NOT EXISTS idx_writing_reward_claims_class_created
    ON public.writing_reward_claims (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_writing_reward_claims_student_type_created
    ON public.writing_reward_claims (student_id, writing_type, created_at DESC);

ALTER TABLE public.writing_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_writing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_reward_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Writing_Types_Select" ON public.writing_types;
CREATE POLICY "Writing_Types_Select" ON public.writing_types
FOR SELECT TO authenticated USING (is_active = true OR public.auth_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Class_Writing_Policies_Select" ON public.class_writing_policies;
CREATE POLICY "Class_Writing_Policies_Select" ON public.class_writing_policies
FOR SELECT TO authenticated USING (
    public.auth_user_role() = 'ADMIN'
    OR class_id = public.auth_user_class_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_writing_policies.class_id AND c.teacher_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Class_Writing_Policies_Insert" ON public.class_writing_policies;
CREATE POLICY "Class_Writing_Policies_Insert" ON public.class_writing_policies
FOR INSERT TO authenticated WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_writing_policies.class_id AND c.teacher_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Class_Writing_Policies_Update" ON public.class_writing_policies;
CREATE POLICY "Class_Writing_Policies_Update" ON public.class_writing_policies
FOR UPDATE TO authenticated USING (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_writing_policies.class_id AND c.teacher_id = auth.uid()
    )
) WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_writing_policies.class_id AND c.teacher_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Class_Writing_Policies_Delete" ON public.class_writing_policies;
CREATE POLICY "Class_Writing_Policies_Delete" ON public.class_writing_policies
FOR DELETE TO authenticated USING (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = class_writing_policies.class_id AND c.teacher_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Writing_Reward_Claims_Select" ON public.writing_reward_claims;
CREATE POLICY "Writing_Reward_Claims_Select" ON public.writing_reward_claims
FOR SELECT TO authenticated USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = writing_reward_claims.class_id AND c.teacher_id = auth.uid()
    )
);

REVOKE ALL ON TABLE public.writing_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.class_writing_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.writing_reward_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.writing_types TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.class_writing_policies TO authenticated;
GRANT SELECT ON TABLE public.writing_reward_claims TO authenticated;
GRANT ALL ON TABLE public.writing_types, public.class_writing_policies, public.writing_reward_claims TO service_role;

CREATE OR REPLACE FUNCTION public.writing_content_char_count(p_content TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
    SELECT char_length(
        replace(replace(replace(replace(replace(
            COALESCE(p_content, ''), U&'\200B', ''), U&'\200C', ''),
            U&'\200D', ''), U&'\2060', ''), U&'\FEFF', '')
    )::INTEGER;
$$;

CREATE OR REPLACE FUNCTION public.writing_content_paragraph_count(p_content TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
    SELECT count(*)::INTEGER
    FROM regexp_split_to_table(COALESCE(p_content, ''), E'\n+') AS paragraph(value)
    WHERE btrim(value) <> '';
$$;

-- 기존의 검증 없는 저장 구현은 내부 저장 함수로 보존하고 학생 직접 실행을 막는다.
DO $$
BEGIN
    IF to_regprocedure('public.upsert_my_reading_log_storage(uuid,jsonb,text,text,text,text)') IS NULL THEN
        ALTER FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
            RENAME TO upsert_my_reading_log_storage;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_reading_log_storage(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_my_reading_log(
    p_post_id UUID,
    p_book JSONB,
    p_title TEXT,
    p_content TEXT,
    p_visibility TEXT DEFAULT 'private',
    p_reading_status TEXT DEFAULT 'completed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_min_chars INTEGER := 100;
    v_min_paragraphs INTEGER := 1;
    v_base_reward INTEGER := 50;
    v_bonus_enabled BOOLEAN := false;
    v_bonus_threshold INTEGER := 0;
    v_bonus_reward INTEGER := 0;
    v_daily_limit INTEGER := 3;
    v_policy_enabled BOOLEAN := true;
    v_daily_awarded INTEGER := 0;
    v_points_to_award INTEGER := 0;
    v_total_points INTEGER := 0;
    v_reward_status TEXT := 'no_reward';
    v_result JSONB;
    v_post_id UUID;
    v_library_item_id UUID;
    v_claim_id UUID;
    v_policy_snapshot JSONB;
    v_is_new_completion BOOLEAN := p_post_id IS NULL;
BEGIN
    v_student_id := public.auth_student_id();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    -- 같은 학생의 동시 완료를 직렬화해 일일 상한과 포인트 합계를 안전하게 계산한다.
    SELECT s.class_id, COALESCE(s.total_points, 0)
    INTO v_class_id, v_total_points
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.auth_id = auth.uid()
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    FOR UPDATE;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT
        p.is_enabled, p.min_chars, p.min_paragraphs, p.base_reward,
        p.bonus_enabled, p.bonus_threshold, p.bonus_reward, p.daily_reward_limit
    INTO
        v_policy_enabled, v_min_chars, v_min_paragraphs, v_base_reward,
        v_bonus_enabled, v_bonus_threshold, v_bonus_reward, v_daily_limit
    FROM public.class_writing_policies p
    WHERE p.class_id = v_class_id
      AND p.writing_type = 'reading_log';

    -- 과거/비정상 학급에 정책 행이 없어도 안전한 기본값으로 동작한다.
    v_policy_enabled := COALESCE(v_policy_enabled, true);
    v_min_chars := COALESCE(v_min_chars, 100);
    v_min_paragraphs := COALESCE(v_min_paragraphs, 1);
    v_base_reward := COALESCE(v_base_reward, 50);
    v_bonus_enabled := COALESCE(v_bonus_enabled, false);
    v_bonus_threshold := COALESCE(v_bonus_threshold, 0);
    v_bonus_reward := COALESCE(v_bonus_reward, 0);
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 3));

    v_char_count := public.writing_content_char_count(p_content);
    v_paragraph_count := public.writing_content_paragraph_count(p_content);

    IF v_policy_enabled AND v_char_count < v_min_chars THEN
        RAISE EXCEPTION '독서록을 작성 완료하려면 최소 %자 이상 써야 해요. (현재 %자)', v_min_chars, v_char_count
            USING ERRCODE = 'P0001';
    END IF;
    IF v_policy_enabled AND v_paragraph_count < v_min_paragraphs THEN
        RAISE EXCEPTION '독서록을 작성 완료하려면 최소 %문단 이상 써야 해요. (현재 %문단)', v_min_paragraphs, v_paragraph_count
            USING ERRCODE = 'P0001';
    END IF;

    IF p_post_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.student_posts p
        WHERE p.id = p_post_id
          AND p.student_id = v_student_id
          AND p.class_id = v_class_id
          AND p.writing_context = 'self'
          AND p.self_writing_type = 'reading_log'
    ) THEN
        RAISE EXCEPTION '수정할 내 독서록을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_result := public.upsert_my_reading_log_storage(
        p_post_id, p_book, p_title, p_content, p_visibility, p_reading_status
    );
    v_post_id := (v_result ->> 'post_id')::UUID;
    v_library_item_id := (v_result ->> 'library_item_id')::UUID;

    v_policy_snapshot := jsonb_build_object(
        'min_chars', v_min_chars,
        'min_paragraphs', v_min_paragraphs,
        'base_reward', v_base_reward,
        'bonus_enabled', v_bonus_enabled,
        'bonus_threshold', v_bonus_threshold,
        'bonus_reward', v_bonus_reward,
        'daily_reward_limit', v_daily_limit
    );

    UPDATE public.student_posts
    SET char_count = v_char_count,
        paragraph_count = v_paragraph_count,
        awarded_base_reward = v_base_reward,
        awarded_bonus_threshold = CASE WHEN v_bonus_enabled THEN v_bonus_threshold ELSE 0 END,
        awarded_bonus_reward = CASE WHEN v_bonus_enabled THEN v_bonus_reward ELSE 0 END
    WHERE id = v_post_id
      AND student_id = v_student_id;

    IF v_is_new_completion THEN
        IF NOT v_policy_enabled THEN
            v_reward_status := 'policy_disabled';
        ELSE
            SELECT count(*)::INTEGER
            INTO v_daily_awarded
            FROM public.writing_reward_claims claim
            WHERE claim.student_id = v_student_id
              AND claim.writing_type = 'reading_log'
              AND claim.reward_kind = 'completion'
              AND claim.awarded_points > 0
              AND claim.created_at >= (
                  date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
              );

            IF v_daily_awarded >= v_daily_limit THEN
                v_reward_status := 'daily_limit';
            ELSE
                v_points_to_award := v_base_reward;
                IF v_bonus_enabled
                   AND v_bonus_threshold > 0
                   AND v_bonus_reward > 0
                   AND v_char_count >= v_min_chars + v_bonus_threshold THEN
                    v_points_to_award := v_points_to_award + v_bonus_reward;
                END IF;
                v_reward_status := CASE WHEN v_points_to_award > 0 THEN 'awarded' ELSE 'no_reward' END;
            END IF;
        END IF;

        INSERT INTO public.writing_reward_claims (
            class_id, student_id, writing_type, source_key, source_post_id,
            reward_kind, awarded_points, reward_status, policy_snapshot
        ) VALUES (
            v_class_id, v_student_id, 'reading_log', v_library_item_id::TEXT, v_post_id,
            'completion', v_points_to_award, v_reward_status, v_policy_snapshot
        )
        ON CONFLICT (student_id, writing_type, source_key, reward_kind) DO NOTHING
        RETURNING id INTO v_claim_id;

        -- 삭제 후 같은 책을 다시 완료한 경우에도 기존 원장이 남아 있으므로 지급하지 않는다.
        IF v_claim_id IS NULL THEN
            v_points_to_award := 0;
            v_reward_status := 'already_claimed';
        ELSIF v_points_to_award > 0 THEN
            PERFORM set_config('app.bypass_student_trigger', 'true', true);
            UPDATE public.students
            SET total_points = COALESCE(total_points, 0) + v_points_to_award
            WHERE id = v_student_id
            RETURNING total_points INTO v_total_points;

            INSERT INTO public.point_logs (
                student_id, class_id, amount, reason, post_id, activity_type
            ) VALUES (
                v_student_id, v_class_id, v_points_to_award,
                '독서록 작성 완료 보상', v_post_id, 'writing_reward'
            );
            PERFORM set_config('app.bypass_student_trigger', 'false', true);
        END IF;
    ELSE
        v_reward_status := 'already_completed';
    END IF;

    RETURN v_result || jsonb_build_object(
        'char_count', v_char_count,
        'paragraph_count', v_paragraph_count,
        'points_awarded', v_points_to_award,
        'total_points', v_total_points,
        'reward_status', v_reward_status,
        'daily_reward_limit', v_daily_limit,
        'daily_rewards_used', v_daily_awarded + CASE WHEN v_points_to_award > 0 THEN 1 ELSE 0 END
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_writing_policy_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_class_writing_policies() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.writing_content_char_count(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.writing_content_paragraph_count(TEXT) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
