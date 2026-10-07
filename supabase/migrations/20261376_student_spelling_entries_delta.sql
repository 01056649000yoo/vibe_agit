-- 학생 글쓰기 맞춤법 밑줄 자료: 한도 100 → 3000, 기기에 저장해 두고 바뀐 것만 받기(2026-10-07, 선생님 결정).
-- [까닭] 공통 자료 70개 + 반영 대기 36개로 곧 100개를 넘어, 오래된 맞춤법부터 밑줄이 조용히 빠질 참이었다.
--        또 학생 화면이 1분마다 목록 전체를 다시 받았다.
-- 새 판 v3: 공통 자료는 `p_common_since`(기기가 가진 마지막 시각) 뒤에 바뀐 줄만 — 꺼진 것도 status 를 달아 보내
-- 기기가 지운다. 처음(NULL)이면 켜진 것 전부(최대 3000). 반별 수첩은 몇 개뿐이라 늘 통째로.
-- 공통 자료는 모든 수정이 updated_at 을 고치고 지우는 길이 없다(2026-10-07 확인) — 그래도 기기는 개수를 맞춰 보고
-- 어긋나면 처음부터 다시 받는다. 옛 판 v2 는 지운다.

CREATE OR REPLACE FUNCTION public.spelling_student_entry_limit_v1()
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$ SELECT 3000 $$;

CREATE INDEX IF NOT EXISTS idx_spelling_common_updated
    ON public.spelling_learning_entries (updated_at DESC)
    WHERE scope = 'common';

CREATE OR REPLACE FUNCTION public.get_student_spelling_entries_v3(p_common_since TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_class_id UUID;
    v_limit INTEGER := public.spelling_student_entry_limit_v1();
    v_total INTEGER;
    v_full BOOLEAN;
BEGIN
    SELECT student.class_id INTO v_class_id
    FROM public.students student
    WHERE student.auth_id = auth.uid() AND student.deleted_at IS NULL
    LIMIT 1;
    IF v_class_id IS NULL THEN
        RETURN jsonb_build_object('full', TRUE, 'common_version', NULL, 'common_count', 0, 'common', '[]'::JSONB, 'class_entries', '[]'::JSONB);
    END IF;

    SELECT count(*) INTO v_total FROM public.spelling_learning_entries entry
    WHERE entry.scope = 'common' AND entry.status = 'approved';
    -- 한도를 넘으면 늘 통째로(최근 것부터 한도까지) — 바뀐 것만 받으면 기기와 개수가 영영 안 맞는다.
    v_full := p_common_since IS NULL OR v_total > v_limit;

    RETURN jsonb_build_object(
        'full', v_full,
        'common_version', (SELECT max(entry.updated_at) FROM public.spelling_learning_entries entry WHERE entry.scope = 'common'),
        'common_count', LEAST(v_total, v_limit),
        'common', COALESCE((
            SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.updated_at DESC)
            FROM (
                SELECT entry.id, entry.wrong_expression, entry.correct_expression, entry.label,
                       entry.explanation, entry.examples, entry.source_kind, entry.status, entry.updated_at
                FROM public.spelling_learning_entries entry
                WHERE entry.scope = 'common'
                  AND (
                      (v_full AND entry.status = 'approved')
                      -- 같은 순간에 끝난 쓰기를 놓치지 않게 5분 겹쳐 받는다(받은 쪽에서 덮어쓰므로 겹쳐도 같다).
                      OR (NOT v_full AND entry.updated_at > p_common_since - INTERVAL '5 minutes')
                  )
                ORDER BY entry.updated_at DESC
                LIMIT v_limit
            ) row_data
        ), '[]'::JSONB),
        'class_entries', COALESCE((
            SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.updated_at DESC)
            FROM (
                SELECT entry.id, entry.wrong_expression, entry.correct_expression, entry.label,
                       entry.explanation, entry.examples, entry.source_kind, entry.updated_at
                FROM public.spelling_learning_entries entry
                WHERE entry.scope = 'class' AND entry.class_id = v_class_id AND entry.status = 'approved'
                ORDER BY entry.updated_at DESC
                LIMIT 200
            ) row_data
        ), '[]'::JSONB)
    );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_student_spelling_entries_v3(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_spelling_entries_v3(TIMESTAMPTZ) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_student_spelling_entries_v2();

CREATE OR REPLACE FUNCTION public.admin_get_spelling_promotion_workspace_v3()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_candidate_week DATE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT run.week_start INTO v_candidate_week
    FROM public.spelling_weekly_review_runs run
    WHERE run.status IN ('ready', 'empty')
    ORDER BY run.week_start DESC
    LIMIT 1;

    SELECT jsonb_build_object(
        -- 학생 글쓰기 밑줄이 받는 공통 자료 한도와 지금 수(2026-10-07). 화면이 80% 에서 경고한다.
        'student_entry_limit', public.spelling_student_entry_limit_v1(),
        'common_approved_count', (
            SELECT count(*) FROM public.spelling_learning_entries entry
            WHERE entry.scope = 'common' AND entry.status = 'approved'
        ),
        'latest_run', COALESCE((
            SELECT to_jsonb(run_row)
            FROM (
                SELECT run.week_start, run.status, run.collected_count, run.known_filtered_count,
                       run.cache_hit_count, run.ai_reviewed_count, run.catalog_version,
                       run.model, run.error_code, run.started_at, run.finished_at
                FROM public.spelling_weekly_review_runs run
                ORDER BY run.week_start DESC, run.started_at DESC
                LIMIT 1
            ) run_row
        ), 'null'::JSONB),
        'candidate_week', v_candidate_week,
        'weekly_candidates', COALESCE((
            SELECT jsonb_agg(to_jsonb(item_row)
                ORDER BY CASE item_row.ai_verdict WHEN 'recommend' THEN 0 WHEN 'caution' THEN 1 ELSE 2 END,
                         item_row.class_count DESC, item_row.hit_count DESC)
            FROM (
                -- 2026-10-01: 최신 주만이 아니라 **모든 주의** 남은 후보를 보인다(예전 주 대기 305개가 화면에 없었다).
                -- 같은 표현은 자동 정리(spelling_weekly_auto_triage_v1)가 하나만 남긴다.
                SELECT item.id, item.week_start, item.source_kinds, item.primary_source, item.expression,
                       item.source_correction, item.hit_count, item.class_count, item.similar_matches,
                       item.ai_verdict, item.ai_correct_expression, item.ai_label,
                       item.ai_explanation, item.ai_examples, item.ai_reason, item.cache_hit,
                       item.created_at,
                       public.spelling_weekly_item_is_priority(item.class_count, item.hit_count) AS is_priority
                FROM public.spelling_weekly_review_items item
                WHERE item.decision = 'pending'
                ORDER BY item.week_start DESC, item.created_at DESC
                LIMIT 500
            ) item_row
        ), '[]'::JSONB),
        -- 자동으로 뺀 것(최근 200). 관리자가 보고 되돌릴 수 있다.
        'auto_closed', COALESCE((
            SELECT jsonb_agg(to_jsonb(closed_row) ORDER BY closed_row.decided_at DESC)
            FROM (
                SELECT item.id, item.week_start, item.expression, item.source_correction,
                       item.ai_verdict, item.ai_correct_expression, item.ai_reason,
                       item.class_count, item.hit_count, item.auto_reason, item.decided_at
                FROM public.spelling_weekly_review_items item
                WHERE item.decision = 'rejected' AND item.auto_reason IS NOT NULL
                ORDER BY item.decided_at DESC
                LIMIT 200
            ) closed_row
        ), '[]'::JSONB),
        'auto_closed_count', (
            SELECT count(*) FROM public.spelling_weekly_review_items item
            WHERE item.decision = 'rejected' AND item.auto_reason IS NOT NULL
        ),
        'common_entries', COALESCE((
            SELECT jsonb_agg(to_jsonb(entry_row) ORDER BY entry_row.status, entry_row.updated_at DESC)
            FROM (
                SELECT entry.id, entry.wrong_expression, entry.correct_expression, entry.label,
                       entry.explanation, entry.examples, entry.status, entry.source_kind,
                       entry.approved_at, entry.updated_at
                FROM public.spelling_learning_entries entry
                WHERE entry.scope = 'common'
                ORDER BY entry.updated_at DESC
                LIMIT 100
            ) entry_row
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';
