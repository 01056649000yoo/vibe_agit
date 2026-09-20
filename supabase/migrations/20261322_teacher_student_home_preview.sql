-- 교사가 자기 학급 "학생 대시보드"를 미리 볼 수 있게, 학생 홈을 재현할 재료를 한 번에 준다
-- (2026-09-19, 선생님 요청). 학생 앱은 익명 인증(auth.uid=학생)으로 읽어서 교사가 그대로 못 부른다.
-- 그래서 교사 권한으로 "학급 단위" 정보를 모아 주는 미리보기 전용 RPC 를 둔다.
--   - class_config: 학생 홈 메뉴를 정하는 enabled_modules + 레거시 설정(=classes 행).
--   - diary_enabled: 일기 메뉴 노출(class_writing_policies).
--   - missions: 지금 학생에게 보이는 과제(보관 안 된 것) 목록·개수.
-- 학생 개인 데이터(포인트·오늘 현황 등)는 미리보기에서 예시로 두므로 여기서 주지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_student_home_preview_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_class public.classes%ROWTYPE;
    v_diary_enabled BOOLEAN := TRUE;
    v_missions JSONB := '[]'::JSONB;
    v_mission_count INTEGER := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION '교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT class.* INTO v_class
    FROM public.classes class
    WHERE class.id = p_class_id AND class.deleted_at IS NULL AND class.teacher_id = v_user_id;
    IF v_class.id IS NULL THEN
        RAISE EXCEPTION '담당 학급만 미리볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(policy.is_enabled, TRUE) INTO v_diary_enabled
    FROM public.class_writing_policies policy
    WHERE policy.class_id = p_class_id AND policy.writing_type = 'diary';
    v_diary_enabled := COALESCE(v_diary_enabled, TRUE);

    SELECT COALESCE(jsonb_agg(m.item ORDER BY m.created_at DESC), '[]'::JSONB), count(*)::INTEGER
    INTO v_missions, v_mission_count
    FROM (
        SELECT mission.created_at,
            jsonb_build_object(
                'id', mission.id,
                'title', mission.title,
                'genre', mission.genre,
                'created_at', mission.created_at,
                'submitted_count', (
                    SELECT count(*)::INTEGER FROM public.student_posts post
                    WHERE post.mission_id = mission.id AND post.class_id = p_class_id
                      AND post.is_submitted IS TRUE AND post.recalled_at IS NULL
                )
            ) AS item
        FROM public.writing_missions mission
        WHERE mission.class_id = p_class_id
          AND mission.is_archived IS DISTINCT FROM TRUE
        ORDER BY mission.created_at DESC
        LIMIT 100
    ) m;

    RETURN jsonb_build_object(
        'version', 1,
        'class_config', to_jsonb(v_class),
        'diary_enabled', v_diary_enabled,
        'mission_count', v_mission_count,
        'missions', v_missions
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_student_home_preview_v1(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_student_home_preview_v1(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
