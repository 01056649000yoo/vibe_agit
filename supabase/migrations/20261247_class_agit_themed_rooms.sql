-- 주제별 전시실: 20편/실, 120편/전시, 독립된 최대 10실. 기존 공개본·토큰·기간 보존.
BEGIN;
CREATE OR REPLACE FUNCTION public.class_agit_room_capacity_v1() RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT 20; $$;
CREATE OR REPLACE FUNCTION public.class_agit_max_rooms_v1() RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT 10; $$;
CREATE OR REPLACE FUNCTION public.class_agit_legacy_rooms_v1(p_count INTEGER) RETURNS JSONB LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id','room-'||n,'title',n||' 전시실','introduction','','variant',0) ORDER BY n),'[]')
 FROM generate_series(1,GREATEST(1,(p_count+11)/12)) n;
$$;
CREATE OR REPLACE FUNCTION public.class_agit_valid_rooms_v1(p_rooms JSONB) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE r JSONB; ids TEXT[]:='{}';
BEGIN
 IF p_rooms IS NULL OR jsonb_typeof(p_rooms)<>'array' OR jsonb_array_length(p_rooms)>public.class_agit_max_rooms_v1() THEN RETURN FALSE;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_rooms) LOOP
  IF jsonb_typeof(r)<>'object' OR jsonb_typeof(r->'id') IS DISTINCT FROM 'string' OR (r->>'id') !~ '^[a-zA-Z0-9-]{1,40}$'
   OR (r->>'id')=ANY(ids) OR jsonb_typeof(r->'title') IS DISTINCT FROM 'string' OR char_length(btrim(r->>'title')) NOT BETWEEN 1 AND 60
   OR jsonb_typeof(r->'introduction') IS DISTINCT FROM 'string' OR char_length(r->>'introduction')>240
   OR jsonb_typeof(r->'variant') IS DISTINCT FROM 'number' OR (r->>'variant') !~ '^[0-3]$'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(r) k WHERE k NOT IN ('id','title','introduction','variant')) THEN RETURN FALSE;END IF;
  ids:=array_append(ids,r->>'id');
 END LOOP;
 RETURN TRUE;
END; $$;
ALTER TABLE public.class_agit_exhibitions ADD COLUMN IF NOT EXISTS rooms JSONB;
ALTER TABLE public.class_agit_exhibitions ADD COLUMN IF NOT EXISTS layout_version INTEGER NOT NULL DEFAULT 1 CHECK(layout_version IN (1,2));
UPDATE public.class_agit_exhibitions e SET rooms=public.class_agit_legacy_rooms_v1((SELECT count(*)::INTEGER FROM public.class_agit_items i WHERE i.class_id=e.class_id AND i.exhibition_id=e.id AND i.removed_at IS NULL)) WHERE rooms IS NULL;
ALTER TABLE public.class_agit_exhibitions ALTER COLUMN rooms SET DEFAULT '[{"id":"room-1","title":"1 전시실","introduction":"","variant":0}]';
ALTER TABLE public.class_agit_exhibitions ALTER COLUMN rooms SET NOT NULL;
ALTER TABLE public.class_agit_exhibitions DROP CONSTRAINT IF EXISTS class_agit_rooms_check;
ALTER TABLE public.class_agit_exhibitions ADD CONSTRAINT class_agit_rooms_check CHECK(public.class_agit_valid_rooms_v1(rooms));
ALTER TABLE public.class_agit_items ADD COLUMN IF NOT EXISTS room_id TEXT;
-- 재실행 시 새 미배정을 임의로 배정하지 않고 과거 구성만 옮긴다.
UPDATE public.class_agit_items i SET room_id='room-'||((i.position-1)/12+1) FROM public.class_agit_exhibitions e
 WHERE e.class_id=i.class_id AND e.id=i.exhibition_id AND e.layout_version=1 AND i.room_id IS NULL;
ALTER TABLE public.class_agit_external_shares ADD COLUMN IF NOT EXISTS rooms JSONB;
ALTER TABLE public.class_agit_publication_catalog ADD COLUMN IF NOT EXISTS room_definitions JSONB;
ALTER TABLE public.class_agit_published_items ADD COLUMN IF NOT EXISTS room_no INTEGER CHECK(room_no BETWEEN 1 AND 10);
ALTER TABLE public.class_agit_external_items ADD COLUMN IF NOT EXISTS room_no INTEGER CHECK(room_no BETWEEN 1 AND 10);
-- 발행 당시 원문은 수정하지 않는다. 현재 보이는 12편 방의 경계를 고정한다.
UPDATE public.class_agit_published_items i SET room_no=COALESCE((SELECT s.room_no FROM public.class_agit_publication_slots s WHERE s.class_id=i.class_id AND s.exhibition_id=i.exhibition_id AND s.scope='class' AND s.work_no=i.work_no),(i.work_no-1)/12+1) WHERE room_no IS NULL;
UPDATE public.class_agit_external_items i SET room_no=COALESCE((SELECT s.room_no FROM public.class_agit_publication_slots s WHERE s.class_id=i.class_id AND s.exhibition_id=i.share_id AND s.scope='external' AND s.work_no=i.position),(i.position-1)/12+1) WHERE room_no IS NULL;
ALTER TABLE public.class_agit_published_items ALTER COLUMN room_no SET NOT NULL;
-- 외부 항목 INSERT 직후의 기존 summary 트리거와 호환하며 RPC가 같은 트랜잭션에서 방 번호를 채운다.
ALTER TABLE public.class_agit_external_items ALTER COLUMN room_no SET DEFAULT 1;
UPDATE public.class_agit_publication_catalog c SET room_definitions=public.class_agit_legacy_rooms_v1(c.original_count) WHERE room_definitions IS NULL;
UPDATE public.class_agit_external_shares s SET rooms=c.room_definitions FROM public.class_agit_publication_catalog c WHERE c.class_id=s.class_id AND c.exhibition_id=s.id AND c.scope='external' AND s.rooms IS NULL;
ALTER TABLE public.class_agit_external_shares ALTER COLUMN rooms SET DEFAULT '[]';

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
                'missionId',post.mission_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,'authorNumber',i.position,'roomId',i.room_id,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision,
                'unavailable',cur.data IS NULL,'revoked',i.revoked_at IS NOT NULL,
                'scopes',jsonb_build_object('class',i.revoked_at IS NULL,'anthology',FALSE,'external',FALSE)) AS data
            FROM public.class_agit_items i LEFT JOIN public.student_posts post ON post.id=i.post_id AND post.class_id=i.class_id LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
            WHERE i.class_id = p_class_id AND i.exhibition_id = p_exhibition_id AND i.removed_at IS NULL
            ORDER BY i.position,i.id LIMIT public.class_agit_max_works_v1()
        ) q;
        v_draft := jsonb_build_object('id',v_ex.id,'classId',p_class_id,'title',v_ex.title,'introduction',v_ex.introduction,'theme',v_ex.theme,
            'rooms',v_ex.rooms,'layoutVersion',v_ex.layout_version,'revision',v_ex.revision,'state',v_ex.state,'publicationNo',v_ex.publication_no,'items',v_items);
    END IF;
    RETURN jsonb_build_object('version',1,'rollout','internal','class',jsonb_build_object('id',p_class_id,
        'module_enabled',(SELECT COALESCE('class-agit'=ANY(c.enabled_modules),FALSE) FROM public.classes c WHERE c.id=p_class_id),
        'enabled_modules',(SELECT c.enabled_modules FROM public.classes c WHERE c.id=p_class_id),
        'vocab_tower_enabled',(SELECT c.vocab_tower_enabled FROM public.classes c WHERE c.id=p_class_id)),
        'projects',v_projects,'students',v_students,'draft',v_draft);
END; $$;

CREATE OR REPLACE FUNCTION public.run_class_agit_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET lock_timeout='250ms' SET search_path = public AS $$
DECLARE v_actor UUID; v_id UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_data JSONB; v_item JSONB; v_snapshot JSONB;
    v_existing public.class_agit_items%ROWTYPE; v_item_id UUID; v_position INTEGER := 0; v_items JSONB := '[]'; v_post_id UUID;
    v_rooms JSONB; v_room_id TEXT; v_old_enabled BOOLEAN; v_selection_changed BOOLEAN; v_modules TEXT[]; v_legacy_enabled BOOLEAN;
BEGIN
    v_actor := public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT) > public.class_agit_max_works_v1()*500 THEN
        RAISE EXCEPTION '전시 요청 크기 또는 형식이 올바르지 않습니다.' USING ERRCODE = '22023'; END IF;
    -- Conflicting publication/source edits fail with PT409 instead of holding a lock cycle.
    -- 학급당 프로젝트 상한과 모듈 변경·발행을 같은 잠금 순서로 직렬화한다.
    SELECT COALESCE('class-agit'=ANY(enabled_modules),FALSE),enabled_modules,vocab_tower_enabled
    INTO v_old_enabled,v_modules,v_legacy_enabled FROM public.classes WHERE id=p_class_id FOR UPDATE NOWAIT;
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

    IF p_action IN ('save','publish') THEN
        PERFORM s.id FROM public.students s WHERE s.class_id=p_class_id ORDER BY s.id FOR SHARE NOWAIT;
        PERFORM m.id FROM public.writing_missions m WHERE m.class_id=p_class_id
            AND m.id IN (SELECT p.mission_id FROM public.student_posts p WHERE p.class_id=p_class_id
                AND (p.id IN (SELECT i.post_id FROM public.class_agit_items i WHERE i.class_id=p_class_id AND i.exhibition_id=v_id)
                     OR p.id IN (SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(COALESCE(p_payload->'items','[]')) x)))
            ORDER BY m.id FOR SHARE NOWAIT;
    END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=v_id FOR UPDATE NOWAIT;
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
    IF p_action = 'delete' THEN
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN
            RAISE EXCEPTION '전시 삭제 동작을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        -- FK CASCADE removes only drafts, publication catalogs/slots and external shares.
        -- student_posts is the referenced parent and is never deleted here.
        DELETE FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=v_id;
        RETURN public.get_class_agit_workspace_v1(p_class_id,NULL);
    END IF;
    IF p_action = 'save' THEN
        IF NOT p_payload ? 'rooms' AND v_ex.layout_version=2 THEN RAISE EXCEPTION '새 전시실 구성을 편집하려면 화면을 새로고침해 주세요.' USING ERRCODE='PT409';END IF;
        v_rooms:=CASE WHEN p_payload ? 'rooms' THEN p_payload->'rooms' ELSE public.class_agit_legacy_rooms_v1(jsonb_array_length(p_payload->'items')) END;
        IF NOT public.class_agit_valid_rooms_v1(v_rooms) THEN RAISE EXCEPTION '전시실 이름·소개·배경·10실 상한을 확인해 주세요.' USING ERRCODE='22023';END IF;
        IF p_payload ? 'rooms' AND (EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') x WHERE x->>'roomId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_rooms) r WHERE r->>'id'=x->>'roomId'))
         OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') x WHERE x->>'roomId' IS NOT NULL GROUP BY x->>'roomId' HAVING count(*)>public.class_agit_room_capacity_v1())) THEN RAISE EXCEPTION '작품 배정과 전시실당 20편 상한을 확인해 주세요.' USING ERRCODE='23514';END IF;
        IF COALESCE(p_payload->>'theme',v_ex.theme) NOT IN ('garden','museum','library','night') THEN
            RAISE EXCEPTION '전시관 디자인을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF char_length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 OR char_length(COALESCE(p_payload->>'introduction',''))>240
           OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION '전시 제목·소개·작품 목록을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF jsonb_array_length(p_payload->'items') > public.class_agit_max_works_v1() OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_payload->'items') a GROUP BY a->>'sourceId' HAVING count(*)>1
        ) THEN RAISE EXCEPTION '전시는 중복 없이 %편까지 담을 수 있습니다.', public.class_agit_max_works_v1() USING ERRCODE='23514'; END IF;
        -- source를 먼저 잠근다. source 회수 트리거는 전시 행을 잠그지 않으므로 잠금 순환이 없다.
        PERFORM p.id FROM public.student_posts p WHERE p.class_id=p_class_id
            AND p.id IN (SELECT (a->>'sourceId')::UUID FROM jsonb_array_elements(p_payload->'items') a) ORDER BY p.id FOR SHARE NOWAIT;
        UPDATE public.class_agit_items SET removed_at=NOW() WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL;
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
            v_position := v_position + 1; v_room_id:=CASE WHEN p_payload ? 'rooms' THEN v_item->>'roomId' ELSE 'room-'||((v_position-1)/12+1) END; v_post_id := (v_item->>'sourceId')::UUID;
            v_data := public.class_agit_current_source_v1(p_class_id,v_post_id);
            IF v_data IS NULL THEN RAISE EXCEPTION '담은 글 중 제출·확인·공개 조건이 바뀐 글이 있습니다. 해당 작품을 빼거나 다시 확인해 주세요.' USING ERRCODE='42501'; END IF;
            IF v_item->>'sourceRevision' IS DISTINCT FROM v_data->>'source_revision' THEN
                RAISE EXCEPTION '원글 내용이 바뀌었습니다. 전문을 다시 읽고 담아 주세요.' USING ERRCODE='PT409'; END IF;
            IF char_length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30 THEN
                RAISE EXCEPTION '가림 이름을 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            SELECT * INTO v_existing FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND post_id=v_post_id;
            v_selection_changed := v_existing.id IS NULL OR v_existing.revoked_at IS NOT NULL OR v_existing.source_revision<>v_data->>'source_revision';
            v_snapshot := jsonb_build_object('title',v_data->>'title','authorName',v_data->>'student_name','groupTitle',v_data->>'group_title','format',v_data->>'format',
                'kindLabel',v_data->>'kindLabel','blocks',v_data->'blocks','excerpt',v_data->>'excerpt');
            INSERT INTO public.class_agit_items(class_id,exhibition_id,post_id,student_id,position,source_revision,snapshot,public_alias,confirmed_by,room_id)
            VALUES(p_class_id,v_id,v_post_id,(v_data->>'student_id')::UUID,v_position,v_data->>'source_revision',v_snapshot,btrim(v_item->>'publicAlias'),v_actor,v_room_id)
            ON CONFLICT(exhibition_id,post_id) DO UPDATE SET room_id=EXCLUDED.room_id,position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,
                public_alias=EXCLUDED.public_alias,removed_at=NULL,revoked_at=NULL,
                confirmed_by=CASE WHEN v_selection_changed THEN v_actor ELSE class_agit_items.confirmed_by END,
                confirmed_at=CASE WHEN v_selection_changed THEN NOW() ELSE class_agit_items.confirmed_at END,
                consent_id=CASE WHEN v_existing.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_items.consent_id END
            RETURNING id INTO v_item_id;
            IF v_selection_changed THEN INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'selected',v_actor); END IF;
        END LOOP;
        WITH numbered AS (
            SELECT i.id,row_number() OVER(ORDER BY COALESCE(r.n,999),i.position,i.id)::INTEGER AS position
            FROM public.class_agit_items i LEFT JOIN LATERAL (SELECT n FROM jsonb_array_elements(v_rooms) WITH ORDINALITY x(r,n) WHERE r->>'id'=i.room_id) r ON TRUE
            WHERE i.class_id=p_class_id AND i.exhibition_id=v_id AND i.removed_at IS NULL
        ) UPDATE public.class_agit_items i SET position=n.position FROM numbered n WHERE i.class_id=p_class_id AND i.exhibition_id=v_id AND i.id=n.id;
        UPDATE public.class_agit_exhibitions SET rooms=v_rooms,layout_version=CASE WHEN p_payload ? 'rooms' THEN 2 ELSE 1 END,theme=COALESCE(p_payload->>'theme',v_ex.theme),title=btrim(p_payload->>'title'),introduction=COALESCE(p_payload->>'introduction',''),revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'publish' THEN
        IF EXISTS(SELECT 1 FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL AND room_id IS NULL) THEN RAISE EXCEPTION '미배정 작품을 전시실에 넣거나 빼 주세요.' USING ERRCODE='23514';END IF;
        IF NOT v_old_enabled THEN RAISE EXCEPTION '학생 공개 스위치를 먼저 켜 주세요.' USING ERRCODE='42501'; END IF;
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '학급 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.post_id=p.id AND i.class_id=p.class_id
        WHERE p.class_id=p_class_id AND i.exhibition_id=v_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p NOWAIT;
        FOR v_existing IN SELECT * FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL ORDER BY position,id LOOP
            v_data := public.class_agit_current_source_v1(p_class_id,v_existing.post_id);
            IF v_existing.revoked_at IS NOT NULL OR v_data IS NULL THEN RAISE EXCEPTION '수록이 철회되었거나 공개할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_existing.source_revision IS DISTINCT FROM v_data->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인하고 초안을 저장해 주세요.' USING ERRCODE='PT409'; END IF;
            v_items := v_items || jsonb_build_array(v_existing.snapshot || jsonb_build_object('itemId',v_existing.id,'consentId',v_existing.consent_id,'roomId',v_existing.room_id));
        END LOOP;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND public.class_agit_max_works_v1() THEN RAISE EXCEPTION '공개할 작품을 먼저 담아 주세요.' USING ERRCODE='23514'; END IF;
        UPDATE public.class_agit_exhibitions SET state='published',publication_no=publication_no+1,published_at=NOW(),revision=revision+1,updated_at=NOW(),
            published_snapshot=jsonb_build_object('title',title,'introduction',introduction,'theme',theme,'rooms',rooms,'works',v_items)
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
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION '원글이나 공개 설정을 변경하는 작업이 진행 중입니다. 잠시 뒤 다시 확인해 주세요.' USING ERRCODE='PT409';
END; $$;

CREATE OR REPLACE FUNCTION public.class_agit_capture_publication_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF NEW.published_snapshot IS NULL OR NEW.publication_no<1 THEN RETURN NEW; END IF;
    INSERT INTO public.class_agit_publication_catalog(class_id,exhibition_id,scope,publication_no,title,introduction,theme,room_definitions)
    VALUES(NEW.class_id,NEW.id,'class',NEW.publication_no,NEW.published_snapshot->>'title',NEW.published_snapshot->>'introduction',COALESCE(NEW.published_snapshot->>'theme','garden'),COALESCE(NEW.published_snapshot->'rooms',public.class_agit_legacy_rooms_v1(jsonb_array_length(NEW.published_snapshot->'works'))))
    ON CONFLICT(class_id,exhibition_id,scope) DO UPDATE SET publication_no=EXCLUDED.publication_no,title=EXCLUDED.title,introduction=EXCLUDED.introduction,theme=EXCLUDED.theme,room_definitions=EXCLUDED.room_definitions;
    DELETE FROM public.class_agit_published_items WHERE class_id=NEW.class_id AND exhibition_id=NEW.id;
    INSERT INTO public.class_agit_published_items(class_id,exhibition_id,publication_no,work_no,item_id,consent_id,summary,blocks,room_no,revoked_at)
    SELECT NEW.class_id,NEW.id,NEW.publication_no,w.ordinality,(w.value->>'itemId')::UUID,(w.value->>'consentId')::UUID,
        jsonb_build_object('title',w.value->>'title','author',w.value->>'authorName','format',w.value->>'format',
            'kindLabel',w.value->>'kindLabel','excerpt',w.value->>'excerpt'),w.value->'blocks',COALESCE((SELECT n::INTEGER FROM jsonb_array_elements(NEW.published_snapshot->'rooms') WITH ORDINALITY r(value,n) WHERE value->>'id'=w.value->>'roomId'),((w.ordinality-1)/12+1)::INTEGER),
        CASE WHEN i.id IS NULL OR i.revoked_at IS NOT NULL OR i.consent_id IS DISTINCT FROM (w.value->>'consentId')::UUID THEN now() END
    FROM jsonb_array_elements(NEW.published_snapshot->'works') WITH ORDINALITY w
    LEFT JOIN public.class_agit_items i ON i.class_id=NEW.class_id AND i.exhibition_id=NEW.id AND i.id=(w.value->>'itemId')::UUID;
    PERFORM public.class_agit_refresh_catalog_v1(NEW.class_id,NEW.id,'class');
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.class_agit_refresh_catalog_v1(p_class_id UUID,p_exhibition_id UUID,p_scope TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF p_scope='external' THEN
        INSERT INTO public.class_agit_publication_catalog(class_id,exhibition_id,scope,publication_no,title,introduction,theme,room_definitions)
        SELECT s.class_id,s.exhibition_id,'external',s.publication_no,s.title,s.introduction,s.theme,s.rooms FROM public.class_agit_external_shares s
        WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id
        ON CONFLICT(class_id,exhibition_id,scope) DO UPDATE SET room_definitions=EXCLUDED.room_definitions;
    END IF;
    -- Serialize only tiny layout writes, independently of source/exhibition/share locks.
    PERFORM 1 FROM public.class_agit_publication_catalog WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    DELETE FROM public.class_agit_publication_slots WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope;
    INSERT INTO public.class_agit_publication_slots(class_id,exhibition_id,scope,work_no,display_position,room_no,summary)
    SELECT p_class_id,p_exhibition_id,p_scope,work_no,n,room_no,summary||jsonb_build_object('id','published-'||work_no)
    FROM (
        SELECT work_no,room_no,summary,(row_number() OVER(ORDER BY work_no))::INTEGER AS n FROM (
            SELECT i.work_no,i.room_no,i.summary FROM public.class_agit_published_items i
                WHERE p_scope='class' AND i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.revoked_at IS NULL
            UNION ALL
            SELECT i.position,i.room_no,i.summary FROM public.class_agit_external_items i
                WHERE p_scope='external' AND i.class_id=p_class_id AND i.share_id=p_exhibition_id AND i.revoked_at IS NULL
        ) source ORDER BY work_no LIMIT public.class_agit_max_works_v1()
    ) numbered;
    UPDATE public.class_agit_publication_catalog c SET
        total_count=(SELECT count(*) FROM public.class_agit_publication_slots s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.scope=p_scope),
        rooms=COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.number) FROM (
            SELECT s.room_no AS number,COALESCE(c.room_definitions->(s.room_no-1)->>'title',s.room_no||' 전시실') AS title,COALESCE(c.room_definitions->(s.room_no-1)->>'introduction','') AS introduction,COALESCE((c.room_definitions->(s.room_no-1)->>'variant')::INTEGER,0) AS variant,count(*)::INTEGER AS count FROM public.class_agit_publication_slots s
            WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.scope=p_scope GROUP BY s.room_no) r),'[]'),
        original_count=CASE WHEN p_scope='class' THEN (SELECT count(*) FROM public.class_agit_published_items i WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id)
            ELSE (SELECT count(*) FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id) END,
        visibility_revision=visibility_revision+1
    WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope=p_scope;
    IF p_scope='external' THEN
        UPDATE public.class_agit_publication_catalog c SET publication_no=s.publication_no,title=s.title,introduction=s.introduction,theme=s.theme,room_definitions=s.rooms
        FROM public.class_agit_external_shares s WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope='external'
            AND s.class_id=c.class_id AND s.exhibition_id=c.exhibition_id;
    END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_class_agit_share_workspace_v1(p_class_id UUID,p_exhibition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_share JSONB; v_items JSONB; v_ex public.class_agit_exhibitions%ROWTYPE; v_selected JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT jsonb_build_object('revision',s.revision,'publication_no',s.publication_no,'title',s.title,'introduction',s.introduction,
        'starts_at',s.starts_at,'scheduled',s.starts_at>now(),'expires_at',s.expires_at,'revoked',s.revoked_at IS NOT NULL,'expired',s.expires_at<=now()) INTO v_share
        FROM public.class_agit_external_shares s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id;
    SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position),'[]') INTO v_items FROM (
        SELECT i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,'roomId',i.room_id,
            'unavailable',cur.data IS NULL,'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
        FROM public.class_agit_items i LEFT JOIN LATERAL(SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
        WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.removed_at IS NULL ORDER BY i.position LIMIT public.class_agit_max_works_v1()) q;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'title',i.snapshot->>'title','author',i.snapshot->>'author','revoked',i.revoked_at IS NOT NULL) ORDER BY i.position),'[]') INTO v_selected
        FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id;
    RETURN jsonb_build_object('version',1,'exhibition_revision',v_ex.revision,'exhibition_theme',v_ex.theme,'rooms',v_ex.rooms,'layout_version',v_ex.layout_version,'share',v_share,'candidates',v_items,'published_items',v_selected,
        'external_enabled',(SELECT external_enabled FROM public.class_agit_rollout WHERE singleton));
END; $$;

CREATE OR REPLACE FUNCTION public.run_class_agit_share_action_v1(p_class_id UUID,p_exhibition_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET lock_timeout='250ms' SET search_path=public AS $$
DECLARE v_actor UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_share public.class_agit_external_shares%ROWTYPE;
    v_item JSONB; v_source JSONB; v_n INTEGER:=0; v_token TEXT:=p_payload->>'token'; v_hash TEXT; v_start TIMESTAMPTZ; v_end TIMESTAMPTZ; v_external_item UUID; v_rooms JSONB; v_room_no INTEGER;
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>public.class_agit_max_works_v1()*500 THEN RAISE EXCEPTION '공개 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.classes WHERE id=p_class_id FOR UPDATE NOWAIT;

    IF p_action IN ('save','publish') THEN
        PERFORM s.id FROM public.students s WHERE s.class_id=p_class_id ORDER BY s.id FOR SHARE NOWAIT;
        PERFORM m.id FROM public.writing_missions m WHERE m.class_id=p_class_id
            AND m.id IN (SELECT p.mission_id FROM public.student_posts p WHERE p.class_id=p_class_id
                AND (p.id IN (SELECT i.post_id FROM public.class_agit_items i WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id)
                     OR p.id IN (SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(COALESCE(p_payload->'items','[]')) x)))
            ORDER BY m.id FOR SHARE NOWAIT;
    END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_share FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE NOWAIT;
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
        IF p_action='publish' THEN
            v_start:=(p_payload->>'starts_at')::TIMESTAMPTZ;
            v_end:=(p_payload->>'expires_at')::TIMESTAMPTZ;
            IF v_start IS NULL OR v_start < now()-INTERVAL '5 minutes' THEN
                RAISE EXCEPTION '전시 시작 시간을 현재 이후로 정해 주세요.' USING ERRCODE='22023'; END IF;
        ELSIF p_action='extend' THEN
            v_start:=v_share.starts_at; v_end:=(p_payload->>'expires_at')::TIMESTAMPTZ;
        ELSE v_start:=v_share.starts_at; v_end:=v_share.expires_at;
        END IF;
        IF NOT public.class_agit_valid_share_period_v1(v_start,v_end) OR v_end<=now() THEN
            RAISE EXCEPTION '종료는 시작 이후, 시작부터 최대 30일 이내로 정해 주세요.' USING ERRCODE='22023'; END IF;
    END IF;
    IF p_action='publish' THEN
        IF v_ex.layout_version=2 AND COALESCE((p_payload->>'layout_version')::INTEGER,1)<>2 THEN RAISE EXCEPTION '전시실 구성을 공유하려면 화면을 새로고침해 주세요.' USING ERRCODE='PT409';END IF;
        IF EXISTS(SELECT 1 FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND removed_at IS NULL AND room_id IS NULL) THEN RAISE EXCEPTION '미배정 작품을 전시실에 넣거나 빼 주세요.' USING ERRCODE='23514';END IF;
        v_rooms:=CASE WHEN v_ex.layout_version=2 THEN v_ex.rooms ELSE public.class_agit_legacy_rooms_v1(jsonb_array_length(p_payload->'items')) END;
        IF v_ex.state='archived' THEN RAISE EXCEPTION '보관한 전시를 먼저 복원해 주세요.' USING ERRCODE='22023'; END IF;
        IF (p_payload->>'exhibition_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN RAISE EXCEPTION '전시 작품이 바뀌었습니다. 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND public.class_agit_max_works_v1()
            OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '공개 제목과 1~%편의 작품을 확인해 주세요.', public.class_agit_max_works_v1() USING ERRCODE='22023'; END IF;
        IF v_ex.layout_version=2 AND jsonb_array_length(p_payload->'items')<>(SELECT count(*) FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND removed_at IS NULL) THEN RAISE EXCEPTION '전시에 담은 전체 작품으로 공유를 준비해 주세요.' USING ERRCODE='23514';END IF;
        IF (SELECT count(DISTINCT x->>'itemId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 선택할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.exhibition_id=p_exhibition_id ORDER BY p.id FOR SHARE OF p NOWAIT;
        INSERT INTO public.class_agit_external_shares(id,class_id,exhibition_id,title,introduction,token_hash,starts_at,expires_at,theme,rooms)
        VALUES(p_exhibition_id,p_class_id,p_exhibition_id,btrim(p_payload->>'title'),COALESCE(p_payload->>'introduction',''),v_hash,v_start,v_end,v_ex.theme,v_rooms)
        ON CONFLICT(exhibition_id) DO UPDATE SET rooms=EXCLUDED.rooms,theme=EXCLUDED.theme,title=EXCLUDED.title,introduction=EXCLUDED.introduction,token_hash=v_hash,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,
            revoked_at=NULL,revision=class_agit_external_shares.revision+1,publication_no=class_agit_external_shares.publication_no+1,updated_at=now();
        DELETE FROM public.class_agit_external_items WHERE class_id=p_class_id AND share_id=p_exhibition_id;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) INTO v_source FROM public.class_agit_items i
                WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID AND i.removed_at IS NULL;
            IF v_source IS NULL THEN RAISE EXCEPTION '공개할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_source->>'source_revision' IS DISTINCT FROM v_item->>'sourceRevision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            IF length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30
                THEN RAISE EXCEPTION '가림 이름을 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            v_n:=v_n+1;
            SELECT r.n::INTEGER INTO v_room_no FROM public.class_agit_items i JOIN LATERAL jsonb_array_elements(v_ex.rooms) WITH ORDINALITY r(value,n) ON r.value->>'id'=i.room_id
             WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID;
            IF v_ex.layout_version=1 THEN v_room_no:=(v_n-1)/12+1;END IF;
            INSERT INTO public.class_agit_external_items(class_id,share_id,post_id,student_id,position,room_no,snapshot)
            VALUES(p_class_id,p_exhibition_id,(v_source->>'id')::UUID,(v_source->>'student_id')::UUID,v_n,v_room_no,
                jsonb_build_object('title',v_source->>'title','author',CASE WHEN v_ex.layout_version=2 THEN '새싹 작가 '||lpad(v_n::TEXT,GREATEST(2,length(v_n::TEXT)),'0') ELSE btrim(v_item->>'publicAlias') END,'format',v_source->>'format',
                    'kindLabel',v_source->>'kindLabel','excerpt',v_source->>'excerpt','blocks',v_source->'blocks')) RETURNING id INTO v_external_item;
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_external_item,'external','selected',v_actor);
        END LOOP;
        PERFORM public.class_agit_refresh_catalog_v1(p_class_id,p_exhibition_id,'external');
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id)
            VALUES(p_class_id,p_exhibition_id,'external','published',v_actor);
    ELSIF p_action IN('rotate','extend') THEN
        IF v_share.id IS NULL OR v_share.revoked_at IS NOT NULL OR v_share.expires_at<=now() THEN RAISE EXCEPTION '외부 공개본을 먼저 발행해 주세요.' USING ERRCODE='22023'; END IF;
        UPDATE public.class_agit_external_shares SET token_hash=CASE WHEN p_action='rotate' THEN v_hash ELSE token_hash END,
            expires_at=v_end,revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
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
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION '원글이나 공개 설정을 변경하는 작업이 진행 중입니다. 잠시 뒤 다시 확인해 주세요.' USING ERRCODE='PT409';
END; $$;

-- 작은 확정 목록에서만 조회한다. 1은 이미 열린 구형 화면의 12편 페이지, 2는 명시적 주제방이다.
CREATE OR REPLACE FUNCTION public.class_agit_read_layout_v1(p_class_id UUID,p_exhibition_id UUID,p_scope TEXT,p_room INTEGER,p_layout_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB;v_rooms JSONB;
BEGIN
 IF p_layout_version NOT IN (1,2) OR p_layout_version IS NULL THEN RAISE EXCEPTION '전시실 표시 버전을 확인해 주세요.' USING ERRCODE='22023';END IF;
 SELECT * INTO v_catalog FROM public.class_agit_publication_catalog WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope;
 IF p_layout_version=2 THEN
  v_rooms:=v_catalog.rooms;
  SELECT COALESCE(jsonb_agg(q.summary ORDER BY q.display_position),'[]') INTO v_items FROM (
   SELECT summary,display_position FROM public.class_agit_publication_slots WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope AND room_no=p_room ORDER BY display_position LIMIT 20) q;
 ELSE
  SELECT COALESCE(jsonb_agg(jsonb_build_object('number',n,'count',LEAST(12,v_catalog.total_count-(n-1)*12)) ORDER BY n),'[]') INTO v_rooms FROM generate_series(1,(v_catalog.total_count+11)/12) n;
  SELECT COALESCE(jsonb_agg(q.summary ORDER BY q.n),'[]') INTO v_items FROM (
   SELECT * FROM (SELECT summary,row_number() OVER(ORDER BY display_position) AS n FROM public.class_agit_publication_slots WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope) ordered
   WHERE p_room>0 AND n BETWEEN (p_room-1)*12+1 AND p_room*12 ORDER BY n LIMIT 12) q;
 END IF;
 RETURN jsonb_build_object('rooms',v_rooms,'items',v_items);
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_room_v1(p_exhibition_id UUID,p_room INTEGER,p_layout_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB; v_layout JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_room IS NULL OR p_room NOT BETWEEN 0 AND public.class_agit_max_rooms_v1() THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c JOIN public.class_agit_exhibitions e
        ON e.class_id=c.class_id AND e.id=c.exhibition_id AND e.publication_no=c.publication_no
        WHERE c.class_id=v_class AND c.exhibition_id=p_exhibition_id AND c.scope='class' AND e.state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 전시를 볼 수 없어요.' USING ERRCODE='42501'; END IF;
    v_layout:=public.class_agit_read_layout_v1(v_class,p_exhibition_id,'class',p_room,p_layout_version);v_items:=v_layout->'items';
    RETURN jsonb_build_object('version',1,'exhibition_id',p_exhibition_id,'publication_no',v_catalog.publication_no,
        'title',v_catalog.title,'introduction',v_catalog.introduction,'theme',v_catalog.theme,'room',p_room,'rooms',v_layout->'rooms',
        'total_count',v_catalog.total_count,'visibility_revision',v_catalog.visibility_revision,'items',v_items);
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_room_v1(p_exhibition_id UUID,p_room INTEGER DEFAULT 0) RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.get_my_class_agit_room_v1(p_exhibition_id,p_room,1); $$;

REVOKE ALL ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_agit_publication_v1(p_class_id UUID,p_exhibition_id UUID,p_room INTEGER,p_layout_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB; v_layout JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND public.class_agit_class_is_open_v1(c.id)
        AND (c.teacher_id=auth.uid() OR EXISTS(SELECT 1 FROM public.students s WHERE s.class_id=c.id AND s.auth_id=auth.uid()
            AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE))) THEN RAISE EXCEPTION '이 학급 전시를 볼 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF p_room IS NULL OR p_room NOT BETWEEN 1 AND public.class_agit_max_rooms_v1() THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c JOIN public.class_agit_exhibitions e
        ON e.class_id=c.class_id AND e.id=c.exhibition_id AND e.publication_no=c.publication_no
        WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope='class' AND e.state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '공개 중인 전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    v_layout:=public.class_agit_read_layout_v1(p_class_id,p_exhibition_id,'class',p_room,p_layout_version);
    SELECT COALESCE(jsonb_agg(x.value||jsonb_build_object('blocks',i.blocks) ORDER BY x.n),'[]') INTO v_items
     FROM jsonb_array_elements(v_layout->'items') WITH ORDINALITY x(value,n)
     JOIN public.class_agit_published_items i ON i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.work_no=substring(x.value->>'id' FROM 11)::INTEGER;
    RETURN jsonb_build_object('version',1,'publication_no',v_catalog.publication_no,'room',p_room,'room_count',GREATEST(1,jsonb_array_length(v_layout->'rooms')),
        'total_count',v_catalog.total_count,'blocked_count',v_catalog.original_count-v_catalog.total_count,
        'rooms',v_layout->'rooms','exhibition',jsonb_build_object('title',v_catalog.title,'introduction',v_catalog.introduction,'theme',v_catalog.theme,'audience','class','works',v_items));
END; $$;

CREATE OR REPLACE FUNCTION public.get_class_agit_publication_v1(p_class_id UUID,p_exhibition_id UUID,p_room INTEGER DEFAULT 1) RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.get_class_agit_publication_v1(p_class_id,p_exhibition_id,p_room,1)-'rooms'; $$;

REVOKE ALL ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.read_public_class_agit_v1(p_token TEXT,p_room INTEGER,p_work_id TEXT,p_publication_no INTEGER,p_layout_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET statement_timeout='3s' SET lock_timeout='1s' AS $$
DECLARE v_share RECORD; v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB:='[]'; v_layout JSONB; v_work JSONB;
BEGIN
    IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR p_room IS NULL OR p_room NOT BETWEEN 0 AND public.class_agit_max_rooms_v1()
        OR (p_work_id IS NOT NULL AND NOT public.class_agit_valid_work_id_v1(p_work_id)) THEN
        RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT s.id,s.class_id,s.publication_no,s.starts_at,s.expires_at INTO v_share FROM public.class_agit_external_shares s
        WHERE s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND s.revoked_at IS NULL
        AND s.starts_at<=statement_timestamp() AND s.expires_at>statement_timestamp() AND public.class_agit_class_is_allowed_v1(s.class_id)
        AND EXISTS(SELECT 1 FROM public.class_agit_rollout WHERE singleton AND external_enabled);
    IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c WHERE c.class_id=v_share.class_id AND c.exhibition_id=v_share.id
        AND c.scope='external' AND c.publication_no=v_share.publication_no;
    IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    IF p_work_id IS NOT NULL AND p_publication_no IS DISTINCT FROM v_share.publication_no THEN RETURN jsonb_build_object('version',1,'error','changed'); END IF;
    v_layout:=public.class_agit_read_layout_v1(v_share.class_id,v_share.id,'external',p_room,p_layout_version);
    IF p_work_id IS NULL THEN
        v_items:=v_layout->'items';
    ELSE
        SELECT i.snapshot||jsonb_build_object('id',p_work_id) INTO v_work FROM public.class_agit_external_items i
            WHERE i.class_id=v_share.class_id AND i.share_id=v_share.id AND i.position=substring(p_work_id FROM 11)::INTEGER AND i.revoked_at IS NULL;
        IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    END IF;
    RETURN jsonb_build_object('version',1,'title',v_catalog.title,'introduction',v_catalog.introduction,'theme',v_catalog.theme,'publication_no',v_share.publication_no,
        'room',p_room,'total_count',v_catalog.total_count,'rooms',v_layout->'rooms','visibility_revision',v_catalog.visibility_revision,
        'starts_at',v_share.starts_at,'expires_at',v_share.expires_at,'server_now',statement_timestamp(),'items',v_items,'work',v_work);
END; $$;

CREATE OR REPLACE FUNCTION public.read_public_class_agit_v1(p_token TEXT,p_room INTEGER DEFAULT 0,p_work_id TEXT DEFAULT NULL,p_publication_no INTEGER DEFAULT NULL) RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.read_public_class_agit_v1(p_token,p_room,p_work_id,p_publication_no,1); $$;

REVOKE ALL ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER,INTEGER) TO service_role;

-- 새 학생 전문 화면은 도착 작품의 주제만 추가한다. 본문 조회는 기존 한 편 읽기를 재사용한다.
CREATE OR REPLACE FUNCTION public.get_my_class_agit_work_v1(p_exhibition_id UUID,p_publication_no INTEGER,p_work_id TEXT,p_layout_version INTEGER)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result JSONB;v_title TEXT;v_class UUID;
BEGIN
 IF p_layout_version IS DISTINCT FROM 2 THEN RAISE EXCEPTION '전시실 표시 버전을 확인해 주세요.' USING ERRCODE='22023';END IF;
 result:=public.get_my_class_agit_work_v1(p_exhibition_id,p_publication_no,p_work_id);
 v_class:=public.class_agit_reader_class_v1();
 SELECT c.room_definitions->(s.room_no-1)->>'title' INTO v_title
 FROM public.class_agit_publication_slots s JOIN public.class_agit_publication_catalog c ON c.class_id=s.class_id AND c.exhibition_id=s.exhibition_id AND c.scope=s.scope
 WHERE s.class_id=v_class AND s.exhibition_id=p_exhibition_id AND s.scope='class' AND s.work_no=substring(p_work_id FROM 11)::INTEGER;
 RETURN result||jsonb_build_object('room_title',COALESCE(v_title,''));
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_work_v1(UUID,INTEGER,TEXT,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_work_v1(UUID,INTEGER,TEXT,INTEGER) TO authenticated;

-- 작은 목차만 재구성한다. 원문·기한·토큰·공개 범위는 유지한다.
DO $$ DECLARE c RECORD; BEGIN
 FOR c IN SELECT class_id,exhibition_id,scope FROM public.class_agit_publication_catalog LOOP PERFORM public.class_agit_refresh_catalog_v1(c.class_id,c.exhibition_id,c.scope); END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.class_agit_room_capacity_v1() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.class_agit_max_rooms_v1() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.class_agit_legacy_rooms_v1(INTEGER) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.class_agit_valid_rooms_v1(JSONB) FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.class_agit_read_layout_v1(UUID,UUID,TEXT,INTEGER,INTEGER) FROM PUBLIC,anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
