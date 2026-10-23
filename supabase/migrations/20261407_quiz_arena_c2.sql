-- 퀴즈 아레나 문제 세트에 2지선다(c2) 형식을 더한다(2026-10-23, 선생님 `적용해`).
-- 20261406 의 표 제약과 검사 함수를 고친다. 기존 O/X·4지선다 문제는 그대로다.

BEGIN;

ALTER TABLE public.quiz_arena_questions DROP CONSTRAINT quiz_arena_questions_kind_check;
ALTER TABLE public.quiz_arena_questions ADD CONSTRAINT quiz_arena_questions_kind_check CHECK (kind IN ('ox', 'c2', 'c4'));
ALTER TABLE public.quiz_arena_questions DROP CONSTRAINT quiz_arena_questions_shape;
-- (이전 판은 choices 가 NULL 이면 CHECK 가 통과해 버렸다 — COALESCE 로 막는다)
ALTER TABLE public.quiz_arena_questions ADD CONSTRAINT quiz_arena_questions_shape CHECK (
    (kind = 'ox' AND choices IS NULL AND answer <= 1)
    OR (kind = 'c2' AND COALESCE(jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 2, FALSE) AND answer <= 1)
    OR (kind = 'c4' AND COALESCE(jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 4, FALSE))
);

CREATE OR REPLACE FUNCTION public.quiz_arena_check_questions_v1(p_questions JSONB)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    item JSONB;
    n INTEGER := 0;
    v_kind TEXT;
    v_want INTEGER;
BEGIN
    IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION '문제는 1~50개여야 해요' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
        n := n + 1;
        v_kind := item->>'kind';
        IF v_kind NOT IN ('ox', 'c2', 'c4') THEN RAISE EXCEPTION '%번 문제 형태(ox / c2 / c4)를 확인해 주세요', n USING ERRCODE = '22023'; END IF;
        IF char_length(btrim(COALESCE(item->>'text', ''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION '%번 문제 글은 1~60자예요', n USING ERRCODE = '22023'; END IF;
        IF char_length(COALESCE(item->>'explanation', '')) > 80 THEN RAISE EXCEPTION '%번 해설은 80자까지예요', n USING ERRCODE = '22023'; END IF;
        IF jsonb_typeof(item->'answer') <> 'number' OR (item->>'answer')::NUMERIC <> trunc((item->>'answer')::NUMERIC) THEN
            RAISE EXCEPTION '%번 문제 정답 번호를 확인해 주세요', n USING ERRCODE = '22023';
        END IF;
        IF v_kind = 'ox' AND (item->>'answer')::INTEGER NOT IN (0, 1) THEN RAISE EXCEPTION '%번 문제 정답 번호를 확인해 주세요', n USING ERRCODE = '22023'; END IF;
        IF v_kind IN ('c2', 'c4') THEN
            v_want := CASE WHEN v_kind = 'c2' THEN 2 ELSE 4 END;
            IF jsonb_typeof(item->'choices') <> 'array' OR jsonb_array_length(item->'choices') <> v_want
               OR (item->>'answer')::INTEGER NOT BETWEEN 0 AND v_want - 1 THEN
                RAISE EXCEPTION '%번 문제는 보기 %개와 정답 번호가 필요해요', n, v_want USING ERRCODE = '22023';
            END IF;
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(item->'choices') AS choice(value)
                WHERE char_length(btrim(choice.value)) NOT BETWEEN 1 AND 20
            ) OR (SELECT COUNT(DISTINCT btrim(choice.value)) FROM jsonb_array_elements_text(item->'choices') AS choice(value)) <> v_want THEN
                RAISE EXCEPTION '%번 문제 보기는 서로 다른 1~20자여야 해요', n USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.quiz_arena_check_questions_v1(JSONB) FROM PUBLIC, anon, authenticated;

-- 세트 저장(새로 만들기 p_set_id NULL / 고치기). 문제는 통째로 바꾼다. 내 세트는 200개까지.
CREATE OR REPLACE FUNCTION public.save_quiz_arena_set_v1(p_set_id UUID, p_meta JSONB, p_questions JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := public.quiz_arena_assert_user_v1();
    v_id UUID := p_set_id;
    v_title TEXT := btrim(COALESCE(p_meta->>'title', ''));
    v_source TEXT := COALESCE(NULLIF(p_meta->>'source', ''), 'manual');
    v_count INTEGER;
BEGIN
    PERFORM public.quiz_arena_check_questions_v1(p_questions);
    v_count := jsonb_array_length(p_questions);
    IF v_source NOT IN ('manual', 'default', 'ai') THEN v_source := 'manual'; END IF;
    IF v_id IS NULL THEN
        IF (SELECT COUNT(*) FROM public.quiz_arena_sets WHERE owner_id = v_user) >= 200 THEN
            RAISE EXCEPTION '내 문제 세트는 200개까지 만들 수 있어요' USING ERRCODE = '22023';
        END IF;
        INSERT INTO public.quiz_arena_sets (owner_id, title, grade, subject, unit, description, source, question_count)
        VALUES (v_user, v_title, NULLIF(p_meta->>'grade', '')::SMALLINT, COALESCE(p_meta->>'subject', ''), COALESCE(p_meta->>'unit', ''),
                COALESCE(p_meta->>'description', ''), v_source, v_count)
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.quiz_arena_sets SET
            title = v_title, grade = NULLIF(p_meta->>'grade', '')::SMALLINT, subject = COALESCE(p_meta->>'subject', ''),
            unit = COALESCE(p_meta->>'unit', ''), description = COALESCE(p_meta->>'description', ''),
            question_count = v_count, updated_at = NOW()
        WHERE id = v_id AND owner_id = v_user;
        IF NOT FOUND THEN RAISE EXCEPTION '[보안] 내 세트가 아니에요' USING ERRCODE = '42501'; END IF;
        DELETE FROM public.quiz_arena_questions WHERE set_id = v_id;
    END IF;
    INSERT INTO public.quiz_arena_questions (set_id, position, kind, text, choices, answer, explanation)
    SELECT v_id, ordinality::SMALLINT, item->>'kind', btrim(item->>'text'),
           CASE WHEN item->>'kind' IN ('c2', 'c4') THEN item->'choices' END, (item->>'answer')::SMALLINT, COALESCE(item->>'explanation', '')
    FROM jsonb_array_elements(p_questions) WITH ORDINALITY AS q(item, ordinality);
    RETURN jsonb_build_object('id', v_id, 'question_count', v_count);
END;
$$;

COMMIT;
