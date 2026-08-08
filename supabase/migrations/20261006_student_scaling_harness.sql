BEGIN;

-- 학생 홈은 여러 카드가 각자 조회하지 않고 이 한 번의 버전형 응답을 공유한다.
CREATE OR REPLACE FUNCTION public.get_student_home_bootstrap_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
            'writing_editor_settings', COALESCE(v_class.writing_editor_settings, '{}'::JSONB),
            'agit_settings', COALESCE(v_class.agit_settings, '{}'::JSONB)
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
$$;

REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_v1() TO authenticated, service_role;

-- 실제 쓰기는 내부 엔진 하나가 담당하고 학생 화면에는 기능 전용 wrapper만 공개한다.
CREATE OR REPLACE FUNCTION public.writing_engine_submit_assignment(
    p_student_id UUID,
    p_mission_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_student_answers JSONB DEFAULT '[]'::JSONB,
    p_structured_content JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_mission public.writing_missions%ROWTYPE;
    v_existing public.student_posts%ROWTYPE;
    v_post_id UUID;
    v_is_first_time BOOLEAN;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_status TEXT;
BEGIN
    IF p_student_id IS NULL OR p_mission_id IS NULL OR btrim(COALESCE(p_title, '')) = '' THEN
        RAISE EXCEPTION '학생·과제·제목이 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(p_student_answers, '[]'::JSONB)) <> 'array' THEN
        RAISE EXCEPTION '학생 답변 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    FOR UPDATE;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '활성 학생을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    WHERE mission.id = p_mission_id
      AND mission.class_id = v_student.class_id
    FOR SHARE;
    IF v_mission.id IS NULL THEN
        RAISE EXCEPTION '이 학급의 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_mission.is_archived IS TRUE THEN
        RAISE EXCEPTION '보관된 과제는 제출할 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT post.* INTO v_existing
    FROM public.student_posts post
    WHERE post.class_id = v_student.class_id
      AND post.student_id = p_student_id
      AND post.mission_id = p_mission_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL
       AND (v_existing.is_confirmed IS TRUE OR (v_existing.is_submitted IS TRUE AND v_existing.is_returned IS FALSE)) THEN
        RAISE EXCEPTION '이미 제출되어 확인 중인 글입니다.' USING ERRCODE = '23505';
    END IF;

    v_char_count := public.writing_content_char_count(p_content);
    v_paragraph_count := public.writing_content_paragraph_count(p_content);
    IF v_char_count < GREATEST(0, COALESCE(v_mission.min_chars, 0)) THEN
        RAISE EXCEPTION '최소 글자 수를 채우지 못했습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_paragraph_count < GREATEST(0, COALESCE(v_mission.min_paragraphs, 0)) THEN
        RAISE EXCEPTION '최소 문단 수를 채우지 못했습니다.' USING ERRCODE = '22023';
    END IF;

    v_is_first_time := v_existing.id IS NULL OR NULLIF(v_existing.original_content, '') IS NULL;
    v_status := CASE WHEN v_mission.mission_type = 'meeting' THEN '제안중'
                     ELSE COALESCE(v_existing.status, 'submitted') END;

    INSERT INTO public.student_posts (
        student_id, mission_id, class_id, title, content, char_count, paragraph_count,
        awarded_base_reward, awarded_bonus_reward, awarded_bonus_threshold,
        is_submitted, is_returned, is_confirmed, is_teacher_edited,
        teacher_edited_title, teacher_edited_content, teacher_edited_at, teacher_edited_by,
        student_answers, structured_content, status, writing_context,
        original_title, original_content, first_submitted_at, updated_at
    ) VALUES (
        p_student_id, p_mission_id, v_student.class_id, btrim(p_title), COALESCE(p_content, ''),
        v_char_count, v_paragraph_count,
        v_mission.base_reward, v_mission.bonus_reward, v_mission.bonus_threshold,
        true, false, false, false,
        NULL, NULL, NULL, NULL,
        COALESCE(p_student_answers, '[]'::JSONB), p_structured_content, v_status, 'assignment',
        CASE WHEN v_is_first_time THEN btrim(p_title) ELSE v_existing.original_title END,
        CASE WHEN v_is_first_time THEN COALESCE(p_content, '') ELSE v_existing.original_content END,
        CASE WHEN v_is_first_time THEN NOW() ELSE v_existing.first_submitted_at END,
        NOW()
    )
    ON CONFLICT (student_id, mission_id) DO UPDATE SET
        class_id = EXCLUDED.class_id,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        char_count = EXCLUDED.char_count,
        paragraph_count = EXCLUDED.paragraph_count,
        awarded_base_reward = EXCLUDED.awarded_base_reward,
        awarded_bonus_reward = EXCLUDED.awarded_bonus_reward,
        awarded_bonus_threshold = EXCLUDED.awarded_bonus_threshold,
        is_submitted = true,
        is_returned = false,
        is_confirmed = false,
        is_teacher_edited = false,
        teacher_edited_title = NULL,
        teacher_edited_content = NULL,
        teacher_edited_at = NULL,
        teacher_edited_by = NULL,
        student_answers = EXCLUDED.student_answers,
        structured_content = EXCLUDED.structured_content,
        status = EXCLUDED.status,
        writing_context = 'assignment',
        original_title = CASE WHEN v_is_first_time THEN EXCLUDED.original_title ELSE public.student_posts.original_title END,
        original_content = CASE WHEN v_is_first_time THEN EXCLUDED.original_content ELSE public.student_posts.original_content END,
        first_submitted_at = CASE WHEN v_is_first_time THEN EXCLUDED.first_submitted_at ELSE public.student_posts.first_submitted_at END,
        updated_at = NOW()
    RETURNING id INTO v_post_id;

    RETURN jsonb_build_object(
        'success', true,
        'post_id', v_post_id,
        'student_id', p_student_id,
        'class_id', v_student.class_id,
        'mission_id', p_mission_id,
        'mission_type', v_mission.mission_type,
        'is_first_time', v_is_first_time,
        'char_count', v_char_count,
        'paragraph_count', v_paragraph_count,
        'base_reward', COALESCE(v_mission.base_reward, 0),
        'mission_title', v_mission.title
    );
END;
$$;

REVOKE ALL ON FUNCTION public.writing_engine_submit_assignment(UUID, UUID, TEXT, TEXT, JSONB, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_assignment_post_v1(
    p_mission_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_student_answers JSONB DEFAULT '[]'::JSONB,
    p_structured_content JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_result JSONB;
    v_point_result JSONB;
    v_reward INTEGER;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_result := public.writing_engine_submit_assignment(
        v_student_id, p_mission_id, p_title, p_content,
        COALESCE(p_student_answers, '[]'::JSONB), p_structured_content
    );

    IF v_result->>'mission_type' = 'meeting' THEN
        v_reward := GREATEST(0, COALESCE((v_result->>'base_reward')::INTEGER, 0));
        IF v_reward > 0 THEN
            v_point_result := public.point_engine_apply(
                v_student_id,
                v_reward,
                format('아이디어 마켓에 제안을 제출했어요! 🏛️💡 (%s)', v_result->>'mission_title'),
                'meeting_activity',
                format('meeting:%s:submission-reward', v_result->>'post_id'),
                (v_result->>'post_id')::UUID,
                p_mission_id,
                jsonb_build_object('source', 'meeting_submission')
            );
        END IF;
    END IF;

    RETURN v_result || jsonb_build_object(
        'points_awarded', CASE WHEN v_point_result->>'status' = 'applied' THEN v_reward ELSE 0 END,
        'reward_status', COALESCE(v_point_result->>'status', 'not_applicable')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_assignment_post_v1(UUID, TEXT, TEXT, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_assignment_post_v1(UUID, TEXT, TEXT, JSONB, JSONB) TO authenticated, service_role;

-- 구 화면의 회의 제출 보상 호출도 공용 엔진으로 수렴시켜 직접 원장 쓰기를 없앤다.
CREATE OR REPLACE FUNCTION public.reward_for_idea_submission(p_mission_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_post public.student_posts%ROWTYPE;
    v_mission public.writing_missions%ROWTYPE;
    v_result JSONB;
    v_reward INTEGER;
BEGIN
    IF v_student_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '학생 인증이 필요합니다.');
    END IF;
    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    JOIN public.students student ON student.class_id = mission.class_id AND student.id = v_student_id
    WHERE mission.id = p_mission_id AND mission.mission_type = 'meeting' AND mission.is_archived IS FALSE;
    SELECT post.* INTO v_post
    FROM public.student_posts post
    WHERE post.student_id = v_student_id AND post.mission_id = p_mission_id AND post.is_submitted IS TRUE;
    IF v_mission.id IS NULL OR v_post.id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '제출된 회의 안건을 찾을 수 없습니다.');
    END IF;
    v_reward := GREATEST(0, COALESCE(v_mission.base_reward, 0));
    IF v_reward = 0 THEN
        RETURN json_build_object('success', true, 'points_awarded', 0);
    END IF;
    v_result := public.point_engine_apply(
        v_student_id, v_reward,
        format('아이디어 마켓에 제안을 제출했어요! 🏛️💡 (%s)', v_mission.title),
        'meeting_activity', format('meeting:%s:submission-reward', v_post.id),
        v_post.id, p_mission_id, jsonb_build_object('source', 'meeting_submission_compat')
    );
    RETURN json_build_object(
        'success', true,
        'already_rewarded', v_result->>'status' = 'duplicate',
        'points_awarded', CASE WHEN v_result->>'status' = 'applied' THEN v_reward ELSE 0 END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reward_for_idea_submission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reward_for_idea_submission(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_archived_missions_page(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_total INTEGER;
    v_items JSONB;
BEGIN
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes class
            WHERE class.id = p_class_id AND class.teacher_id = auth.uid() AND class.deleted_at IS NULL
        )
    ) THEN
        RAISE EXCEPTION '이 학급의 보관함을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::INTEGER INTO v_total
    FROM public.writing_missions mission
    WHERE mission.class_id = p_class_id AND mission.is_archived IS TRUE;

    WITH page AS MATERIALIZED (
        SELECT mission.id, mission.title, mission.archived_at, mission.genre,
               mission.allow_comments, mission.tags, mission.min_chars, mission.max_chars
        FROM public.writing_missions mission
        WHERE mission.class_id = p_class_id AND mission.is_archived IS TRUE
        ORDER BY mission.archived_at DESC NULLS LAST, mission.id DESC
        LIMIT v_limit OFFSET v_offset
    ), student_count AS (
        SELECT count(*)::INTEGER AS total
        FROM public.students student
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM false
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    ), submission_counts AS (
        SELECT post.mission_id, count(DISTINCT post.student_id)::INTEGER AS submitted
        FROM public.student_posts post
        JOIN page ON page.id = post.mission_id
        WHERE post.class_id = p_class_id AND post.is_submitted IS TRUE
        GROUP BY post.mission_id
    )
    SELECT COALESCE(jsonb_agg(
        to_jsonb(page)
        || jsonb_build_object(
            'totalStudents', student_count.total,
            'submittedCount', COALESCE(submission_counts.submitted, 0)
        )
        ORDER BY page.archived_at DESC NULLS LAST, page.id DESC
    ), '[]'::JSONB)
    INTO v_items
    FROM page
    CROSS JOIN student_count
    LEFT JOIN submission_counts ON submission_counts.mission_id = page.id;

    RETURN jsonb_build_object(
        'items', COALESCE(v_items, '[]'::JSONB),
        'total', COALESCE(v_total, 0),
        'limit', v_limit,
        'offset', v_offset,
        'has_more', v_offset + jsonb_array_length(COALESCE(v_items, '[]'::JSONB)) < COALESCE(v_total, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_archived_missions_page(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_archived_missions_page(UUID, INTEGER, INTEGER) TO authenticated, service_role;

-- 같은 키를 두 번 유지하던 비고유 인덱스만 제거한다. 고유 제약과 사용 중인 대표 인덱스는 남긴다.
DROP INDEX IF EXISTS public.idx_student_posts_class_created_at;
DROP INDEX IF EXISTS public.idx_posts_student_id;
DROP INDEX IF EXISTS public.idx_posts_mission_id;
DROP INDEX IF EXISTS public.idx_comments_post_id;
DROP INDEX IF EXISTS public.idx_comments_student_id;
DROP INDEX IF EXISTS public.idx_post_reactions_post_id;
DROP INDEX IF EXISTS public.idx_post_reactions_student_id;
DROP INDEX IF EXISTS public.idx_students_student_code;
DROP INDEX IF EXISTS public.idx_class_writing_policies_class_type;
DROP INDEX IF EXISTS public.idx_missions_teacher_id;
DROP INDEX IF EXISTS public.idx_missions_class_id;
DROP INDEX IF EXISTS public.idx_agit_honor_roll_class_id;
DROP INDEX IF EXISTS public.idx_tower_rankings_class_id;
DROP INDEX IF EXISTS public.idx_vocab_tower_rankings_composite;

COMMIT;
