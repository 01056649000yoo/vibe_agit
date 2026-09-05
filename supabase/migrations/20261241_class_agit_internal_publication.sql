-- 우리반 아지트 C1: 관리자 본인 학급의 초안·고정 공개판. 일반 교사/익명 공개는 열지 않는다.
-- Business revision/source conflicts use PT409. PostgREST 14 retries 40001 indefinitely.
BEGIN;

CREATE TABLE IF NOT EXISTS public.class_agit_rollout (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    mode TEXT NOT NULL DEFAULT 'internal' CHECK (mode IN ('internal', 'disabled'))
);
INSERT INTO public.class_agit_rollout(singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.class_agit_exhibitions (
    id UUID PRIMARY KEY, class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
    introduction TEXT NOT NULL DEFAULT '' CHECK (char_length(introduction) <= 240),
    state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','archived')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    publication_no INTEGER NOT NULL DEFAULT 0 CHECK (publication_no >= 0),
    published_snapshot JSONB, published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(class_id, id),
    CHECK (published_snapshot IS NULL OR (jsonb_typeof(published_snapshot) = 'object' AND octet_length(published_snapshot::TEXT) <= 6500000))
);
CREATE INDEX IF NOT EXISTS class_agit_exhibitions_class_updated_idx ON public.class_agit_exhibitions(class_id, updated_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS class_agit_post_class_reference_idx ON public.student_posts(class_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS class_agit_student_class_reference_idx ON public.students(class_id, id);
CREATE INDEX IF NOT EXISTS class_agit_source_candidates_idx ON public.student_posts(class_id, updated_at DESC, id DESC)
    WHERE writing_context = 'assignment' AND is_submitted IS TRUE AND is_confirmed IS TRUE;

CREATE TABLE IF NOT EXISTS public.class_agit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID NOT NULL, exhibition_id UUID NOT NULL,
    post_id UUID, student_id UUID, position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 60),
    source_revision TEXT NOT NULL CHECK (char_length(source_revision) = 64),
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::TEXT) <= 100000),
    public_alias TEXT NOT NULL CHECK (char_length(btrim(public_alias)) BETWEEN 1 AND 30),
    confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consent_id UUID NOT NULL DEFAULT gen_random_uuid(),
    revoked_at TIMESTAMPTZ, removed_at TIMESTAMPTZ,
    FOREIGN KEY(class_id, exhibition_id) REFERENCES public.class_agit_exhibitions(class_id, id) ON DELETE CASCADE,
    FOREIGN KEY(class_id, post_id) REFERENCES public.student_posts(class_id, id) ON DELETE SET NULL (post_id),
    FOREIGN KEY(class_id, student_id) REFERENCES public.students(class_id, id) ON DELETE SET NULL (student_id),
    UNIQUE(class_id, id), UNIQUE(exhibition_id, post_id)
);
CREATE INDEX IF NOT EXISTS class_agit_items_exhibition_idx ON public.class_agit_items(class_id, exhibition_id, position, id);
CREATE INDEX IF NOT EXISTS class_agit_items_source_idx ON public.class_agit_items(class_id, post_id);
CREATE INDEX IF NOT EXISTS class_agit_items_student_idx ON public.class_agit_items(class_id, student_id);

CREATE TABLE IF NOT EXISTS public.class_agit_consent_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID NOT NULL, item_id UUID NOT NULL,
    scope TEXT NOT NULL DEFAULT 'class' CHECK (scope = 'class'),
    action TEXT NOT NULL CHECK (action IN ('confirmed','withdrawn','source_unavailable')),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY(class_id, item_id) REFERENCES public.class_agit_items(class_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS class_agit_consent_class_time_idx ON public.class_agit_consent_events(class_id, recorded_at DESC);

ALTER TABLE public.class_agit_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_exhibitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_agit_rollout, public.class_agit_exhibitions, public.class_agit_items, public.class_agit_consent_events FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assert_class_agit_manager_v1(p_class_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND c.teacher_id=auth.uid()
        AND public.class_agit_class_is_allowed_v1(c.id)) THEN
        RAISE EXCEPTION '허용된 담당 학급에서만 우리반 아지트를 준비할 수 있습니다.' USING ERRCODE='42501'; END IF;
    RETURN auth.uid();
END; $$;
REVOKE ALL ON FUNCTION public.assert_class_agit_manager_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;

-- 원글 자격·장르·표시본·버전의 서버 정본. 후보/전문/저장/발행/열람에서 모두 사용한다.
CREATE OR REPLACE FUNCTION public.class_agit_source_data_v1(p_post public.student_posts, p_mission public.writing_missions, p_author TEXT)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_template TEXT; v_blocks JSONB; v_structured JSONB := p_post.structured_content; v_version TEXT; v_body TEXT;
BEGIN
    IF p_post.writing_context IS DISTINCT FROM 'assignment' OR p_post.visibility IS DISTINCT FROM 'class'
       OR p_post.is_submitted IS NOT TRUE OR p_post.is_confirmed IS NOT TRUE OR p_post.is_returned IS TRUE
       OR p_post.recalled_at IS NOT NULL OR p_mission.id IS NULL OR p_mission.class_id IS DISTINCT FROM p_post.class_id
       OR p_author IS NULL OR char_length(COALESCE(p_post.content,'')) > 20000 OR char_length(COALESCE(p_post.title,'')) > 200
    THEN RETURN NULL; END IF;
    v_template := COALESCE(NULLIF(NULLIF(p_mission.input_template, 'freeform'), ''),
        CASE WHEN p_mission.mission_type IN ('poem','letter','report','meeting') THEN p_mission.mission_type END,
        v_structured->>'template', 'prose');
    IF v_template NOT IN ('prose','poem') OR (v_structured->>'template' IS NOT NULL AND v_structured->>'template' <> v_template)
    THEN RETURN NULL; END IF;
    IF v_template = 'prose' AND v_structured IS NOT NULL AND v_structured <> '{}'::JSONB AND v_structured <> 'null'::JSONB
    THEN RETURN NULL; END IF;
    IF v_template = 'poem' AND v_structured IS NOT NULL AND v_structured <> 'null'::JSONB THEN
        IF jsonb_typeof(v_structured) <> 'object' OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_structured) k WHERE k NOT IN ('template','version','stanzas')
        ) THEN RETURN NULL; END IF;
        IF v_structured ? 'stanzas' AND (jsonb_typeof(v_structured->'stanzas') <> 'array') THEN RETURN NULL; END IF;
    END IF;
    IF v_template = 'poem' AND jsonb_typeof(v_structured->'stanzas') = 'array' THEN
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_structured->'stanzas') s WHERE jsonb_typeof(s) <> 'string') THEN RETURN NULL; END IF;
        SELECT COALESCE(jsonb_agg(to_jsonb(btrim(replace(replace(s.value,E'\r\n',E'\n'),E'\r',E'\n'))) ORDER BY s.ordinality)
            FILTER (WHERE btrim(s.value) <> ''), '[]'::JSONB) INTO v_blocks
        FROM jsonb_array_elements_text(v_structured->'stanzas') WITH ORDINALITY s;
    ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(btrim(s.value)) ORDER BY s.ordinality) FILTER (WHERE btrim(s.value) <> ''), '[]'::JSONB)
        INTO v_blocks FROM regexp_split_to_table(replace(replace(COALESCE(p_post.content,''),E'\r\n',E'\n'),E'\r',E'\n'), E'\n[[:space:]]*\n') WITH ORDINALITY s(value, ordinality);
    END IF;
    SELECT string_agg(value,' ') INTO v_body FROM jsonb_array_elements_text(v_blocks);
    IF jsonb_array_length(v_blocks) NOT BETWEEN 1 AND 200 OR char_length(v_body) > 20000 OR octet_length(v_blocks::TEXT) > 85000 THEN RETURN NULL; END IF;
    v_version := encode(extensions.digest(jsonb_build_array(p_post.id, p_post.updated_at, p_post.title, p_post.content,
        p_post.structured_content, p_post.is_submitted, p_post.is_confirmed, p_post.is_returned, p_post.visibility,
        p_post.recalled_at, p_mission.input_template, p_mission.mission_type, p_author)::TEXT, 'sha256'), 'hex');
    RETURN jsonb_build_object('id', p_post.id, 'class_id', p_post.class_id, 'student_id', p_post.student_id,
        'student_name', left(p_author,30), 'source_revision', v_version, 'writing_context', 'assignment',
        'is_submitted', TRUE, 'is_confirmed', TRUE, 'is_returned', FALSE, 'visibility', 'class',
        'title', COALESCE(NULLIF(btrim(p_post.title),''),'제목 없는 글'), 'content', p_post.content,
        'structured_content', CASE WHEN v_template = 'poem' THEN jsonb_build_object('template','poem','stanzas',v_blocks) ELSE NULL END,
        'input_template', CASE WHEN v_template = 'poem' THEN 'poem' ELSE NULL END,
        'group_title', left(p_mission.title,80), 'updated_at', p_post.updated_at,
        'format', v_template, 'kindLabel', CASE WHEN v_template = 'poem' THEN '시' ELSE '글' END,
        'blocks', v_blocks, 'excerpt', left(regexp_replace(v_body,'[[:space:]]+',' ','g'),96));
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_source_data_v1(public.student_posts, public.writing_missions, TEXT) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.class_agit_current_source_v1(p_class_id UUID, p_post_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public.class_agit_source_data_v1(p, m, s.name)
    FROM public.student_posts p
    JOIN public.students s ON s.id = p.student_id AND s.class_id = p.class_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
    JOIN public.writing_missions m ON m.id = p.mission_id AND m.class_id = p.class_id
    WHERE p.class_id = p_class_id AND p.id = p_post_id;
$$;
REVOKE ALL ON FUNCTION public.class_agit_current_source_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_class_agit_source_v1(p_class_id UUID, p_post_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_source JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    v_source := public.class_agit_current_source_v1(p_class_id, p_post_id);
    IF v_source IS NULL THEN RAISE EXCEPTION '전시에 담을 수 없는 글입니다. 제출·확인·공개 상태와 장르를 확인해 주세요.' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('version',1,'source',v_source);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_source_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_source_v1(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_agit_candidates_v1(p_class_id UUID, p_query TEXT DEFAULT '', p_before_updated_at TIMESTAMPTZ DEFAULT NULL, p_before_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 20)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_items JSONB; v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit,20),1),50); v_has_more BOOLEAN;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    IF char_length(COALESCE(p_query,'')) > 80 OR (p_before_updated_at IS NULL) <> (p_before_id IS NULL)
    THEN RAISE EXCEPTION '검색어나 이어 볼 위치를 확인해 주세요.' USING ERRCODE = '22023'; END IF;
    WITH rows AS MATERIALIZED (
        SELECT p.id, p.updated_at, public.class_agit_source_data_v1(p,m,s.name) AS data
        FROM public.student_posts p JOIN public.students s ON s.id = p.student_id AND s.class_id = p.class_id
            AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
        JOIN public.writing_missions m ON m.id = p.mission_id AND m.class_id = p.class_id
        WHERE p.class_id = p_class_id AND p.writing_context = 'assignment' AND p.is_submitted IS TRUE AND p.is_confirmed IS TRUE
            AND (p_before_id IS NULL OR (p.updated_at,p.id) < (p_before_updated_at,p_before_id))
            AND (btrim(COALESCE(p_query,'')) = '' OR strpos(lower(COALESCE(p.title,'') || ' ' || s.name),lower(btrim(p_query))) > 0)
            AND public.class_agit_source_data_v1(p,m,s.name) IS NOT NULL
        ORDER BY p.updated_at DESC,p.id DESC LIMIT v_limit + 1
    ), page AS (SELECT * FROM rows ORDER BY updated_at DESC,id DESC LIMIT v_limit)
    SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'title',data->>'title','student_name',data->>'student_name',
        'group_title',data->>'group_title','excerpt',data->>'excerpt','updated_at',updated_at) ORDER BY updated_at DESC,id DESC) FROM page),'[]'),
        (SELECT count(*) > v_limit FROM rows) INTO v_items,v_has_more;
    RETURN jsonb_build_object('version',1,'items',v_items,'has_more',v_has_more,
        'next_cursor',CASE WHEN v_has_more THEN jsonb_build_object('id',v_items->-1->>'id','updated_at',v_items->-1->>'updated_at') ELSE NULL END);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_candidates_v1(UUID,TEXT,TIMESTAMPTZ,UUID,INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_candidates_v1(UUID,TEXT,TIMESTAMPTZ,UUID,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_agit_workspace_v1(p_class_id UUID, p_exhibition_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_projects JSONB; v_students JSONB; v_draft JSONB; v_items JSONB; v_ex public.class_agit_exhibitions%ROWTYPE;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.updated_at DESC,q.id DESC),'[]') INTO v_projects FROM (
        SELECT e.id,e.title,e.state,e.revision,e.publication_no,e.published_at,e.updated_at
        FROM public.class_agit_exhibitions e WHERE e.class_id = p_class_id ORDER BY e.updated_at DESC,e.id DESC LIMIT 20
    ) q;
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.name,q.id),'[]') INTO v_students FROM (
        SELECT s.id,left(s.name,30) AS name FROM public.students s WHERE s.class_id = p_class_id AND s.deleted_at IS NULL
          AND s.is_active IS DISTINCT FROM FALSE ORDER BY s.name,s.id LIMIT 100
    ) q;
    IF p_exhibition_id IS NOT NULL THEN
        SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id = p_class_id AND id = p_exhibition_id;
        IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE = '42501'; END IF;
        SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position,q.id),'[]') INTO v_items FROM (
            SELECT i.id,i.position, i.snapshot || jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'studentId',i.student_id,
                'sourceRevision',i.source_revision,'publicAlias',i.public_alias,'authorNumber',i.position,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision,
                'unavailable',cur.data IS NULL,'revoked',i.revoked_at IS NOT NULL,
                'scopes',jsonb_build_object('class',i.revoked_at IS NULL,'anthology',FALSE,'external',FALSE)) AS data
            FROM public.class_agit_items i LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
            WHERE i.class_id = p_class_id AND i.exhibition_id = p_exhibition_id AND i.removed_at IS NULL
            ORDER BY i.position,i.id LIMIT 60
        ) q;
        v_draft := jsonb_build_object('id',v_ex.id,'classId',p_class_id,'title',v_ex.title,'introduction',v_ex.introduction,
            'revision',v_ex.revision,'state',v_ex.state,'publicationNo',v_ex.publication_no,'items',v_items);
    END IF;
    RETURN jsonb_build_object('version',1,'rollout','internal','class',jsonb_build_object('id',p_class_id,
        'module_enabled',(SELECT COALESCE('class-agit'=ANY(c.enabled_modules),FALSE) FROM public.classes c WHERE c.id=p_class_id),
        'enabled_modules',(SELECT c.enabled_modules FROM public.classes c WHERE c.id=p_class_id),
        'vocab_tower_enabled',(SELECT c.vocab_tower_enabled FROM public.classes c WHERE c.id=p_class_id)),
        'projects',v_projects,'students',v_students,'draft',v_draft);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_workspace_v1(UUID,UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_workspace_v1(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_class_agit_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor UUID; v_id UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_data JSONB; v_item JSONB; v_snapshot JSONB;
    v_existing public.class_agit_items%ROWTYPE; v_item_id UUID; v_position INTEGER := 0; v_items JSONB := '[]'; v_post_id UUID;
    v_old_enabled BOOLEAN; v_class_confirmed BOOLEAN; v_modules TEXT[]; v_legacy_enabled BOOLEAN;
BEGIN
    v_actor := public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT) > 30000 THEN
        RAISE EXCEPTION '전시 요청 크기 또는 형식이 올바르지 않습니다.' USING ERRCODE = '22023'; END IF;
    -- 학급당 프로젝트 상한과 모듈 변경·발행을 같은 잠금 순서로 직렬화한다.
    SELECT COALESCE('class-agit'=ANY(enabled_modules),FALSE),enabled_modules,vocab_tower_enabled
    INTO v_old_enabled,v_modules,v_legacy_enabled FROM public.classes WHERE id=p_class_id FOR UPDATE;
    IF p_action = 'set_enabled' THEN
        IF jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean'
           OR (p_payload->>'expected_enabled')::BOOLEAN IS DISTINCT FROM v_old_enabled THEN
            RAISE EXCEPTION '학급 공개 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
        -- 미설정 학급은 화면이 공용 registry로 계산한 기존 메뉴를 함께 초기화한다.
        -- 이미 설정된 목록은 잠금 안에서 읽은 서버 값을 유지해 다른 메뉴 변경을 덮지 않는다.
        IF (p_payload->>'enabled')::BOOLEAN AND COALESCE(cardinality(v_modules),0)=0 THEN
            IF jsonb_typeof(p_payload->'initial_modules') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION '기존 학급 메뉴를 확인하려면 작업공간을 다시 열어 주세요.' USING ERRCODE='22023'; END IF;
            IF jsonb_array_length(p_payload->'initial_modules')>100
               OR NOT (p_payload->'initial_modules' ? '__configured__')
               OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'initial_modules') x
                   WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>80)
               THEN RAISE EXCEPTION '기존 학급 메뉴 설정을 확인해 주세요.' USING ERRCODE='22023'; END IF;
            IF (p_payload->>'initial_vocab_tower_enabled')::BOOLEAN IS DISTINCT FROM v_legacy_enabled THEN
                RAISE EXCEPTION '학급 메뉴 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
            SELECT array_agg(DISTINCT value) INTO v_modules FROM jsonb_array_elements_text(p_payload->'initial_modules');
        END IF;
        UPDATE public.classes SET enabled_modules = CASE WHEN (p_payload->>'enabled')::BOOLEAN
            THEN array_append(array_remove(v_modules,'class-agit'),'class-agit')
            ELSE array_remove(v_modules,'class-agit') END WHERE id=p_class_id;
        RETURN public.get_class_agit_workspace_v1(p_class_id,(p_payload->>'exhibition_id')::UUID);
    END IF;
    v_id := (p_payload->>'exhibition_id')::UUID;
    IF v_id IS NULL THEN RAISE EXCEPTION '전시 식별자가 필요합니다.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=v_id FOR UPDATE;
    IF p_action = 'create' THEN
        IF FOUND THEN RETURN public.get_class_agit_workspace_v1(p_class_id,v_id); END IF;
        IF (SELECT count(*) FROM public.class_agit_exhibitions WHERE class_id=p_class_id) >= 20 THEN
            RAISE EXCEPTION '한 학급은 전시를 20개까지 보관할 수 있습니다.' USING ERRCODE='23514'; END IF;
        INSERT INTO public.class_agit_exhibitions(id,class_id,title) VALUES(v_id,p_class_id,'우리의 작은 발견');
        RETURN public.get_class_agit_workspace_v1(p_class_id,v_id);
    END IF;
    IF v_ex.id IS NULL THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF (p_payload->>'expected_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN
        RAISE EXCEPTION '다른 화면에서 전시가 변경되었습니다. 현재 편집은 남겨 두고 최신 전시를 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action = 'save' THEN
        IF char_length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 OR char_length(COALESCE(p_payload->>'introduction',''))>240
           OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION '전시 제목·소개·작품 목록을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF jsonb_array_length(p_payload->'items') > 60 OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_payload->'items') a GROUP BY a->>'sourceId' HAVING count(*)>1
        ) THEN RAISE EXCEPTION '전시는 중복 없이 60편까지 담을 수 있습니다.' USING ERRCODE='23514'; END IF;
        -- source를 먼저 잠근다. source 회수 트리거는 전시 행을 잠그지 않으므로 잠금 순환이 없다.
        PERFORM p.id FROM public.student_posts p WHERE p.class_id=p_class_id
            AND p.id IN (SELECT (a->>'sourceId')::UUID FROM jsonb_array_elements(p_payload->'items') a) ORDER BY p.id FOR SHARE;
        UPDATE public.class_agit_items SET removed_at=NOW() WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL;
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
            v_position := v_position + 1; v_post_id := (v_item->>'sourceId')::UUID;
            v_data := public.class_agit_current_source_v1(p_class_id,v_post_id);
            IF v_data IS NULL THEN RAISE EXCEPTION '담은 글 중 제출·확인·공개 조건이 바뀐 글이 있습니다. 해당 작품을 빼거나 다시 확인해 주세요.' USING ERRCODE='42501'; END IF;
            IF v_item->>'sourceRevision' IS DISTINCT FROM v_data->>'source_revision' THEN
                RAISE EXCEPTION '원글 내용이 바뀌었습니다. 전문을 다시 읽고 담아 주세요.' USING ERRCODE='PT409'; END IF;
            IF v_item->'classAcknowledged' IS DISTINCT FROM 'true'::JSONB THEN
                RAISE EXCEPTION '작품별 학급 전시 수록 의사를 확인해 주세요.' USING ERRCODE='22023'; END IF;
            IF char_length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30 THEN
                RAISE EXCEPTION '가림 이름을 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            SELECT * INTO v_existing FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND post_id=v_post_id;
            v_class_confirmed := v_existing.id IS NULL OR v_existing.revoked_at IS NOT NULL OR v_existing.source_revision<>v_data->>'source_revision';
            v_snapshot := jsonb_build_object('title',v_data->>'title','authorName',v_data->>'student_name','groupTitle',v_data->>'group_title','format',v_data->>'format',
                'kindLabel',v_data->>'kindLabel','blocks',v_data->'blocks','excerpt',v_data->>'excerpt');
            INSERT INTO public.class_agit_items(class_id,exhibition_id,post_id,student_id,position,source_revision,snapshot,public_alias,confirmed_by)
            VALUES(p_class_id,v_id,v_post_id,(v_data->>'student_id')::UUID,v_position,v_data->>'source_revision',v_snapshot,btrim(v_item->>'publicAlias'),v_actor)
            ON CONFLICT(exhibition_id,post_id) DO UPDATE SET position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,
                public_alias=EXCLUDED.public_alias,removed_at=NULL,revoked_at=NULL,
                confirmed_by=CASE WHEN v_class_confirmed THEN v_actor ELSE class_agit_items.confirmed_by END,
                confirmed_at=CASE WHEN v_class_confirmed THEN NOW() ELSE class_agit_items.confirmed_at END,
                consent_id=CASE WHEN v_existing.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_items.consent_id END
            RETURNING id INTO v_item_id;
            IF v_class_confirmed THEN INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'confirmed',v_actor); END IF;
        END LOOP;
        UPDATE public.class_agit_exhibitions SET title=btrim(p_payload->>'title'),introduction=COALESCE(p_payload->>'introduction',''),revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'publish' THEN
        IF NOT v_old_enabled THEN RAISE EXCEPTION '학생 공개 스위치를 먼저 켜 주세요.' USING ERRCODE='42501'; END IF;
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '학급 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.post_id=p.id AND i.class_id=p.class_id
        WHERE p.class_id=p_class_id AND i.exhibition_id=v_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p;
        FOR v_existing IN SELECT * FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL ORDER BY position,id LOOP
            v_data := public.class_agit_current_source_v1(p_class_id,v_existing.post_id);
            IF v_existing.revoked_at IS NOT NULL OR v_data IS NULL THEN RAISE EXCEPTION '수록이 철회되었거나 공개할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_existing.source_revision IS DISTINCT FROM v_data->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인하고 초안을 저장해 주세요.' USING ERRCODE='PT409'; END IF;
            v_items := v_items || jsonb_build_array(v_existing.snapshot || jsonb_build_object('itemId',v_existing.id,'consentId',v_existing.consent_id));
        END LOOP;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 60 THEN RAISE EXCEPTION '공개할 작품을 먼저 담아 주세요.' USING ERRCODE='23514'; END IF;
        UPDATE public.class_agit_exhibitions SET state='published',publication_no=publication_no+1,published_at=NOW(),revision=revision+1,updated_at=NOW(),
            published_snapshot=jsonb_build_object('title',title,'introduction',introduction,'works',v_items)
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'withdraw' THEN
        v_item_id := (p_payload->>'item_id')::UUID;
        UPDATE public.class_agit_items SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE class_id=p_class_id AND exhibition_id=v_id AND id=v_item_id;
        IF NOT FOUND THEN RAISE EXCEPTION '작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'withdrawn',v_actor);
        UPDATE public.class_agit_exhibitions SET revision=revision+1,updated_at=NOW() WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action IN ('unpublish','archive','restore') THEN
        UPDATE public.class_agit_exhibitions SET state=CASE WHEN p_action='archive' THEN 'archived' ELSE 'draft' END,revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSE RAISE EXCEPTION '지원하지 않는 전시 동작입니다.' USING ERRCODE='22023'; END IF;
    RETURN public.get_class_agit_workspace_v1(p_class_id,v_id);
END; $$;
REVOKE ALL ON FUNCTION public.run_class_agit_action_v1(UUID,TEXT,JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_action_v1(UUID,TEXT,JSONB) TO authenticated;

-- 작품별 회수는 새 판에 다시 확인해 수록하기 전까지 되살아나지 않는다.
CREATE OR REPLACE FUNCTION public.revoke_class_agit_source_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item RECORD;
BEGIN
    IF TG_TABLE_NAME='student_posts' THEN
        IF TG_OP='UPDATE' AND NEW.is_submitted IS TRUE AND NEW.is_confirmed IS TRUE AND NEW.is_returned IS NOT TRUE
           AND NEW.recalled_at IS NULL AND NEW.writing_context='assignment' AND NEW.visibility='class' THEN RETURN NEW; END IF;
        FOR v_item IN UPDATE public.class_agit_items SET revoked_at=clock_timestamp()
            WHERE class_id=OLD.class_id AND post_id=OLD.id AND revoked_at IS NULL RETURNING class_id,id LOOP
            INSERT INTO public.class_agit_consent_events(class_id,item_id,action) VALUES(v_item.class_id,v_item.id,'source_unavailable');
        END LOOP;
    ELSE
        IF TG_OP='UPDATE' AND NEW.is_active IS DISTINCT FROM FALSE AND NEW.deleted_at IS NULL AND NEW.class_id=OLD.class_id THEN RETURN NEW; END IF;
        FOR v_item IN UPDATE public.class_agit_items SET revoked_at=clock_timestamp()
            WHERE class_id=OLD.class_id AND student_id=OLD.id AND revoked_at IS NULL RETURNING class_id,id LOOP
            INSERT INTO public.class_agit_consent_events(class_id,item_id,action) VALUES(v_item.class_id,v_item.id,'source_unavailable');
        END LOOP;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.revoke_class_agit_source_v1() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS class_agit_post_revoke ON public.student_posts;
CREATE TRIGGER class_agit_post_revoke BEFORE DELETE OR UPDATE OF is_submitted,is_confirmed,is_returned,recalled_at,visibility,writing_context
ON public.student_posts FOR EACH ROW EXECUTE FUNCTION public.revoke_class_agit_source_v1();
DROP TRIGGER IF EXISTS class_agit_student_revoke ON public.students;
CREATE TRIGGER class_agit_student_revoke BEFORE DELETE OR UPDATE OF is_active,deleted_at,class_id
ON public.students FOR EACH ROW EXECUTE FUNCTION public.revoke_class_agit_source_v1();

CREATE OR REPLACE FUNCTION public.get_class_agit_publication_v1(p_class_id UUID,p_exhibition_id UUID,p_room INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ex public.class_agit_exhibitions%ROWTYPE; v_works JSONB; v_total INTEGER; v_rooms INTEGER;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id=p_class_id AND public.class_agit_class_is_open_v1(c.id)
          AND (c.teacher_id=auth.uid() OR EXISTS(SELECT 1 FROM public.students s WHERE s.class_id=c.id AND s.auth_id=auth.uid()
            AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE))
    ) THEN RAISE EXCEPTION '이 학급 전시를 볼 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id AND state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '공개 중인 전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF p_room IS NULL OR p_room NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    -- 공개 JSON 전체를 반환하지 않는다. 최신 자격/철회 상태를 통과한 표시 필드만 한 방씩 반환한다.
    WITH visible AS MATERIALIZED (
        SELECT w.value,w.ordinality FROM jsonb_array_elements(v_ex.published_snapshot->'works') WITH ORDINALITY w
        JOIN public.class_agit_items i ON i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(w.value->>'itemId')::UUID
        WHERE i.revoked_at IS NULL AND i.consent_id=(w.value->>'consentId')::UUID
            AND public.class_agit_current_source_v1(p_class_id,i.post_id) IS NOT NULL
    ), numbered AS (SELECT *,row_number() OVER(ORDER BY ordinality) AS n FROM visible)
    SELECT (SELECT count(*)::INTEGER FROM visible),COALESCE(jsonb_agg(jsonb_build_object('id','published-' || ordinality,
        'title',value->>'title','author',value->>'authorName','format',value->>'format','kindLabel',value->>'kindLabel',
        'excerpt',value->>'excerpt','blocks',value->'blocks') ORDER BY ordinality) FILTER(WHERE n BETWEEN (p_room-1)*12+1 AND p_room*12),'[]')
    INTO v_total,v_works FROM numbered;
    v_rooms:=GREATEST(1,(v_total+11)/12);
    RETURN jsonb_build_object('version',1,'publication_no',v_ex.publication_no,'room',p_room,'room_count',v_rooms,'total_count',v_total,
        'blocked_count',jsonb_array_length(v_ex.published_snapshot->'works')-v_total,
        'exhibition',jsonb_build_object('title',v_ex.published_snapshot->>'title','introduction',v_ex.published_snapshot->>'introduction','audience','class','works',v_works));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER) TO authenticated;

-- C2: 아직 운영 미적용인 같은 마이그레이션에 학생 읽기와 홈의 작은 신호를 연결한다.
CREATE INDEX IF NOT EXISTS class_agit_exhibitions_published_idx ON public.class_agit_exhibitions(class_id,published_at DESC,id DESC) WHERE state='published';

CREATE OR REPLACE FUNCTION public.class_agit_class_is_open_v1(p_class_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
    RETURN public.class_agit_class_is_allowed_v1(p_class_id) AND EXISTS(
        SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND COALESCE('class-agit'=ANY(c.enabled_modules),FALSE));
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_class_is_open_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.class_agit_reader_class_v1()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class UUID;
BEGIN
    SELECT s.class_id INTO v_class FROM public.students s
    WHERE s.auth_id=auth.uid() AND s.is_active IS DISTINCT FROM FALSE AND s.deleted_at IS NULL
      AND public.class_agit_class_is_open_v1(s.class_id)
    ORDER BY s.id LIMIT 1;
    IF v_class IS NULL THEN RAISE EXCEPTION '지금은 우리반 전시를 볼 수 없어요. 선생님께 공개 상태를 확인해 주세요.' USING ERRCODE='42501'; END IF;
    RETURN v_class;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_reader_class_v1() FROM PUBLIC, anon, authenticated, service_role;

-- 방/전문이 같은 철회·최신 자격 필터와 작품 번호를 사용한다. 내부 JSON은 브라우저에 직접 주지 않는다.
CREATE OR REPLACE FUNCTION public.class_agit_visible_works_v1(p_class_id UUID,p_exhibition_id UUID)
RETURNS TABLE(work_id TEXT,sort_position BIGINT,snapshot JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT 'published-'||w.ordinality,row_number() OVER(ORDER BY w.ordinality),w.value
    FROM public.class_agit_exhibitions e
    CROSS JOIN LATERAL jsonb_array_elements(e.published_snapshot->'works') WITH ORDINALITY w
    JOIN public.class_agit_items i ON i.class_id=e.class_id AND i.exhibition_id=e.id AND i.id=(w.value->>'itemId')::UUID
    WHERE e.class_id=p_class_id AND e.id=p_exhibition_id AND e.state='published'
      AND i.revoked_at IS NULL AND i.consent_id=(w.value->>'consentId')::UUID
      AND public.class_agit_current_source_v1(p_class_id,i.post_id) IS NOT NULL
    ORDER BY w.ordinality LIMIT 60;
$$;
REVOKE ALL ON FUNCTION public.class_agit_visible_works_v1(UUID,UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_exhibitions_v1()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class UUID; v_items JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.published_at DESC,q.id DESC),'[]') INTO v_items FROM (
        SELECT e.id,e.published_snapshot->>'title' AS title,e.published_snapshot->>'introduction' AS introduction,
            e.publication_no,e.published_at FROM public.class_agit_exhibitions e
        WHERE e.class_id=v_class AND e.state='published' ORDER BY e.published_at DESC,e.id DESC LIMIT 20
    ) q;
    RETURN jsonb_build_object('version',1,'exhibitions',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_exhibitions_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_exhibitions_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_room_v1(p_exhibition_id UUID,p_room INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_items JSONB; v_rooms JSONB; v_total INTEGER;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_room IS NULL OR p_room NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=v_class AND id=p_exhibition_id AND state='published' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 전시를 볼 수 없어요.' USING ERRCODE='42501'; END IF;
    WITH visible AS MATERIALIZED (SELECT * FROM public.class_agit_visible_works_v1(v_class,p_exhibition_id)),
    rooms AS (SELECT ((sort_position-1)/12+1)::INTEGER AS number,count(*)::INTEGER AS count FROM visible GROUP BY 1)
    SELECT (SELECT count(*) FROM visible),
        COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY number) FROM rooms r),'[]'),
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',work_id,'title',snapshot->>'title','author',snapshot->>'authorName',
            'format',snapshot->>'format','kindLabel',snapshot->>'kindLabel','excerpt',snapshot->>'excerpt') ORDER BY sort_position)
            FROM visible WHERE sort_position BETWEEN (p_room-1)*12+1 AND p_room*12),'[]')
    INTO v_total,v_rooms,v_items;
    RETURN jsonb_build_object('version',1,'exhibition_id',v_ex.id,'publication_no',v_ex.publication_no,
        'title',v_ex.published_snapshot->>'title','introduction',v_ex.published_snapshot->>'introduction',
        'room',p_room,'rooms',v_rooms,'total_count',v_total,'items',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_work_v1(p_exhibition_id UUID,p_publication_no INTEGER,p_work_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_item RECORD;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_work_id IS NULL OR p_work_id !~ '^published-([1-9]|[1-5][0-9]|60)$' THEN RAISE EXCEPTION '작품 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=v_class AND id=p_exhibition_id AND state='published' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 전시를 볼 수 없어요.' USING ERRCODE='42501'; END IF;
    IF p_publication_no IS DISTINCT FROM v_ex.publication_no THEN RAISE EXCEPTION '전시가 새로 바뀌었어요. 전시실에서 작품을 다시 골라 주세요.' USING ERRCODE='PT409'; END IF;
    WITH visible AS MATERIALIZED (SELECT *,lag(work_id) OVER(ORDER BY sort_position) AS previous_id,lead(work_id) OVER(ORDER BY sort_position) AS next_id
        FROM public.class_agit_visible_works_v1(v_class,p_exhibition_id))
    SELECT * INTO v_item FROM visible WHERE work_id=p_work_id;
    IF NOT FOUND THEN RAISE EXCEPTION '이 작품은 지금 읽을 수 없어요. 전시실에서 다른 작품을 골라 주세요.' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('version',1,'publication_no',v_ex.publication_no,'previous_id',v_item.previous_id,'next_id',v_item.next_id,
        'work',jsonb_build_object('id',v_item.work_id,'title',v_item.snapshot->>'title','author',v_item.snapshot->>'authorName',
            'format',v_item.snapshot->>'format','kindLabel',v_item.snapshot->>'kindLabel','excerpt',v_item.snapshot->>'excerpt','blocks',v_item.snapshot->'blocks'));
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_work_v1(UUID,INTEGER,TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_work_v1(UUID,INTEGER,TEXT) TO authenticated;

-- 기존 홈 코어·이웃 요약을 보존하고 공개 전시 존재 여부만 합친다. 홈에서 작품 본문은 읽지 않는다.
CREATE OR REPLACE FUNCTION public.get_student_home_bootstrap_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_student_id UUID;
    v_class_id UUID;
    v_space_id UUID;
    v_new_count INTEGER := 0;
    v_home JSONB;
BEGIN
    v_base := public.get_student_home_bootstrap_core_20261199();
    v_student_id := NULLIF(v_base #>> '{student,id}', '')::UUID;
    v_class_id := NULLIF(v_base #>> '{student,class_id}', '')::UUID;

    SELECT membership.space_id INTO v_space_id
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space
      ON space.id = membership.space_id
     AND space.status = 'active'
    JOIN public.classes class
      ON class.id = membership.class_id
     AND class.deleted_at IS NULL
     AND 'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
    WHERE membership.class_id = v_class_id
      AND public.neighbor_class_is_released_v1(membership.class_id) IS TRUE
      AND membership.status = 'active'
      AND membership.student_access_enabled IS TRUE
      AND (
          SELECT count(*)
          FROM public.neighbor_space_classes active_membership
          WHERE active_membership.space_id = membership.space_id
            AND active_membership.status = 'active'
      ) >= 2
    LIMIT 1;

    IF v_space_id IS NOT NULL THEN
        SELECT LEAST(count(*)::INTEGER, 99) INTO v_new_count
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes source_membership
          ON source_membership.space_id = shared.space_id
         AND source_membership.class_id = shared.class_id
         AND source_membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id
         AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id
         AND post.is_submitted IS TRUE
         AND post.recalled_at IS NULL
        LEFT JOIN public.neighbor_feed_visits visit
          ON visit.space_id = shared.space_id
         AND visit.student_id = v_student_id
         AND visit.class_id = v_class_id
        WHERE shared.space_id = v_space_id
          AND shared.status = 'published'
          AND shared.published_at > COALESCE(visit.last_seen_at, '-infinity'::TIMESTAMPTZ);
    END IF;

    v_home := COALESCE(v_base->'home', '{}'::JSONB) || jsonb_build_object(
        'neighbor_agit_available', v_space_id IS NOT NULL,
        'neighbor_agit_space_id', v_space_id,
        'neighbor_agit_new_count', COALESCE(v_new_count, 0),
        'class_agit_available', EXISTS (
            SELECT 1 FROM public.class_agit_exhibitions e
            JOIN public.students s ON s.class_id=e.class_id AND s.id=v_student_id AND s.auth_id=auth.uid()
                AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
            WHERE e.class_id=v_class_id AND e.state='published' AND public.class_agit_class_is_open_v1(e.class_id)
        ) OR (public.class_agit_class_is_open_v1(v_class_id) AND EXISTS (
            SELECT 1 FROM public.class_agit_book_editions e
            JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
            JOIN public.students s ON s.class_id=e.class_id AND s.id=v_student_id AND s.auth_id=auth.uid()
                AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
            WHERE e.class_id=v_class_id AND e.student_visible
        ))
    );
    RETURN jsonb_set(v_base, '{home}', v_home, TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_v1() TO authenticated;

-- C3: 문집은 전시와 별개의 프로젝트·수록 확인·확정판을 소유한다.
CREATE TABLE IF NOT EXISTS public.class_agit_books (
    id UUID PRIMARY KEY, class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '우리들의 문집' CHECK (length(btrim(title)) BETWEEN 1 AND 80),
    subtitle TEXT NOT NULL DEFAULT '' CHECK(length(subtitle)<=120),
    introduction TEXT NOT NULL DEFAULT '' CHECK(length(introduction)<=2000),
    class_label TEXT NOT NULL DEFAULT '' CHECK(length(class_label)<=80),
    term TEXT NOT NULL DEFAULT '' CHECK(length(term)<=40), issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    grouping TEXT NOT NULL DEFAULT 'custom' CHECK(grouping IN('custom','author','topic')),
    revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(class_id,id)
);
CREATE INDEX IF NOT EXISTS class_agit_books_class_idx ON public.class_agit_books(class_id,updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS public.class_agit_book_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID NOT NULL, book_id UUID NOT NULL,
    post_id UUID, student_id UUID, position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 100),
    source_revision TEXT NOT NULL CHECK(length(source_revision)=64),
    snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::TEXT)<=100000),
    consent_id UUID NOT NULL DEFAULT gen_random_uuid(), revoked_at TIMESTAMPTZ, removed_at TIMESTAMPTZ,
    FOREIGN KEY(class_id,book_id) REFERENCES public.class_agit_books(class_id,id) ON DELETE CASCADE,
    FOREIGN KEY(class_id,post_id) REFERENCES public.student_posts(class_id,id) ON DELETE SET NULL(post_id),
    FOREIGN KEY(class_id,student_id) REFERENCES public.students(class_id,id) ON DELETE SET NULL(student_id),
    UNIQUE(class_id,id), UNIQUE(book_id,post_id)
);
CREATE INDEX IF NOT EXISTS class_agit_book_items_book_idx ON public.class_agit_book_items(class_id,book_id,position,id);
CREATE INDEX IF NOT EXISTS class_agit_book_items_source_idx ON public.class_agit_book_items(class_id,post_id);
CREATE INDEX IF NOT EXISTS class_agit_book_items_student_idx ON public.class_agit_book_items(class_id,student_id);
CREATE TABLE IF NOT EXISTS public.class_agit_book_editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID NOT NULL, book_id UUID NOT NULL,
    number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 20),
    snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::TEXT)<=11000000),
    student_visible BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(class_id,book_id) REFERENCES public.class_agit_books(class_id,id) ON DELETE CASCADE,
    UNIQUE(class_id,id), UNIQUE(book_id,number)
);
CREATE INDEX IF NOT EXISTS class_agit_book_editions_idx ON public.class_agit_book_editions(class_id,book_id,number DESC);
CREATE UNIQUE INDEX IF NOT EXISTS class_agit_book_one_visible_idx ON public.class_agit_book_editions(class_id,book_id) WHERE student_visible;
CREATE TABLE IF NOT EXISTS public.class_agit_release_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL, scope TEXT NOT NULL CHECK(scope IN('anthology','external')),
    action TEXT NOT NULL CHECK(action IN('confirmed','withdrawn','source_unavailable','published','revoked','renewed')),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_agit_release_events_class_idx ON public.class_agit_release_events(class_id,recorded_at DESC);
ALTER TABLE public.class_agit_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_book_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_book_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_release_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_agit_books,public.class_agit_book_items,public.class_agit_book_editions,public.class_agit_release_events FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_class_agit_book_workspace_v1(p_class_id UUID,p_book_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_books JSONB; v_students JSONB; v_book JSONB; v_items JSONB; v_editions JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY updated_at DESC,id DESC),'[]') INTO v_books FROM (
        SELECT id,title,archived,revision,updated_at FROM public.class_agit_books WHERE class_id=p_class_id ORDER BY updated_at DESC,id DESC LIMIT 20) q;
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY name,id),'[]') INTO v_students FROM (
        SELECT id,left(name,30) AS name FROM public.students WHERE class_id=p_class_id AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE ORDER BY name,id LIMIT 100) q;
    IF p_book_id IS NOT NULL THEN
        SELECT to_jsonb(b) INTO v_book FROM public.class_agit_books b WHERE b.class_id=p_class_id AND b.id=p_book_id;
        IF v_book IS NULL THEN RAISE EXCEPTION '문집을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position,q.id),'[]') INTO v_items FROM (
            SELECT i.id,i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'studentId',i.student_id,
                'sourceRevision',i.source_revision,'revoked',i.revoked_at IS NOT NULL,'unavailable',cur.data IS NULL,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision,'anthologyConfirmed',i.revoked_at IS NULL) AS data
            FROM public.class_agit_book_items i LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
            WHERE i.class_id=p_class_id AND i.book_id=p_book_id AND i.removed_at IS NULL ORDER BY i.position,i.id LIMIT 100) q;
        SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY number DESC),'[]') INTO v_editions FROM (
            SELECT id,number,created_at,student_visible,snapshot->>'title' AS title FROM public.class_agit_book_editions
            WHERE class_id=p_class_id AND book_id=p_book_id ORDER BY number DESC LIMIT 20) q;
        v_book:=v_book||jsonb_build_object('items',v_items,'editions',v_editions);
    END IF;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'books',v_books,'students',v_students,'book',v_book);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_book_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_book_workspace_v1(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.class_agit_book_draft_snapshot_v1(p_class_id UUID,p_book_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_book public.class_agit_books%ROWTYPE; v_old public.class_agit_book_items%ROWTYPE; v_source JSONB; v_items JSONB:='[]';
BEGIN
    SELECT * INTO v_book FROM public.class_agit_books WHERE class_id=p_class_id AND id=p_book_id FOR SHARE;
    IF NOT FOUND OR v_book.archived THEN RAISE EXCEPTION '문집 초안을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_book_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.book_id=p_book_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p;
        FOR v_old IN SELECT * FROM public.class_agit_book_items WHERE class_id=p_class_id AND book_id=p_book_id AND removed_at IS NULL ORDER BY position,id LOOP
            v_source:=public.class_agit_current_source_v1(p_class_id,v_old.post_id);
            IF v_source IS NULL OR v_old.revoked_at IS NOT NULL THEN RAISE EXCEPTION '수록할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_old.source_revision IS DISTINCT FROM v_source->>'source_revision' THEN RAISE EXCEPTION '원글 전문을 다시 확인하고 저장해 주세요.' USING ERRCODE='PT409'; END IF;
            v_items:=v_items||jsonb_build_array(v_old.snapshot||jsonb_build_object('itemId',v_old.id,'consentId',v_old.consent_id));
        END LOOP;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '문집에는 1~100편의 작품이 필요합니다.' USING ERRCODE='23514'; END IF;
    RETURN jsonb_build_object('title',v_book.title,'subtitle',v_book.subtitle,'introduction',v_book.introduction,
            'class_label',v_book.class_label,'term',v_book.term,'issue_date',v_book.issue_date,'grouping',v_book.grouping,'print','{"paper":"A4","body_pt":12,"poem_pt":14,"version":1}'::JSONB,'works',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_book_draft_snapshot_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.run_class_agit_book_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor UUID; v_id UUID:=(p_payload->>'book_id')::UUID; v_book public.class_agit_books%ROWTYPE;
    v_item JSONB; v_source JSONB; v_items JSONB:='[]'; v_item_id UUID; v_post UUID; v_n INTEGER:=0; v_number INTEGER;
    v_old public.class_agit_book_items%ROWTYPE; v_snapshot JSONB; v_edition UUID;
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF v_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>60000
        THEN RAISE EXCEPTION '문집 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.classes WHERE id=p_class_id FOR UPDATE;
    SELECT * INTO v_book FROM public.class_agit_books WHERE class_id=p_class_id AND id=v_id FOR UPDATE;
    IF p_action='create' THEN
        IF FOUND THEN RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id); END IF;
        IF (SELECT count(*) FROM public.class_agit_books WHERE class_id=p_class_id)>=20 THEN RAISE EXCEPTION '문집은 학급당 20권까지 보관합니다.' USING ERRCODE='23514'; END IF;
        INSERT INTO public.class_agit_books(id,class_id) VALUES(v_id,p_class_id);
        RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id);
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION '문집을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF (p_payload->>'expected_revision')::INTEGER IS DISTINCT FROM v_book.revision
        THEN RAISE EXCEPTION '문집이 다른 화면에서 변경되었습니다. 입력을 확인한 뒤 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF v_book.archived AND p_action NOT IN('restore','hide','withdraw') THEN RAISE EXCEPTION '보관한 문집을 먼저 복원해 주세요.' USING ERRCODE='22023'; END IF;
    IF p_action='save' THEN
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')>100
            OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80
            THEN RAISE EXCEPTION '문집 제목과 작품 수(최대 100편)를 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (SELECT count(DISTINCT x->>'sourceId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 수록할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p WHERE p.class_id=p_class_id AND p.id IN(
            SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(p_payload->'items') x) ORDER BY p.id FOR SHARE;
        UPDATE public.class_agit_book_items SET removed_at=now() WHERE class_id=p_class_id AND book_id=v_id AND removed_at IS NULL;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            v_post:=(v_item->>'sourceId')::UUID; v_source:=public.class_agit_current_source_v1(p_class_id,v_post);
            IF v_source IS NULL THEN RAISE EXCEPTION '수록할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_item->>'sourceRevision' IS DISTINCT FROM v_source->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글의 전문을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            IF v_item->'anthologyConfirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '문집 수록 의사를 별도로 확인해 주세요.' USING ERRCODE='22023'; END IF;
            v_n:=v_n+1;
            SELECT * INTO v_old FROM public.class_agit_book_items WHERE class_id=p_class_id AND book_id=v_id AND post_id=v_post;
            v_snapshot:=jsonb_build_object('title',v_source->>'title','author',v_source->>'student_name','format',v_source->>'format',
                'kindLabel',v_source->>'kindLabel','blocks',v_source->'blocks','excerpt',v_source->>'excerpt','group',v_source->>'group_title');
            INSERT INTO public.class_agit_book_items(class_id,book_id,post_id,student_id,position,source_revision,snapshot)
            VALUES(p_class_id,v_id,v_post,(v_source->>'student_id')::UUID,v_n,v_source->>'source_revision',v_snapshot)
            ON CONFLICT(book_id,post_id) DO UPDATE SET position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,
                consent_id=CASE WHEN class_agit_book_items.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_book_items.consent_id END,
                revoked_at=NULL,removed_at=NULL RETURNING id INTO v_item_id;
            IF v_old.id IS NULL OR v_old.revoked_at IS NOT NULL OR v_old.source_revision<>v_source->>'source_revision' THEN
                INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_item_id,'anthology','confirmed',v_actor); END IF;
        END LOOP;
        UPDATE public.class_agit_books SET title=btrim(p_payload->>'title'),subtitle=COALESCE(p_payload->>'subtitle',''),introduction=COALESCE(p_payload->>'introduction',''),
            class_label=COALESCE(p_payload->>'class_label',''),term=COALESCE(p_payload->>'term',''),issue_date=(p_payload->>'issue_date')::DATE,
            grouping=COALESCE(p_payload->>'grouping','custom') WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action='finalize' THEN
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '문집의 내용과 수록 의사를 확인해 주세요.' USING ERRCODE='22023'; END IF;
        v_snapshot:=public.class_agit_book_draft_snapshot_v1(p_class_id,v_id);
        SELECT COALESCE(max(number),0)+1 INTO v_number FROM public.class_agit_book_editions WHERE class_id=p_class_id AND book_id=v_id;
        IF v_number>20 THEN RAISE EXCEPTION '확정판은 20판까지 보관합니다. 새 문집을 만들어 주세요.' USING ERRCODE='23514'; END IF;
        INSERT INTO public.class_agit_book_editions(class_id,book_id,number,snapshot)
        VALUES(p_class_id,v_id,v_number,v_snapshot);
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_id,'anthology','published',v_actor);
    ELSIF p_action IN('show','hide') THEN
        v_edition:=(p_payload->>'edition_id')::UUID;
        IF NOT EXISTS(SELECT 1 FROM public.class_agit_book_editions WHERE class_id=p_class_id AND book_id=v_id AND id=v_edition)
            THEN RAISE EXCEPTION '확정판을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        UPDATE public.class_agit_book_editions SET student_visible=FALSE WHERE class_id=p_class_id AND book_id=v_id;
        IF p_action='show' THEN UPDATE public.class_agit_book_editions SET student_visible=TRUE WHERE class_id=p_class_id AND book_id=v_id AND id=v_edition; END IF;
    ELSIF p_action='withdraw' THEN
        UPDATE public.class_agit_book_items SET revoked_at=COALESCE(revoked_at,now()) WHERE class_id=p_class_id AND book_id=v_id AND id=(p_payload->>'item_id')::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION '수록 작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,(p_payload->>'item_id')::UUID,'anthology','withdrawn',v_actor);
    ELSIF p_action IN('archive','restore') THEN
        UPDATE public.class_agit_books SET archived=p_action='archive' WHERE class_id=p_class_id AND id=v_id;
        UPDATE public.class_agit_book_editions SET student_visible=FALSE WHERE class_id=p_class_id AND book_id=v_id;
    ELSE RAISE EXCEPTION '지원하지 않는 문집 동작입니다.' USING ERRCODE='22023'; END IF;
    UPDATE public.class_agit_books SET revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_id;
    RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id);
END; $$;
REVOKE ALL ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_agit_book_preview_v1(p_class_id UUID,p_book_id UUID,p_revision INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_revision INTEGER; v_snapshot JSONB; v_works JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT revision INTO v_revision FROM public.class_agit_books WHERE class_id=p_class_id AND id=p_book_id FOR SHARE;
    IF v_revision IS NULL THEN RAISE EXCEPTION '문집을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF p_revision IS DISTINCT FROM v_revision THEN RAISE EXCEPTION '최신 문집을 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    v_snapshot:=public.class_agit_book_draft_snapshot_v1(p_class_id,p_book_id);
    SELECT jsonb_agg(value-'itemId'-'consentId'||jsonb_build_object('id','chapter-'||ordinality) ORDER BY ordinality)
        INTO v_works FROM jsonb_array_elements(v_snapshot->'works') WITH ORDINALITY;
    RETURN jsonb_build_object('version',1,'id',p_book_id,'number',0,'draft',TRUE,'book',v_snapshot||jsonb_build_object('works',v_works));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_book_preview_v1(UUID,UUID,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_book_preview_v1(UUID,UUID,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.class_agit_book_visible_works_v1(p_class_id UUID,p_edition_id UUID)
RETURNS TABLE(work_id TEXT,sort_position BIGINT,snapshot JSONB) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT 'chapter-'||w.ordinality,w.ordinality,w.value-'itemId'-'consentId'
    FROM public.class_agit_book_editions e CROSS JOIN LATERAL jsonb_array_elements(e.snapshot->'works') WITH ORDINALITY w
    JOIN public.class_agit_book_items i ON i.class_id=e.class_id AND i.book_id=e.book_id AND i.id=(w.value->>'itemId')::UUID
    WHERE e.class_id=p_class_id AND e.id=p_edition_id AND i.revoked_at IS NULL AND i.consent_id=(w.value->>'consentId')::UUID
        AND public.class_agit_current_source_v1(p_class_id,i.post_id) IS NOT NULL ORDER BY w.ordinality LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.class_agit_book_visible_works_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_class_agit_book_edition_v1(p_class_id UUID,p_edition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_edition public.class_agit_book_editions%ROWTYPE; v_works JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_edition FROM public.class_agit_book_editions WHERE class_id=p_class_id AND id=p_edition_id;
    IF NOT FOUND THEN RAISE EXCEPTION '확정판을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(snapshot||jsonb_build_object('id',work_id) ORDER BY sort_position),'[]') INTO v_works FROM public.class_agit_book_visible_works_v1(p_class_id,p_edition_id);
    IF jsonb_array_length(v_works)<>jsonb_array_length(v_edition.snapshot->'works') THEN
        RAISE EXCEPTION '수록이 철회되었거나 읽을 수 없는 작품이 있습니다. 작품을 제외하고 새 판을 확정한 뒤 출력해 주세요.' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('version',1,'id',v_edition.id,'number',v_edition.number,'created_at',v_edition.created_at,
        'book',v_edition.snapshot||jsonb_build_object('works',v_works));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_book_edition_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_book_edition_v1(UUID,UUID) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_my_class_agit_books_v1(p_edition_id UUID DEFAULT NULL,p_work_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_ed public.class_agit_book_editions%ROWTYPE; v_books JSONB; v_works JSONB; v_work JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_edition_id IS NULL THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY created_at DESC,id DESC),'[]') INTO v_books FROM (
            SELECT e.id,e.number,e.created_at,e.snapshot->>'title' AS title,e.snapshot->>'subtitle' AS subtitle
            FROM public.class_agit_book_editions e JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
            WHERE e.class_id=v_class AND e.student_visible ORDER BY e.created_at DESC,e.id DESC LIMIT 20) q;
        RETURN jsonb_build_object('version',1,'books',v_books);
    END IF;
    SELECT e.* INTO v_ed FROM public.class_agit_book_editions e JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
        WHERE e.class_id=v_class AND e.id=p_edition_id AND e.student_visible;
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 문집을 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    IF p_work_id IS NOT NULL THEN
        SELECT snapshot||jsonb_build_object('id',work_id) INTO v_work FROM public.class_agit_book_visible_works_v1(v_class,p_edition_id) WHERE work_id=p_work_id;
        IF v_work IS NULL THEN RAISE EXCEPTION '이 작품은 지금 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    ELSE
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id',work_id,'title',snapshot->>'title','author',snapshot->>'author','group',snapshot->>'group') ORDER BY sort_position),'[]')
            INTO v_works FROM public.class_agit_book_visible_works_v1(v_class,p_edition_id);
    END IF;
    RETURN jsonb_build_object('version',1,'id',v_ed.id,'number',v_ed.number,'book',v_ed.snapshot-'works'-'print', 'works',v_works,'work',v_work);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_books_v1(UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_books_v1(UUID,TEXT) TO authenticated;

-- C4/C5: 관리자 내부 → 지정 1~2학급 시범과 전체 중지. 외부 공유 허용은 별도 스위치다.
ALTER TABLE public.class_agit_rollout DROP CONSTRAINT IF EXISTS class_agit_rollout_mode_check;
ALTER TABLE public.class_agit_rollout ADD CONSTRAINT class_agit_rollout_mode_check CHECK(mode IN('internal','pilot','disabled'));
ALTER TABLE public.class_agit_rollout ADD COLUMN IF NOT EXISTS external_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.class_agit_rollout ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.class_agit_pilot_classes (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE
);
ALTER TABLE public.class_agit_pilot_classes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_agit_pilot_classes FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.class_agit_class_is_allowed_v1(p_class_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT EXISTS(SELECT 1 FROM public.classes c JOIN public.profiles p ON p.id=c.teacher_id
        CROSS JOIN public.class_agit_rollout r WHERE c.id=p_class_id AND c.deleted_at IS NULL AND p.is_approved IS TRUE
        AND r.singleton AND ((r.mode='internal' AND p.role='ADMIN') OR (r.mode='pilot' AND p.role IN('ADMIN','TEACHER')
            AND EXISTS(SELECT 1 FROM public.class_agit_pilot_classes pc WHERE pc.class_id=c.id))));
$$;
REVOKE ALL ON FUNCTION public.class_agit_class_is_allowed_v1(UUID) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.get_class_agit_access_v1(p_class_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT jsonb_build_object('allowed',EXISTS(SELECT 1 FROM public.classes WHERE id=p_class_id AND teacher_id=auth.uid() AND public.class_agit_class_is_allowed_v1(id)),
        'is_admin',EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='ADMIN' AND is_approved IS TRUE));
$$;
REVOKE ALL ON FUNCTION public.get_class_agit_access_v1(UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_access_v1(UUID) TO authenticated;
CREATE OR REPLACE FUNCTION public.manage_class_agit_rollout_v1(p_payload JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_state public.class_agit_rollout%ROWTYPE; v_classes JSONB; v_allowed JSONB;
BEGIN
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='ADMIN' AND is_approved IS TRUE)
        THEN RAISE EXCEPTION '관리자만 공개 단계를 관리할 수 있습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_state FROM public.class_agit_rollout WHERE singleton FOR UPDATE;
    IF p_payload IS NOT NULL THEN
        IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>2000
            OR p_payload->>'mode' NOT IN('internal','pilot','disabled') OR jsonb_typeof(p_payload->'external_enabled') IS DISTINCT FROM 'boolean'
            OR jsonb_typeof(p_payload->'class_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'class_ids')>2
            THEN RAISE EXCEPTION '공개 단계와 시범 학급(최대 2개)을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (p_payload->>'expected_revision')::INTEGER IS DISTINCT FROM v_state.revision THEN RAISE EXCEPTION '공개 설정을 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
        IF p_payload->>'mode'='pilot' AND jsonb_array_length(p_payload->'class_ids')=0 THEN RAISE EXCEPTION '시범 학급을 선택해 주세요.' USING ERRCODE='22023'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'class_ids') x WHERE NOT EXISTS(
            SELECT 1 FROM public.classes c JOIN public.profiles p ON p.id=c.teacher_id WHERE c.id=x::UUID AND c.deleted_at IS NULL AND p.is_approved IS TRUE AND p.role IN('ADMIN','TEACHER')))
            THEN RAISE EXCEPTION '허용할 수 없는 학급입니다.' USING ERRCODE='42501'; END IF;
        DELETE FROM public.class_agit_pilot_classes;
        INSERT INTO public.class_agit_pilot_classes SELECT DISTINCT value::UUID FROM jsonb_array_elements_text(p_payload->'class_ids');
        UPDATE public.class_agit_rollout SET mode=p_payload->>'mode',external_enabled=(p_payload->>'external_enabled')::BOOLEAN,revision=revision+1 WHERE singleton;
    END IF;
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY name,id),'[]') INTO v_classes FROM (
        SELECT c.id,c.name,left(COALESCE(t.name,''),80) AS teacher_name,left(COALESCE(t.school_name,''),80) AS school_name
        FROM public.classes c JOIN public.profiles p ON p.id=c.teacher_id LEFT JOIN public.teachers t ON t.id=c.teacher_id
        WHERE c.deleted_at IS NULL AND p.is_approved IS TRUE AND p.role IN('ADMIN','TEACHER') ORDER BY c.name,c.id LIMIT 100) q;
    SELECT COALESCE(jsonb_agg(class_id ORDER BY class_id),'[]') INTO v_allowed FROM public.class_agit_pilot_classes;
    RETURN jsonb_build_object('version',1,'settings',(SELECT to_jsonb(r)-'singleton' FROM public.class_agit_rollout r WHERE singleton),'class_ids',v_allowed,'classes',v_classes);
END; $$;
REVOKE ALL ON FUNCTION public.manage_class_agit_rollout_v1(JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.manage_class_agit_rollout_v1(JSONB) TO authenticated;

CREATE TABLE IF NOT EXISTS public.class_agit_external_shares (
    id UUID PRIMARY KEY, class_id UUID NOT NULL, exhibition_id UUID NOT NULL,
    title TEXT NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 80), introduction TEXT NOT NULL DEFAULT '' CHECK(length(introduction)<=240),
    token_hash TEXT UNIQUE CHECK(length(token_hash)=64), expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ, revision INTEGER NOT NULL DEFAULT 1, publication_no INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(class_id,exhibition_id) REFERENCES public.class_agit_exhibitions(class_id,id) ON DELETE CASCADE,
    UNIQUE(class_id,id), UNIQUE(exhibition_id)
);
CREATE INDEX IF NOT EXISTS class_agit_external_shares_class_idx ON public.class_agit_external_shares(class_id,updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS public.class_agit_external_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_id UUID NOT NULL, share_id UUID NOT NULL,
    post_id UUID, student_id UUID, position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 60),
    snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::TEXT)<=100000), revoked_at TIMESTAMPTZ,
    FOREIGN KEY(class_id,share_id) REFERENCES public.class_agit_external_shares(class_id,id) ON DELETE CASCADE,
    FOREIGN KEY(class_id,post_id) REFERENCES public.student_posts(class_id,id) ON DELETE SET NULL(post_id),
    FOREIGN KEY(class_id,student_id) REFERENCES public.students(class_id,id) ON DELETE SET NULL(student_id),
    UNIQUE(share_id,position), UNIQUE(share_id,post_id)
);
CREATE INDEX IF NOT EXISTS class_agit_external_items_scope_idx ON public.class_agit_external_items(class_id,share_id,position);
CREATE INDEX IF NOT EXISTS class_agit_external_items_post_idx ON public.class_agit_external_items(class_id,post_id);
CREATE INDEX IF NOT EXISTS class_agit_external_items_student_idx ON public.class_agit_external_items(class_id,student_id);
CREATE TABLE IF NOT EXISTS public.class_agit_public_read_budget (
    bucket TEXT PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL, requests INTEGER NOT NULL CHECK(requests>0)
);
ALTER TABLE public.class_agit_external_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_external_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_agit_public_read_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.class_agit_external_shares,public.class_agit_external_items,public.class_agit_public_read_budget FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_class_agit_share_workspace_v1(p_class_id UUID,p_exhibition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_share JSONB; v_items JSONB; v_ex public.class_agit_exhibitions%ROWTYPE; v_selected JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT jsonb_build_object('revision',s.revision,'publication_no',s.publication_no,'title',s.title,'introduction',s.introduction,
        'expires_at',s.expires_at,'revoked',s.revoked_at IS NOT NULL,'expired',s.expires_at<=now()) INTO v_share
        FROM public.class_agit_external_shares s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id;
    SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position),'[]') INTO v_items FROM (
        SELECT i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,
            'unavailable',cur.data IS NULL,'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
        FROM public.class_agit_items i LEFT JOIN LATERAL(SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
        WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.removed_at IS NULL ORDER BY i.position LIMIT 60) q;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'title',i.snapshot->>'title','author',i.snapshot->>'author','revoked',i.revoked_at IS NOT NULL) ORDER BY i.position),'[]') INTO v_selected
        FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id;
    RETURN jsonb_build_object('version',1,'exhibition_revision',v_ex.revision,'share',v_share,'candidates',v_items,'published_items',v_selected,
        'external_enabled',(SELECT external_enabled FROM public.class_agit_rollout WHERE singleton));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_class_agit_share_action_v1(p_class_id UUID,p_exhibition_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_share public.class_agit_external_shares%ROWTYPE;
    v_item JSONB; v_source JSONB; v_n INTEGER:=0; v_token TEXT:=p_payload->>'token'; v_hash TEXT; v_days INTEGER; v_external_item UUID;
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>30000 THEN RAISE EXCEPTION '공개 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.classes WHERE id=p_class_id FOR UPDATE;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_share FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE;
    IF p_action IN('publish','rotate') THEN
        IF v_token IS NULL OR v_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION '새 공유 주소를 준비해 주세요.' USING ERRCODE='22023'; END IF;
        v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
        -- 같은 토큰으로 잃어버린 응답을 재시도해도 중복 발행/판 증가가 없다.
        IF v_share.token_hash=v_hash AND v_share.revoked_at IS NULL THEN RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id); END IF;
    END IF;
    IF COALESCE((p_payload->>'expected_revision')::INTEGER,0) IS DISTINCT FROM COALESCE(v_share.revision,0)
        THEN RAISE EXCEPTION '공유 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action IN('publish','rotate','extend') THEN
        IF NOT (SELECT external_enabled FROM public.class_agit_rollout WHERE singleton) THEN RAISE EXCEPTION '관리자가 외부 공유를 허용한 뒤 발행할 수 있습니다.' USING ERRCODE='42501'; END IF;
        v_days:=(p_payload->>'days')::INTEGER;
        IF v_days IS NULL OR v_days NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION '공유 기간은 1~30일입니다.' USING ERRCODE='22023'; END IF;
    END IF;
    IF p_action='publish' THEN
        IF v_ex.state='archived' OR p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '외부 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (p_payload->>'exhibition_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN RAISE EXCEPTION '전시 작품이 바뀌었습니다. 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 60
            OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '공개 제목과 1~60편의 작품을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (SELECT count(DISTINCT x->>'itemId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 선택할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.exhibition_id=p_exhibition_id ORDER BY p.id FOR SHARE OF p;
        INSERT INTO public.class_agit_external_shares(id,class_id,exhibition_id,title,introduction,token_hash,expires_at)
        VALUES(p_exhibition_id,p_class_id,p_exhibition_id,btrim(p_payload->>'title'),COALESCE(p_payload->>'introduction',''),v_hash,now()+make_interval(days=>v_days))
        ON CONFLICT(exhibition_id) DO UPDATE SET title=EXCLUDED.title,introduction=EXCLUDED.introduction,token_hash=v_hash,expires_at=EXCLUDED.expires_at,
            revoked_at=NULL,revision=class_agit_external_shares.revision+1,publication_no=class_agit_external_shares.publication_no+1,updated_at=now();
        DELETE FROM public.class_agit_external_items WHERE class_id=p_class_id AND share_id=p_exhibition_id;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) INTO v_source FROM public.class_agit_items i
                WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID AND i.removed_at IS NULL;
            IF v_source IS NULL THEN RAISE EXCEPTION '공개할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_source->>'source_revision' IS DISTINCT FROM v_item->>'sourceRevision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            IF v_item->'externalConfirmed' IS DISTINCT FROM 'true'::JSONB OR length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30
                THEN RAISE EXCEPTION '작품별 외부 공개 의사와 가림 이름을 확인해 주세요.' USING ERRCODE='22023'; END IF;
            v_n:=v_n+1;
            INSERT INTO public.class_agit_external_items(class_id,share_id,post_id,student_id,position,snapshot)
            VALUES(p_class_id,p_exhibition_id,(v_source->>'id')::UUID,(v_source->>'student_id')::UUID,v_n,
                jsonb_build_object('title',v_source->>'title','author',btrim(v_item->>'publicAlias'),'format',v_source->>'format',
                    'kindLabel',v_source->>'kindLabel','excerpt',v_source->>'excerpt','blocks',v_source->'blocks')) RETURNING id INTO v_external_item;
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_external_item,'external','confirmed',v_actor);
        END LOOP;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id)
            VALUES(p_class_id,p_exhibition_id,'external','confirmed',v_actor),(p_class_id,p_exhibition_id,'external','published',v_actor);
    ELSIF p_action IN('rotate','extend') THEN
        IF v_share.id IS NULL OR v_share.revoked_at IS NOT NULL THEN RAISE EXCEPTION '외부 공개본을 먼저 발행해 주세요.' USING ERRCODE='22023'; END IF;
        UPDATE public.class_agit_external_shares SET token_hash=CASE WHEN p_action='rotate' THEN v_hash ELSE token_hash END,
            expires_at=now()+make_interval(days=>v_days),revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_share.id,'external','renewed',v_actor);
    ELSIF p_action='revoke' THEN
        UPDATE public.class_agit_external_shares SET revoked_at=COALESCE(revoked_at,now()),revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        IF NOT FOUND THEN RAISE EXCEPTION '공개본을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_share.id,'external','revoked',v_actor);
    ELSIF p_action='withdraw' THEN
        UPDATE public.class_agit_external_items SET revoked_at=COALESCE(revoked_at,now()) WHERE class_id=p_class_id AND share_id=v_share.id AND id=(p_payload->>'item_id')::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION '공개 작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        UPDATE public.class_agit_external_shares SET revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,(p_payload->>'item_id')::UUID,'external','withdrawn',v_actor);
    ELSE RAISE EXCEPTION '지원하지 않는 공유 동작입니다.' USING ERRCODE='22023'; END IF;
    RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id);
END; $$;
REVOKE ALL ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) TO authenticated;

-- 고정 버킷으로 IP·기기·토큰 원문 없이 전역 3000회/분, 공개본 600회/분. 초과도 정상 반환해 카운터를 롤백하지 않는다.
CREATE OR REPLACE FUNCTION public.class_agit_take_public_budget_v1(p_bucket TEXT,p_limit INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count INTEGER;
BEGIN
    INSERT INTO public.class_agit_public_read_budget(bucket,window_start,requests) VALUES(p_bucket,date_trunc('minute',clock_timestamp()),1)
    ON CONFLICT(bucket) DO UPDATE SET window_start=EXCLUDED.window_start,
        requests=CASE WHEN class_agit_public_read_budget.window_start=EXCLUDED.window_start THEN LEAST(class_agit_public_read_budget.requests+1,p_limit+1) ELSE 1 END
    RETURNING requests INTO v_count;
    RETURN v_count<=p_limit;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_take_public_budget_v1(TEXT,INTEGER) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.read_public_class_agit_v1(p_token TEXT,p_room INTEGER DEFAULT 0,p_work_id TEXT DEFAULT NULL,p_publication_no INTEGER DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='3s' SET lock_timeout='1s' AS $$
DECLARE v_share public.class_agit_external_shares%ROWTYPE; v_items JSONB; v_work JSONB; v_count INTEGER; v_rooms JSONB;
BEGIN
    PERFORM set_config('response.status','200',TRUE);
    PERFORM set_config('response.headers','[{"Cache-Control":"no-store"},{"Referrer-Policy":"no-referrer"},{"X-Robots-Tag":"noindex, nofollow, noarchive"}]',TRUE);
    IF NOT public.class_agit_take_public_budget_v1('global',3000) THEN
        PERFORM set_config('response.status','429',TRUE); RETURN jsonb_build_object('version',1,'error','rate_limited'); END IF;
    IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR p_room IS NULL OR p_room NOT BETWEEN 0 AND 5
        OR (p_work_id IS NOT NULL AND p_work_id !~ '^published-([1-9]|[1-5][0-9]|60)$') THEN
        PERFORM set_config('response.status','404',TRUE); RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT * INTO v_share FROM public.class_agit_external_shares s WHERE s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
        AND s.revoked_at IS NULL AND s.expires_at>now() AND public.class_agit_class_is_allowed_v1(s.class_id)
        AND EXISTS(SELECT 1 FROM public.class_agit_rollout WHERE singleton AND external_enabled) FOR SHARE;
    IF NOT FOUND THEN PERFORM set_config('response.status','404',TRUE); RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    IF NOT public.class_agit_take_public_budget_v1('share:'||v_share.id,600) THEN
        PERFORM set_config('response.status','429',TRUE); RETURN jsonb_build_object('version',1,'error','rate_limited'); END IF;
    IF p_work_id IS NOT NULL AND p_publication_no IS DISTINCT FROM v_share.publication_no THEN
        PERFORM set_config('response.status','409',TRUE); RETURN jsonb_build_object('version',1,'error','changed'); END IF;
    WITH visible AS MATERIALIZED (
        SELECT i.position,'published-'||i.position AS work_id,i.snapshot,row_number() OVER(ORDER BY i.position) AS n
        FROM public.class_agit_external_items i WHERE i.class_id=v_share.class_id AND i.share_id=v_share.id AND i.revoked_at IS NULL
            AND public.class_agit_current_source_v1(v_share.class_id,i.post_id) IS NOT NULL ORDER BY i.position LIMIT 60
    ), rooms AS (SELECT ((n-1)/12+1)::INTEGER AS number,count(*)::INTEGER AS count FROM visible GROUP BY 1)
    SELECT (SELECT count(*) FROM visible),COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY number) FROM rooms r),'[]'),
        COALESCE((SELECT jsonb_agg((snapshot-'blocks')||jsonb_build_object('id',work_id) ORDER BY n) FROM visible
            WHERE n BETWEEN (p_room-1)*12+1 AND p_room*12),'[]'),
        (SELECT snapshot||jsonb_build_object('id',work_id) FROM visible WHERE work_id=p_work_id)
    INTO v_count,v_rooms,v_items,v_work;
    IF p_work_id IS NOT NULL AND v_work IS NULL THEN PERFORM set_config('response.status','404',TRUE); RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    RETURN jsonb_build_object('version',1,'title',v_share.title,'introduction',v_share.introduction,'publication_no',v_share.publication_no,
        'room',p_room,'total_count',v_count,'rooms',v_rooms,'items',CASE WHEN p_work_id IS NULL THEN v_items ELSE '[]'::JSONB END,'work',v_work);
END; $$;
REVOKE ALL ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER) TO anon,authenticated;

-- 원글이 다시 공개되어도 새 수록 확인/외부 발행 전에는 온라인 판을 자동 부활시키지 않는다.
CREATE OR REPLACE FUNCTION public.revoke_class_agit_releases_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item RECORD;
BEGIN
    IF TG_TABLE_NAME='student_posts' THEN
        IF TG_OP='UPDATE' AND NEW.is_submitted IS TRUE AND NEW.is_confirmed IS TRUE AND NEW.is_returned IS NOT TRUE
            AND NEW.recalled_at IS NULL AND NEW.writing_context='assignment' AND NEW.visibility='class' AND NEW.class_id=OLD.class_id THEN RETURN NEW; END IF;
        FOR v_item IN UPDATE public.class_agit_book_items SET revoked_at=now() WHERE class_id=OLD.class_id AND post_id=OLD.id AND revoked_at IS NULL RETURNING id LOOP
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(OLD.class_id,v_item.id,'anthology','source_unavailable'); END LOOP;
        FOR v_item IN UPDATE public.class_agit_external_items SET revoked_at=now() WHERE class_id=OLD.class_id AND post_id=OLD.id AND revoked_at IS NULL RETURNING id LOOP
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(OLD.class_id,v_item.id,'external','source_unavailable'); END LOOP;
    ELSE
        IF TG_OP='UPDATE' AND NEW.is_active IS DISTINCT FROM FALSE AND NEW.deleted_at IS NULL AND NEW.class_id=OLD.class_id THEN RETURN NEW; END IF;
        FOR v_item IN UPDATE public.class_agit_book_items SET revoked_at=now() WHERE class_id=OLD.class_id AND student_id=OLD.id AND revoked_at IS NULL RETURNING id LOOP
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(OLD.class_id,v_item.id,'anthology','source_unavailable'); END LOOP;
        FOR v_item IN UPDATE public.class_agit_external_items SET revoked_at=now() WHERE class_id=OLD.class_id AND student_id=OLD.id AND revoked_at IS NULL RETURNING id LOOP
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(OLD.class_id,v_item.id,'external','source_unavailable'); END LOOP;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.revoke_class_agit_releases_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS class_agit_release_post_revoke ON public.student_posts;
CREATE TRIGGER class_agit_release_post_revoke BEFORE DELETE OR UPDATE OF is_submitted,is_confirmed,is_returned,recalled_at,visibility,writing_context,class_id
    ON public.student_posts FOR EACH ROW EXECUTE FUNCTION public.revoke_class_agit_releases_v1();
DROP TRIGGER IF EXISTS class_agit_release_student_revoke ON public.students;
CREATE TRIGGER class_agit_release_student_revoke BEFORE DELETE OR UPDATE OF is_active,deleted_at,class_id
    ON public.students FOR EACH ROW EXECUTE FUNCTION public.revoke_class_agit_releases_v1();

NOTIFY pgrst, 'reload schema';
COMMIT;
