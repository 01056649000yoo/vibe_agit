-- 두근두근 우리반 아지트(agit-on-class) 기능을 완전히 삭제한다.
--
-- 2026-07-26부터 `available: false`로 UI에서만 숨겨 코드·데이터를 보관해 왔는데(재활성화 대비),
-- 실제로 다시 켤 계획이 없어 완전히 걷어내기로 했다(2026-08-09 사용자 결정). 프런트엔드 모듈
-- 폴더(`src/modules/community/agit-on-class/`)·전용 훅(`useClassAgitClass.js`)·registry 등록은
-- 이미 같은 커밋에서 제거했다. 이 마이그레이션은 DB 쪽을 정리한다.
--
-- `classes.agit_class_id`는 이름이 비슷하지만 완전히 다른 용도(연구소 통합용 학급 매핑, Stage 2)라
-- 건드리지 않는다.

BEGIN;

-- 1. 학생 홈 bootstrap이 더 이상 agit_settings를 내려주지 않게 한다.
CREATE OR REPLACE FUNCTION public.get_student_home_bootstrap_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_class public.classes%ROWTYPE;
    v_title JSONB;
    v_reading JSONB;
    v_diary JSONB;
    v_pending_missions INTEGER := 0;
    v_returned_count INTEGER := 0;
    v_has_activity BOOLEAN := false;
    v_has_new_mission BOOLEAN := false;
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
    v_marathon JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.*
    INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class.* INTO STRICT v_class
    FROM public.classes class
    WHERE class.id = v_student.class_id
      AND class.deleted_at IS NULL;

    -- 기존 검증된 집계 함수를 서버 내부에서 재사용한다. HTTP 왕복과 중복 학생 조회는 bootstrap 한 번으로 묶는다.
    v_title := public.get_my_title_status();
    v_reading := public.get_my_reading_log_daily_status();
    v_diary := public.get_my_diary_daily_status();

    SELECT count(*)::INTEGER
    INTO v_pending_missions
    FROM public.writing_missions mission
    WHERE mission.class_id = v_student.class_id
      AND mission.is_archived IS FALSE
      AND NOT EXISTS (
          SELECT 1
          FROM public.student_posts post
          WHERE post.class_id = v_student.class_id
            AND post.student_id = v_student.id
            AND post.mission_id = mission.id
            AND (
                post.is_submitted IS TRUE
                OR post.is_confirmed IS TRUE
                OR (
                    post.is_returned IS TRUE
                    AND post.is_submitted IS FALSE
                    AND post.is_confirmed IS FALSE
                    AND post.recalled_at IS NULL
                )
            )
      );

    SELECT count(*)::INTEGER
    INTO v_returned_count
    FROM public.student_posts post
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id
     AND mission.class_id = post.class_id
    WHERE post.class_id = v_student.class_id
      AND post.student_id = v_student.id
      AND mission.is_archived IS FALSE
      AND post.is_returned IS TRUE
      AND post.is_submitted IS FALSE
      AND post.is_confirmed IS FALSE
      AND post.recalled_at IS NULL;

    SELECT (
        EXISTS (
            SELECT 1
            FROM public.post_reactions reaction
            JOIN public.student_posts post
              ON post.id = reaction.post_id
             AND post.class_id = reaction.class_id
            WHERE reaction.class_id = v_student.class_id
              AND post.student_id = v_student.id
              AND reaction.student_id <> v_student.id
              AND reaction.created_at > COALESCE(v_student.last_feedback_check, '-infinity'::TIMESTAMPTZ)
            LIMIT 1
        ) OR EXISTS (
            SELECT 1
            FROM public.post_comments comment
            JOIN public.student_posts post
              ON post.id = comment.post_id
             AND post.class_id = comment.class_id
            WHERE comment.class_id = v_student.class_id
              AND post.student_id = v_student.id
              AND (comment.teacher_id IS NOT NULL OR comment.student_id <> v_student.id)
              AND comment.status = 'approved'
              AND comment.created_at > COALESCE(v_student.last_feedback_check, '-infinity'::TIMESTAMPTZ)
            LIMIT 1
        )
    ) INTO v_has_activity;

    SELECT EXISTS (
        SELECT 1
        FROM public.writing_missions mission
        WHERE mission.class_id = v_student.class_id
          AND mission.is_archived IS FALSE
          AND mission.created_at >= NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
              SELECT 1
              FROM public.student_posts post
              WHERE post.class_id = v_student.class_id
                AND post.student_id = v_student.id
                AND post.mission_id = mission.id
                AND post.is_submitted IS TRUE
          )
        LIMIT 1
    ) INTO v_has_new_mission;

    SELECT campaign.*
    INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = v_student.class_id
      AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC
    LIMIT 1;

    IF v_campaign.id IS NULL THEN
        v_marathon := jsonb_build_object(
            'campaign', NULL,
            'summary', jsonb_build_object(
                'total_pages', 0, 'total_distance_m', 0, 'contributors', 0,
                'book_count', 0, 'target_distance_m', 0, 'progress_percent', 0
            ),
            'my', NULL
        );
    ELSE
        WITH summary AS (
            SELECT
                COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
                COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS total_distance_m,
                COUNT(DISTINCT contribution.student_id)::INTEGER AS contributors,
                COUNT(contribution.id)::INTEGER AS book_count
            FROM public.reading_marathon_contributions contribution
            WHERE contribution.class_id = v_student.class_id
              AND contribution.campaign_id = v_campaign.id
        ), mine AS (
            SELECT
                COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
                COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS distance_m,
                COUNT(contribution.id)::INTEGER AS book_count
            FROM public.reading_marathon_contributions contribution
            WHERE contribution.class_id = v_student.class_id
              AND contribution.campaign_id = v_campaign.id
              AND contribution.student_id = v_student.id
        )
        SELECT jsonb_build_object(
            'campaign', jsonb_build_object(
                'id', v_campaign.id,
                'title', v_campaign.title,
                'target_distance_m', v_campaign.target_distance_m,
                'meters_per_page', v_campaign.meters_per_page,
                'status', v_campaign.status,
                'is_enabled', v_campaign.status IN ('active', 'completed'),
                'started_at', v_campaign.started_at,
                'ends_on', v_campaign.ends_on,
                'completed_at', v_campaign.completed_at
            ),
            'summary', jsonb_build_object(
                'total_pages', summary.total_pages,
                'total_distance_m', summary.total_distance_m,
                'contributors', summary.contributors,
                'book_count', summary.book_count,
                'target_distance_m', v_campaign.target_distance_m,
                'progress_percent', CASE
                    WHEN v_campaign.target_distance_m > 0
                    THEN LEAST(100, ROUND(summary.total_distance_m * 100.0 / v_campaign.target_distance_m, 1))
                    ELSE 0
                END
            ),
            'my', jsonb_build_object(
                'student_id', v_student.id,
                'name', v_student.name,
                'total_pages', mine.total_pages,
                'distance_m', mine.distance_m,
                'book_count', mine.book_count,
                'rank', NULL
            )
        ) INTO v_marathon
        FROM summary CROSS JOIN mine;
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
        'generated_at', NOW(),
        'student', jsonb_build_object(
            'id', v_student.id,
            'name', v_student.name,
            'class_id', v_student.class_id,
            'total_points', COALESCE(v_student.total_points, 0),
            'pet_data', COALESCE(v_student.pet_data, '{}'::JSONB),
            'last_feedback_check', v_student.last_feedback_check
        ),
        'class_config', jsonb_build_object(
            'enabled_modules', v_class.enabled_modules,
            'vocab_tower_enabled', v_class.vocab_tower_enabled,
            'writing_editor_settings', COALESCE(v_class.writing_editor_settings, '{}'::JSONB)
        ),
        'home', jsonb_build_object(
            'pending_missions', COALESCE(v_pending_missions, 0),
            'returned_count', COALESCE(v_returned_count, 0),
            'has_activity', COALESCE(v_has_activity, false),
            'has_new_mission', COALESCE(v_has_new_mission, false)
        ),
        'title_status', COALESCE(v_title, '{}'::JSONB),
        'reading_daily', COALESCE(v_reading, '{}'::JSONB),
        'diary_daily', COALESCE(v_diary, '{}'::JSONB),
        'reading_marathon', COALESCE(v_marathon, '{}'::JSONB)
    );
END;
$function$;

-- 2. 전용 테이블·컬럼 삭제 (인덱스·정책·FK는 테이블과 함께 자동 삭제된다)
DROP TABLE IF EXISTS public.agit_honor_roll;
ALTER TABLE public.classes DROP COLUMN IF EXISTS agit_settings;

COMMIT;
