-- 모두의 아지트: 함께 쓰는 주제 기한 + 메뉴 배지 정리 (2026-09-23, 선생님 결정)
--
-- 1. 글쓰기 마감(writing_close_at): 주제를 만들 때 정한다. 시각이 지나면 5분마다 도는 cron 이
--    '활동 종료'와 같은 일(상태 closed + 반별 과제 보관)을 한다. 승인 전에 기한이 지나면 제안도
--    닫고 남은 승인 대기를 cancelled 로 돌린다 — 안 그러면 검토함·메뉴 배지에 지울 수 없는 수가 남는다.
-- 2. 기한 설정 함수를 하나로 합친다: set_neighbor_activity_deadline_v1(댓글 마감만) →
--    set_neighbor_activity_schedule_v1(p_changes 에 든 키만 바꾼다. 값 null = 기한 없음).
--    · 댓글·반응 마감은 지난 시각을 주면 "지금 마감" 으로 본다(활동 종료와 함께 닫기).
--    · 글쓰기 마감은 앞으로의 시각만, 호스트나 제안한 학급만 정한다(활동 종료가 호스트 권한이라서).
-- 3. 메뉴 배지(get_neighbor_teacher_badge_v1)에서 학생 공개 요청 수(v_reviews)를 뺀다 —
--    요청 기능은 20261317 에서 없앴다. 이제 검토함이 세는 것(주제 승인·막힌 댓글·참여 신청)과 같다.
-- 4. 교사·학생 활동 목록에 기한 두 개를 싣는다(아래 두 함수는 운영 정의에 한 줄씩만 더한 것).

BEGIN;

ALTER TABLE public.neighbor_activities ADD COLUMN IF NOT EXISTS writing_close_at TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.set_neighbor_activity_deadline_v1(UUID, UUID, UUID, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.set_neighbor_activity_schedule_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_id UUID,
    p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activity public.neighbor_activities%ROWTYPE;
    v_writing TIMESTAMPTZ;
    v_comments TIMESTAMPTZ;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION '바꿀 기한을 알려 주세요.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_activity_classes link
        WHERE link.activity_id = p_activity_id AND link.class_id = p_actor_class_id AND link.space_id = p_space_id
    ) THEN
        RAISE EXCEPTION '우리 반이 참여하는 주제만 기한을 정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    SELECT activity.* INTO v_activity FROM public.neighbor_activities activity
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id
    FOR UPDATE;
    IF v_activity.id IS NULL THEN
        RAISE EXCEPTION '기한을 정할 주제가 없습니다.' USING ERRCODE = '22023';
    END IF;

    v_writing := v_activity.writing_close_at;
    v_comments := v_activity.comments_close_at;

    IF p_changes ? 'writing_close_at' THEN
        IF v_activity.status = 'closed' THEN
            RAISE EXCEPTION '이미 글쓰기가 끝난 주제입니다.' USING ERRCODE = '55000';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM public.neighbor_spaces space
            WHERE space.id = p_space_id AND space.host_class_id = p_actor_class_id
        ) AND NOT EXISTS (
            SELECT 1 FROM public.neighbor_activity_approvals approval
            WHERE approval.activity_id = p_activity_id AND approval.class_id = p_actor_class_id
              AND approval.is_proposer
        ) THEN
            RAISE EXCEPTION '글쓰기 마감은 호스트나 주제를 낸 학급 교사가 정합니다.' USING ERRCODE = '42501';
        END IF;
        v_writing := NULLIF(p_changes->>'writing_close_at', '')::TIMESTAMPTZ;
        IF v_writing IS NOT NULL AND v_writing <= NOW() THEN
            RAISE EXCEPTION '글쓰기 마감은 지금 이후로 정해 주세요.' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_changes ? 'comments_close_at' THEN
        v_comments := NULLIF(p_changes->>'comments_close_at', '')::TIMESTAMPTZ;
        -- 지난 시각은 "지금 마감" 이다(활동 종료와 함께 댓글·반응도 닫을 때).
        IF v_comments IS NOT NULL AND v_comments < NOW() THEN
            v_comments := NOW();
        END IF;
    END IF;

    UPDATE public.neighbor_activities
    SET writing_close_at = v_writing, comments_close_at = v_comments
    WHERE id = p_activity_id AND space_id = p_space_id;

    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', p_activity_id,
        'writing_close_at', v_writing, 'comments_close_at', v_comments
    );
END;
$$;
REVOKE ALL ON FUNCTION public.set_neighbor_activity_schedule_v1(UUID, UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_neighbor_activity_schedule_v1(UUID, UUID, UUID, JSONB) TO authenticated;

-- 글쓰기 마감이 지난 주제를 닫는다(cron 전용 — 브라우저에는 열지 않는다).
CREATE OR REPLACE FUNCTION public.close_due_neighbor_activities_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ids UUID[];
BEGIN
    SELECT COALESCE(array_agg(activity.id), '{}') INTO v_ids
    FROM (
        SELECT due.id FROM public.neighbor_activities due
        WHERE due.status IN ('pending_approval', 'open')
          AND due.writing_close_at IS NOT NULL
          AND due.writing_close_at <= NOW()
        FOR UPDATE SKIP LOCKED
    ) activity;
    IF cardinality(v_ids) = 0 THEN
        RETURN 0;
    END IF;

    UPDATE public.neighbor_activities
    SET status = 'closed', closed_at = NOW()
    WHERE id = ANY(v_ids);

    UPDATE public.neighbor_activity_approvals
    SET status = 'cancelled'
    WHERE activity_id = ANY(v_ids) AND status = 'pending';

    UPDATE public.writing_missions mission
    SET is_archived = TRUE
    FROM public.neighbor_activity_classes link
    WHERE link.activity_id = ANY(v_ids) AND mission.id = link.mission_id;

    RETURN cardinality(v_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.close_due_neighbor_activities_v1()
    FROM PUBLIC, anon, authenticated, service_role;

-- 이미 닫힌 주제에 남은 승인 대기(지울 수 없는 배지의 씨앗)를 정리한다.
UPDATE public.neighbor_activity_approvals approval
SET status = 'cancelled'
FROM public.neighbor_activities activity
WHERE activity.id = approval.activity_id
  AND activity.status = 'closed'
  AND approval.status = 'pending';

-- 메뉴 배지: 검토함이 세는 것과 같게(주제 승인 + 막힌 댓글 + 호스트의 참여 신청).
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_badge_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space_id UUID;
    v_role TEXT;
    v_approvals INTEGER := 0;
    v_joins INTEGER := 0;
    v_blocked INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL
       OR NOT (public.auth_user_role() = 'ADMIN'
               OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id AND c.teacher_id = auth.uid())) THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT membership.space_id, membership.role INTO v_space_id, v_role
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id
      AND membership.status = 'active'
      AND space.status = 'active'
    LIMIT 1;
    IF v_space_id IS NULL THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT count(*)::INTEGER INTO v_approvals
    FROM public.neighbor_activity_approvals approval
    WHERE approval.space_id = v_space_id AND approval.class_id = p_class_id AND approval.status = 'pending';

    SELECT count(*)::INTEGER INTO v_blocked
    FROM public.neighbor_comments comment
    WHERE comment.space_id = v_space_id AND comment.class_id = p_class_id AND comment.status = 'blocked';

    IF v_role = 'host' THEN
        SELECT count(*)::INTEGER INTO v_joins
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space_id AND membership.status = 'pending';
    END IF;

    RETURN jsonb_build_object('count', v_approvals + v_joins + v_blocked);
END;
$$;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_badge_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_badge_v1(UUID) TO authenticated;

-- 교사 활동 목록: 운영 정의 + writing_close_at 한 줄.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_activities_v1(p_space_id uuid, p_actor_class_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(
        base.item || jsonb_build_object(
            'exchange_share_scope', activity.exchange_share_scope,
            'comments_close_at', activity.comments_close_at,
            'writing_close_at', activity.writing_close_at,
            'match_review_class_id', activity.match_review_class_id,
            'match_proposed_at', activity.match_proposed_at,
            'approvals', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'class_id', approval.class_id,
                    'class_name', membership.public_class_name,
                    'status', approval.status,
                    'is_proposer', approval.is_proposer,
                    'decided_at', approval.decided_at
                ) ORDER BY approval.is_proposer DESC, membership.public_class_name, approval.class_id)
                FROM public.neighbor_activity_approvals approval
                JOIN public.neighbor_space_classes membership
                  ON membership.space_id = approval.space_id
                 AND membership.class_id = approval.class_id
                WHERE approval.activity_id = activity.id
            ), '[]'::JSONB),
            'my_approval_status', (
                SELECT approval.status
                FROM public.neighbor_activity_approvals approval
                WHERE approval.activity_id = activity.id
                  AND approval.class_id = p_actor_class_id
            ),
            'can_review', EXISTS (
                SELECT 1 FROM public.neighbor_activity_approvals approval
                WHERE approval.activity_id = activity.id
                  AND approval.class_id = p_actor_class_id
                  AND approval.status = 'pending'
            ),
            'can_manage', EXISTS (
                SELECT 1 FROM public.neighbor_space_classes membership
                WHERE membership.space_id = p_space_id
                  AND membership.class_id = p_actor_class_id
                  AND membership.role = 'host'
            ),
            'can_propose_match', activity.activity_type = 'exchange'
                AND activity.status = 'open'
                AND EXISTS (
                    SELECT 1 FROM public.neighbor_space_classes membership
                    WHERE membership.space_id = p_space_id
                      AND membership.class_id = p_actor_class_id
                      AND membership.role = 'host'
                ),
            'can_review_match', activity.activity_type = 'exchange'
                AND activity.status = 'matching_review'
                AND activity.match_review_class_id = p_actor_class_id,
            'match_pairs', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'student_name', left(btrim(student.name), 30),
                    'student_class_name', student_membership.public_class_name,
                    'partner_name', left(btrim(partner.name), 30),
                    'partner_class_name', partner_membership.public_class_name
                ) ORDER BY student_membership.public_class_name, student.name,
                    partner_membership.public_class_name, partner.name)
                FROM public.neighbor_exchange_matches match
                JOIN public.students student
                  ON student.id = match.student_id AND student.class_id = match.class_id
                JOIN public.students partner
                  ON partner.id = match.partner_student_id AND partner.class_id = match.partner_class_id
                JOIN public.neighbor_space_classes student_membership
                  ON student_membership.space_id = match.space_id
                 AND student_membership.class_id = match.class_id
                JOIN public.neighbor_space_classes partner_membership
                  ON partner_membership.space_id = match.space_id
                 AND partner_membership.class_id = match.partner_class_id
                WHERE match.activity_id = activity.id
                  AND match.student_id < match.partner_student_id
                  AND EXISTS (
                      SELECT 1 FROM public.neighbor_activity_classes viewer_link
                      WHERE viewer_link.activity_id = activity.id
                        AND viewer_link.class_id = p_actor_class_id
                  )
            ), '[]'::JSONB)
        )
        ORDER BY base.ordinality
    ), '[]'::JSONB)
    FROM jsonb_array_elements(
        public.get_neighbor_teacher_activities_core_20261238(p_space_id, p_actor_class_id)
    ) WITH ORDINALITY AS base(item, ordinality)
    JOIN public.neighbor_activities activity
      ON activity.id = (base.item->>'id')::UUID AND activity.space_id = p_space_id;
$function$;


-- 학생 활동 목록: 운영 정의 + 기한 두 줄.
CREATE OR REPLACE FUNCTION public.get_neighbor_student_activities_v1(p_space_id uuid, p_student_id uuid, p_class_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(
        base.item || jsonb_build_object(
            'exchange_share_scope', activity.exchange_share_scope,
            'writing_close_at', activity.writing_close_at,
            'comments_close_at', activity.comments_close_at,
            'published_count', (
                SELECT count(*)::INTEGER
                FROM public.neighbor_shared_posts published
                WHERE published.activity_id = activity.id
                  AND published.status = 'published'
                  AND (
                      activity.activity_type = 'topic'
                      OR activity.exchange_share_scope = 'space'
                      OR published.student_id = p_student_id
                      OR EXISTS (
                          SELECT 1 FROM public.neighbor_exchange_matches match
                          WHERE match.activity_id = activity.id
                            AND match.student_id = p_student_id
                            AND match.partner_student_id = published.student_id
                      )
                  )
            )
        ) ORDER BY base.ordinality
    ), '[]'::JSONB)
    FROM jsonb_array_elements(
        public.get_neighbor_student_activities_core_20261238(p_space_id, p_student_id, p_class_id)
    ) WITH ORDINALITY AS base(item, ordinality)
    JOIN public.neighbor_activities activity
      ON activity.id = (base.item->>'id')::UUID AND activity.space_id = p_space_id
    WHERE NOT EXISTS (
        SELECT 1 FROM public.neighbor_activity_approvals approval
        WHERE approval.activity_id = activity.id AND approval.status <> 'approved'
    )
      AND (
          activity.activity_type <> 'exchange'
          OR (
              activity.status IN ('matched', 'closed')
              AND activity.matched_at IS NOT NULL
              AND EXISTS (
                  SELECT 1 FROM public.neighbor_exchange_matches match
                  WHERE match.activity_id = activity.id AND match.student_id = p_student_id
              )
          )
      );
$function$;


SELECT cron.unschedule('neighbor-close-due-activities')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'neighbor-close-due-activities');
SELECT cron.schedule(
    'neighbor-close-due-activities', '*/5 * * * *',
    $job$SELECT public.close_due_neighbor_activities_v1()$job$
);

NOTIFY pgrst, 'reload schema';

COMMIT;
