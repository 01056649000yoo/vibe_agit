-- 우리 반 스크린 `오늘 현황`의 자율 글(일기·독서록)을 **제출**과 **교사 확인**으로 나눠 센다(2026-09-30 선생님 요청).
--
-- 20261139 이후 자율 글의 완료 기록(writing_reward_claims)은 교사가 확인할 때 생긴다. 그래서 현황판의
-- "N명 완료 / 오늘 N편 제출"은 실제로는 **오늘 확인된 것**만 셌고, 학생이 막 낸 글은 어디에도 잡히지 않았다.
-- 20261225 의 get_teacher_class_board_status_v1 을 그대로 두고(도구로 옮김) 일기·독서록마다 두 값만 더한다:
--   submittedStudentCount·submittedCount — 오늘 처음 제출한 학생 수·편수(student_posts.first_submitted_at).
-- 기존 completedStudentCount·submissionCount 는 뜻이 그대로(오늘 교사 확인)라 옛 화면도 틀리지 않는다.
--
-- 이 위젯은 20초마다 묻는다. 새 집계가 표를 훑지 않도록 학급·글 종류·첫 제출 시각 부분 인덱스를 둔다.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_student_posts_self_first_submitted
    ON public.student_posts (class_id, self_writing_type, first_submitted_at)
    WHERE writing_context = 'self' AND is_submitted IS TRUE;

CREATE OR REPLACE FUNCTION public.get_teacher_class_board_status_v1(
    p_class_id UUID,
    p_mission_id UUID DEFAULT NULL,
    p_sections TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_allowed TEXT[] := ARRAY['mission', 'daily', 'dailyNames', 'titles', 'reactions'];
    v_sections TEXT[];
    v_selected_mission_id UUID;
    v_selected_mission_title TEXT;
    v_snapshot JSONB := '{}'::JSONB;
    v_summary JSONB := '{}'::JSONB;
    v_student_statuses JSONB := '[]'::JSONB;
    v_total_students INTEGER;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_today_start TIMESTAMPTZ;
    v_tomorrow_start TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '해당 학급의 글쓰기 현황만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 모르는 이름은 버리고, 아무것도 안 주면 기존 구성 그대로 본다.
    SELECT COALESCE(ARRAY_AGG(item), ARRAY[]::TEXT[]) INTO v_sections
    FROM UNNEST(COALESCE(p_sections, ARRAY['mission', 'daily'])) item
    WHERE item = ANY(v_allowed);

    SELECT mission.id, mission.title
    INTO v_selected_mission_id, v_selected_mission_title
    FROM public.writing_missions mission
    WHERE mission.class_id = p_class_id
      AND mission.is_archived IS FALSE
      AND mission.mission_type IS DISTINCT FROM 'meeting'
      AND (p_mission_id IS NULL OR mission.id = p_mission_id)
    ORDER BY mission.created_at DESC, mission.id DESC
    LIMIT 1;

    IF p_mission_id IS NOT NULL AND v_selected_mission_id IS NULL THEN
        RAISE EXCEPTION '선택한 활성 글 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_total_students
    FROM public.students student
    WHERE student.class_id = p_class_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());

    -- 가장 비싼 계산. 과제 현황을 끄면 아예 돌리지 않는다.
    IF v_selected_mission_id IS NOT NULL AND 'mission' = ANY(v_sections) THEN
        v_snapshot := public.teacher_assignment_submission_board_snapshot_v2(
            p_class_id, v_selected_mission_id, 20, 1
        );
        v_summary := COALESCE(v_snapshot -> 'scope_summary', '{}'::JSONB);
        v_student_statuses := COALESCE(v_snapshot -> 'student_statuses', '[]'::JSONB);
    END IF;

    v_today_start := v_today::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_tomorrow_start := (v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    -- 화면 머리말과 설정창이 늘 필요로 하는 값은 항목과 무관하게 싸게 함께 준다.
    v_result := JSONB_BUILD_OBJECT(
        'version', 1,
        'sections', TO_JSONB(v_sections),
        'scope', CASE WHEN v_selected_mission_id IS NULL THEN 'none' ELSE 'mission' END,
        'selectedMissionId', v_selected_mission_id,
        'selectedMissionTitle', v_selected_mission_title,
        'generatedAt', NOW(),
        'today', v_today,
        'totalStudents', COALESCE(v_total_students, 0),
        'submittedCount', COALESCE((v_summary ->> 'confirmed_count')::INTEGER, 0)
            + COALESCE((v_summary ->> 'pending_count')::INTEGER, 0),
        'confirmedCount', COALESCE((v_summary ->> 'confirmed_count')::INTEGER, 0),
        'pendingCount', COALESCE((v_summary ->> 'pending_count')::INTEGER, 0),
        'rewritingCount', COALESCE((v_summary ->> 'rewriting_count')::INTEGER, 0),
        'notSubmittedCount', COALESCE((v_summary ->> 'not_submitted_count')::INTEGER, 0),
        'submitterNames', COALESCE((
            SELECT JSONB_AGG(status.item ->> 'student_name' ORDER BY status.item ->> 'student_name')
            FROM JSONB_ARRAY_ELEMENTS(v_student_statuses) status(item)
            WHERE status.item ->> 'status' IN ('confirmed', 'pending')
        ), '[]'::JSONB),
        'nonSubmitterNames', COALESCE((
            SELECT JSONB_AGG(status.item ->> 'student_name' ORDER BY status.item ->> 'student_name')
            FROM JSONB_ARRAY_ELEMENTS(v_student_statuses) status(item)
            WHERE status.item ->> 'status' IN ('rewriting', 'not_submitted')
        ), '[]'::JSONB),
        'rewritingNames', COALESCE((
            SELECT JSONB_AGG(status.item ->> 'student_name' ORDER BY status.item ->> 'student_name')
            FROM JSONB_ARRAY_ELEMENTS(v_student_statuses) status(item)
            WHERE status.item ->> 'status' = 'rewriting'
        ), '[]'::JSONB),
        'activeMissionCount', (
            SELECT COUNT(*)::INTEGER FROM (
                SELECT mission.id
                FROM public.writing_missions mission
                WHERE mission.class_id = p_class_id
                  AND mission.is_archived IS FALSE
                  AND mission.mission_type IS DISTINCT FROM 'meeting'
                ORDER BY mission.created_at DESC, mission.id DESC
                LIMIT 20
            ) active_mission
        ),
        'missionOptions', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id', mission.id, 'title', mission.title)
                ORDER BY mission.created_at DESC, mission.id DESC)
            FROM (
                SELECT item.id, item.title, item.created_at
                FROM public.writing_missions item
                WHERE item.class_id = p_class_id
                  AND item.is_archived IS FALSE
                  AND item.mission_type IS DISTINCT FROM 'meeting'
                ORDER BY item.created_at DESC, item.id DESC
                LIMIT 20
            ) mission
        ), '[]'::JSONB)
    );

    IF 'daily' = ANY(v_sections) THEN
        v_result := v_result || JSONB_BUILD_OBJECT('dailyWriting', JSONB_BUILD_OBJECT(
            'date', v_today,
            'diary', JSONB_BUILD_OBJECT(
                'completedStudentCount', (
                    SELECT COUNT(DISTINCT claim.student_id)::INTEGER
                    FROM public.writing_reward_claims claim
                    JOIN public.students student
                      ON student.id = claim.student_id
                     AND student.class_id = p_class_id
                     AND student.is_active IS DISTINCT FROM FALSE
                     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                    WHERE claim.class_id = p_class_id
                      AND claim.writing_type = 'diary'
                      AND claim.reward_kind = 'completion'
                      AND claim.created_at >= v_today_start
                      AND claim.created_at < v_tomorrow_start
                ),
                'submissionCount', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.writing_reward_claims claim
                    JOIN public.students student ON student.id = claim.student_id
                    WHERE claim.class_id = p_class_id
                      AND student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      AND claim.writing_type = 'diary'
                      AND claim.reward_kind = 'completion'
                      AND claim.created_at >= v_today_start
                      AND claim.created_at < v_tomorrow_start
                ),
                -- 오늘 제출(2026-09-30): 학생이 오늘 처음 낸 자율 글. 교사 확인과 따로 센다.
                'submittedStudentCount', (
                    SELECT COUNT(DISTINCT post.student_id)::INTEGER
                    FROM public.student_posts post
                    JOIN public.students student
                      ON student.id = post.student_id
                     AND student.class_id = p_class_id
                     AND student.is_active IS DISTINCT FROM FALSE
                     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                    WHERE post.class_id = p_class_id
                      AND post.writing_context = 'self'
                      AND post.is_submitted IS TRUE
                      AND post.self_writing_type = 'diary'
                      AND post.first_submitted_at >= v_today_start
                      AND post.first_submitted_at < v_tomorrow_start
                ),
                'submittedCount', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.student_posts post
                    JOIN public.students student
                      ON student.id = post.student_id
                     AND student.class_id = p_class_id
                     AND student.is_active IS DISTINCT FROM FALSE
                     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                    WHERE post.class_id = p_class_id
                      AND post.writing_context = 'self'
                      AND post.is_submitted IS TRUE
                      AND post.self_writing_type = 'diary'
                      AND post.first_submitted_at >= v_today_start
                      AND post.first_submitted_at < v_tomorrow_start
                ),
                'totalStudents', COALESCE(v_total_students, 0)
            ),
            'readingLog', JSONB_BUILD_OBJECT(
                'completedStudentCount', (
                    SELECT COUNT(DISTINCT claim.student_id)::INTEGER
                    FROM public.writing_reward_claims claim
                    JOIN public.students student
                      ON student.id = claim.student_id
                     AND student.class_id = p_class_id
                     AND student.is_active IS DISTINCT FROM FALSE
                     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                    WHERE claim.class_id = p_class_id
                      AND claim.writing_type = 'reading_log'
                      AND claim.reward_kind = 'completion'
                      AND claim.created_at >= v_today_start
                      AND claim.created_at < v_tomorrow_start
                ),
                'submissionCount', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.writing_reward_claims claim
                    JOIN public.students student ON student.id = claim.student_id
                    WHERE claim.class_id = p_class_id
                      AND student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      AND claim.writing_type = 'reading_log'
                      AND claim.reward_kind = 'completion'
                      AND claim.created_at >= v_today_start
                      AND claim.created_at < v_tomorrow_start
                ),
                -- 오늘 제출(2026-09-30): 학생이 오늘 처음 낸 자율 글. 교사 확인과 따로 센다.
                'submittedStudentCount', (
                    SELECT COUNT(DISTINCT post.student_id)::INTEGER
                    FROM public.student_posts post
                    JOIN public.students student
                      ON student.id = post.student_id
                     AND student.class_id = p_class_id
                     AND student.is_active IS DISTINCT FROM FALSE
                     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                    WHERE post.class_id = p_class_id
                      AND post.writing_context = 'self'
                      AND post.is_submitted IS TRUE
                      AND post.self_writing_type = 'reading_log'
                      AND post.first_submitted_at >= v_today_start
                      AND post.first_submitted_at < v_tomorrow_start
                ),
                'submittedCount', (
                    SELECT COUNT(*)::INTEGER
                    FROM public.student_posts post
                    JOIN public.students student
                      ON student.id = post.student_id
                     AND student.class_id = p_class_id
                     AND student.is_active IS DISTINCT FROM FALSE
                     AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                    WHERE post.class_id = p_class_id
                      AND post.writing_context = 'self'
                      AND post.is_submitted IS TRUE
                      AND post.self_writing_type = 'reading_log'
                      AND post.first_submitted_at >= v_today_start
                      AND post.first_submitted_at < v_tomorrow_start
                ),
                'totalStudents', COALESCE(v_total_students, 0)
            )
        ));
    END IF;

    -- 오늘 자율 글을 쓴 친구와 아직 안 쓴 친구. 이름만 주고 무엇을 썼는지는 주지 않는다.
    IF 'dailyNames' = ANY(v_sections) THEN
        v_result := v_result || JSONB_BUILD_OBJECT('dailyNames', JSONB_BUILD_OBJECT(
            'date', v_today,
            'writerNames', COALESCE((
                SELECT JSONB_AGG(roster.name ORDER BY roster.name, roster.id)
                FROM (
                    SELECT student.id, student.name
                    FROM public.students student
                    WHERE student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      AND EXISTS (
                          SELECT 1 FROM public.writing_reward_claims claim
                          WHERE claim.student_id = student.id
                            AND claim.class_id = p_class_id
                            AND claim.writing_type IN ('diary', 'reading_log')
                            AND claim.reward_kind = 'completion'
                            AND claim.created_at >= v_today_start
                            AND claim.created_at < v_tomorrow_start
                      )
                    ORDER BY student.name, student.id
                    LIMIT 100
                ) roster
            ), '[]'::JSONB),
            'restingNames', COALESCE((
                SELECT JSONB_AGG(roster.name ORDER BY roster.name, roster.id)
                FROM (
                    SELECT student.id, student.name
                    FROM public.students student
                    WHERE student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM FALSE
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      AND NOT EXISTS (
                          SELECT 1 FROM public.writing_reward_claims claim
                          WHERE claim.student_id = student.id
                            AND claim.class_id = p_class_id
                            AND claim.writing_type IN ('diary', 'reading_log')
                            AND claim.reward_kind = 'completion'
                            AND claim.created_at >= v_today_start
                            AND claim.created_at < v_tomorrow_start
                      )
                    ORDER BY student.name, student.id
                    LIMIT 100
                ) roster
            ), '[]'::JSONB)
        ));
    END IF;

    -- 오늘 새 칭호를 받은 친구. 이름·칭호 종류·단계만 주고 포인트는 주지 않는다.
    IF 'titles' = ANY(v_sections) THEN
        v_result := v_result || JSONB_BUILD_OBJECT('todayTitles', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'name', earned.name,
                'track', earned.track_id,
                'level', earned.level
            ) ORDER BY earned.created_at DESC)
            FROM (
                SELECT student.name, claim.track_id, claim.level, claim.created_at
                FROM public.student_title_reward_claims claim
                JOIN public.students student
                  ON student.id = claim.student_id
                 AND student.class_id = p_class_id
                 AND student.is_active IS DISTINCT FROM FALSE
                 AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                WHERE claim.class_id = p_class_id
                  AND claim.created_at >= v_today_start
                  AND claim.created_at < v_tomorrow_start
                ORDER BY claim.created_at DESC
                LIMIT 30
            ) earned
        ), '[]'::JSONB));
    END IF;

    -- 서로 읽어 준 정도. 숫자만 세고 누가 무엇에 남겼는지는 주지 않는다.
    IF 'reactions' = ANY(v_sections) THEN
        v_result := v_result || JSONB_BUILD_OBJECT('todayReading', JSONB_BUILD_OBJECT(
            'date', v_today,
            'commentCount', (
                SELECT COUNT(*)::INTEGER
                FROM public.post_comments comment
                WHERE comment.class_id = p_class_id
                  AND comment.status = 'approved'
                  AND comment.created_at >= v_today_start
                  AND comment.created_at < v_tomorrow_start
            ),
            'reactionCount', (
                SELECT COUNT(*)::INTEGER
                FROM public.post_reactions reaction
                WHERE reaction.class_id = p_class_id
                  AND reaction.created_at >= v_today_start
                  AND reaction.created_at < v_tomorrow_start
            )
        ));
    END IF;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_board_status_v1(UUID, UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_status_v1(UUID, UUID, TEXT[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
