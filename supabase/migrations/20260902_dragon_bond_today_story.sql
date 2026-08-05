-- 교감을 "오늘 쓴 글을 수호룡에게 들려주기"로 바꾼다.
--
-- 그동안 교감은 클라이언트가 만든 pet_data 를 spend_student_points(0, …) 로 그대로 저장했다.
-- 그 함수는 넘어온 pet_data 를 검증하지 않으므로 교감 기록을 학생이 마음대로 쓸 수 있었다.
-- 여기서는 교감 전용 RPC 를 두고 서버가 오늘 날짜·교감 횟수·오늘의 글을 직접 계산한다.
--
-- 오늘은 한국 날짜 기준이다. 클라이언트의 UTC `toISOString()` 은 오전 9시 이전에 전날로 밀린다.

BEGIN;

-- 오늘 낸 글 / 오늘 쓰는 중인 글을 학급·학생으로 직접 좁혀 상한 1건만 읽는다.
CREATE INDEX IF NOT EXISTS idx_student_posts_class_student_submitted_day
    ON public.student_posts (class_id, student_id, first_submitted_at DESC)
    WHERE is_submitted IS TRUE;

CREATE INDEX IF NOT EXISTS idx_student_posts_class_student_draft_day
    ON public.student_posts (class_id, student_id, updated_at DESC)
    WHERE is_submitted IS FALSE;

CREATE OR REPLACE FUNCTION public.bond_with_my_dragon()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_pet_data JSONB;
    v_today DATE;
    v_day_start TIMESTAMPTZ;
    v_day_end TIMESTAMPTZ;
    v_bond_count INTEGER;
    v_already_bonded BOOLEAN;
    v_story_state TEXT := 'none';
    v_story_title TEXT;
    v_story_kind TEXT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_today := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_day_start := v_today::TIMESTAMP AT TIME ZONE 'Asia/Seoul';
    v_day_end := (v_today + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul';

    SELECT s.class_id, COALESCE(s.pet_data, '{}'::JSONB)
    INTO v_class_id, v_pet_data
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    -- 1순위: 오늘 완성해서 낸 글.
    SELECT NULLIF(BTRIM(COALESCE(p.title, '')), ''),
           CASE
               WHEN p.writing_context = 'self' AND p.self_writing_type = 'reading_log' THEN 'reading_log'
               WHEN p.mission_id IS NOT NULL THEN 'mission'
               ELSE 'free'
           END
    INTO v_story_title, v_story_kind
    FROM public.student_posts p
    WHERE p.class_id = v_class_id
      AND p.student_id = v_student_id
      AND p.is_submitted IS TRUE
      AND p.first_submitted_at >= v_day_start
      AND p.first_submitted_at < v_day_end
    ORDER BY p.first_submitted_at DESC
    LIMIT 1;

    IF FOUND THEN
        v_story_state := 'submitted';
    ELSE
        -- 2순위: 오늘 쓰는 중인 글. 완성하지 않았어도 오늘의 노력은 알아준다.
        SELECT NULLIF(BTRIM(COALESCE(p.title, '')), ''),
               CASE
                   WHEN p.writing_context = 'self' AND p.self_writing_type = 'reading_log' THEN 'reading_log'
                   WHEN p.mission_id IS NOT NULL THEN 'mission'
                   ELSE 'free'
               END
        INTO v_story_title, v_story_kind
        FROM public.student_posts p
        WHERE p.class_id = v_class_id
          AND p.student_id = v_student_id
          AND p.is_submitted IS FALSE
          AND p.updated_at >= v_day_start
          AND p.updated_at < v_day_end
        ORDER BY p.updated_at DESC
        LIMIT 1;

        IF FOUND THEN
            v_story_state := 'writing';
        ELSE
            v_story_title := NULL;
            v_story_kind := NULL;
        END IF;
    END IF;

    -- 하루에 여러 번 눌러도 교감 횟수는 하루 1회만 센다. 반응은 눌릴 때마다 돌려준다.
    v_bond_count := CASE
        WHEN jsonb_typeof(v_pet_data -> 'bondCount') = 'number'
        THEN GREATEST(0, (v_pet_data ->> 'bondCount')::INTEGER)
        ELSE 0
    END;
    v_already_bonded := (v_pet_data ->> 'lastFed') = v_today::TEXT;

    -- 이미 오늘 교감했으면 저장할 내용이 그대로다. 아이들이 연타해도 쓰기가 쌓이지 않도록
    -- 실제로 바뀔 때만 UPDATE 한다. 반응 메시지는 아래에서 그대로 돌려준다.
    IF NOT v_already_bonded THEN
        v_bond_count := v_bond_count + 1;
        v_pet_data := v_pet_data || jsonb_build_object(
            'lastFed', v_today::TEXT,
            'bondCount', v_bond_count
        );

        PERFORM set_config('app.bypass_student_trigger', 'true', true);
        UPDATE public.students
        SET pet_data = v_pet_data
        WHERE id = v_student_id;
        PERFORM set_config('app.bypass_student_trigger', 'false', true);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'pet_data', v_pet_data,
        'already_bonded_today', v_already_bonded,
        'story_state', v_story_state,
        'story_title', v_story_title,
        'story_kind', v_story_kind
    );
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.bond_with_my_dragon() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bond_with_my_dragon() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
