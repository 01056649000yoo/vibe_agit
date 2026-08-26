-- AI 맞춤법·학생 검색 후보를 관리자가 검토해 재배포 없이 모든 학급에 적용한다.
-- 학급 전용 자료는 그대로 유지하되, 같은 표현의 공통 자료가 있으면 중복 등록하지 않는다.

BEGIN;

ALTER TABLE public.spelling_learning_entries
    ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'teacher'
        CHECK (source_kind IN ('teacher', 'ai', 'search', 'manual'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_spelling_common_approved_expression
    ON public.spelling_learning_entries (lower(btrim(wrong_expression)))
    WHERE scope = 'common' AND status = 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_spelling_class_approved_expression
    ON public.spelling_learning_entries (class_id, lower(btrim(wrong_expression)))
    WHERE scope = 'class' AND status = 'approved';

CREATE TABLE IF NOT EXISTS public.spelling_common_reviews (
    source_kind TEXT NOT NULL CHECK (source_kind IN ('ai', 'search', 'manual')),
    expression TEXT NOT NULL CHECK (char_length(expression) BETWEEN 1 AND 40),
    source_correction TEXT NOT NULL DEFAULT '' CHECK (char_length(source_correction) <= 40),
    decision TEXT NOT NULL CHECK (decision IN ('published', 'rejected')),
    common_entry_id UUID REFERENCES public.spelling_learning_entries(id) ON DELETE SET NULL,
    note TEXT CHECK (note IS NULL OR char_length(note) <= 200),
    decided_by UUID NOT NULL REFERENCES auth.users(id),
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (source_kind, expression, source_correction)
);

COMMENT ON TABLE public.spelling_common_reviews IS
    'AI 맞춤법·학생 검색 후보의 공통 자료 게시/보류 기록. 원문·학생·학급 식별자는 담지 않는다.';

ALTER TABLE public.spelling_common_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_common_reviews FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_spelling_promotion_workspace_v2(
    p_min_classes INTEGER DEFAULT 2,
    p_min_hits INTEGER DEFAULT 3,
    p_limit INTEGER DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_min_classes INTEGER := GREATEST(COALESCE(p_min_classes, 2), 1);
    v_min_hits INTEGER := GREATEST(COALESCE(p_min_hits, 3), 1);
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'thresholds', jsonb_build_object('min_classes', v_min_classes, 'min_hits', v_min_hits),
        'ai_findings', COALESCE((
            SELECT jsonb_agg(to_jsonb(candidate) ORDER BY candidate.class_count DESC, candidate.hit_count DESC)
            FROM (
                SELECT finding.expression, finding.correction, finding.hit_count, finding.class_count,
                       finding.first_seen_at, finding.last_seen_at
                FROM public.spelling_ai_findings finding
                WHERE finding.class_count >= v_min_classes
                  AND finding.hit_count >= v_min_hits
                  AND NOT EXISTS (
                      SELECT 1 FROM public.spelling_common_reviews review
                      WHERE review.source_kind = 'ai'
                        AND review.expression = finding.expression
                        AND review.source_correction = finding.correction
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM public.spelling_promotion_decisions legacy
                      WHERE legacy.expression = finding.expression
                        AND legacy.correction = finding.correction
                  )
                ORDER BY finding.class_count DESC, finding.hit_count DESC
                LIMIT v_limit
            ) candidate
        ), '[]'::JSONB),
        'searched', COALESCE((
            SELECT jsonb_agg(to_jsonb(candidate) ORDER BY candidate.class_count DESC, candidate.search_count DESC)
            FROM (
                SELECT corpus.expression, corpus.label, corpus.search_count, corpus.class_count,
                       corpus.first_seen_at, corpus.last_seen_at
                FROM public.spelling_search_corpus corpus
                WHERE corpus.class_count >= v_min_classes
                  AND corpus.search_count >= v_min_hits
                  AND corpus.matched IS FALSE
                  AND char_length(corpus.expression) BETWEEN 2 AND 15
                  AND array_length(regexp_split_to_array(corpus.expression, '\s+'), 1) <= 2
                  AND corpus.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
                  AND NOT EXISTS (
                      SELECT 1 FROM public.spelling_common_reviews review
                      WHERE review.source_kind = 'search'
                        AND review.expression = corpus.expression
                        AND review.source_correction = ''
                  )
                ORDER BY corpus.class_count DESC, corpus.search_count DESC
                LIMIT v_limit
            ) candidate
        ), '[]'::JSONB),
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
        ), '[]'::JSONB),
        'reviewed_recent', COALESCE((
            SELECT jsonb_agg(to_jsonb(review_row) ORDER BY review_row.decided_at DESC)
            FROM (
                SELECT review.source_kind, review.expression, review.source_correction,
                       review.decision, review.common_entry_id, review.decided_at
                FROM public.spelling_common_reviews review
                ORDER BY review.decided_at DESC
                LIMIT 50
            ) review_row
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_publish_common_spelling_entry_v1(
    p_source_kind TEXT,
    p_expression TEXT,
    p_source_correction TEXT,
    p_entry JSONB,
    p_entry_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_source_kind TEXT := btrim(COALESCE(p_source_kind, ''));
    v_expression TEXT := btrim(COALESCE(p_expression, ''));
    v_source_correction TEXT := btrim(COALESCE(p_source_correction, ''));
    v_wrong TEXT := btrim(COALESCE(p_entry->>'wrong_expression', ''));
    v_correct TEXT := btrim(COALESCE(p_entry->>'correct_expression', ''));
    v_label TEXT := btrim(COALESCE(p_entry->>'label', '미분류'));
    v_explanation TEXT := btrim(COALESCE(p_entry->>'explanation', ''));
    v_examples JSONB := COALESCE(p_entry->'examples', '[]'::JSONB);
    v_id UUID;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 공통 맞춤법 자료를 게시할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF v_source_kind NOT IN ('ai', 'search', 'manual')
       OR char_length(v_expression) NOT BETWEEN 1 AND 40
       OR char_length(v_source_correction) > 40 THEN
        RAISE EXCEPTION '승격 후보의 출처와 표현을 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_wrong) NOT BETWEEN 1 AND 40
       OR char_length(v_correct) NOT BETWEEN 1 AND 40
       OR lower(v_wrong) = lower(v_correct)
       OR char_length(v_label) NOT BETWEEN 1 AND 40
       OR char_length(v_explanation) NOT BETWEEN 1 AND 600
       OR jsonb_typeof(v_examples) <> 'array'
       OR jsonb_array_length(v_examples) > 4
       OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_examples) example
            WHERE jsonb_typeof(example) <> 'string'
               OR char_length(example #>> '{}') > 150
       ) THEN
        RAISE EXCEPTION '공통 맞춤법 자료의 입력 범위를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('common-spelling:' || lower(v_wrong)));

    IF p_entry_id IS NOT NULL THEN
        UPDATE public.spelling_learning_entries entry
        SET wrong_expression = v_wrong,
            correct_expression = v_correct,
            label = v_label,
            explanation = v_explanation,
            examples = v_examples,
            status = 'approved',
            source_kind = v_source_kind,
            approved_by = auth.uid(),
            approved_at = NOW(),
            updated_at = NOW()
        WHERE entry.id = p_entry_id
          AND entry.scope = 'common'
        RETURNING entry.id INTO v_id;
        IF v_id IS NULL THEN
            RAISE EXCEPTION '수정할 공통 맞춤법 자료를 찾지 못했습니다.' USING ERRCODE = '22023';
        END IF;
    ELSE
        SELECT entry.id INTO v_id
        FROM public.spelling_learning_entries entry
        WHERE entry.scope = 'common'
          AND lower(btrim(entry.wrong_expression)) = lower(v_wrong)
        ORDER BY entry.updated_at DESC
        LIMIT 1
        FOR UPDATE;

        IF v_id IS NULL THEN
            INSERT INTO public.spelling_learning_entries(
                class_id, scope, status, wrong_expression, correct_expression,
                label, explanation, examples, created_by, approved_by,
                approved_at, source_kind
            ) VALUES (
                NULL, 'common', 'approved', v_wrong, v_correct,
                v_label, v_explanation, v_examples, auth.uid(), auth.uid(),
                NOW(), v_source_kind
            ) RETURNING id INTO v_id;
        ELSE
            UPDATE public.spelling_learning_entries entry
            SET correct_expression = v_correct,
                label = v_label,
                explanation = v_explanation,
                examples = v_examples,
                status = 'approved',
                source_kind = v_source_kind,
                approved_by = auth.uid(),
                approved_at = NOW(),
                updated_at = NOW()
            WHERE entry.id = v_id;
        END IF;
    END IF;

    INSERT INTO public.spelling_common_reviews(
        source_kind, expression, source_correction, decision,
        common_entry_id, decided_by, decided_at
    ) VALUES (
        v_source_kind, v_expression, v_source_correction, 'published',
        v_id, auth.uid(), NOW()
    )
    ON CONFLICT (source_kind, expression, source_correction) DO UPDATE SET
        decision = 'published',
        common_entry_id = EXCLUDED.common_entry_id,
        decided_by = EXCLUDED.decided_by,
        decided_at = NOW();

    RETURN jsonb_build_object('id', v_id, 'status', 'approved', 'scope', 'common');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_spelling_candidate_v1(
    p_source_kind TEXT,
    p_expression TEXT,
    p_source_correction TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_source_kind TEXT := btrim(COALESCE(p_source_kind, ''));
    v_expression TEXT := btrim(COALESCE(p_expression, ''));
    v_source_correction TEXT := btrim(COALESCE(p_source_correction, ''));
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 승격 후보를 보류할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF v_source_kind NOT IN ('ai', 'search')
       OR char_length(v_expression) NOT BETWEEN 1 AND 40
       OR char_length(v_source_correction) > 40 THEN
        RAISE EXCEPTION '보류할 후보를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.spelling_common_reviews(
        source_kind, expression, source_correction, decision, decided_by, decided_at
    ) VALUES (
        v_source_kind, v_expression, v_source_correction, 'rejected', auth.uid(), NOW()
    )
    ON CONFLICT (source_kind, expression, source_correction) DO UPDATE SET
        decision = 'rejected',
        common_entry_id = NULL,
        decided_by = EXCLUDED.decided_by,
        decided_at = NOW();

    RETURN jsonb_build_object('decision', 'rejected');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_common_spelling_entry_status_v1(
    p_entry_id UUID,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_status TEXT := CASE WHEN COALESCE(p_enabled, FALSE) THEN 'approved' ELSE 'disabled' END;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 공통 맞춤법 자료 상태를 바꿀 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.spelling_learning_entries entry
    SET status = v_status,
        approved_by = CASE WHEN v_status = 'approved' THEN auth.uid() ELSE entry.approved_by END,
        approved_at = CASE WHEN v_status = 'approved' THEN NOW() ELSE entry.approved_at END,
        updated_at = NOW()
    WHERE entry.id = p_entry_id
      AND entry.scope = 'common'
    RETURNING entry.id INTO v_id;

    IF v_id IS NULL THEN
        RAISE EXCEPTION '상태를 바꿀 공통 맞춤법 자료를 찾지 못했습니다.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('id', v_id, 'status', v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_spelling_entries_v2()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH student_scope AS MATERIALIZED (
        SELECT student.class_id
        FROM public.students student
        WHERE student.auth_id = auth.uid()
          AND student.deleted_at IS NULL
        LIMIT 1
    ), ranked AS MATERIALIZED (
        SELECT entry.id, entry.wrong_expression, entry.correct_expression, entry.label,
               entry.explanation, entry.examples, entry.scope, entry.source_kind, entry.updated_at,
               row_number() OVER (
                   PARTITION BY lower(btrim(entry.wrong_expression))
                   ORDER BY CASE WHEN entry.scope = 'common' THEN 0 ELSE 1 END, entry.updated_at DESC
               ) AS duplicate_rank
        FROM student_scope student
        JOIN public.spelling_learning_entries entry
          ON (entry.scope = 'common' OR entry.class_id = student.class_id)
         AND entry.status = 'approved'
    ), selected AS MATERIALIZED (
        SELECT ranked.id, ranked.wrong_expression, ranked.correct_expression, ranked.label,
               ranked.explanation, ranked.examples, ranked.scope, ranked.source_kind, ranked.updated_at
        FROM ranked
        WHERE ranked.duplicate_rank = 1
        ORDER BY CASE WHEN ranked.scope = 'common' THEN 0 ELSE 1 END, ranked.updated_at DESC
        LIMIT 100
    )
    SELECT jsonb_build_object(
        'version', COALESCE((SELECT max(ranked.updated_at)::TEXT FROM ranked), ''),
        'entries', COALESCE((
            SELECT jsonb_agg(to_jsonb(selected_row)
                             ORDER BY CASE WHEN selected_row.scope = 'common' THEN 0 ELSE 1 END,
                                      selected_row.updated_at DESC)
            FROM selected selected_row
        ), '[]'::JSONB)
    );
$$;

CREATE OR REPLACE FUNCTION public.get_spelling_learning_workspace_v3(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_common JSONB;
BEGIN
    -- 기존 V2가 담당 교사 권한과 학급 직접 범위를 먼저 검증한다.
    v_base := public.get_spelling_learning_workspace_v2(p_class_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(entry_row) ORDER BY entry_row.updated_at DESC), '[]'::JSONB)
    INTO v_common
    FROM (
        SELECT entry.id, entry.wrong_expression, entry.correct_expression, entry.label,
               entry.explanation, entry.examples, entry.status, entry.source_kind, entry.updated_at
        FROM public.spelling_learning_entries entry
        WHERE entry.scope = 'common'
          AND entry.status = 'approved'
        ORDER BY entry.updated_at DESC
        LIMIT 100
    ) entry_row;
    RETURN v_base || jsonb_build_object('common_entries', v_common);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_spelling_learning_entry_v1(
    p_class_id UUID, p_entry_id UUID, p_entry JSONB, p_approve BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
    v_wrong TEXT;
    v_correct TEXT;
    v_label TEXT;
    v_explanation TEXT;
    v_examples JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
          AND class.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION '이 학급의 맞춤법 항목을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_wrong := btrim(COALESCE(p_entry->>'wrong_expression', ''));
    v_correct := btrim(COALESCE(p_entry->>'correct_expression', ''));
    v_label := btrim(COALESCE(p_entry->>'label', '미분류'));
    v_explanation := btrim(COALESCE(p_entry->>'explanation', ''));
    v_examples := COALESCE(p_entry->'examples', '[]'::JSONB);

    IF char_length(v_wrong) NOT BETWEEN 1 AND 80
       OR char_length(v_correct) NOT BETWEEN 1 AND 80
       OR char_length(v_label) NOT BETWEEN 1 AND 40
       OR char_length(v_explanation) NOT BETWEEN 1 AND 600
       OR jsonb_typeof(v_examples) <> 'array'
       OR jsonb_array_length(v_examples) > 4 THEN
        RAISE EXCEPTION '맞춤법 항목의 입력 범위를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    IF p_approve AND EXISTS (
        SELECT 1 FROM public.spelling_learning_entries common_entry
        WHERE common_entry.scope = 'common'
          AND common_entry.status = 'approved'
          AND lower(btrim(common_entry.wrong_expression)) = lower(v_wrong)
    ) THEN
        RAISE EXCEPTION '이미 모든 학급에 적용되는 공통 맞춤법 자료가 있습니다.' USING ERRCODE = '23505';
    END IF;

    IF p_approve AND EXISTS (
        SELECT 1 FROM public.spelling_learning_entries class_entry
        WHERE class_entry.class_id = p_class_id
          AND class_entry.scope = 'class'
          AND class_entry.status = 'approved'
          AND lower(btrim(class_entry.wrong_expression)) = lower(v_wrong)
          AND class_entry.id IS DISTINCT FROM p_entry_id
    ) THEN
        RAISE EXCEPTION '우리 반에 같은 표현의 맞춤법 자료가 이미 있습니다.' USING ERRCODE = '23505';
    END IF;

    IF p_entry_id IS NULL THEN
        INSERT INTO public.spelling_learning_entries(
            class_id, wrong_expression, correct_expression, label, explanation,
            examples, created_by, status, approved_by, approved_at, source_kind
        ) VALUES (
            p_class_id, v_wrong, v_correct, v_label, v_explanation,
            v_examples, auth.uid(), CASE WHEN p_approve THEN 'approved' ELSE 'draft' END,
            CASE WHEN p_approve THEN auth.uid() END,
            CASE WHEN p_approve THEN NOW() END,
            'teacher'
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE public.spelling_learning_entries entry
        SET wrong_expression = v_wrong,
            correct_expression = v_correct,
            label = v_label,
            explanation = v_explanation,
            examples = v_examples,
            status = CASE WHEN p_approve THEN 'approved' ELSE 'draft' END,
            approved_by = CASE WHEN p_approve THEN auth.uid() ELSE NULL END,
            approved_at = CASE WHEN p_approve THEN NOW() ELSE NULL END,
            source_kind = 'teacher',
            updated_at = NOW()
        WHERE entry.id = p_entry_id
          AND entry.class_id = p_class_id
          AND entry.scope = 'class'
        RETURNING entry.id INTO v_id;
        IF v_id IS NULL THEN
            RAISE EXCEPTION '수정할 항목을 찾지 못했습니다.' USING ERRCODE = '22023';
        END IF;
    END IF;

    RETURN jsonb_build_object('id', v_id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'draft' END);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_spelling_promotion_workspace_v2(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_publish_common_spelling_entry_v1(TEXT, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_reject_spelling_candidate_v1(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_common_spelling_entry_status_v1(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_student_spelling_entries_v2() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_spelling_learning_workspace_v3(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_spelling_promotion_workspace_v2(INTEGER, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_publish_common_spelling_entry_v1(TEXT, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_spelling_candidate_v1(TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_common_spelling_entry_status_v1(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_spelling_entries_v2() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_spelling_learning_workspace_v3(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
