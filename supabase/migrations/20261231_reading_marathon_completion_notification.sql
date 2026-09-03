-- ============================================================================
-- 🏅 독서마라톤 완주를 학생에게 알린다
-- 작성일: 2026-09-03
--
-- 무엇이 문제였나:
--   완주하면 메달이 조용히 쌓이기만 했다. 화면에서 달라지는 것은 카드 요약 글이 `🎉 완주!` 로 바뀌고
--   코스의 달리는 사람이 노랗게 깜빡이는 정도라, **아이가 독서마라톤 카드를 직접 열어 보지 않으면
--   완주한 줄도 몰랐다.** 이 저장소의 다른 성취(어휘의 탑 휘장, 활동 알림)는 모두 알림 원장을 거치는데
--   마라톤만 빠져 있었다.
--
-- 어떻게 고치나:
--   메달을 새로 준 그 자리에서 `notification_emit_v1` 로 알림을 남긴다. 🔔 헤더와 학생 홈이
--   이미 그 원장을 읽으므로 화면 쪽에 새 통로를 만들지 않는다.
--   같은 완주로 두 번 알리지 않도록 `event_key` 를 `marathon-medal:<캠페인>:<메달종류>` 로 고정한다.
--   알림이 실패해도 메달·거리 계산은 그대로 둔다 — 알림은 곁가지다.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_reading_marathon_campaign_v1(p_campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_medal RECORD;
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_all_teams_completed BOOLEAN := FALSE;
BEGIN
    SELECT campaign.* INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.id = p_campaign_id
    FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    UPDATE public.reading_marathon_participants participant
    SET total_pages = totals.total_pages,
        total_distance_m = totals.total_distance_m,
        book_count = totals.book_count,
        completed_at = CASE
            WHEN v_campaign.competition_type = 'individual'
             AND totals.total_distance_m >= v_campaign.target_distance_m
            THEN COALESCE(participant.completed_at, v_now)
            ELSE NULL
        END,
        updated_at = v_now
    FROM (
        SELECT roster.id AS participant_id,
               COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
               COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS total_distance_m,
               COUNT(contribution.id)::INTEGER AS book_count
        FROM public.reading_marathon_participants roster
        LEFT JOIN public.reading_marathon_contributions contribution
          ON contribution.campaign_id = roster.campaign_id
         AND contribution.class_id = roster.class_id
         AND contribution.student_id = roster.student_id
        WHERE roster.campaign_id = p_campaign_id
        GROUP BY roster.id
    ) totals
    WHERE participant.id = totals.participant_id;

    UPDATE public.reading_marathon_teams team
    SET total_pages = totals.total_pages,
        total_distance_m = totals.total_distance_m,
        book_count = totals.book_count,
        completed_at = CASE
            WHEN totals.total_distance_m >= v_campaign.target_distance_m
            THEN COALESCE(team.completed_at, v_now)
            ELSE NULL
        END,
        updated_at = v_now
    FROM (
        SELECT marathon_team.id AS team_id,
               COALESCE(SUM(participant.total_pages), 0)::BIGINT AS total_pages,
               COALESCE(SUM(participant.total_distance_m), 0)::BIGINT AS total_distance_m,
               COALESCE(SUM(participant.book_count), 0)::INTEGER AS book_count
        FROM public.reading_marathon_teams marathon_team
        LEFT JOIN public.reading_marathon_participants participant
          ON participant.team_id = marathon_team.id
         AND participant.campaign_id = marathon_team.campaign_id
         AND participant.class_id = marathon_team.class_id
        WHERE marathon_team.campaign_id = p_campaign_id
        GROUP BY marathon_team.id
    ) totals
    WHERE team.id = totals.team_id;

    -- 아직 보관하지 않은 결과는 잘못 확인한 글을 보완 요청으로 돌리면 함께 되돌린다.
    DELETE FROM public.reading_marathon_medals medal
    USING public.reading_marathon_participants participant
    LEFT JOIN public.reading_marathon_teams team ON team.id = participant.team_id
    WHERE medal.campaign_id = p_campaign_id
      AND medal.student_id = participant.student_id
      AND v_campaign.archived_at IS NULL
      AND NOT (
          CASE
              WHEN v_campaign.competition_type = 'individual'
                  THEN participant.total_distance_m >= v_campaign.target_distance_m
              ELSE team.completed_at IS NOT NULL AND (
                  v_campaign.medal_requirement_type = 'none'
                  OR (v_campaign.medal_requirement_type = 'books' AND participant.book_count >= v_campaign.medal_requirement_value)
                  OR (v_campaign.medal_requirement_type = 'pages' AND participant.total_pages >= v_campaign.medal_requirement_value)
              )
          END
      );

    INSERT INTO public.reading_marathon_medals (
        campaign_id, class_id, student_id, team_id, medal_kind, competition_type,
        campaign_title, team_name, total_pages, total_distance_m, book_count, awarded_at
    )
    SELECT
        v_campaign.id, v_campaign.class_id, participant.student_id, participant.team_id,
        CASE WHEN v_campaign.competition_type = 'individual' THEN 'individual' ELSE 'team' END,
        v_campaign.competition_type, v_campaign.title, team.name,
        participant.total_pages, participant.total_distance_m, participant.book_count,
        COALESCE(participant.completed_at, team.completed_at, v_now)
    FROM public.reading_marathon_participants participant
    LEFT JOIN public.reading_marathon_teams team ON team.id = participant.team_id
    WHERE participant.campaign_id = v_campaign.id
      AND (
          (v_campaign.competition_type = 'individual'
           AND participant.total_distance_m >= v_campaign.target_distance_m)
          OR
          (v_campaign.competition_type <> 'individual'
           AND team.completed_at IS NOT NULL
           AND (
               v_campaign.medal_requirement_type = 'none'
               OR (v_campaign.medal_requirement_type = 'books' AND participant.book_count >= v_campaign.medal_requirement_value)
               OR (v_campaign.medal_requirement_type = 'pages' AND participant.total_pages >= v_campaign.medal_requirement_value)
           ))
      )
    ON CONFLICT (campaign_id, student_id) DO NOTHING;

    /*
     * 완주를 알린다 (2026-09-03).
     *
     * 그전에는 메달이 조용히 쌓이기만 해서, 아이가 독서마라톤 카드를 직접 열어 보지 않으면
     * 완주한 줄도 몰랐다. 이 저장소의 다른 성취(휘장·활동 알림)는 모두 알림 원장을 거치는데
     * 마라톤만 빠져 있었다. 같은 원장에 넣어 🔔 와 학생 홈에 함께 뜨게 한다.
     *
     * ⚠️ `RETURNING` 은 **새로 넣은 줄만** 준다(`ON CONFLICT DO NOTHING`). 그래서 이미 받은 메달로
     *    알림이 다시 뜨지 않는다. 확인 취소로 메달을 거뒀다가 다시 주면 그때는 다시 알린다 —
     *    `event_key` 에 메달 종류와 캠페인을 넣어 같은 완주로는 한 번만 쌓이게 한다.
     */
    FOR v_medal IN
        SELECT medal.student_id, medal.medal_kind, medal.campaign_title, medal.team_name,
               medal.total_distance_m, medal.book_count
        FROM public.reading_marathon_medals medal
        WHERE medal.campaign_id = v_campaign.id
          AND medal.awarded_at >= v_now - INTERVAL '1 second'
    LOOP
        BEGIN
            PERFORM public.notification_emit_v1(
                v_medal.student_id,
                'reading-log',
                'reading-log.marathon_completed',
                'reading_marathon_campaign',
                v_campaign.id,
                jsonb_build_object(
                    'campaign_title', COALESCE(v_medal.campaign_title, '독서마라톤'),
                    'medal_kind', v_medal.medal_kind,
                    'team_name', v_medal.team_name,
                    'competition_type', v_campaign.competition_type,
                    'total_distance_m', v_medal.total_distance_m,
                    'book_count', v_medal.book_count
                ),
                format('marathon-medal:%s:%s', v_campaign.id, v_medal.medal_kind)
            );
        EXCEPTION WHEN OTHERS THEN
            -- 알림이 실패해도 메달과 거리 계산은 그대로 둔다. 알림은 곁가지다.
            NULL;
        END;
    END LOOP;

    IF v_campaign.competition_type <> 'individual' THEN
        SELECT COUNT(*) > 0 AND BOOL_AND(team.completed_at IS NOT NULL)
        INTO v_all_teams_completed
        FROM public.reading_marathon_teams team
        WHERE team.campaign_id = v_campaign.id;

        UPDATE public.reading_marathon_campaigns campaign
        SET status = CASE
                WHEN v_all_teams_completed THEN 'completed'
                WHEN campaign.status = 'completed' THEN 'active'
                ELSE campaign.status
            END,
            completed_at = CASE
                WHEN v_all_teams_completed THEN COALESCE(campaign.completed_at, v_now)
                WHEN campaign.status = 'completed' THEN NULL
                ELSE campaign.completed_at
            END,
            updated_at = v_now
        WHERE campaign.id = v_campaign.id
          AND campaign.archived_at IS NULL
          AND campaign.status IN ('active', 'completed');
    END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
