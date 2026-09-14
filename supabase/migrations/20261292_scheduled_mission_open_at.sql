-- 선생님 과제 예약 공개 (2026-09-14).
--
-- 무엇을 하나: 교사가 정한 시각이 되면 과제가 저절로 학생에게 열린다.
--
-- 왜 이렇게 만들었나:
--   학생에게 과제가 보이는지는 `is_archived` 하나로 정해지는데, 그 검사가 22개 함수 34곳에
--   흩어져 있다. `open_at <= NOW()` 같은 새 조건을 만들면 그 34곳을 모두 고쳐야 하고,
--   한 곳만 놓쳐도 **아직 열지 않은 과제가 학생에게 새어 나간다**.
--   그래서 예약 상태를 **이미 있는 숨김 스위치로 표현**한다. 학생 쪽 조회·쓰기 차단은
--   한 줄도 고치지 않는다 — 이미 숨겨지고 이미 막힌다.
--
--   is_archived=TRUE,  archived_at=NULL,  open_at=<시각>  → 예약됨 (아직 안 열림)
--   is_archived=TRUE,  archived_at=<시각>, open_at=NULL   → 보관됨 (끝난 것)
--   is_archived=FALSE,                     open_at=NULL   → 진행 중
--
--   `archived_at` 은 이미 있는 칸이라, 예약과 보관이 저절로 구분된다.

BEGIN;

ALTER TABLE public.writing_missions
    ADD COLUMN IF NOT EXISTS open_at TIMESTAMPTZ;

COMMENT ON COLUMN public.writing_missions.open_at IS
    '예약 공개 시각. 값이 있으면 아직 열지 않은 과제이며 반드시 is_archived=TRUE·archived_at=NULL 이다. '
    '열리는 순간 NULL 로 지워진다. 보관(archived_at 있음)과 헷갈리지 말 것.';

-- 가장 중요한 안전장치.
-- "예약됐는데 학생에게 보이는" 상태를 **아예 만들 수 없게** 한다. 화면 코드가 실수해도 DB 가 막는다.
ALTER TABLE public.writing_missions
    DROP CONSTRAINT IF EXISTS writing_missions_open_at_must_be_hidden;
ALTER TABLE public.writing_missions
    ADD CONSTRAINT writing_missions_open_at_must_be_hidden
    CHECK (open_at IS NULL OR (is_archived IS TRUE AND archived_at IS NULL));

-- 1분마다 "열 때가 된 것"만 집어 오는 자리. 예약 과제는 학급당 몇 건뿐이라 부분 인덱스면 충분하다.
CREATE INDEX IF NOT EXISTS idx_writing_missions_due_to_open
    ON public.writing_missions (open_at)
    WHERE is_archived IS TRUE AND open_at IS NOT NULL;

-- 학생이 표를 직접 읽어도 예약 과제는 보이지 않게 한다.
-- 기존 정책은 `class_id = auth_user_class_id()` 만 봐서, REST 로 직접 물으면 숨긴 과제도 읽혔다.
-- 보관 과제는 지금처럼 읽히게 둔다 — 학생이 이미 쓴 글의 상태를 보여 주는 화면이 그 값을 쓴다.
DROP POLICY IF EXISTS "Mission_Select_V18" ON public.writing_missions;
CREATE POLICY "Mission_Select_V18" ON public.writing_missions
FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR teacher_id = auth.uid()
    OR (class_id = public.auth_user_class_id() AND open_at IS NULL)
);

-- 열 때가 된 과제를 연다. `= NOW()` 가 아니라 `<= NOW()` 라서, 맥미니가 잠깐 꺼져 있었어도
-- 다음 차례에 저절로 따라잡는다. 몇 건을 열었는지 돌려주어 돌고 있는지 확인할 수 있게 한다.
CREATE OR REPLACE FUNCTION public.open_due_scheduled_missions_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_opened INTEGER;
BEGIN
    WITH due AS (
        UPDATE public.writing_missions
        SET is_archived = FALSE, open_at = NULL
        WHERE is_archived IS TRUE
          AND archived_at IS NULL
          AND open_at IS NOT NULL
          AND open_at <= NOW()
        RETURNING id
    )
    SELECT COUNT(*) INTO v_opened FROM due;
    RETURN v_opened;
END;
$$;

-- 브라우저에서 부를 일이 없다. 시계(pg_cron)와 관리자만 부른다.
REVOKE ALL ON FUNCTION public.open_due_scheduled_missions_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_due_scheduled_missions_v1() TO service_role;

-- 교사 화면은 예약 과제도 봐야 한다(학생에게는 계속 안 보인다).
-- 기존 목록은 `is_archived IS FALSE` 만 봐서 예약 과제가 통째로 사라졌다. 예약분을 함께 싣고
-- `open_at` 을 돌려주어, 화면이 진행 중과 예약을 나눠 보여 줄 수 있게 한다.
CREATE OR REPLACE FUNCTION public.get_teacher_mission_overview_v1(p_class_id uuid, p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
    v_submission_board JSONB;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '학급 과제 조회 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_submission_board := public.teacher_assignment_submission_board_snapshot_v1(
        p_class_id,
        v_limit,
        8
    );

    WITH mission_rows AS MATERIALIZED (
        SELECT
            mission.id, mission.title, mission.guide, mission.genre,
            mission.mission_type, mission.input_template, mission.template_config,
            mission.min_chars, mission.min_paragraphs, mission.guide_questions,
            mission.is_archived, mission.created_at, mission.base_reward,
            mission.bonus_threshold, mission.bonus_reward, mission.allow_comments,
            mission.tags, mission.evaluation_rubric, mission.open_at
        FROM public.writing_missions mission
        WHERE mission.class_id = p_class_id
          AND (mission.is_archived IS FALSE OR mission.open_at IS NOT NULL)
        ORDER BY mission.created_at DESC, mission.id DESC
        LIMIT v_limit
    )
    SELECT jsonb_build_object(
        'version', 1,
        'missions', COALESCE((
            SELECT jsonb_agg(to_jsonb(mission) ORDER BY mission.created_at DESC, mission.id DESC)
            FROM mission_rows mission
        ), '[]'::JSONB),
        'total_students', COALESCE((v_submission_board->>'total_students')::INTEGER, 0),
        'submission_counts', COALESCE(v_submission_board->'submission_counts', '{}'::JSONB),
        'submission_board', v_submission_board
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_mission_overview_v1(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_mission_overview_v1(uuid, integer) TO authenticated, service_role;

COMMIT;
