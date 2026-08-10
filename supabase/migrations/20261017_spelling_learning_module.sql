BEGIN;

CREATE TABLE IF NOT EXISTS public.spelling_learning_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    scope TEXT NOT NULL DEFAULT 'class' CHECK (scope IN ('common', 'class')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'disabled')),
    wrong_expression TEXT NOT NULL CHECK (char_length(wrong_expression) BETWEEN 1 AND 80),
    correct_expression TEXT NOT NULL CHECK (char_length(correct_expression) BETWEEN 1 AND 80),
    label TEXT NOT NULL DEFAULT '미분류' CHECK (char_length(label) BETWEEN 1 AND 40),
    explanation TEXT NOT NULL CHECK (char_length(explanation) BETWEEN 1 AND 600),
    examples JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(examples) = 'array'),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((scope = 'common' AND class_id IS NULL) OR (scope = 'class' AND class_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_spelling_entries_class_status_updated
    ON public.spelling_learning_entries (class_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.class_spelling_daily_stats (
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    entry_key TEXT NOT NULL CHECK (char_length(entry_key) BETWEEN 1 AND 80),
    label TEXT NOT NULL DEFAULT '미분류' CHECK (char_length(label) BETWEEN 1 AND 40),
    display_expression TEXT CHECK (display_expression IS NULL OR char_length(display_expression) <= 80),
    search_count INTEGER NOT NULL DEFAULT 0 CHECK (search_count >= 0),
    student_count INTEGER NOT NULL DEFAULT 0 CHECK (student_count >= 0),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (class_id, event_date, entry_key)
);

CREATE INDEX IF NOT EXISTS idx_class_spelling_stats_class_date
    ON public.class_spelling_daily_stats (class_id, event_date DESC);

CREATE TABLE IF NOT EXISTS public.class_spelling_student_daily (
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    entry_key TEXT NOT NULL CHECK (char_length(entry_key) BETWEEN 1 AND 80),
    PRIMARY KEY (class_id, event_date, student_id, entry_key)
);

ALTER TABLE public.spelling_learning_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_spelling_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_spelling_student_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.spelling_learning_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.class_spelling_daily_stats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.class_spelling_student_daily FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_student_spelling_entries_v1()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.updated_at DESC), '[]'::jsonb)
    FROM (
        SELECT sle.id, sle.wrong_expression, sle.correct_expression, sle.label,
               sle.explanation, sle.examples, sle.updated_at
        FROM public.students s
        JOIN public.spelling_learning_entries sle
          ON (sle.scope = 'common' OR sle.class_id = s.class_id)
         AND sle.status = 'approved'
        WHERE s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
        ORDER BY sle.updated_at DESC
        LIMIT 100
    ) e;
$$;

CREATE OR REPLACE FUNCTION public.get_spelling_learning_workspace_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid() AND c.deleted_at IS NULL
    ) THEN RAISE EXCEPTION '이 학급의 맞춤법 데이터를 볼 권한이 없습니다.' USING ERRCODE = '42501'; END IF;

    SELECT jsonb_build_object(
        'entries', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.updated_at DESC) FROM (
            SELECT id, wrong_expression, correct_expression, label, explanation, examples, status, updated_at
            FROM public.spelling_learning_entries
            WHERE class_id = p_class_id ORDER BY updated_at DESC LIMIT 100
        ) e), '[]'::jsonb),
        'top_searches', COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.total DESC) FROM (
            SELECT stats.entry_key, max(stats.label) AS label, max(stats.display_expression) AS display,
                   sum(stats.search_count)::int AS total,
                   (SELECT count(DISTINCT seen.student_id)::int
                    FROM public.class_spelling_student_daily seen
                    WHERE seen.class_id=p_class_id AND seen.entry_key=stats.entry_key
                      AND seen.event_date >= CURRENT_DATE-30) AS students
            FROM public.class_spelling_daily_stats stats
            WHERE stats.class_id = p_class_id AND stats.event_date >= CURRENT_DATE - 30
            GROUP BY stats.entry_key ORDER BY total DESC LIMIT 30
        ) t), '[]'::jsonb)
    ) INTO v_result;
    RETURN v_result;
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
DECLARE v_id UUID; v_wrong TEXT; v_correct TEXT; v_label TEXT; v_explanation TEXT; v_examples JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid() AND c.deleted_at IS NULL
    ) THEN RAISE EXCEPTION '이 학급의 맞춤법 항목을 관리할 권한이 없습니다.' USING ERRCODE = '42501'; END IF;

    v_wrong := btrim(COALESCE(p_entry->>'wrong_expression', ''));
    v_correct := btrim(COALESCE(p_entry->>'correct_expression', ''));
    v_label := btrim(COALESCE(p_entry->>'label', '미분류'));
    v_explanation := btrim(COALESCE(p_entry->>'explanation', ''));
    v_examples := COALESCE(p_entry->'examples', '[]'::jsonb);
    IF char_length(v_wrong) NOT BETWEEN 1 AND 80 OR char_length(v_correct) NOT BETWEEN 1 AND 80
       OR char_length(v_label) NOT BETWEEN 1 AND 40 OR char_length(v_explanation) NOT BETWEEN 1 AND 600
       OR jsonb_typeof(v_examples) <> 'array' OR jsonb_array_length(v_examples) > 4 THEN
        RAISE EXCEPTION '맞춤법 항목의 입력 범위를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    IF p_entry_id IS NULL THEN
        INSERT INTO public.spelling_learning_entries(class_id, wrong_expression, correct_expression, label, explanation, examples, created_by, status, approved_by, approved_at)
        VALUES (p_class_id, v_wrong, v_correct, v_label, v_explanation, v_examples, auth.uid(), CASE WHEN p_approve THEN 'approved' ELSE 'draft' END, CASE WHEN p_approve THEN auth.uid() END, CASE WHEN p_approve THEN NOW() END)
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.spelling_learning_entries SET wrong_expression=v_wrong, correct_expression=v_correct,
            label=v_label, explanation=v_explanation, examples=v_examples,
            status=CASE WHEN p_approve THEN 'approved' ELSE 'draft' END,
            approved_by=CASE WHEN p_approve THEN auth.uid() ELSE NULL END,
            approved_at=CASE WHEN p_approve THEN NOW() ELSE NULL END, updated_at=NOW()
        WHERE id=p_entry_id AND class_id=p_class_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION '수정할 항목을 찾지 못했습니다.'; END IF;
    END IF;
    RETURN jsonb_build_object('id', v_id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'draft' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_spelling_search_batch_v1(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_student public.students%ROWTYPE; v_item JSONB; v_key TEXT; v_label TEXT; v_query TEXT; v_count INTEGER; v_new_student BOOLEAN;
BEGIN
    SELECT * INTO v_student FROM public.students s
    WHERE s.auth_id=auth.uid() AND s.deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 연결을 확인할 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 20 THEN
        RAISE EXCEPTION '한 번에 기록할 수 있는 항목 수를 넘었습니다.' USING ERRCODE='22023'; END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_key := left(btrim(COALESCE(v_item->>'entry_key','')),80);
        v_label := left(btrim(COALESCE(v_item->>'label','미분류')),40);
        v_count := LEAST(GREATEST(COALESCE((v_item->>'count')::int,1),1),100);
        v_query := CASE WHEN v_key LIKE 'unmatched:%' THEN left(btrim(COALESCE(v_item->>'query','')),80) ELSE NULL END;
        IF v_key = '' OR v_label = '' THEN CONTINUE; END IF;

        INSERT INTO public.class_spelling_student_daily(class_id,event_date,student_id,entry_key)
        VALUES(v_student.class_id,CURRENT_DATE,v_student.id,v_key) ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        v_new_student := v_count = 1;
        v_count := LEAST(GREATEST(COALESCE((v_item->>'count')::int,1),1),100);

        INSERT INTO public.class_spelling_daily_stats(class_id,event_date,entry_key,label,display_expression,search_count,student_count,last_seen_at)
        VALUES(v_student.class_id,CURRENT_DATE,v_key,v_label,NULLIF(v_query,''),v_count,CASE WHEN v_new_student THEN 1 ELSE 0 END,NOW())
        ON CONFLICT(class_id,event_date,entry_key) DO UPDATE SET
            search_count=public.class_spelling_daily_stats.search_count+EXCLUDED.search_count,
            student_count=public.class_spelling_daily_stats.student_count+EXCLUDED.student_count,
            label=EXCLUDED.label, display_expression=COALESCE(public.class_spelling_daily_stats.display_expression,EXCLUDED.display_expression), last_seen_at=NOW();
    END LOOP;
    RETURN jsonb_build_object('recorded', true);
END;
$$;

DO $$
BEGIN
    IF to_regprocedure('public.get_class_writing_footprint_dashboard_core_v1(uuid)') IS NULL
       AND to_regprocedure('public.get_class_writing_footprint_dashboard(uuid)') IS NOT NULL THEN
        ALTER FUNCTION public.get_class_writing_footprint_dashboard(UUID) RENAME TO get_class_writing_footprint_dashboard_core_v1;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_class_writing_footprint_dashboard(p_class_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_base JSONB; v_labels JSONB;
BEGIN
    v_base := public.get_class_writing_footprint_dashboard_core_v1(p_class_id);
    SELECT COALESCE(jsonb_agg(jsonb_build_object('type',label,'total',total) ORDER BY total DESC),'[]'::jsonb)
    INTO v_labels FROM (
        SELECT max(label) label, sum(search_count)::int total
        FROM public.class_spelling_daily_stats
        WHERE class_id=p_class_id AND event_date >= CURRENT_DATE-30
        GROUP BY label ORDER BY total DESC LIMIT 10
    ) s;
    RETURN jsonb_set(v_base,'{detail,spelling_labels}',v_labels,true);
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_spelling_entries_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_spelling_learning_workspace_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_spelling_learning_entry_v1(UUID,UUID,JSONB,BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_spelling_search_batch_v1(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_spelling_entries_v1() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_spelling_learning_workspace_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_spelling_learning_entry_v1(UUID,UUID,JSONB,BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_spelling_search_batch_v1(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_class_writing_footprint_dashboard(UUID) TO authenticated, service_role;

COMMIT;
