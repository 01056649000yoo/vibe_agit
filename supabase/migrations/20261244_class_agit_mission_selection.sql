BEGIN;

CREATE INDEX IF NOT EXISTS class_agit_missions_browse_idx ON public.writing_missions(class_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS class_agit_posts_mission_browse_idx ON public.student_posts(class_id,mission_id,updated_at DESC,id DESC)
    WHERE writing_context='assignment' AND is_submitted IS TRUE AND is_confirmed IS TRUE;

CREATE OR REPLACE FUNCTION public.class_agit_mission_format_v1(p_template TEXT,p_type TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(NULLIF(NULLIF(p_template,'freeform'),''),CASE WHEN p_type IN('poem','letter','report','meeting') THEN p_type END,'prose');
$$;
REVOKE ALL ON FUNCTION public.class_agit_mission_format_v1(TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_class_agit_missions_v1(p_class_id UUID,p_query TEXT DEFAULT '',p_scope TEXT DEFAULT 'all',p_cursor JSONB DEFAULT NULL,p_limit INTEGER DEFAULT 50)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='3s' AS $$
DECLARE v_items JSONB; v_more BOOLEAN; v_limit INTEGER:=LEAST(GREATEST(COALESCE(p_limit,50),1),100);
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    IF char_length(COALESCE(p_query,''))>80 OR p_scope IS NULL OR p_scope NOT IN('all','active','archived')
        OR (p_cursor IS NOT NULL AND (jsonb_typeof(p_cursor)<>'object' OR p_cursor->>'id' IS NULL OR p_cursor->>'created_at' IS NULL))
    THEN RAISE EXCEPTION '미션 검색 조건을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    WITH rows AS MATERIALIZED (
        SELECT m.id,m.class_id,left(m.title,200) AS title,m.created_at,COALESCE(m.is_archived,FALSE) AS archived,
            public.class_agit_mission_format_v1(m.input_template,m.mission_type) AS format
        FROM public.writing_missions m WHERE m.class_id=p_class_id
          AND (p_scope='all' OR COALESCE(m.is_archived,FALSE)=(p_scope='archived'))
          AND (btrim(COALESCE(p_query,''))='' OR strpos(lower(m.title),lower(btrim(p_query)))>0)
          AND (p_cursor IS NULL OR (m.created_at,m.id)<((p_cursor->>'created_at')::TIMESTAMPTZ,(p_cursor->>'id')::UUID))
        ORDER BY m.created_at DESC,m.id DESC LIMIT v_limit+1
    ), page AS MATERIALIZED (SELECT * FROM rows ORDER BY created_at DESC,id DESC LIMIT v_limit), counts AS (
        SELECT p.mission_id,count(*) AS review_count FROM public.student_posts p
        JOIN page m ON m.id=p.mission_id AND m.class_id=p.class_id
        JOIN public.students s ON s.id=p.student_id AND s.class_id=p.class_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
        WHERE p.class_id=p_class_id AND p.writing_context='assignment' AND p.is_submitted IS TRUE AND p.is_confirmed IS TRUE
            AND p.is_returned IS NOT TRUE AND p.recalled_at IS NULL AND p.visibility='class' AND m.format IN('prose','poem')
        GROUP BY p.mission_id
    ) SELECT COALESCE((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('supported',m.format IN('prose','poem'),'review_count',COALESCE(c.review_count,0))
        ORDER BY m.created_at DESC,m.id DESC) FROM page m LEFT JOIN counts c ON c.mission_id=m.id),'[]'),
        (SELECT count(*)>v_limit FROM rows) INTO v_items,v_more;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'items',v_items,'has_more',v_more,
        'next_cursor',CASE WHEN v_more THEN jsonb_build_object('id',v_items->-1->>'id','created_at',v_items->-1->>'created_at') ELSE NULL END);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_missions_v1(UUID,TEXT,TEXT,JSONB,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_missions_v1(UUID,TEXT,TEXT,JSONB,INTEGER) TO authenticated;

-- 2026-09-05: repository consumers migrate together; no callers in four external app images, DB bodies or policies.
DROP FUNCTION IF EXISTS public.get_class_agit_candidates_v1(UUID,TEXT,TIMESTAMPTZ,UUID,INTEGER);
CREATE OR REPLACE FUNCTION public.get_class_agit_candidates_v2(p_class_id UUID,p_filters JSONB DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='3s' AS $$
DECLARE v_items JSONB; v_more BOOLEAN; v_limit INTEGER; v_query TEXT; v_sort TEXT; v_mission UUID; v_cursor JSONB; v_excluded UUID[];
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR octet_length(p_filters::TEXT)>12000 THEN
        RAISE EXCEPTION '작품 검색 조건을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    v_limit:=LEAST(GREATEST(COALESCE((p_filters->>'limit')::INTEGER,30),1),50);
    v_query:=btrim(COALESCE(p_filters->>'query','')); v_sort:=COALESCE(p_filters->>'sort','recent');
    v_mission:=(p_filters->>'mission_id')::UUID; v_cursor:=NULLIF(p_filters->'cursor','null'::JSONB);
    IF char_length(v_query)>80 OR v_sort NOT IN('recent','student') OR
        (v_cursor IS NOT NULL AND (jsonb_typeof(v_cursor)<>'object' OR v_cursor->>'id' IS NULL OR v_cursor->>'updated_at' IS NULL
            OR (v_sort='student' AND (v_cursor->>'name' IS NULL OR char_length(v_cursor->>'name')>200))))
        OR (p_filters ? 'excluded_students' AND (jsonb_typeof(p_filters->'excluded_students')<>'array' OR jsonb_array_length(p_filters->'excluded_students')>100))
    THEN RAISE EXCEPTION '작품 검색 조건을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT COALESCE(array_agg(x::UUID),'{}') INTO v_excluded FROM jsonb_array_elements_text(COALESCE(p_filters->'excluded_students','[]')) x;
    WITH rows AS MATERIALIZED (
        SELECT p.id,p.mission_id,p.student_id,p.updated_at,left(COALESCE(NULLIF(btrim(p.title),''),'제목 없는 글'),200) AS title,
            s.name AS cursor_name,left(s.name,30) AS student_name,left(m.title,80) AS group_title,
            left(regexp_replace(left(COALESCE(p.content,''),160),'[[:space:]]+',' ','g'),96) AS excerpt
        FROM public.student_posts p
        JOIN public.students s ON s.id=p.student_id AND s.class_id=p.class_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
        JOIN public.writing_missions m ON m.id=p.mission_id AND m.class_id=p.class_id
        WHERE p.class_id=p_class_id AND (v_mission IS NULL OR p.mission_id=v_mission)
            AND p.writing_context='assignment' AND p.is_submitted IS TRUE AND p.is_confirmed IS TRUE
            AND p.is_returned IS NOT TRUE AND p.recalled_at IS NULL AND p.visibility='class'
            AND public.class_agit_mission_format_v1(m.input_template,m.mission_type) IN('prose','poem')
            AND NOT (p.student_id=ANY(v_excluded))
            AND (v_query='' OR strpos(lower(COALESCE(p.title,'')||' '||s.name),lower(v_query))>0)
            AND (v_cursor IS NULL OR CASE WHEN v_sort='recent' THEN (p.updated_at,p.id)<((v_cursor->>'updated_at')::TIMESTAMPTZ,(v_cursor->>'id')::UUID)
                ELSE s.name>(v_cursor->>'name') OR (s.name=(v_cursor->>'name') AND (p.updated_at,p.id)<((v_cursor->>'updated_at')::TIMESTAMPTZ,(v_cursor->>'id')::UUID)) END)
        ORDER BY CASE WHEN v_sort='student' THEN s.name END,p.updated_at DESC,p.id DESC LIMIT v_limit+1
    ), page AS (SELECT * FROM rows ORDER BY CASE WHEN v_sort='student' THEN cursor_name END,updated_at DESC,id DESC LIMIT v_limit)
    SELECT COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY CASE WHEN v_sort='student' THEN cursor_name END,updated_at DESC,id DESC) FROM page p),'[]'),
        (SELECT count(*)>v_limit FROM rows) INTO v_items,v_more;
    RETURN jsonb_build_object('version',2,'class_id',p_class_id,'items',v_items,'has_more',v_more,
        'next_cursor',CASE WHEN v_more THEN jsonb_build_object('id',v_items->-1->>'id','updated_at',v_items->-1->>'updated_at','name',v_items->-1->>'cursor_name') ELSE NULL END);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_candidates_v2(UUID,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_candidates_v2(UUID,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.class_agit_current_source_v1(p_class_id UUID,p_post_id UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
    SELECT public.class_agit_source_data_v1(p,m,s.name)||jsonb_build_object('mission_id',m.id)
    FROM public.student_posts p
    JOIN public.students s ON s.id=p.student_id AND s.class_id=p.class_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
    JOIN public.writing_missions m ON m.id=p.mission_id AND m.class_id=p.class_id
    WHERE p.class_id=p_class_id AND p.id=p_post_id;
$$;
REVOKE ALL ON FUNCTION public.class_agit_current_source_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_class_agit_sources_v1(p_class_id UUID,p_post_ids UUID[])
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='3s' AS $$
DECLARE v_items JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    IF COALESCE(cardinality(p_post_ids),0) NOT BETWEEN 1 AND 50 OR array_position(p_post_ids,NULL) IS NOT NULL
        OR (SELECT count(DISTINCT x) FROM unnest(p_post_ids) x)<>cardinality(p_post_ids)
    THEN RAISE EXCEPTION '서로 다른 작품을 1~50편 선택해 주세요.' USING ERRCODE='22023'; END IF;
    WITH checked AS MATERIALIZED (
        SELECT x.id,x.n,public.class_agit_current_source_v1(p_class_id,x.id) AS source FROM unnest(p_post_ids) WITH ORDINALITY x(id,n)
    ) SELECT jsonb_agg(jsonb_build_object('id',id,'source',source,'reason',CASE WHEN source IS NULL
        THEN '현재 수록할 수 없습니다. 제출·확인·공개 상태와 장르를 확인해 주세요.' ELSE NULL END) ORDER BY n) INTO v_items FROM checked;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'items',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_sources_v1(UUID,UUID[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_sources_v1(UUID,UUID[]) TO authenticated;

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
                'missionId',post.mission_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,'authorNumber',i.position,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision,
                'unavailable',cur.data IS NULL,'revoked',i.revoked_at IS NOT NULL,
                'scopes',jsonb_build_object('class',i.revoked_at IS NULL,'anthology',FALSE,'external',FALSE)) AS data
            FROM public.class_agit_items i LEFT JOIN public.student_posts post ON post.id=i.post_id AND post.class_id=i.class_id LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
            WHERE i.class_id = p_class_id AND i.exhibition_id = p_exhibition_id AND i.removed_at IS NULL
            ORDER BY i.position,i.id LIMIT public.class_agit_max_works_v1()
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
                'missionId',post.mission_id,'sourceRevision',i.source_revision,'revoked',i.revoked_at IS NOT NULL,'unavailable',cur.data IS NULL,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision,'anthologyConfirmed',i.revoked_at IS NULL) AS data
            FROM public.class_agit_book_items i LEFT JOIN public.student_posts post ON post.id=i.post_id AND post.class_id=i.class_id LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
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

NOTIFY pgrst, 'reload schema';
COMMIT;
