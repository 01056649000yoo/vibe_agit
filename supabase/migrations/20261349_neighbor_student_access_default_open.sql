-- 모두의 아지트 학생 입장을 기본으로 연다 (2026-09-25, 선생님 요청)
--
-- 예전: 반이 참여해도 학생 입장은 꺼진 채였고, 교사마다 `학생 입장 열기` 를 눌러야 학생 홈에 카드가 보였다.
--       숨은 단계라 "학생에게 안 보인다" 가 되풀이됐다.
-- 이제: 두 반 이상이 모이면(승인 순간) 참여 반 모두 학생 입장이 **저절로 열린다.** 교사가 `학생 입장 닫기` 를 눌렀을 때만 닫힌 채로 둔다.
--   · 교사가 닫았다는 사실은 `student_access_closed` 로 남긴다. 반이 한 곳만 남아 입장이 꺼졌다가(guard_neighbor_space_collapse_v1)
--     다시 두 반이 되면, 닫지 않은 반은 또 저절로 열린다.
--   · 새로 승인된 반은 닫은 기록 없이 시작한다(다시 들어온 반도 새 참여로 본다).
--   · 학생 쪽 조건(두 반 이상·활성 공간·공개 단계·학급 모듈)은 그대로다.
-- 운영 자료: 지금 운영 중인 공간의 반들은 교사가 입장을 바꾼 적이 없어(이벤트 0건) 기본값을 따라 연다.

BEGIN;

ALTER TABLE public.neighbor_space_classes
    ADD COLUMN IF NOT EXISTS student_access_closed BOOLEAN NOT NULL DEFAULT FALSE;

-- 닫은 기록이 없는 활성 반의 학생 입장을 연다(두 반 이상일 때만). 교사 화면·승인에서만 부르는 내부 함수.
CREATE OR REPLACE FUNCTION public.open_neighbor_default_access_v1(p_space_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_opened UUID[];
BEGIN
    IF (SELECT count(*) FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id AND membership.status = 'active') < 2
       OR NOT EXISTS (SELECT 1 FROM public.neighbor_spaces space WHERE space.id = p_space_id AND space.status = 'active') THEN
        RETURN 0;
    END IF;

    WITH opened AS (
        UPDATE public.neighbor_space_classes membership
        SET student_access_enabled = TRUE
        WHERE membership.space_id = p_space_id
          AND membership.status = 'active'
          AND membership.student_access_closed IS NOT TRUE
          AND membership.student_access_enabled IS NOT TRUE
        RETURNING membership.class_id
    )
    SELECT COALESCE(array_agg(class_id), '{}') INTO v_opened FROM opened;

    -- 학생 홈 카드는 학급 모듈 목록을 본다(set_neighbor_class_access_v1 과 같은 규칙).
    UPDATE public.classes class
    SET enabled_modules = array_append(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit')
    WHERE class.id = ANY(v_opened)
      AND NOT ('neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[])));

    RETURN COALESCE(array_length(v_opened, 1), 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.open_neighbor_default_access_v1(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- 참여 승인: 운영 정의 + 새 반은 닫은 기록 없이 시작하고, 두 반 이상이면 기본으로 연다.
CREATE OR REPLACE FUNCTION public.review_neighbor_join_v1(p_space_id uuid, p_class_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_status TEXT;
    v_active_count INTEGER;
BEGIN
    v_actor := public.assert_neighbor_space_host_v1(p_space_id);
    IF p_class_id IS NULL OR p_approve IS NULL THEN
        RAISE EXCEPTION '참여 신청과 승인 여부가 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.status = 'active'
    ) THEN
        RAISE EXCEPTION '활성 공간에서만 참여 신청을 처리할 수 있습니다.' USING ERRCODE = '55000';
    END IF;

    UPDATE public.neighbor_space_classes
    SET status = CASE WHEN p_approve THEN 'active' ELSE 'rejected' END,
        reviewed_at = NOW(),
        reviewed_by = v_user_id,
        joined_at = CASE WHEN p_approve THEN NOW() ELSE NULL END,
        left_at = NULL,
        student_access_enabled = FALSE,
        student_access_closed = FALSE
    WHERE space_id = p_space_id
      AND class_id = p_class_id
      AND role = 'guest'
      AND status = 'pending'
    RETURNING status INTO v_status;

    IF v_status IS NULL THEN
        RAISE EXCEPTION '대기 중인 참여 신청을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_class_id, v_user_id, v_actor,
        CASE WHEN p_approve THEN 'join_approved' ELSE 'join_rejected' END,
        'class', p_class_id
    );

    IF p_approve THEN
        PERFORM public.open_neighbor_default_access_v1(p_space_id);
    END IF;

    SELECT count(*)::INTEGER INTO v_active_count
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.status = 'active';

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', v_status,
        'active_class_count', v_active_count
    );
END;
$function$;

-- 학생 입장 켜고 끄기: 운영 정의 + 닫으면 "교사가 닫음" 을 남기고, 열면 지운다.
CREATE OR REPLACE FUNCTION public.set_neighbor_class_access_v1(p_space_id uuid, p_class_id uuid, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_active_count INTEGER;
    v_enabled BOOLEAN := COALESCE(p_enabled, FALSE);
BEGIN
    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_class_id);
    SELECT count(*)::INTEGER INTO v_active_count
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.status = 'active';

    IF v_enabled AND v_active_count < 2 THEN
        RAISE EXCEPTION '두 학급 이상 참여한 뒤 학생에게 열 수 있습니다.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.neighbor_space_classes
    SET student_access_enabled = v_enabled,
        student_access_closed = NOT v_enabled
    WHERE space_id = p_space_id AND class_id = p_class_id AND status = 'active';

    UPDATE public.classes class
    SET enabled_modules = CASE
        WHEN v_enabled AND NOT ('neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[])))
            THEN array_append(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit')
        WHEN NOT v_enabled
            THEN array_remove(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]), 'neighbor-agit')
        ELSE class.enabled_modules
    END
    WHERE class.id = p_class_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_class_id, v_user_id, v_actor,
        'class_access_changed', 'class', p_class_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'student_access_enabled', v_enabled,
        'module_enabled', v_enabled
    );
END;
$function$;

-- 지금 있는 자료: 교사가 입장을 바꾼 기록이 있고 지금 닫혀 있으면 "교사가 닫음" 으로 본다. 나머지는 기본값(열기)을 따른다.
UPDATE public.neighbor_space_classes membership
SET student_access_closed = TRUE
WHERE membership.status = 'active'
  AND membership.student_access_enabled IS NOT TRUE
  AND EXISTS (
      SELECT 1 FROM public.neighbor_space_events event
      WHERE event.space_id = membership.space_id AND event.class_id = membership.class_id
        AND event.event_type = 'class_access_changed'
  );

SELECT public.open_neighbor_default_access_v1(space.id)
FROM public.neighbor_spaces space
WHERE space.status = 'active';

NOTIFY pgrst, 'reload schema';

COMMIT;
