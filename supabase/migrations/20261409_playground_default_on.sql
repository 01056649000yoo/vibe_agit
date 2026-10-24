-- 어휘의 탑·수호룡의 인형뽑기를 모든 학급에서 기본 켬으로 바꾼다(2026-10-24 선생님 결정).
--
-- 배경: 학급 912개 중 어휘의 탑 18%·인형뽑기 2%만 켜져 있었다. 기능을 몰라서 안 켠 학급이 대부분이라
--       "기본 켬 + 공지로 안내, 안 쓰는 선생님은 끄기" 로 바꾼다. 학생 개별로는 하고 싶은 학생만 하므로 부담이 없다.
--
-- 바뀌는 것
--  1) 새 학급: 어휘의 탑은 `vocab_tower_enabled` 기본값을 true 로. 인형뽑기는 `enabled_modules` 가 NULL(설정 안 함)이면 켜진 것으로 본다.
--  2) 기존 학급: 설정 안 한 학급(`enabled_modules IS NULL`)은 어휘의 탑 플래그만 켠다(인형뽑기는 1 번 규칙이 적용된다).
--     선생님이 모듈 목록을 저장해 둔 학급은 목록에 `vocab-tower`·`spelling-claw` 를 더한다.
--  3) 예외: **한 번이라도 어휘의 탑(또는 인형뽑기)을 쓴 기록이 있는데 지금 꺼져 있는 학급**은 선생님이 일부러 끈 것으로 보고 그대로 둔다.
--  4) 서버 인형뽑기 입구 세 함수가 `enabled_modules` 가 NULL 이면 켜진 것으로 읽는다(이전엔 거절).
--  5) 인형뽑기 설정을 저장하지 않은 학급은 서버 기본값(선생님 선물 없음·포인트+수호룡 아이템, 코인 규칙은 기존 기본)이 그대로 쓰인다 — 바꿀 것 없음.
-- 포인트·코인 규칙·상품 확률 같은 값은 바꾸지 않는다(어휘의 탑 층당 보상 기본 100P 그대로).
BEGIN;

ALTER TABLE public.classes ALTER COLUMN vocab_tower_enabled SET DEFAULT TRUE;

-- 어휘의 탑: 쓴 기록이 없는 학급은 켠다(설정 안 한 학급은 이 플래그가 기준, 설정한 학급은 아래 목록 갱신이 기준).
UPDATE public.classes AS class
SET vocab_tower_enabled = TRUE
WHERE class.deleted_at IS NULL
  AND class.vocab_tower_enabled IS NOT TRUE
  AND NOT EXISTS (SELECT 1 FROM public.vocab_tower_runs run WHERE run.class_id = class.id);

UPDATE public.classes AS class
SET enabled_modules = array_append(class.enabled_modules, 'vocab-tower')
WHERE class.deleted_at IS NULL
  AND class.enabled_modules IS NOT NULL
  AND NOT ('vocab-tower' = ANY(class.enabled_modules))
  AND NOT EXISTS (SELECT 1 FROM public.vocab_tower_runs run WHERE run.class_id = class.id);

-- 인형뽑기: 설정한 학급 중 쓴 기록이 없는 학급에 더한다(설정 안 한 학급은 아래 함수가 켜진 것으로 읽는다).
UPDATE public.classes AS class
SET enabled_modules = array_append(class.enabled_modules, 'spelling-claw')
WHERE class.deleted_at IS NULL
  AND class.enabled_modules IS NOT NULL
  AND NOT ('spelling-claw' = ANY(class.enabled_modules))
  AND NOT EXISTS (SELECT 1 FROM public.spelling_claw_plays play WHERE play.class_id = class.id);

-- 인형뽑기 입구 세 함수: 설정 안 한 학급(NULL)은 켜진 것으로 읽는다.
CREATE OR REPLACE FUNCTION public.get_my_spelling_claw_context_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_student public.students%ROWTYPE;
    v_enabled BOOLEAN := false;
    v_title JSONB;
    v_writer INTEGER := 1;
    v_reader INTEGER := 1;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_settings public.spelling_claw_class_settings%ROWTYPE;
    v_today_state JSONB;
    v_recent JSONB;
    v_collection JSONB;
    v_catalog JSONB;
    v_owned JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_student FROM public.students WHERE id = v_student_id;
    SELECT COALESCE('spelling-claw' = ANY(class.enabled_modules), true) INTO v_enabled
    FROM public.classes class WHERE class.id = v_student.class_id AND class.deleted_at IS NULL;

    v_title := public.get_my_title_status();
    v_writer := public.dragon_writer_level(
        COALESCE((v_title ->> 'writer_total_chars')::BIGINT, 0),
        COALESCE((v_title ->> 'writer_completed_posts')::BIGINT, 0),
        NULLIF(v_title ->> 'writer_level_override', '')::INTEGER
    );
    v_reader := public.dragon_reader_level(
        COALESCE((v_title ->> 'reader_score')::BIGINT, 0),
        NULLIF(v_title ->> 'reader_level_override', '')::INTEGER
    );

    SELECT * INTO v_settings FROM public.spelling_claw_class_settings WHERE class_id = v_student.class_id;

    SELECT jsonb_build_object(
        'coins_earned', COUNT(*),
        'rewarded_quizzes', COUNT(DISTINCT play.attempt_id),
        'coins_left', COUNT(*) FILTER (WHERE play.status = 'coin'),
        'plays_done', COUNT(*) FILTER (WHERE play.status = 'done'),
        'prizes', COALESCE(SUM(jsonb_array_length(play.prizes)), 0),
        'consolation_points', COALESCE(SUM(play.consolation_points), 0),
        'playing_id', (ARRAY_AGG(play.id ORDER BY play.created_at) FILTER (WHERE play.status = 'playing'))[1]
    ) INTO v_today_state
    FROM public.spelling_claw_plays play
    WHERE play.student_id = v_student_id AND play.played_on = v_today;

    SELECT COALESCE(jsonb_agg(row_data ORDER BY finished_at DESC), '[]'::JSONB) INTO v_recent
    FROM (
        SELECT play.finished_at, jsonb_build_object(
            'play_id', play.id, 'finished_at', play.finished_at, 'caught', play.caught,
            'prizes', play.prizes, 'consolation_points', play.consolation_points
        ) AS row_data
        FROM public.spelling_claw_plays play
        WHERE play.student_id = v_student_id AND play.status = 'done'
          AND (jsonb_array_length(play.caught) > 0 OR play.consolation_points > 0)
        ORDER BY play.finished_at DESC
        LIMIT 30
    ) latest;

    SELECT COALESCE(jsonb_object_agg(plush_id, plush_count), '{}'::JSONB) INTO v_collection
    FROM (
        SELECT caught.value AS plush_id, COUNT(*) AS plush_count
        FROM public.spelling_claw_plays play, jsonb_array_elements_text(play.caught) caught
        WHERE play.student_id = v_student_id AND play.status = 'done'
        GROUP BY caught.value
    ) counts;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', item.id, 'slot', item.slot, 'name', item.name, 'price', item.price, 'rarity', item.rarity,
        'required_writer_level', item.required_writer_level, 'required_reader_level', item.required_reader_level,
        'acquisition_type', item.acquisition_type, 'is_default', item.is_default, 'is_active', item.is_active
    ) ORDER BY item.sort_order, item.id), '[]'::JSONB) INTO v_catalog
    FROM public.dragon_decor_catalog item WHERE item.is_active;

    v_owned := (CASE WHEN jsonb_typeof(v_student.pet_data -> 'ownedDecorItems') = 'array' THEN v_student.pet_data -> 'ownedDecorItems' ELSE '[]'::JSONB END)
        || (CASE WHEN jsonb_typeof(v_student.pet_data -> 'ownedItems') = 'array' THEN v_student.pet_data -> 'ownedItems' ELSE '[]'::JSONB END);

    RETURN jsonb_build_object(
        'student_id', v_student_id,
        'class_id', v_student.class_id,
        'name', v_student.name,
        'enabled', v_enabled,
        'species', v_student.pet_data ->> 'species',
        'writer_level', v_writer,
        'reader_level', v_reader,
        'owned', v_owned,
        'catalog', v_catalog,
        'settings', COALESCE(v_settings.settings, '{}'::JSONB),
        'prize_settings', v_settings.prize_settings,
        'today', v_today_state,
        'recent', v_recent,
        'collection', v_collection,
        'total_points', COALESCE(v_student.total_points, 0)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.spelling_claw_issue_quiz_v1(p_student_id uuid, p_questions jsonb, p_pass_count smallint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_class_id UUID;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_id UUID;
BEGIN
    SELECT student.class_id INTO v_class_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id AND class.deleted_at IS NULL
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND COALESCE('spelling-claw' = ANY(class.enabled_modules), TRUE)
    FOR UPDATE OF student;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '인형뽑기를 열 수 없는 학생입니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.spelling_claw_quiz_attempts SET status = 'abandoned', finished_at = NOW()
    WHERE student_id = p_student_id AND status = 'active';

    INSERT INTO public.spelling_claw_quiz_attempts (student_id, class_id, played_on, questions, pass_count)
    VALUES (p_student_id, v_class_id, v_today, p_questions, p_pass_count)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_my_spelling_claw_play_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_today DATE := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::DATE;
    v_play_id UUID;
    v_resumed BOOLEAN := false;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT student.class_id INTO v_class_id FROM public.students student WHERE student.id = v_student_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = v_class_id AND class.deleted_at IS NULL AND COALESCE('spelling-claw' = ANY(class.enabled_modules), TRUE)
    ) THEN
        RAISE EXCEPTION '선생님이 인형뽑기를 아직 열지 않았어요.' USING ERRCODE = '42501';
    END IF;

    SELECT play.id INTO v_play_id FROM public.spelling_claw_plays play
    WHERE play.student_id = v_student_id AND play.played_on = v_today AND play.status = 'playing'
    ORDER BY play.created_at LIMIT 1;
    IF FOUND THEN
        v_resumed := true;
    ELSE
        UPDATE public.spelling_claw_plays play SET status = 'playing', started_at = NOW()
        WHERE play.id = (
            SELECT candidate.id FROM public.spelling_claw_plays candidate
            WHERE candidate.student_id = v_student_id AND candidate.played_on = v_today AND candidate.status = 'coin'
            ORDER BY candidate.created_at LIMIT 1
        )
        RETURNING play.id INTO v_play_id;
    END IF;

    RETURN jsonb_build_object(
        'play_id', v_play_id,
        'resumed', v_resumed,
        'coins_left', (SELECT COUNT(*) FROM public.spelling_claw_plays play
                       WHERE play.student_id = v_student_id AND play.played_on = v_today AND play.status = 'coin')
    );
END;
$function$;

COMMIT;
