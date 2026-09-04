-- 쪽당 거리를 교사가 정할 수 있는지, 지난 기록이 새 비율로 맞춰졌는지 본다.
-- check-migrations.mjs 가 바깥을 BEGIN/ROLLBACK 으로 감싼다.

DO $$
DECLARE
    v_default TEXT;
    v_def TEXT;
    v_old_count INTEGER;
    v_stale INTEGER;
    v_mixed INTEGER;
BEGIN
    -- 1) 새로 만드는 마라톤은 1쪽 = 1m 로 시작한다.
    SELECT column_default INTO v_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reading_marathon_campaigns'
      AND column_name = 'meters_per_page';
    IF v_default IS NULL OR btrim(v_default) NOT LIKE '1%' THEN
        RAISE EXCEPTION '쪽당 거리의 기본값이 1m 가 아닙니다 (지금: %).', COALESCE(v_default, '없음');
    END IF;

    -- 2) 교사가 값을 넘길 수 있어야 한다.
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'save_teacher_reading_marathon_v2';
    IF v_def IS NULL THEN
        RAISE EXCEPTION '마라톤 저장 함수를 찾지 못했습니다.';
    END IF;
    IF v_def NOT LIKE '%p_meters_per_page%' THEN
        RAISE EXCEPTION '교사가 쪽당 거리를 정할 수 없습니다.';
    END IF;
    IF v_def NOT LIKE '%쪽당 거리는 1m~100m%' THEN
        RAISE EXCEPTION '쪽당 거리의 범위를 확인하지 않습니다.';
    END IF;
    -- 비율을 바꾸면 지난 기록도 같은 비율로 다시 세야 한다. 안 그러면 한 화면에 두 비율이 섞인다.
    IF v_def NOT LIKE '%page_count * p_meters_per_page%' THEN
        RAISE EXCEPTION '쪽당 거리를 바꿔도 지난 기록을 다시 계산하지 않습니다.';
    END IF;
    -- 화면이 이 결과를 그대로 받아 그린다. 돌려주는 값이 바뀌면 설정 화면이 빈다.
    IF v_def NOT LIKE '%RETURN public.get_reading_marathon_snapshot_v2(p_class_id)%' THEN
        RAISE EXCEPTION '저장 뒤 돌려주는 값이 바뀌었습니다 — 교사 설정 화면이 비어 버립니다.';
    END IF;

    -- 3) ⚠️ 매개변수가 하나 늘면 옛 함수가 나란히 남는다. 남아 있으면 어느 쪽이 불릴지 갈린다.
    SELECT COUNT(*) INTO v_old_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'save_teacher_reading_marathon_v2'
      AND p.pronargs = 10;
    IF v_old_count > 0 THEN
        RAISE EXCEPTION '매개변수 10개짜리 옛 함수가 %개 남아 있습니다.', v_old_count;
    END IF;

    -- 4) 돌고 있는 마라톤이 모두 1m 로 옮겨졌는가.
    SELECT COUNT(*) INTO v_stale
    FROM public.reading_marathon_campaigns
    WHERE archived_at IS NULL AND meters_per_page <> 1;
    IF v_stale > 0 THEN
        RAISE EXCEPTION '아직 옛 비율로 남은 마라톤이 %개 있습니다.', v_stale;
    END IF;

    -- 5) 거리와 쪽수가 그 마라톤의 비율과 어긋난 기록이 없어야 한다.
    --    하나라도 어긋나면 누가 얼마나 왔는지 설명할 수 없게 된다.
    SELECT COUNT(*) INTO v_mixed
    FROM public.reading_marathon_contributions contribution
    JOIN public.reading_marathon_campaigns campaign ON campaign.id = contribution.campaign_id
    WHERE campaign.archived_at IS NULL
      AND contribution.distance_m <> contribution.page_count * campaign.meters_per_page;
    IF v_mixed > 0 THEN
        RAISE EXCEPTION '쪽수와 거리가 비율에 맞지 않는 기록이 %건 있습니다.', v_mixed;
    END IF;
END;
$$;

SELECT '쪽당 거리 검증 통과' AS smoke_result;
