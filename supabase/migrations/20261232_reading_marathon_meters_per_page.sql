-- 독서마라톤: 1쪽 = 1m 를 기본으로 하고, 쪽당 거리를 교사가 정할 수 있게 한다 (2026-09-03)
--
-- 왜: 설계할 때 1쪽 = 10m 로 정했고(ROADMAP.md, 2026-08 작업 기록) 그대로 구현됐다.
-- 그런데 교사가 "1쪽은 1m 여야 한다"고 알려 왔다. 쪽수를 거리로 바꾸는 비율은 학급마다 다르게
-- 잡고 싶을 수 있어(저학년은 얇은 책, 고학년은 두꺼운 책) 값을 고를 수 있게 연다.
--
-- `meters_per_page` 칸은 처음부터 있었지만(1~100) 교사 화면이 넘겨 주지 않아 늘 10 이었다.
--
-- ⚠️ 지난 기록도 다시 계산한다. 기여 기록에 쪽수(`page_count`)가 거리와 함께 남아 있어
--    `page_count * 새 비율` 로 정확히 되살릴 수 있다. 반올림 오차가 생기지 않는다.
--
-- ⚠️ **이미 받은 메달을 거두지 않는다.** `refresh_reading_marathon_campaign_v1` 은 목표에
--    못 미치면 메달을 지운다(확인을 되돌렸을 때를 위한 규칙이다). 거리를 10분의 1로 줄이면
--    완주했던 팀이 미완주가 되어 아이 메달함에서 메달이 사라진다. 그래서 메달이 하나라도 있으면
--    이 마이그레이션은 **멈춘다** — 사람이 보고 정할 일이다.

BEGIN;

-- 1) 새로 만드는 마라톤의 기본을 1쪽 = 1m 로 한다. 이미 있는 줄은 건드리지 않는다.
ALTER TABLE public.reading_marathon_campaigns
    ALTER COLUMN meters_per_page SET DEFAULT 1;

-- 2) 돌고 있는 마라톤도 1m 로 옮긴다. 단, 메달이 걸려 있으면 멈춘다.
DO $$
DECLARE
    v_medals INTEGER;
    v_campaign RECORD;
BEGIN
    SELECT COUNT(*) INTO v_medals
    FROM public.reading_marathon_medals medal
    JOIN public.reading_marathon_campaigns campaign ON campaign.id = medal.campaign_id
    WHERE campaign.archived_at IS NULL
      AND campaign.meters_per_page <> 1;

    IF v_medals > 0 THEN
        RAISE EXCEPTION
            '아직 보관하지 않은 마라톤에 메달 %건이 있습니다. 쪽당 거리를 줄이면 완주가 취소되어 아이 메달함에서 메달이 사라집니다. 목표 거리도 함께 줄일지 사람이 정한 뒤에 다시 적용해주세요.',
            v_medals
            USING ERRCODE = '22023';
    END IF;

    FOR v_campaign IN
        SELECT id FROM public.reading_marathon_campaigns
        WHERE archived_at IS NULL AND meters_per_page <> 1
    LOOP
        UPDATE public.reading_marathon_campaigns
        SET meters_per_page = 1, updated_at = clock_timestamp()
        WHERE id = v_campaign.id;

        -- 쪽수가 남아 있어 정확히 되살린다.
        UPDATE public.reading_marathon_contributions
        SET distance_m = page_count, updated_at = clock_timestamp()
        WHERE campaign_id = v_campaign.id AND distance_m <> page_count;

        PERFORM public.refresh_reading_marathon_campaign_v1(v_campaign.id);
    END LOOP;
END;
$$;

-- 3) 교사가 쪽당 거리를 정할 수 있게 한다.
--    아래는 20261143 의 함수를 **그대로 두고** 필요한 곳만 더한 것이다(손으로 옮겨 적지 않았다).
CREATE OR REPLACE FUNCTION public.save_teacher_reading_marathon_v2(
    p_class_id UUID,
    p_title TEXT,
    p_target_distance_m INTEGER,
    p_competition_type TEXT DEFAULT 'class_team',
    p_medal_requirement_type TEXT DEFAULT 'books',
    p_medal_requirement_value INTEGER DEFAULT 1,
    p_teams JSONB DEFAULT '[]'::JSONB,
    p_ends_on DATE DEFAULT NULL,
    p_enabled BOOLEAN DEFAULT true,
    p_start_new BOOLEAN DEFAULT false,
    -- ⚠️ 새 값은 **맨 뒤에** 더한다. 앞에 끼우면 자리로 넘기는 옛 호출이 조용히 어긋난다.
    p_meters_per_page INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current public.reading_marathon_campaigns%ROWTYPE;
    v_campaign_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_team JSONB;
    v_team_id UUID;
    v_active_students INTEGER;
    v_assigned_students INTEGER;
    v_requested_members INTEGER;
    v_distinct_requested_members INTEGER;
    v_roster_repair_allowed BOOLEAN := FALSE;
    v_rate_changed BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501'; END IF;
    PERFORM 1 FROM public.classes class
    WHERE class.id = p_class_id AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '이 학급의 독서마라톤을 관리할 권한이 없습니다.' USING ERRCODE = '42501'; END IF;

    IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION '마라톤 이름은 1~60자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_target_distance_m NOT BETWEEN 1000 AND 10000000 THEN
        RAISE EXCEPTION '목표 거리는 1km~10,000km 사이로 정해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_meters_per_page NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION '쪽당 거리는 1m~100m 사이로 정해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_competition_type NOT IN ('individual', 'class_team', 'group_team') THEN
        RAISE EXCEPTION '경기 방식을 다시 선택해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_medal_requirement_type NOT IN ('none', 'books', 'pages')
       OR p_medal_requirement_value NOT BETWEEN 0 AND 100000
       OR (p_medal_requirement_type = 'none' AND p_medal_requirement_value <> 0) THEN
        RAISE EXCEPTION '메달 최소 참여 조건을 다시 확인해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_ends_on IS NOT NULL AND p_ends_on < CURRENT_DATE THEN
        RAISE EXCEPTION '종료일은 오늘 이후로 정해주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT campaign.* INTO v_current
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = p_class_id AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC LIMIT 1 FOR UPDATE;

    IF p_start_new AND v_current.id IS NOT NULL THEN
        UPDATE public.reading_marathon_campaigns
        SET status = 'archived',
            finish_reason = CASE WHEN v_current.status = 'completed' THEN 'completed' ELSE 'replaced' END,
            archived_at = v_now, updated_at = v_now
        WHERE id = v_current.id AND class_id = p_class_id;
        v_current.id := NULL;
    END IF;

    IF v_current.id IS NOT NULL AND v_current.started_at IS NOT NULL
       AND v_current.competition_type <> p_competition_type THEN
        RAISE EXCEPTION '시작한 마라톤의 경기 방식은 바꿀 수 없습니다. 결과를 보관한 뒤 새 마라톤을 만들어주세요.' USING ERRCODE = '22023';
    END IF;

    IF v_current.id IS NOT NULL
       AND v_current.started_at IS NOT NULL
       AND v_current.competition_type = 'group_team'
       AND p_competition_type = 'group_team' THEN
        SELECT NOT EXISTS (
            SELECT 1
            FROM public.reading_marathon_contributions contribution
            WHERE contribution.campaign_id = v_current.id
              AND contribution.class_id = p_class_id
        ) INTO v_roster_repair_allowed;
    END IF;

    IF v_current.id IS NULL THEN
        INSERT INTO public.reading_marathon_campaigns (
            class_id, teacher_id, title, target_distance_m, meters_per_page, competition_type,
            medal_requirement_type, medal_requirement_value, status, started_at, ends_on
        ) VALUES (
            p_class_id, auth.uid(), btrim(p_title), p_target_distance_m, p_meters_per_page, p_competition_type,
            CASE WHEN p_competition_type = 'individual' THEN 'none' ELSE p_medal_requirement_type END,
            CASE WHEN p_competition_type = 'individual' THEN 0 ELSE p_medal_requirement_value END,
            CASE WHEN p_enabled THEN 'active' ELSE 'draft' END,
            CASE WHEN p_enabled THEN v_now ELSE NULL END, p_ends_on
        ) RETURNING id INTO v_campaign_id;
    ELSE
        IF v_current.status = 'completed' AND p_enabled AND NOT p_start_new THEN
            RAISE EXCEPTION '완주한 마라톤은 결과를 보관한 뒤 새 마라톤을 시작해주세요.' USING ERRCODE = '22023';
        END IF;
        v_rate_changed := v_current.meters_per_page IS DISTINCT FROM p_meters_per_page;
        UPDATE public.reading_marathon_campaigns campaign
        SET title = btrim(p_title), target_distance_m = p_target_distance_m,
            meters_per_page = p_meters_per_page,
            competition_type = p_competition_type,
            medal_requirement_type = CASE WHEN p_competition_type = 'individual' THEN 'none' ELSE p_medal_requirement_type END,
            medal_requirement_value = CASE WHEN p_competition_type = 'individual' THEN 0 ELSE p_medal_requirement_value END,
            ends_on = p_ends_on,
            status = CASE WHEN campaign.status = 'completed' THEN 'completed'
                          WHEN p_enabled THEN 'active'
                          WHEN campaign.started_at IS NULL THEN 'draft' ELSE 'paused' END,
            started_at = CASE WHEN p_enabled THEN COALESCE(campaign.started_at, v_now) ELSE campaign.started_at END,
            teacher_id = auth.uid(), updated_at = v_now
        WHERE campaign.id = v_current.id AND campaign.class_id = p_class_id
        RETURNING id INTO v_campaign_id;

        /*
         * 쪽당 거리를 바꾸면 지난 기록도 같은 비율로 다시 센다.
         * ⚠️ 새 기록만 새 비율로 쌓으면 한 화면에 두 가지 비율이 섞여, 누가 얼마나 왔는지
         *    아무도 설명할 수 없게 된다. 기여 기록에 쪽수가 남아 있어 정확히 다시 계산된다.
         */
        IF v_rate_changed THEN
            UPDATE public.reading_marathon_contributions
            SET distance_m = page_count * p_meters_per_page, updated_at = v_now
            WHERE campaign_id = v_campaign_id;
        END IF;
    END IF;

    -- 시작 전에는 언제든 배정할 수 있다. 시작 뒤에는 기여 기록이 0건일 때만 한 번 더 고칠 수 있다.
    IF v_current.id IS NULL OR v_current.started_at IS NULL OR v_roster_repair_allowed THEN
        DELETE FROM public.reading_marathon_participants WHERE campaign_id = v_campaign_id;
        DELETE FROM public.reading_marathon_teams WHERE campaign_id = v_campaign_id;

        IF p_competition_type = 'class_team' THEN
            INSERT INTO public.reading_marathon_teams (campaign_id, class_id, name, color, sort_order)
            VALUES (v_campaign_id, p_class_id, '우리 반', '#F97316', 0)
            RETURNING id INTO v_team_id;
            INSERT INTO public.reading_marathon_participants (campaign_id, class_id, student_id, team_id, name_snapshot)
            SELECT v_campaign_id, p_class_id, student.id, v_team_id, student.name
            FROM public.students student
            WHERE student.class_id = p_class_id AND student.is_active IS DISTINCT FROM false
              AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
            ORDER BY student.name, student.id LIMIT 100;
        ELSIF p_competition_type = 'individual' THEN
            INSERT INTO public.reading_marathon_participants (campaign_id, class_id, student_id, name_snapshot)
            SELECT v_campaign_id, p_class_id, student.id, student.name
            FROM public.students student
            WHERE student.class_id = p_class_id AND student.is_active IS DISTINCT FROM false
              AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
            ORDER BY student.name, student.id LIMIT 100;
        ELSE
            IF jsonb_typeof(COALESCE(p_teams, '[]'::JSONB)) <> 'array'
               OR jsonb_array_length(COALESCE(p_teams, '[]'::JSONB)) NOT BETWEEN 2 AND 20 THEN
                RAISE EXCEPTION '모둠전은 2~20개 모둠을 만들어주세요.' USING ERRCODE = '22023';
            END IF;

            SELECT COUNT(*), COUNT(DISTINCT member.value)
            INTO v_requested_members, v_distinct_requested_members
            FROM jsonb_array_elements(p_teams) requested_team
            CROSS JOIN LATERAL jsonb_array_elements_text(
                COALESCE(requested_team.value->'student_ids', '[]'::JSONB)
            ) member;
            IF v_requested_members <> v_distinct_requested_members THEN
                RAISE EXCEPTION '학생 한 명은 한 모둠에만 배정할 수 있습니다.' USING ERRCODE = '22023';
            END IF;

            FOR v_team IN SELECT value FROM jsonb_array_elements(p_teams)
            LOOP
                IF char_length(btrim(COALESCE(v_team->>'name', ''))) NOT BETWEEN 1 AND 30 THEN
                    RAISE EXCEPTION '모둠 이름은 1~30자로 입력해주세요.' USING ERRCODE = '22023';
                END IF;
                INSERT INTO public.reading_marathon_teams (campaign_id, class_id, name, color, sort_order)
                VALUES (
                    v_campaign_id, p_class_id, btrim(v_team->>'name'),
                    CASE WHEN COALESCE(v_team->>'color', '') ~ '^#[0-9A-Fa-f]{6}$' THEN v_team->>'color' ELSE '#F97316' END,
                    COALESCE((v_team->>'sort_order')::SMALLINT, 0)
                ) RETURNING id INTO v_team_id;

                INSERT INTO public.reading_marathon_participants (campaign_id, class_id, student_id, team_id, name_snapshot)
                SELECT v_campaign_id, p_class_id, student.id, v_team_id, student.name
                FROM public.students student
                JOIN jsonb_array_elements_text(COALESCE(v_team->'student_ids', '[]'::JSONB)) member
                  ON member.value = student.id::TEXT
                WHERE student.class_id = p_class_id AND student.is_active IS DISTINCT FROM false
                  AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
            END LOOP;

            SELECT LEAST(COUNT(*)::INTEGER, 100) INTO v_active_students
            FROM public.students student
            WHERE student.class_id = p_class_id AND student.is_active IS DISTINCT FROM false
              AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
            SELECT COUNT(*)::INTEGER INTO v_assigned_students
            FROM public.reading_marathon_participants participant
            WHERE participant.campaign_id = v_campaign_id;
            IF v_assigned_students <> v_active_students THEN
                RAISE EXCEPTION '모든 학생을 한 모둠에 한 번씩 배정해주세요.' USING ERRCODE = '22023';
            END IF;
        END IF;
    END IF;

    PERFORM public.refresh_reading_marathon_campaign_v1(v_campaign_id);
    RETURN public.get_reading_marathon_snapshot_v2(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_reading_marathon_v2(
    UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, JSONB, DATE, BOOLEAN, BOOLEAN, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_teacher_reading_marathon_v2(
    UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, JSONB, DATE, BOOLEAN, BOOLEAN, INTEGER
) TO authenticated;

-- 매개변수가 하나 늘어 옛 함수가 나란히 남는다. 지워야 호출이 갈라지지 않는다.
DROP FUNCTION IF EXISTS public.save_teacher_reading_marathon_v2(
    UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, JSONB, DATE, BOOLEAN, BOOLEAN
);

COMMIT;
