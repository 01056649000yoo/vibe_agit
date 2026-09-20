-- 학생 대시보드 미리보기 2단계: 메뉴를 눌러 실제 내용을 보도록 학급 단위 콘텐츠를 더 준다
-- (2026-09-19). 학생 앱은 익명 인증이라 교사가 라이브로 못 부르므로, 교사 권한으로 학급 스코프의
-- 과제 상세·친구 아지트(반 공개 글) 피드·독서록/일기 설정을 함께 돌려준다.
-- (개인 전용 화면(나의 아지트·놀이터·개인 목록)은 그 학생 데이터가 필요해 미리보기에서 다루지 않는다.)

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
    v_diary public.class_writing_policies%ROWTYPE;
    v_reading public.class_writing_policies%ROWTYPE;
    v_missions JSONB := '[]'::JSONB;
    v_mission_count INTEGER := 0;
    v_feed JSONB := '[]'::JSONB;
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

    SELECT * INTO v_diary FROM public.class_writing_policies
    WHERE class_id = p_class_id AND writing_type = 'diary';
    SELECT * INTO v_reading FROM public.class_writing_policies
    WHERE class_id = p_class_id AND writing_type = 'reading_log';

    -- 지금 학생에게 보이는 과제(보관 안 된 것) — 상세(안내·포인트)까지.
    SELECT COALESCE(jsonb_agg(m.item ORDER BY m.created_at DESC), '[]'::JSONB), count(*)::INTEGER
    INTO v_missions, v_mission_count
    FROM (
        SELECT mission.created_at,
            jsonb_build_object(
                'id', mission.id,
                'title', mission.title,
                'genre', mission.genre,
                'guide', mission.guide,
                'base_reward', mission.base_reward,
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

    -- 친구 아지트: 반에 공개된(visibility='class') 제출 글 최신 20편. 학생이 보는 그 목록.
    SELECT COALESCE(jsonb_agg(f.item ORDER BY f.sort_at DESC, f.id DESC), '[]'::JSONB)
    INTO v_feed
    FROM (
        SELECT post.id, COALESCE(post.published_at, post.first_submitted_at, post.created_at) AS sort_at,
            jsonb_build_object(
                'post_id', post.id,
                'title', COALESCE(NULLIF(btrim(post.teacher_edited_title), ''), post.title),
                'author_name', left(btrim(student.name), 30),
                'kind', CASE WHEN post.mission_id IS NOT NULL THEN COALESCE(mission.title, '과제 글')
                             WHEN post.self_writing_type = 'diary' THEN '일기'
                             WHEN post.self_writing_type = 'reading_log' THEN '독서록'
                             ELSE COALESCE(post.self_writing_type, '자유 글') END,
                'created_at', COALESCE(post.published_at, post.first_submitted_at, post.created_at)
            ) AS item
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id AND student.class_id = post.class_id
         AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
        LEFT JOIN public.writing_missions mission
          ON mission.id = post.mission_id AND mission.class_id = post.class_id
        WHERE post.class_id = p_class_id
          AND post.is_submitted IS TRUE
          AND post.visibility = 'class'
          AND post.recalled_at IS NULL
        ORDER BY COALESCE(post.published_at, post.first_submitted_at, post.created_at) DESC, post.id DESC
        LIMIT 20
    ) f;

    RETURN jsonb_build_object(
        'version', 2,
        'class_config', to_jsonb(v_class),
        'diary_enabled', COALESCE(v_diary.is_enabled, TRUE),
        'diary_policy', jsonb_build_object('enabled', COALESCE(v_diary.is_enabled, TRUE),
            'daily_limit', COALESCE(v_diary.daily_reward_limit, 1)),
        'reading_policy', jsonb_build_object('enabled', COALESCE(v_reading.is_enabled, TRUE),
            'daily_limit', COALESCE(v_reading.daily_reward_limit, 1)),
        'mission_count', v_mission_count,
        'missions', v_missions,
        'friends_feed', v_feed
    );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
