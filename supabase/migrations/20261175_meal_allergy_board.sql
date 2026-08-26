-- ============================================================================
-- 얘들아, 밥 먹자! — 교사용 급식·개인 건강 항목 확인 도구
--
-- 공개 급식과 학생별 건강 항목은 성격에 맞게 분리한다.
--   * 나이스 급식 응답은 서버 전용 캐시에만 둔다.
--   * 학생별 건강 항목은 담당 교사가 전용 RPC로만 읽고 쓴다.
--   * 학급별 급식 학교가 없으면 가입 시 선택한 교사 기본 학교를 쓴다.
-- ============================================================================

BEGIN;

-- 가입 시 선택한 학교를 나이스의 안정적인 코드로 이어받는다.
ALTER TABLE public.teachers
    ADD COLUMN IF NOT EXISTS school_office_code TEXT,
    ADD COLUMN IF NOT EXISTS school_code TEXT,
    ADD COLUMN IF NOT EXISTS school_address TEXT,
    ADD COLUMN IF NOT EXISTS school_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.teachers.school_office_code IS '나이스 시도교육청 코드. 예: B10';
COMMENT ON COLUMN public.teachers.school_code IS '나이스 표준학교 코드';
COMMENT ON COLUMN public.teachers.school_address IS '교사가 나이스 검색 결과에서 확인한 학교 주소 스냅샷';
COMMENT ON COLUMN public.teachers.school_verified_at IS '교사가 나이스 검색 결과에서 학교를 선택한 시각';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'teachers_school_codes_format'
    ) THEN
        ALTER TABLE public.teachers
            ADD CONSTRAINT teachers_school_codes_format CHECK (
                (school_office_code IS NULL AND school_code IS NULL)
                OR (
                    school_office_code ~ '^[A-Z0-9]{3}$'
                    AND school_code ~ '^[0-9]{7}$'
                )
            );
    END IF;
END;
$$;

-- 학급별로 교사 기본 학교와 다른 학교를 쓸 때만 한 행을 둔다.
CREATE TABLE IF NOT EXISTS public.class_meal_school_settings (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    school_office_code TEXT NOT NULL CHECK (school_office_code ~ '^[A-Z0-9]{3}$'),
    school_code TEXT NOT NULL CHECK (school_code ~ '^[0-9]{7}$'),
    school_name TEXT NOT NULL CHECK (CHAR_LENGTH(BTRIM(school_name)) BETWEEN 1 AND 100),
    school_address TEXT NOT NULL DEFAULT '' CHECK (CHAR_LENGTH(school_address) <= 300),
    updated_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 민감정보 입력 전 교사가 학교의 적법한 처리 근거와 내부 절차를 확인한 기록이다.
CREATE TABLE IF NOT EXISTS public.class_meal_health_authorizations (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    notice_version TEXT NOT NULL DEFAULT '2026-08-26'
        CHECK (notice_version = '2026-08-26'),
    confirmed_by UUID NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 급식 표시 표준 19종의 단일 원본. 화면은 이 목록을 RPC로 받아 쓴다.
CREATE TABLE IF NOT EXISTS public.meal_allergen_catalog (
    code SMALLINT PRIMARY KEY CHECK (code BETWEEN 1 AND 19),
    label TEXT NOT NULL UNIQUE CHECK (CHAR_LENGTH(label) BETWEEN 1 AND 30)
);

INSERT INTO public.meal_allergen_catalog (code, label) VALUES
    (1, '난류'), (2, '우유'), (3, '메밀'), (4, '땅콩'), (5, '대두'),
    (6, '밀'), (7, '고등어'), (8, '게'), (9, '새우'), (10, '돼지고기'),
    (11, '복숭아'), (12, '토마토'), (13, '아황산류'), (14, '호두'),
    (15, '닭고기'), (16, '쇠고기'), (17, '오징어'), (18, '조개류'), (19, '잣')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;

-- class_id를 직접 범위로 쓰는 복합 외래키를 위해 학생 ID와 학급을 함께 보장한다.
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_id_class_unique
    ON public.students (id, class_id);

CREATE TABLE IF NOT EXISTS public.student_meal_health_profiles (
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL,
    confirmation_status TEXT NOT NULL DEFAULT 'unconfirmed'
        CHECK (confirmation_status IN ('unconfirmed', 'confirmed_none', 'has_items')),
    allergen_codes SMALLINT[] NOT NULL DEFAULT '{}'::SMALLINT[],
    updated_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, student_id),
    CONSTRAINT student_meal_health_student_scope
        FOREIGN KEY (student_id, class_id)
        REFERENCES public.students(id, class_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT student_meal_health_codes_valid CHECK (
        CARDINALITY(allergen_codes) <= 19
        AND allergen_codes <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19]::SMALLINT[]
        AND (
            (confirmation_status = 'has_items' AND CARDINALITY(allergen_codes) > 0)
            OR (confirmation_status <> 'has_items' AND CARDINALITY(allergen_codes) = 0)
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_student_meal_health_class_updated
    ON public.student_meal_health_profiles (class_id, updated_at DESC, student_id);

-- Edge 함수만 사용하는 공개 급식 캐시. 학생 개인정보는 넣지 않는다.
CREATE TABLE IF NOT EXISTS public.neis_meal_cache (
    school_office_code TEXT NOT NULL CHECK (school_office_code ~ '^[A-Z0-9]{3}$'),
    school_code TEXT NOT NULL CHECK (school_code ~ '^[0-9]{7}$'),
    meal_date DATE NOT NULL,
    payload JSONB NOT NULL CHECK (
        JSONB_TYPEOF(payload) = 'object'
        AND OCTET_LENGTH(payload::TEXT) <= 262144
    ),
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (school_office_code, school_code, meal_date)
);

CREATE INDEX IF NOT EXISTS idx_neis_meal_cache_expires
    ON public.neis_meal_cache (expires_at);

ALTER TABLE public.class_meal_school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_meal_health_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_allergen_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_meal_health_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neis_meal_cache ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.class_meal_school_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.class_meal_health_authorizations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.meal_allergen_catalog FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.student_meal_health_profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.neis_meal_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.neis_meal_cache TO service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_meal_board_workspace_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_id UUID;
    v_school JSONB;
    v_authorization JSONB;
    v_result JSONB;
BEGIN
    SELECT class.teacher_id
    INTO v_teacher_id
    FROM public.classes class
    WHERE class.id = p_class_id
      AND class.deleted_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN');

    IF v_teacher_id IS NULL THEN
        RAISE EXCEPTION '담당 학급의 급식 정보만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT CASE
        WHEN class_school.class_id IS NOT NULL THEN JSONB_BUILD_OBJECT(
            'source', 'class_override',
            'officeCode', class_school.school_office_code,
            'schoolCode', class_school.school_code,
            'schoolName', class_school.school_name,
            'address', class_school.school_address,
            'verifiedAt', class_school.updated_at
        )
        WHEN teacher.school_office_code IS NOT NULL AND teacher.school_code IS NOT NULL THEN JSONB_BUILD_OBJECT(
            'source', 'teacher_default',
            'officeCode', teacher.school_office_code,
            'schoolCode', teacher.school_code,
            'schoolName', teacher.school_name,
            'address', COALESCE(teacher.school_address, ''),
            'verifiedAt', teacher.school_verified_at
        )
        ELSE NULL
    END
    INTO v_school
    FROM public.teachers teacher
    LEFT JOIN public.class_meal_school_settings class_school
      ON class_school.class_id = p_class_id
    WHERE teacher.id = v_teacher_id;

    SELECT JSONB_BUILD_OBJECT(
        'noticeVersion', health_auth.notice_version,
        'confirmedAt', health_auth.confirmed_at
    )
    INTO v_authorization
    FROM public.class_meal_health_authorizations health_auth
    WHERE health_auth.class_id = p_class_id;

    SELECT JSONB_BUILD_OBJECT(
        'school', v_school,
        'healthAuthorization', v_authorization,
        'allergens', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT('code', catalog.code, 'label', catalog.label) ORDER BY catalog.code)
            FROM public.meal_allergen_catalog catalog
        ), '[]'::JSONB),
        'students', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'id', roster.id,
                'name', roster.name,
                'confirmationStatus', COALESCE(profile.confirmation_status, 'unconfirmed'),
                'allergenCodes', COALESCE(TO_JSONB(profile.allergen_codes), '[]'::JSONB),
                'updatedAt', profile.updated_at
            ) ORDER BY LOWER(roster.name), roster.id)
            FROM (
                SELECT student.id, student.name
                FROM public.students student
                WHERE student.class_id = p_class_id
                  AND student.deleted_at IS NULL
                  AND student.is_active IS DISTINCT FROM FALSE
                ORDER BY LOWER(student.name), student.id
                LIMIT 100
            ) roster
            LEFT JOIN public.student_meal_health_profiles profile
              ON profile.class_id = p_class_id
             AND profile.student_id = roster.id
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_teacher_meal_health_authorization_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_confirmed_at TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '담당 학급의 처리 근거만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.class_meal_health_authorizations (
        class_id, notice_version, confirmed_by, confirmed_at
    ) VALUES (
        p_class_id, '2026-08-26', auth.uid(), NOW()
    )
    ON CONFLICT (class_id) DO UPDATE SET
        notice_version = EXCLUDED.notice_version,
        confirmed_by = EXCLUDED.confirmed_by,
        confirmed_at = EXCLUDED.confirmed_at
    RETURNING confirmed_at INTO v_confirmed_at;

    RETURN JSONB_BUILD_OBJECT(
        'noticeVersion', '2026-08-26',
        'confirmedAt', v_confirmed_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_teacher_student_meal_health_v1(
    p_class_id UUID,
    p_student_id UUID,
    p_confirmation_status TEXT,
    p_allergen_codes SMALLINT[] DEFAULT '{}'::SMALLINT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_codes SMALLINT[];
    v_updated_at TIMESTAMPTZ;
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '담당 학급의 건강 항목만 수정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.class_meal_health_authorizations health_auth
        WHERE health_auth.class_id = p_class_id
          AND health_auth.notice_version = '2026-08-26'
    ) THEN
        RAISE EXCEPTION '민감정보 처리 근거와 학교 내부 절차를 먼저 확인해 주세요.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.students student
        WHERE student.id = p_student_id
          AND student.class_id = p_class_id
          AND student.deleted_at IS NULL
          AND student.is_active IS DISTINCT FROM FALSE
    ) THEN
        RAISE EXCEPTION '현재 학급의 학생만 수정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_confirmation_status NOT IN ('unconfirmed', 'confirmed_none', 'has_items') THEN
        RAISE EXCEPTION '건강 항목 확인 상태가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(ARRAY_AGG(code ORDER BY code), '{}'::SMALLINT[])
    INTO v_codes
    FROM (
        SELECT DISTINCT item.raw_code AS code
        FROM UNNEST(COALESCE(p_allergen_codes, '{}'::SMALLINT[])) AS item(raw_code)
        WHERE item.raw_code BETWEEN 1 AND 19
    ) normalized;

    IF CARDINALITY(COALESCE(p_allergen_codes, '{}'::SMALLINT[])) <> CARDINALITY(v_codes) THEN
        RAISE EXCEPTION '지원하지 않거나 중복된 건강 항목이 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_confirmation_status = 'has_items' AND CARDINALITY(v_codes) = 0 THEN
        RAISE EXCEPTION '건강 항목을 하나 이상 선택해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_confirmation_status <> 'has_items' AND CARDINALITY(v_codes) <> 0 THEN
        RAISE EXCEPTION '선택 항목과 확인 상태가 일치하지 않습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.student_meal_health_profiles (
        class_id, student_id, confirmation_status, allergen_codes, updated_by, updated_at
    ) VALUES (
        p_class_id, p_student_id, p_confirmation_status, v_codes, auth.uid(), NOW()
    )
    ON CONFLICT (class_id, student_id) DO UPDATE SET
        confirmation_status = EXCLUDED.confirmation_status,
        allergen_codes = EXCLUDED.allergen_codes,
        updated_by = EXCLUDED.updated_by,
        updated_at = EXCLUDED.updated_at
    RETURNING updated_at INTO v_updated_at;

    RETURN JSONB_BUILD_OBJECT(
        'studentId', p_student_id,
        'confirmationStatus', p_confirmation_status,
        'allergenCodes', TO_JSONB(v_codes),
        'updatedAt', v_updated_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_teacher_meal_school_v1(
    p_class_id UUID,
    p_scope TEXT,
    p_school_office_code TEXT DEFAULT NULL,
    p_school_code TEXT DEFAULT NULL,
    p_school_name TEXT DEFAULT NULL,
    p_school_address TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_teacher_id UUID;
BEGIN
    SELECT class.teacher_id
    INTO v_teacher_id
    FROM public.classes class
    WHERE class.id = p_class_id
      AND class.deleted_at IS NULL
      AND class.teacher_id = auth.uid();

    IF v_teacher_id IS NULL THEN
        RAISE EXCEPTION '담당 학급의 급식 학교만 변경할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_scope NOT IN ('class', 'default', 'use_default') THEN
        RAISE EXCEPTION '학교 적용 범위가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    IF p_scope = 'use_default' THEN
        DELETE FROM public.class_meal_school_settings WHERE class_id = p_class_id;
        RETURN JSONB_BUILD_OBJECT('success', TRUE, 'source', 'teacher_default');
    END IF;

    IF COALESCE(p_school_office_code, '') !~ '^[A-Z0-9]{3}$'
       OR COALESCE(p_school_code, '') !~ '^[0-9]{7}$'
       OR CHAR_LENGTH(BTRIM(COALESCE(p_school_name, ''))) NOT BETWEEN 1 AND 100
       OR CHAR_LENGTH(COALESCE(p_school_address, '')) > 300 THEN
        RAISE EXCEPTION '나이스 검색 결과에서 학교를 다시 선택해 주세요.' USING ERRCODE = '22023';
    END IF;

    IF p_scope = 'default' THEN
        UPDATE public.teachers
        SET school_office_code = p_school_office_code,
            school_code = p_school_code,
            school_name = BTRIM(p_school_name),
            school_address = BTRIM(COALESCE(p_school_address, '')),
            school_verified_at = NOW()
        WHERE id = v_teacher_id;
        DELETE FROM public.class_meal_school_settings WHERE class_id = p_class_id;
    ELSE
        INSERT INTO public.class_meal_school_settings (
            class_id, school_office_code, school_code, school_name, school_address, updated_by, updated_at
        ) VALUES (
            p_class_id, p_school_office_code, p_school_code, BTRIM(p_school_name),
            BTRIM(COALESCE(p_school_address, '')), auth.uid(), NOW()
        )
        ON CONFLICT (class_id) DO UPDATE SET
            school_office_code = EXCLUDED.school_office_code,
            school_code = EXCLUDED.school_code,
            school_name = EXCLUDED.school_name,
            school_address = EXCLUDED.school_address,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at;
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'success', TRUE,
        'source', CASE WHEN p_scope = 'default' THEN 'teacher_default' ELSE 'class_override' END,
        'school', JSONB_BUILD_OBJECT(
            'officeCode', p_school_office_code,
            'schoolCode', p_school_code,
            'schoolName', BTRIM(p_school_name),
            'address', BTRIM(COALESCE(p_school_address, ''))
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_meal_board_workspace_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_teacher_meal_health_authorization_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_teacher_student_meal_health_v1(UUID, UUID, TEXT, SMALLINT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_teacher_meal_school_v1(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_meal_board_workspace_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_teacher_meal_health_authorization_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_teacher_student_meal_health_v1(UUID, UUID, TEXT, SMALLINT[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_teacher_meal_school_v1(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 최신 교사 부트스트랩(20261149)의 공지 팝업 계약을 보존하며 학교 코드만 추가한다.
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

    v_profile := JSONB_BUILD_OBJECT(
        'id', v_profile_row.id, 'role', v_profile_row.role,
        'full_name', v_profile_row.full_name, 'is_approved', v_profile_row.is_approved,
        'primary_class_id', v_profile_row.primary_class_id, 'api_mode', v_profile_row.api_mode,
        'created_at', v_profile_row.created_at, 'last_login_at', v_profile_row.last_login_at,
        'ai_prompt_template', v_profile_row.ai_prompt_template,
        'frequent_tags', COALESCE(v_profile_row.frequent_tags, '[]'::JSONB),
        'default_rubric', v_profile_row.default_rubric,
        'mission_default_settings', v_profile_row.mission_default_settings
    );
    SELECT JSONB_BUILD_OBJECT(
        'name', teacher.name,
        'school_name', teacher.school_name,
        'school_office_code', teacher.school_office_code,
        'school_code', teacher.school_code,
        'school_address', teacher.school_address,
        'school_verified_at', teacher.school_verified_at,
        'phone', teacher.phone
    )
    INTO v_teacher FROM public.teachers teacher WHERE teacher.id = v_user_id;

    IF v_can_operate THEN
        SELECT COALESCE(JSONB_AGG(TO_JSONB(class_row) ORDER BY class_row.created_at DESC), '[]'::JSONB)
        INTO v_classes FROM (
            SELECT id, name, created_at, teacher_id FROM public.classes
            WHERE teacher_id = v_user_id AND deleted_at IS NULL
            ORDER BY created_at DESC LIMIT 100
        ) class_row;
        SELECT COALESCE(JSONB_AGG(TO_JSONB(announcement) ORDER BY announcement.created_at DESC), '[]'::JSONB)
        INTO v_announcements FROM (
            SELECT id, title, content, created_at, target_role, is_popup FROM public.announcements
            WHERE target_role IN ('TEACHER', 'ALL') ORDER BY created_at DESC LIMIT 50
        ) announcement;
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'version', 1, 'profile', COALESCE(v_profile, '{}'::JSONB),
        'teacher', COALESCE(v_teacher, '{}'::JSONB), 'classes', v_classes,
        'announcements', v_announcements
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_app_bootstrap_v1(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_app_bootstrap_v1(BOOLEAN) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
