-- 최종 승인된 글은 회수 이력과 상관없이 글꽃 책방·전시관에 실을 수 있게 한다 (2026-09-14).
--
-- 제보: 한 주제에 승인된 글이 12편인데 11편만 불러와졌다. 빠진 1편은 교사가 **강제로 회수한 뒤
-- 승인한 글**이었다.
--
-- 왜 그랬나:
--   `회수` 는 교사가 미제출 글을 대신 걷어오는 기능이고, 그때 `student_posts.recalled_at` 에 자국이 남는다.
--   그런데 `approve_assignment_post` 는 승인하면서 이 자국을 지우지 않는다(지울 이유도 없다 — 기록이다).
--   글꽃 쪽 자격 판정이 `recalled_at IS NULL` 을 함께 보고 있어서, **승인했는데도 계속 빠졌다.**
--
-- 무엇을 바꾸나:
--   자격은 `최종 승인`(is_submitted·is_confirmed·is_returned·visibility)만으로 정한다.
--   어떻게 제출됐는지(학생이 냈는지, 교사가 걷었는지)는 싣는 자격과 무관하다 — 승인이 교사의 판단이다.
--   승인되지 않은 회수 글은 `is_confirmed IS TRUE` 때문에 여전히 빠진다.
--
-- 같은 규칙이 여섯 함수 여덟 곳에 흩어져 있어 **한꺼번에** 고친다. 한 곳만 고치면 목록에는 떠도
-- 발행이 거부되거나(class_agit_source_data_v1) 실린 뒤 자동 철회된다(트리거 셋).
--
-- 건드리지 않은 것: `class_agit_source_data_v1` 의 **변경 감지 지문**에는 `recalled_at` 이 그대로 남는다.
-- 그것은 자격 판정이 아니라 "실은 뒤에 원글이 바뀌었는지" 를 알아보는 값이다.
--
-- 아래 본문은 운영 DB 의 현재 정의를 그대로 가져와 위 조건만 덜어낸 것이다.

BEGIN;

CREATE OR REPLACE FUNCTION public.class_agit_revoke_changed_posts_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v RECORD;
BEGIN
    FOR v IN UPDATE public.class_agit_items i SET revoked_at=clock_timestamp()
        FROM old_posts o JOIN new_posts n ON n.id=o.id
        WHERE i.class_id=o.class_id AND i.post_id=o.id AND i.revoked_at IS NULL
        AND (n.is_submitted IS NOT TRUE OR n.is_confirmed IS NOT TRUE OR n.is_returned IS TRUE
            OR n.writing_context IS DISTINCT FROM 'assignment' OR n.visibility IS DISTINCT FROM 'class'
            OR n.class_id IS DISTINCT FROM o.class_id OR n.student_id IS DISTINCT FROM o.student_id OR n.mission_id IS DISTINCT FROM o.mission_id)
        RETURNING i.class_id,i.id LOOP
        INSERT INTO public.class_agit_consent_events(class_id,item_id,action) VALUES(v.class_id,v.id,'source_unavailable');
    END LOOP;
    FOR v IN UPDATE public.class_agit_external_items i SET revoked_at=clock_timestamp()
        FROM old_posts o JOIN new_posts n ON n.id=o.id
        WHERE i.class_id=o.class_id AND i.post_id=o.id AND i.revoked_at IS NULL
        AND (n.is_submitted IS NOT TRUE OR n.is_confirmed IS NOT TRUE OR n.is_returned IS TRUE
            OR n.writing_context IS DISTINCT FROM 'assignment' OR n.visibility IS DISTINCT FROM 'class'
            OR n.class_id IS DISTINCT FROM o.class_id OR n.student_id IS DISTINCT FROM o.student_id OR n.mission_id IS DISTINCT FROM o.mission_id)
        RETURNING i.class_id,i.id LOOP
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(v.class_id,v.id,'external','source_unavailable');
    END LOOP;
    FOR v IN UPDATE public.class_agit_book_items i SET revoked_at=clock_timestamp()
        FROM old_posts o JOIN new_posts n ON n.id=o.id
        WHERE i.class_id=o.class_id AND i.post_id=o.id AND i.revoked_at IS NULL
        AND (n.is_submitted IS NOT TRUE OR n.is_confirmed IS NOT TRUE OR n.is_returned IS TRUE
            OR n.writing_context IS DISTINCT FROM 'assignment' OR n.visibility IS DISTINCT FROM 'class'
            OR n.class_id IS DISTINCT FROM o.class_id OR n.student_id IS DISTINCT FROM o.student_id OR n.mission_id IS DISTINCT FROM o.mission_id)
        RETURNING i.class_id,i.id LOOP
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action) VALUES(v.class_id,v.id,'anthology','source_unavailable');
    END LOOP;
    RETURN NULL;
END; $function$;

CREATE OR REPLACE FUNCTION public.class_agit_source_data_v1(p_post student_posts, p_mission writing_missions, p_author text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_template TEXT; v_blocks JSONB; v_structured JSONB := p_post.structured_content; v_version TEXT; v_body TEXT;
BEGIN
    IF p_post.writing_context IS DISTINCT FROM 'assignment' OR p_post.visibility IS DISTINCT FROM 'class'
       OR p_post.is_submitted IS NOT TRUE OR p_post.is_confirmed IS NOT TRUE OR p_post.is_returned IS TRUE
       OR p_mission.id IS NULL OR p_mission.class_id IS DISTINCT FROM p_post.class_id
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
END; $function$;

CREATE OR REPLACE FUNCTION public.get_class_agit_candidates_v2(p_class_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '3s'
AS $function$
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
            AND p.is_returned IS NOT TRUE AND p.visibility='class'
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
END; $function$;

CREATE OR REPLACE FUNCTION public.get_class_agit_missions_v1(p_class_id uuid, p_query text DEFAULT ''::text, p_scope text DEFAULT 'all'::text, p_cursor jsonb DEFAULT NULL::jsonb, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '3s'
AS $function$
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
            AND p.is_returned IS NOT TRUE AND p.visibility='class' AND m.format IN('prose','poem')
        GROUP BY p.mission_id
    ) SELECT COALESCE((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('supported',m.format IN('prose','poem'),'review_count',COALESCE(c.review_count,0))
        ORDER BY m.created_at DESC,m.id DESC) FROM page m LEFT JOIN counts c ON c.mission_id=m.id),'[]'),
        (SELECT count(*)>v_limit FROM rows) INTO v_items,v_more;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'items',v_items,'has_more',v_more,
        'next_cursor',CASE WHEN v_more THEN jsonb_build_object('id',v_items->-1->>'id','created_at',v_items->-1->>'created_at') ELSE NULL END);
END; $function$;

CREATE OR REPLACE FUNCTION public.revoke_class_agit_releases_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_item RECORD;
BEGIN
    IF TG_TABLE_NAME='student_posts' THEN
        IF TG_OP='UPDATE' AND NEW.is_submitted IS TRUE AND NEW.is_confirmed IS TRUE AND NEW.is_returned IS NOT TRUE
            AND NEW.writing_context='assignment' AND NEW.visibility='class' AND NEW.class_id=OLD.class_id
            AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id AND NEW.mission_id IS NOT DISTINCT FROM OLD.mission_id THEN RETURN NEW; END IF;
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
END; $function$;

CREATE OR REPLACE FUNCTION public.revoke_class_agit_source_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_item RECORD;
BEGIN
    IF TG_TABLE_NAME='student_posts' THEN
        IF TG_OP='UPDATE' AND NEW.is_submitted IS TRUE AND NEW.is_confirmed IS TRUE AND NEW.is_returned IS NOT TRUE
           AND NEW.writing_context='assignment' AND NEW.visibility='class' AND NEW.class_id=OLD.class_id
            AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id AND NEW.mission_id IS NOT DISTINCT FROM OLD.mission_id THEN RETURN NEW; END IF;
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
END; $function$;

COMMIT;
