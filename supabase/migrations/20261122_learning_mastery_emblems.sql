-- 공통 학습 엔진 3단계 — 덱마스터 진행 상징과 어휘 마스터 휘장.
--
-- 학생이 덱마스터 10개를 하나씩 채우는 것이 보이고, 다 채워 어휘 마스터가 되면 휘장과 칭호를 받는다.
-- 나의 아지트에서 보고, 친구 아지트에서도 보이고, 교사도 학생 아지트에서 확인한다.
--
-- 콘텐츠 중립으로 만드는 이유: 속담·맞춤법도 곧 같은 구조가 필요하다. 어휘 전용으로 만들면
-- `속담 마스터 휘장`을 또 만들게 되고, 그러면 2026-08-17에 엔진을 분리한 이유가 사라진다.
-- 그래서 엔진이 "몇 개 관문을 통과했고 정상에 올랐는가"를 갖고, 콘텐츠는 **이름과 그림만 선언**한다.
--
-- 공개 범위 (사용자 결정, A안):
--   · 본인    — 진행도까지 본다 (7/10)
--   · 친구    — **완성된 것만** 본다. 진행 중인 7/10은 보이지 않는다.
--               진행도가 공개되면 은근한 상시 비교가 생긴다. SP 순위를 기본 `내 주변형`으로
--               조심스럽게 설계한 것과 같은 이유다.
--   · 교사    — 담당 학급 학생의 진행도까지 본다(학생 아지트 열람과 같은 범위).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 콘텐츠 등록표 — 콘텐츠는 이름과 그림만 선언한다
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learning_content_types (
    content_type TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    emblem_icon TEXT NOT NULL,
    -- 관문 이름은 콘텐츠마다 다르다. 어휘는 `덱마스터`·`어휘 마스터`를 쓴다.
    collection_label TEXT NOT NULL,
    summit_label TEXT NOT NULL,
    master_title TEXT NOT NULL,
    collection_count SMALLINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT learning_content_types_count_check CHECK (collection_count BETWEEN 1 AND 100),
    CONSTRAINT learning_content_types_name_check CHECK (char_length(display_name) BETWEEN 1 AND 40),
    CONSTRAINT learning_content_types_icon_check CHECK (char_length(emblem_icon) BETWEEN 1 AND 8),
    CONSTRAINT learning_content_types_title_check CHECK (char_length(master_title) BETWEEN 1 AND 40)
);

ALTER TABLE public.learning_content_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learning_content_types FROM PUBLIC, anon, authenticated;

-- 어휘의 탑을 첫 콘텐츠로 등록한다. 휘장 이름·그림은 운영에서 바꿀 수 있다.
INSERT INTO public.learning_content_types
    (content_type, display_name, emblem_icon, collection_label, summit_label, master_title, collection_count)
VALUES
    ('vocab', '어휘의 탑', '🏆', '덱마스터', '어휘 마스터', '어휘 마스터', 10)
ON CONFLICT (content_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. 정상 달성 기록
-- ---------------------------------------------------------------------------
-- 관문 통과는 learning_challenge_attempts 로 알 수 있지만, 정상(어휘 마스터)은 "언제 올랐는가"를
-- 따로 남긴다. 나중에 덱 구성이 바뀌어도 이미 받은 휘장은 사라지지 않아야 하기 때문이다.
CREATE TABLE IF NOT EXISTS public.learning_summit_awards (
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    collection_count SMALLINT NOT NULL,
    PRIMARY KEY (student_id, content_type)
);

ALTER TABLE public.learning_summit_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learning_summit_awards FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS learning_summit_awards_class_idx
    ON public.learning_summit_awards (class_id, content_type, awarded_at DESC);

-- ---------------------------------------------------------------------------
-- 3. 성취 요약 (엔진 내부)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.learning_engine_mastery_summary_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_include_progress BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_items JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'content_type'), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT jsonb_strip_nulls(jsonb_build_object(
            'content_type', content.content_type,
            'display_name', content.display_name,
            'emblem_icon', content.emblem_icon,
            'collection_label', content.collection_label,
            'summit_label', content.summit_label,
            'master_title', content.master_title,
            'collection_count', content.collection_count,
            -- 정상 달성은 완성된 성취라 친구에게도 보인다.
            'summit_reached', award.student_id IS NOT NULL,
            'summit_awarded_at', award.awarded_at,
            -- 모든 관문을 채웠는지도 완성 여부라 공개한다.
            'all_collections_cleared', passed.passed_count >= content.collection_count,
            -- 진행 중인 숫자는 본인·교사만 본다(A안). 친구에게는 NULL 로 빠진다.
            'passed_count', CASE WHEN p_include_progress THEN passed.passed_count ELSE NULL END
        )) AS entry
        FROM public.learning_content_types content
        LEFT JOIN LATERAL (
            SELECT count(DISTINCT attempt.collection_key)::INTEGER AS passed_count
            FROM public.learning_challenge_attempts attempt
            WHERE attempt.student_id = p_student_id
              AND attempt.class_id = p_class_id
              AND attempt.content_type = content.content_type
              AND attempt.challenge_kind = 'collection'
              AND attempt.status = 'completed'
              AND attempt.passed IS TRUE
        ) passed ON TRUE
        LEFT JOIN public.learning_summit_awards award
          ON award.student_id = p_student_id
         AND award.content_type = content.content_type
        WHERE content.is_active
    ) rows;

    RETURN jsonb_build_object('version', 1, 'contents', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_mastery_summary_v1(UUID, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

-- 모든 관문을 통과한 순간 정상 휘장을 준다. 관문 통과 직후 콘텐츠가 부른다.
CREATE OR REPLACE FUNCTION public.learning_engine_grant_summit_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_content_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_required SMALLINT;
    v_passed INTEGER;
    v_new BOOLEAN := FALSE;
BEGIN
    SELECT collection_count INTO v_required
    FROM public.learning_content_types
    WHERE content_type = p_content_type AND is_active;
    IF v_required IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT count(DISTINCT collection_key)::INTEGER INTO v_passed
    FROM public.learning_challenge_attempts
    WHERE student_id = p_student_id
      AND class_id = p_class_id
      AND content_type = p_content_type
      AND challenge_kind = 'collection'
      AND status = 'completed'
      AND passed IS TRUE;

    IF v_passed < v_required THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.learning_summit_awards (student_id, class_id, content_type, collection_count)
    VALUES (p_student_id, p_class_id, p_content_type, v_required)
    ON CONFLICT (student_id, content_type) DO NOTHING;
    GET DIAGNOSTICS v_new = ROW_COUNT;
    RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_grant_summit_v1(UUID, UUID, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. 화면이 부르는 조회 RPC 세 개
-- ---------------------------------------------------------------------------
-- 본인 — 나의 아지트. 진행도까지 본다.
CREATE OR REPLACE FUNCTION public.get_my_learning_mastery_v1()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_student public.students%ROWTYPE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT s.* INTO v_student FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.is_active IS DISTINCT FROM FALSE
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW()) LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN public.learning_engine_mastery_summary_v1(v_student.id, v_student.class_id, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_learning_mastery_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_learning_mastery_v1() TO authenticated, service_role;

-- 친구 — 친구 아지트. **완성된 것만** 본다(진행도는 서버가 아예 내려보내지 않는다).
CREATE OR REPLACE FUNCTION public.get_classmate_learning_mastery_v1(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me public.students%ROWTYPE;
    v_friend public.students%ROWTYPE;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT s.* INTO v_me FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.is_active IS DISTINCT FROM FALSE
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW()) LIMIT 1;
    IF v_me.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    -- 같은 학급 친구만 볼 수 있다.
    SELECT s.* INTO v_friend FROM public.students s
    WHERE s.id = p_student_id AND s.class_id = v_me.class_id
      AND s.is_active IS DISTINCT FROM FALSE
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());
    IF v_friend.id IS NULL THEN
        RAISE EXCEPTION '같은 반 친구를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    RETURN public.learning_engine_mastery_summary_v1(v_friend.id, v_friend.class_id, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.get_classmate_learning_mastery_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_classmate_learning_mastery_v1(UUID) TO authenticated, service_role;

-- 교사 — 학급 운영의 학생 아지트. 담당 학급 학생의 진행도까지 본다.
CREATE OR REPLACE FUNCTION public.get_student_learning_mastery_v1(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_student public.students%ROWTYPE;
BEGIN
    SELECT s.* INTO v_student FROM public.students s
    WHERE s.id = p_student_id
      AND s.is_active IS DISTINCT FROM FALSE
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 담당 교사와 ADMIN만. 학생 아지트 열람과 같은 범위다.
    IF public.auth_user_role() <> 'ADMIN'
       AND NOT EXISTS (
           SELECT 1 FROM public.classes c
           WHERE c.id = v_student.class_id AND c.teacher_id = auth.uid() AND c.deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION '[보안] 이 학생의 성취를 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN public.learning_engine_mastery_summary_v1(v_student.id, v_student.class_id, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_learning_mastery_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_learning_mastery_v1(UUID) TO authenticated, service_role;

COMMIT;
