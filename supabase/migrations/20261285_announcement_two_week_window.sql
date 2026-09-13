-- ============================================================================
-- 📢 2주가 지난 공지는 교사 목록에서 뺀다
-- 작성일: 2026-09-13
--
-- 왜: 지난 공지가 끝없이 쌓이면 목록이 길어져 **정작 새 공지가 묻힌다.** 2주가 지난
--     공지를 굳이 다시 읽을 일은 없다(사용자 판단).
--
-- 같은 창을 두 곳이 써야 한다: 이 함수(로그인 때 한 번에 받는 목록)와
--   `src/hooks/useAnnouncements.js`(화면이 직접 부르는 조회). 한쪽만 고치면 로그인
--   직후와 새로고침 뒤의 목록이 달라진다. `tests/announcementWindow.test.mjs` 가 함께 본다.
--   숫자의 원본은 `src/constants/announcements.js` 의 ANNOUNCEMENT_VISIBLE_DAYS.
--
-- 관리자 화면(AdminAnnouncementManager)은 이 창을 쓰지 않는다 — 지난 공지도 고치고
--   지울 수 있어야 한다. 이 함수는 교사 목록만 만든다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_app_bootstrap_v1(p_touch_login boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            -- 2주가 지난 공지는 빼고 준다. 화면이 직접 부르는 조회와 같은 창이어야
            -- 로그인 직후와 새로고침 뒤의 목록이 같다(src/constants/announcements.js).
            WHERE target_role IN ('TEACHER', 'ALL')
              AND created_at > now() - INTERVAL '14 days'
            ORDER BY created_at DESC LIMIT 50
        ) announcement;
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'version', 1, 'profile', COALESCE(v_profile, '{}'::JSONB),
        'teacher', COALESCE(v_teacher, '{}'::JSONB), 'classes', v_classes,
        'announcements', v_announcements
    );
END;
$function$;

COMMIT;

NOTIFY pgrst, 'reload schema';
