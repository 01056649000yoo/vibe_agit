-- 맞춤법 주간 검수 자동 정리 스모크 (전부 롤백된다).
-- ① 마이그레이션 뒤 대기 중 `제외 권장`·같은 표현 중복이 없다 ② 새로 들어온 제외 권장은 저절로 빠진다
-- ③ 같은 표현이 공통 자료로 게시되면 대기 후보가 빠진다 ④ 되돌린 항목은 다시 빠지지 않고, 새 중복이 대신 빠진다
-- ⑤ 관리자 화면이 모든 주의 대기·먼저 볼 표시·자동으로 뺀 것을 준다 ⑥ 권한

DO $$
DECLARE
    v_admin UUID;
BEGIN
    IF EXISTS (SELECT 1 FROM public.spelling_weekly_review_items WHERE decision = 'pending' AND ai_verdict = 'reject' AND triage_locked IS FALSE) THEN
        RAISE EXCEPTION '대기 중 제외 권장이 남아 있습니다.';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.spelling_weekly_review_items WHERE decision = 'pending'
        GROUP BY public.spelling_norm(expression) HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION '같은 표현이 여러 개 대기 중입니다.';
    END IF;
    IF public.spelling_norm(' 몇 일, (이)? ') <> '몇일이' THEN
        RAISE EXCEPTION '정규화가 reviewCore 와 다릅니다: %', public.spelling_norm(' 몇 일, (이)? ');
    END IF;
    IF has_function_privilege('anon', 'public.admin_restore_weekly_spelling_entry_v1(uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.spelling_weekly_auto_triage_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION '자동 정리 함수 권한이 열려 있습니다.';
    END IF;
    SELECT p.id INTO v_admin FROM public.profiles p WHERE p.role = 'ADMIN' LIMIT 1;
    PERFORM set_config('test.st_admin', COALESCE(v_admin::TEXT, ''), true);
END;
$$;

-- ② ③ ④ 검증용 후보를 넣는다(지난 주·이번 주)
DO $$
DECLARE
    -- 후보의 주는 회차 기록이 있어야 한다(외래 키). 가장 오래된 회차를 `지난 주`, 가장 새 회차를 `이번 주` 로 쓴다.
    v_week DATE := (SELECT max(week_start) FROM public.spelling_weekly_review_runs);
    v_past DATE := (SELECT min(week_start) FROM public.spelling_weekly_review_runs);
    v_reject UUID;
    v_caution UUID;
    v_old UUID;
    v_new UUID;
    v_row public.spelling_weekly_review_items%ROWTYPE;
BEGIN
    IF v_week IS NULL OR v_week = v_past THEN
        RAISE EXCEPTION '회차 기록이 둘 이상 있어야 검증할 수 있습니다.';
    END IF;
    INSERT INTO public.spelling_weekly_review_items (week_start, review_key, source_kinds, primary_source, expression, hit_count, class_count,
        ai_verdict, ai_label, ai_explanation, ai_reason)
    VALUES (v_past, encode(sha256('smoke-triage-reject'::bytea), 'hex'), ARRAY['ai'], 'ai', '스모크제외표현', 1, 1, 'reject', '미분류', '설명', '이유')
    RETURNING id INTO v_reject;
    SELECT * INTO v_row FROM public.spelling_weekly_review_items WHERE id = v_reject;
    IF v_row.decision <> 'rejected' OR v_row.auto_reason <> 'ai_reject' THEN
        RAISE EXCEPTION '제외 권장이 저절로 빠지지 않았습니다: % %', v_row.decision, v_row.auto_reason;
    END IF;

    INSERT INTO public.spelling_weekly_review_items (week_start, review_key, source_kinds, primary_source, expression, hit_count, class_count,
        ai_verdict, ai_label, ai_explanation, ai_reason)
    VALUES (v_past, encode(sha256('smoke-triage-caution'::bytea), 'hex'), ARRAY['ai'], 'ai', '스모크 게시표현', 5, 3, 'caution', '미분류', '설명', '이유')
    RETURNING id INTO v_caution;
    INSERT INTO public.spelling_learning_entries (scope, status, wrong_expression, correct_expression, label, explanation, examples, source_kind,
        created_by, approved_by, approved_at)
    SELECT 'common', 'approved', '스모크게시표현', '스모크 게시 표현', '띄어쓰기', '설명', '[]'::jsonb, 'manual', p.id, p.id, NOW()
    FROM public.profiles p WHERE p.role = 'ADMIN' LIMIT 1;
    SELECT * INTO v_row FROM public.spelling_weekly_review_items WHERE id = v_caution;
    IF v_row.decision <> 'rejected' OR v_row.auto_reason <> 'already_common' THEN
        RAISE EXCEPTION '공통 자료가 된 표현이 대기에서 빠지지 않았습니다: % %', v_row.decision, v_row.auto_reason;
    END IF;

    -- ④ 지난 주 후보를 자동으로 뺀 뒤 되돌리면, 이번 주에 같은 표현이 와도 되돌린 쪽이 남는다
    INSERT INTO public.spelling_weekly_review_items (week_start, review_key, source_kinds, primary_source, expression, hit_count, class_count,
        ai_verdict, ai_label, ai_explanation, ai_reason)
    VALUES (v_past, encode(sha256('smoke-triage-old'::bytea), 'hex'), ARRAY['ai'], 'ai', '스모크중복', 1, 1, 'reject', '미분류', '설명', '이유')
    RETURNING id INTO v_old;
    PERFORM set_config('test.st_old', v_old::TEXT, true);
    PERFORM set_config('test.st_week', v_week::TEXT, true);
END;
$$;

DO $$
DECLARE
    v_result JSONB;
    v_row public.spelling_weekly_review_items%ROWTYPE;
    v_new UUID;
BEGIN
    IF current_setting('test.st_admin') = '' THEN
        RAISE NOTICE '관리자 계정이 없어 되돌리기·화면 검증을 건너뜁니다.';
        RETURN;
    END IF;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', current_setting('test.st_admin'), 'role', 'authenticated')::TEXT, true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.admin_restore_weekly_spelling_entry_v1(current_setting('test.st_old')::UUID);
    v_result := public.admin_get_spelling_promotion_workspace_v3();
    IF NOT (v_result ? 'auto_closed') OR NOT (v_result ? 'auto_closed_count') THEN
        RAISE EXCEPTION '관리자 화면에 자동으로 뺀 것이 없습니다.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_result->'weekly_candidates') item
        WHERE item->>'id' = current_setting('test.st_old') AND item ? 'is_priority' AND item ? 'week_start'
    ) THEN
        RAISE EXCEPTION '지난 주에 되돌린 후보가 관리자 화면에 없습니다.';
    END IF;
    RESET ROLE;

    INSERT INTO public.spelling_weekly_review_items (week_start, review_key, source_kinds, primary_source, expression, hit_count, class_count,
        ai_verdict, ai_label, ai_explanation, ai_reason)
    VALUES (current_setting('test.st_week')::DATE, encode(sha256('smoke-triage-new'::bytea), 'hex'), ARRAY['ai'], 'ai', '스모크 중복', 1, 1, 'caution', '미분류', '설명', '이유')
    RETURNING id INTO v_new;
    SELECT * INTO v_row FROM public.spelling_weekly_review_items WHERE id = current_setting('test.st_old')::UUID;
    IF v_row.decision <> 'pending' THEN
        RAISE EXCEPTION '되돌린 후보가 다시 빠졌습니다: %', v_row.auto_reason;
    END IF;
    SELECT * INTO v_row FROM public.spelling_weekly_review_items WHERE id = v_new;
    IF v_row.decision <> 'rejected' OR v_row.auto_reason <> 'duplicate' THEN
        RAISE EXCEPTION '되돌린 것과 같은 새 후보가 중복으로 빠지지 않았습니다: % %', v_row.decision, v_row.auto_reason;
    END IF;
END;
$$;
RESET ROLE;
