-- 학생 맞춤법 밑줄 자료 v3: 바뀐 것만 받을 때 겹쳐 받지 않는다(20261376 바로 뒤 고침).
-- 5분 겹치면 함께 게시한 자료가 매번 다시 왔다(실제 4줄·2.3KB). 늦게 끝난 쓰기를 놓치는 드문 경우는
-- 기기가 개수를 서버와 맞춰 보고 다르면 처음부터 다시 받아 메운다(entryCache.applyCommonResponse).

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
                      OR (NOT v_full AND entry.updated_at > p_common_since)
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

NOTIFY pgrst, 'reload schema';
