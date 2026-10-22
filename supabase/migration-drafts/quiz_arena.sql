-- 수호룡 퀴즈 아레나 문제 세트 저장·공유 — 마이그레이션 **초안**(2026-10-22, 적용 전).
-- 설계: docs/QUIZ_ARENA_PLAN.md. 적용할 때 supabase/migrations/<다음 번호>_quiz_arena_sets.sql 로 옮기고 스모크는
-- tests/sql/<같은 이름>.smoke.sql 로 옮긴다(선생님이 "적용해" 라고 한 뒤에만).
--
-- 지키는 규칙(SECURITY_HARNESS): 표는 RLS 를 켜고 직접 권한을 모두 닫는다 · 읽기/쓰기는 SECURITY DEFINER RPC 로만 ·
-- 함수마다 SET search_path · anon 에 열지 않는다 · WHERE 없는 UPDATE/DELETE 없음 · 글자 수 한도는 DB 에서도 막는다.
-- 한도는 게임 서버(suhoryong-arena validate.ts)와 src/modules/game/quiz-arena/quizSetBuilder.js 의 ARENA_LIMITS 와 같다.
--
-- 지금은 관리자 시험 중이라 모든 RPC 가 `quiz_arena_assert_user_v1()` 한 곳으로 사용자를 확인한다 —
-- 공개할 때는 이 함수 한 곳만 `TEACHER` 를 허용하도록 바꾼다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.quiz_arena_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 40),
    grade SMALLINT CHECK (grade BETWEEN 1 AND 6),
    subject TEXT NOT NULL DEFAULT '' CHECK (char_length(subject) <= 20),
    unit TEXT NOT NULL DEFAULT '' CHECK (char_length(unit) <= 40),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 200),
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'default', 'ai', 'copy')),
    copied_from UUID REFERENCES public.quiz_arena_sets(id) ON DELETE SET NULL,
    question_count SMALLINT NOT NULL DEFAULT 0 CHECK (question_count BETWEEN 0 AND 50),
    copy_count INTEGER NOT NULL DEFAULT 0,
    shared_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quiz_arena_sets_owner ON public.quiz_arena_sets (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_arena_sets_shared ON public.quiz_arena_sets (grade, shared_at DESC) WHERE visibility = 'shared';

CREATE TABLE IF NOT EXISTS public.quiz_arena_questions (
    set_id UUID NOT NULL REFERENCES public.quiz_arena_sets(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 50),
    kind TEXT NOT NULL CHECK (kind IN ('ox', 'c4')),
    text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 60),
    choices JSONB,
    answer SMALLINT NOT NULL CHECK (answer BETWEEN 0 AND 3),
    explanation TEXT NOT NULL DEFAULT '' CHECK (char_length(explanation) <= 80),
    PRIMARY KEY (set_id, position),
    CONSTRAINT quiz_arena_questions_shape CHECK (
        (kind = 'ox' AND choices IS NULL AND answer <= 1)
        OR (kind = 'c4' AND jsonb_typeof(choices) = 'array' AND jsonb_array_length(choices) = 4)
    )
);

ALTER TABLE public.quiz_arena_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_arena_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quiz_arena_sets, public.quiz_arena_questions FROM PUBLIC, anon, authenticated;

-- 사용자 확인 한 곳. 지금은 관리자만, 공개할 때 'TEACHER' 를 더한다.
CREATE OR REPLACE FUNCTION public.quiz_arena_assert_user_v1()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() IS DISTINCT FROM 'ADMIN' THEN
        RAISE EXCEPTION '[보안] 퀴즈 아레나는 관리자 시험 중입니다.' USING ERRCODE = '42501';
    END IF;
    RETURN auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.quiz_arena_assert_user_v1() FROM PUBLIC, anon, authenticated;

-- 문제 목록 검사(서버·화면과 같은 규칙). 잘못이면 이유를 던진다.
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
BEGIN
    IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' OR jsonb_array_length(p_questions) NOT BETWEEN 1 AND 50 THEN
        RAISE EXCEPTION '문제는 1~50개여야 해요' USING ERRCODE = '22023';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
        n := n + 1;
        v_kind := item->>'kind';
        IF v_kind NOT IN ('ox', 'c4') THEN RAISE EXCEPTION '%번 문제 형태(ox / c4)를 확인해 주세요', n USING ERRCODE = '22023'; END IF;
        IF char_length(btrim(COALESCE(item->>'text', ''))) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION '%번 문제 글은 1~60자예요', n USING ERRCODE = '22023'; END IF;
        IF char_length(COALESCE(item->>'explanation', '')) > 80 THEN RAISE EXCEPTION '%번 해설은 80자까지예요', n USING ERRCODE = '22023'; END IF;
        IF jsonb_typeof(item->'answer') <> 'number' OR (item->>'answer')::NUMERIC <> trunc((item->>'answer')::NUMERIC) THEN
            RAISE EXCEPTION '%번 문제 정답 번호를 확인해 주세요', n USING ERRCODE = '22023';
        END IF;
        IF v_kind = 'ox' AND (item->>'answer')::INTEGER NOT IN (0, 1) THEN RAISE EXCEPTION '%번 문제 정답 번호를 확인해 주세요', n USING ERRCODE = '22023'; END IF;
        IF v_kind = 'c4' THEN
            IF jsonb_typeof(item->'choices') <> 'array' OR jsonb_array_length(item->'choices') <> 4
               OR (item->>'answer')::INTEGER NOT BETWEEN 0 AND 3 THEN
                RAISE EXCEPTION '%번 문제는 보기 4개와 정답 번호가 필요해요', n USING ERRCODE = '22023';
            END IF;
            IF EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(item->'choices') AS choice(value)
                WHERE char_length(btrim(choice.value)) NOT BETWEEN 1 AND 20
            ) OR (SELECT COUNT(DISTINCT btrim(choice.value)) FROM jsonb_array_elements_text(item->'choices') AS choice(value)) <> 4 THEN
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
           CASE WHEN item->>'kind' = 'c4' THEN item->'choices' END, (item->>'answer')::SMALLINT, COALESCE(item->>'explanation', '')
    FROM jsonb_array_elements(p_questions) WITH ORDINALITY AS q(item, ordinality);
    RETURN jsonb_build_object('id', v_id, 'question_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_quiz_arena_sets_v1()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := public.quiz_arena_assert_user_v1();
BEGIN
    RETURN COALESCE((
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.updated_at DESC) FROM (
            SELECT id, title, grade, subject, unit, description, visibility, source, question_count, copy_count, shared_at, updated_at
            FROM public.quiz_arena_sets WHERE owner_id = v_user ORDER BY updated_at DESC LIMIT 100
        ) s
    ), '[]'::JSONB);
END;
$$;

-- 공유된 세트 둘러보기(학년·검색어). 만든 사람의 이름은 내보내지 않는다(`is_mine` 만).
CREATE OR REPLACE FUNCTION public.list_shared_quiz_arena_sets_v1(p_grade INTEGER DEFAULT NULL, p_query TEXT DEFAULT NULL, p_limit INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := public.quiz_arena_assert_user_v1();
    v_like TEXT := CASE WHEN btrim(COALESCE(p_query, '')) = '' THEN NULL ELSE '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' END;
BEGIN
    RETURN COALESCE((
        SELECT jsonb_agg(to_jsonb(s) ORDER BY s.shared_at DESC) FROM (
            SELECT id, title, grade, subject, unit, description, source, question_count, copy_count, shared_at, (owner_id = v_user) AS is_mine
            FROM public.quiz_arena_sets
            WHERE visibility = 'shared'
              AND (p_grade IS NULL OR grade = p_grade)
              AND (v_like IS NULL OR title ILIKE v_like OR subject ILIKE v_like OR unit ILIKE v_like)
            ORDER BY shared_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 50)
        ) s
    ), '[]'::JSONB);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_quiz_arena_set_v1(p_set_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := public.quiz_arena_assert_user_v1();
    v_set public.quiz_arena_sets%ROWTYPE;
BEGIN
    SELECT * INTO v_set FROM public.quiz_arena_sets WHERE id = p_set_id AND (owner_id = v_user OR visibility = 'shared');
    IF v_set.id IS NULL THEN RAISE EXCEPTION '[보안] 볼 수 없는 세트예요' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object(
        'id', v_set.id, 'title', v_set.title, 'grade', v_set.grade, 'subject', v_set.subject, 'unit', v_set.unit,
        'description', v_set.description, 'visibility', v_set.visibility, 'source', v_set.source, 'is_mine', v_set.owner_id = v_user,
        'questions', COALESCE((
            SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'kind', q.kind, 'text', q.text, 'choices', q.choices, 'answer', q.answer, 'explanation', NULLIF(q.explanation, '')
            )) ORDER BY q.position) FROM public.quiz_arena_questions q WHERE q.set_id = v_set.id
        ), '[]'::JSONB)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_quiz_arena_set_visibility_v1(p_set_id UUID, p_visibility TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := public.quiz_arena_assert_user_v1();
BEGIN
    IF p_visibility NOT IN ('private', 'shared') THEN RAISE EXCEPTION '공개 범위를 확인해 주세요' USING ERRCODE = '22023'; END IF;
    UPDATE public.quiz_arena_sets
    SET visibility = p_visibility, shared_at = CASE WHEN p_visibility = 'shared' THEN COALESCE(shared_at, NOW()) ELSE NULL END, updated_at = NOW()
    WHERE id = p_set_id AND owner_id = v_user AND (p_visibility = 'private' OR question_count > 0);
    IF NOT FOUND THEN RAISE EXCEPTION '[보안] 내 세트가 아니거나 문제가 없어요' USING ERRCODE = '42501'; END IF;
END;
$$;

-- 공유된 세트를 내 것으로 복사(고쳐 쓰기). 원본은 그대로, 복사 횟수만 센다.
CREATE OR REPLACE FUNCTION public.copy_quiz_arena_set_v1(p_set_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := public.quiz_arena_assert_user_v1();
    v_src public.quiz_arena_sets%ROWTYPE;
    v_id UUID;
BEGIN
    SELECT * INTO v_src FROM public.quiz_arena_sets WHERE id = p_set_id AND (visibility = 'shared' OR owner_id = v_user);
    IF v_src.id IS NULL THEN RAISE EXCEPTION '[보안] 볼 수 없는 세트예요' USING ERRCODE = '42501'; END IF;
    IF (SELECT COUNT(*) FROM public.quiz_arena_sets WHERE owner_id = v_user) >= 200 THEN
        RAISE EXCEPTION '내 문제 세트는 200개까지 만들 수 있어요' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.quiz_arena_sets (owner_id, title, grade, subject, unit, description, source, copied_from, question_count)
    VALUES (v_user, left(v_src.title || ' (복사)', 40), v_src.grade, v_src.subject, v_src.unit, v_src.description, 'copy', v_src.id, v_src.question_count)
    RETURNING id INTO v_id;
    INSERT INTO public.quiz_arena_questions (set_id, position, kind, text, choices, answer, explanation)
    SELECT v_id, position, kind, text, choices, answer, explanation FROM public.quiz_arena_questions WHERE set_id = v_src.id;
    IF v_src.owner_id <> v_user THEN UPDATE public.quiz_arena_sets SET copy_count = copy_count + 1 WHERE id = v_src.id; END IF;
    RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_quiz_arena_set_v1(p_set_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user UUID := public.quiz_arena_assert_user_v1();
BEGIN
    DELETE FROM public.quiz_arena_sets WHERE id = p_set_id AND owner_id = v_user;
    IF NOT FOUND THEN RAISE EXCEPTION '[보안] 내 세트가 아니에요' USING ERRCODE = '42501'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_quiz_arena_set_v1(UUID, JSONB, JSONB), public.list_my_quiz_arena_sets_v1(),
    public.list_shared_quiz_arena_sets_v1(INTEGER, TEXT, INTEGER), public.get_quiz_arena_set_v1(UUID),
    public.set_quiz_arena_set_visibility_v1(UUID, TEXT), public.copy_quiz_arena_set_v1(UUID), public.delete_quiz_arena_set_v1(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quiz_arena_set_v1(UUID, JSONB, JSONB), public.list_my_quiz_arena_sets_v1(),
    public.list_shared_quiz_arena_sets_v1(INTEGER, TEXT, INTEGER), public.get_quiz_arena_set_v1(UUID),
    public.set_quiz_arena_set_visibility_v1(UUID, TEXT), public.copy_quiz_arena_set_v1(UUID), public.delete_quiz_arena_set_v1(UUID)
    TO authenticated;

COMMIT;
