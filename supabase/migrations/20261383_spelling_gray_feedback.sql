-- 맞춤법 회색 점선 '한번 살펴볼까요?' — 학생이 고른 결과 기록(2026-10-08, 선생님 결정: 선생님 반 시험 → 넓힘).
-- 학생이 회색 점선 칩에서 [이렇게 고치기]·[그대로 두기] 를 누르면 그 고른 결과만 남긴다.
--   · 학생 글 전체는 남기지 않는다. 밑줄 자리의 짧은 조각(원래 꼴·제안 꼴, 30자까지)과 갈래·고른 것만.
--   · 학생 식별자를 남기지 않는다(학급만). 학급이 회색 점선을 켰을 때만 받는다.
--   · 브라우저는 읽지 못한다(서버만). 60일 지나면 밤 작업(spelling-shadow.mjs)이 지운다.
-- 쓰임: 갈래별로 "아이들이 받아들인 비율"을 보고 보일 갈래·규칙을 다듬는다(10월).

CREATE TABLE IF NOT EXISTS public.spelling_gray_feedback (
    id BIGSERIAL PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    category TEXT NOT NULL CHECK (category IN ('particle_attach', 'modifier_noun', 'typo')),
    original TEXT NOT NULL CHECK (char_length(original) BETWEEN 1 AND 30),
    suggestion TEXT NOT NULL CHECK (char_length(suggestion) BETWEEN 1 AND 30),
    choice TEXT NOT NULL CHECK (choice IN ('applied', 'kept')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spelling_gray_feedback_created ON public.spelling_gray_feedback (created_at DESC);
ALTER TABLE public.spelling_gray_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_gray_feedback FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.spelling_gray_feedback_id_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_spelling_gray_feedback_v1(p_items JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_enabled BOOLEAN;
    v_item JSONB;
    v_saved INTEGER := 0;
BEGIN
    SELECT * INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.deleted_at IS NULL
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생 연결을 확인할 수 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 20 THEN
        RAISE EXCEPTION '한 번에 기록할 수 있는 항목 수를 넘었습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(c.writing_editor_settings->'enabled_tools' ? 'spelling-gray', FALSE) INTO v_enabled
    FROM public.classes c WHERE c.id = v_student.class_id;
    IF NOT COALESCE(v_enabled, FALSE) THEN
        RETURN 0;   -- 학급이 끈 뒤 남은 요청은 조용히 버린다
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        IF COALESCE(v_item->>'category', '') NOT IN ('particle_attach', 'modifier_noun', 'typo')
           OR COALESCE(v_item->>'choice', '') NOT IN ('applied', 'kept')
           OR char_length(btrim(COALESCE(v_item->>'original', ''))) NOT BETWEEN 1 AND 30
           OR char_length(btrim(COALESCE(v_item->>'suggestion', ''))) NOT BETWEEN 1 AND 30 THEN
            CONTINUE;
        END IF;
        INSERT INTO public.spelling_gray_feedback(class_id, category, original, suggestion, choice)
        VALUES (
            v_student.class_id,
            v_item->>'category',
            normalize(btrim(v_item->>'original'), NFC),
            normalize(btrim(v_item->>'suggestion'), NFC),
            v_item->>'choice'
        );
        v_saved := v_saved + 1;
    END LOOP;
    RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.record_spelling_gray_feedback_v1(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_spelling_gray_feedback_v1(JSONB) TO authenticated;
