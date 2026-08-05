-- 교감이 "오늘 쓴 글"을 판정하는 기준을 완료 시점으로 바꾼다.
--
-- 20260902 의 첫 구현은 `student_posts.first_submitted_at` 하나로 봤는데 두 가지가 틀렸다.
--   1) 독서록은 `first_submitted_at` 이 **채워지지 않는다**(`upsert_my_reading_log_storage` 는
--      `is_submitted` 만 세운다). 그래서 오늘 작성 완료한 독서록을 영영 못 알아봤다.
--   2) 아직 제출도 안 한 초안(`is_submitted = false`)을 "쓰는 중"으로 인정해서,
--      거의 빈 글을 열어만 둬도 수호룡이 반응했다.
--
-- 새 기준:
--   * 과제  — `student_posts.approved_at` (선생님 승인 시각). 승인돼야 완성된 글로 본다.
--   * 독서록 — `writing_reward_claims` 의 completion 원장 `created_at` (작성 완료를 누른 시점).
--             이 원장은 포인트가 0이거나 일일 상한에 걸려도 완료 시 항상 남는다.
--   * 오늘 제출했지만 아직 승인 전인 과제는 `writing` 으로 따로 알려 준다 — 학생이 오늘 글을 쓴 것은
--     사실이므로 "들려줄 이야기가 없다"고 하면 안 된다.

BEGIN;

-- 승인 시각으로 오늘의 과제를 찾는 경로. 학급·학생으로 직접 좁히고 상한 1건만 읽는다.
CREATE INDEX IF NOT EXISTS idx_student_posts_class_student_approved_day
    ON public.student_posts (class_id, student_id, approved_at DESC)
    WHERE approved_at IS NOT NULL;

-- 초안 기반 판정을 그만두므로 20260902 에서 만든 초안 인덱스는 더 쓰지 않는다.
DROP INDEX IF EXISTS public.idx_student_posts_class_student_draft_day;

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
    v_mission_title TEXT;
    v_mission_at TIMESTAMPTZ;
    v_reading_title TEXT;
    v_reading_at TIMESTAMPTZ;
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

    -- 오늘 선생님이 승인한 과제 글.
    SELECT NULLIF(BTRIM(COALESCE(post.title, '')), ''), post.approved_at
    INTO v_mission_title, v_mission_at
    FROM public.student_posts post
    WHERE post.class_id = v_class_id
      AND post.student_id = v_student_id
      AND post.approved_at >= v_day_start
      AND post.approved_at < v_day_end
      AND post.mission_id IS NOT NULL
    ORDER BY post.approved_at DESC
    LIMIT 1;

    -- 오늘 작성 완료한 독서록. 완료 원장이 곧 `작성 완료` 를 누른 시점이다.
    SELECT NULLIF(BTRIM(COALESCE(post.title, '')), ''), claim.created_at
    INTO v_reading_title, v_reading_at
    FROM public.writing_reward_claims claim
    JOIN public.student_posts post
      ON post.id = claim.source_post_id
     AND post.class_id = claim.class_id
    WHERE claim.student_id = v_student_id
      AND claim.class_id = v_class_id
      AND claim.writing_type = 'reading_log'
      AND claim.reward_kind = 'completion'
      AND claim.created_at >= v_day_start
      AND claim.created_at < v_day_end
    ORDER BY claim.created_at DESC
    LIMIT 1;

    IF v_mission_at IS NOT NULL OR v_reading_at IS NOT NULL THEN
        v_story_state := 'submitted';
        IF v_reading_at IS NOT NULL
           AND (v_mission_at IS NULL OR v_reading_at >= v_mission_at) THEN
            v_story_title := v_reading_title;
            v_story_kind := 'reading_log';
        ELSE
            v_story_title := v_mission_title;
            v_story_kind := 'mission';
        END IF;
    ELSE
        -- 오늘 냈지만 아직 승인 전인 과제. 글을 쓴 것은 사실이므로 없다고 하지 않는다.
        SELECT NULLIF(BTRIM(COALESCE(post.title, '')), '')
        INTO v_story_title
        FROM public.student_posts post
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND post.is_submitted IS TRUE
          AND post.approved_at IS NULL
          AND post.first_submitted_at >= v_day_start
          AND post.first_submitted_at < v_day_end
        ORDER BY post.first_submitted_at DESC
        LIMIT 1;

        IF FOUND THEN
            v_story_state := 'writing';
            v_story_kind := 'mission';
        ELSE
            v_story_title := NULL;
            v_story_kind := NULL;
        END IF;
    END IF;

    -- 이미 오늘 교감했으면 저장할 내용이 그대로다. 아이들이 연타해도 쓰기가 쌓이지 않도록
    -- 실제로 바뀔 때만 UPDATE 한다. 반응 메시지는 아래에서 그대로 돌려준다.
    v_bond_count := CASE
        WHEN jsonb_typeof(v_pet_data -> 'bondCount') = 'number'
        THEN GREATEST(0, (v_pet_data ->> 'bondCount')::INTEGER)
        ELSE 0
    END;
    v_already_bonded := (v_pet_data ->> 'lastFed') = v_today::TEXT;

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
