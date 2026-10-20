-- 우리반 아지트 전시·문집에 편지와 보고서(사진 없는 것)를 담는다(2026-10-20, 선생님 요청).
--
-- 전에는 "일반 글과 시만 담는다"가 서버 함수 네 곳(자격 정본·후보·미션 목록·학생 목록)에 복사되어 있었다.
-- 이제 허용 기준은 `class_agit_exhibitable_format_v1` 하나이고, 네 곳이 모두 이것을 부른다(새 장르는 이 함수 한 줄 + 정본).
--
-- - 편지·보고서는 책에서 **일반 글(prose)과 같은 문단 목록**으로 담는다. 읽는 화면·인쇄·구글 문서 내보내기·공개 읽기가
--   받는 글 모양(`format` = prose|poem, 문단 문자열 목록)을 바꾸지 않아도 된다. 책 머리표만 `kindLabel` 로 편지·보고서가 된다.
-- - 보고서 본문은 칸 제목(교사의 질문)을 뺀 학생이 쓴 칸 내용만 잇는다(화면 완성본과 같다).
-- - **사진이 든 보고서는 이 단계에서 제외**한다(후보·개수에도 안 센다). 사진은 담을 때 학생 동의를 기록하는 다음 단계에서 지원한다.
-- - 일기·안건 의견 모으기(meeting)는 담지 않는다. 독서록(자율 글)은 후보 경로가 달라 따로 한다.
-- - 이미 담긴 글의 스냅샷은 바뀌지 않는다(format 은 prose|poem 그대로).

BEGIN;

CREATE OR REPLACE FUNCTION public.class_agit_exhibitable_format_v1(p_format TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT p_format IN ('prose','poem','letter','report');
$$;

CREATE OR REPLACE FUNCTION public.class_agit_report_has_photo_v1(p_structured JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT CASE WHEN jsonb_typeof(p_structured) = 'object' AND jsonb_typeof(p_structured->'sections') = 'array' THEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_structured->'sections') s
        WHERE jsonb_typeof(s) = 'object' AND s ? 'image' AND s->'image' NOT IN ('null'::JSONB,'{}'::JSONB,'""'::JSONB,'[]'::JSONB)
    ) ELSE FALSE END;
$$;

CREATE OR REPLACE FUNCTION public.class_agit_post_exhibitable_v1(p_format TEXT, p_structured JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT public.class_agit_exhibitable_format_v1(p_format)
        AND NOT (p_format = 'report' AND public.class_agit_report_has_photo_v1(p_structured));
$$;

REVOKE ALL ON FUNCTION public.class_agit_exhibitable_format_v1(TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.class_agit_report_has_photo_v1(JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.class_agit_post_exhibitable_v1(TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.class_agit_source_data_v1(p_post student_posts, p_mission writing_missions, p_author text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_template TEXT; v_blocks JSONB; v_structured JSONB := p_post.structured_content; v_version TEXT; v_body TEXT; v_text TEXT;
BEGIN
    IF p_post.writing_context IS DISTINCT FROM 'assignment' OR p_post.visibility IS DISTINCT FROM 'class'
       OR p_post.is_submitted IS NOT TRUE OR p_post.is_confirmed IS NOT TRUE OR p_post.is_returned IS TRUE
       OR p_mission.id IS NULL OR p_mission.class_id IS DISTINCT FROM p_post.class_id
       OR p_author IS NULL OR char_length(COALESCE(p_post.content,'')) > 20000 OR char_length(COALESCE(p_post.title,'')) > 200
    THEN RETURN NULL; END IF;
    v_template := COALESCE(NULLIF(NULLIF(p_mission.input_template, 'freeform'), ''),
        CASE WHEN p_mission.mission_type IN ('poem','letter','report','meeting') THEN p_mission.mission_type END,
        v_structured->>'template', 'prose');
    IF NOT public.class_agit_exhibitable_format_v1(v_template) OR (v_structured->>'template' IS NOT NULL AND v_structured->>'template' <> v_template)
    THEN RETURN NULL; END IF;
    IF v_template = 'prose' AND v_structured IS NOT NULL AND v_structured <> '{}'::JSONB AND v_structured <> 'null'::JSONB
    THEN RETURN NULL; END IF;
    IF v_template = 'poem' AND v_structured IS NOT NULL AND v_structured <> 'null'::JSONB THEN
        IF jsonb_typeof(v_structured) <> 'object' OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_structured) k WHERE k NOT IN ('template','version','stanzas')
        ) THEN RETURN NULL; END IF;
        IF v_structured ? 'stanzas' AND (jsonb_typeof(v_structured->'stanzas') <> 'array') THEN RETURN NULL; END IF;
    END IF;
    -- 편지: 네 칸(받는 사람·첫인사·본문·끝인사) 구조만. 본문은 저장 때 만들어 둔 content 를 문단으로 나눈다.
    IF v_template = 'letter' AND v_structured IS NOT NULL AND v_structured <> 'null'::JSONB THEN
        IF jsonb_typeof(v_structured) <> 'object' OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_structured) k WHERE k NOT IN ('template','version','recipient','greeting','body','closing')
        ) THEN RETURN NULL; END IF;
    END IF;
    -- 보고서: 칸 목록 구조만, 사진이 든 칸이 하나라도 있으면 제외한다(사진 지원은 다음 단계).
    -- 칸 구조(sections)가 없는 보고서는 칸 제목이 본문에 섞여 있을 수 있어 담지 않는다(운영에 2편, 모두 빈 글).
    IF v_template = 'report' THEN
        IF jsonb_typeof(v_structured) IS DISTINCT FROM 'object' OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_structured) k WHERE k NOT IN ('template','version','sections')
        ) THEN RETURN NULL; END IF;
        IF jsonb_typeof(v_structured->'sections') IS DISTINCT FROM 'array'
            OR jsonb_array_length(v_structured->'sections') > 12
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_structured->'sections') s WHERE jsonb_typeof(s) <> 'object')
        THEN RETURN NULL; END IF;
        IF public.class_agit_report_has_photo_v1(v_structured) THEN RETURN NULL; END IF;
    END IF;
    IF v_template = 'poem' AND jsonb_typeof(v_structured->'stanzas') = 'array' THEN
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_structured->'stanzas') s WHERE jsonb_typeof(s) <> 'string') THEN RETURN NULL; END IF;
        SELECT COALESCE(jsonb_agg(to_jsonb(btrim(replace(replace(s.value,E'\r\n',E'\n'),E'\r',E'\n'))) ORDER BY s.ordinality)
            FILTER (WHERE btrim(s.value) <> ''), '[]'::JSONB) INTO v_blocks
        FROM jsonb_array_elements_text(v_structured->'stanzas') WITH ORDINALITY s;
    ELSE
        -- 보고서는 칸 제목(교사의 질문)을 빼고 학생이 쓴 칸 내용만 잇는다(화면의 완성본과 같다). 나머지는 content 그대로.
        IF v_template = 'report' THEN
            SELECT string_agg(q.t, E'\n\n' ORDER BY q.ord) INTO v_text FROM (
                SELECT s.ordinality AS ord, NULLIF(btrim(s.value->>'body'),'') AS t
                FROM jsonb_array_elements(v_structured->'sections') WITH ORDINALITY s
            ) q WHERE q.t IS NOT NULL;
        ELSE
            v_text := COALESCE(p_post.content,'');
        END IF;
        SELECT COALESCE(jsonb_agg(to_jsonb(btrim(s.value)) ORDER BY s.ordinality) FILTER (WHERE btrim(s.value) <> ''), '[]'::JSONB)
        INTO v_blocks FROM regexp_split_to_table(replace(replace(COALESCE(v_text,''),E'\r\n',E'\n'),E'\r',E'\n'), E'\n[[:space:]]*\n') WITH ORDINALITY s(value, ordinality);
    END IF;
    SELECT string_agg(value,' ') INTO v_body FROM jsonb_array_elements_text(v_blocks);
    -- 보고서의 content 는 칸 제목 없이, 길이 검사를 지난 문단 목록에서 다시 만든다(원문 공백·제목이 새지 않게).
    IF v_template = 'report' THEN
        SELECT string_agg(value, E'\n\n' ORDER BY ordinality) INTO v_text FROM jsonb_array_elements_text(v_blocks) WITH ORDINALITY;
    END IF;
    IF jsonb_array_length(v_blocks) NOT BETWEEN 1 AND 200 OR char_length(v_body) > 20000 OR octet_length(v_blocks::TEXT) > 85000 THEN RETURN NULL; END IF;
    v_version := encode(extensions.digest(jsonb_build_array(p_post.id, p_post.updated_at, p_post.title, p_post.content,
        p_post.structured_content, p_post.is_submitted, p_post.is_confirmed, p_post.is_returned, p_post.visibility,
        p_post.recalled_at, p_mission.input_template, p_mission.mission_type, p_author)::TEXT, 'sha256'), 'hex');
    RETURN jsonb_build_object('id', p_post.id, 'class_id', p_post.class_id, 'student_id', p_post.student_id,
        'student_name', left(p_author,30), 'source_revision', v_version, 'writing_context', 'assignment',
        'is_submitted', TRUE, 'is_confirmed', TRUE, 'is_returned', FALSE, 'visibility', 'class',
        'title', COALESCE(NULLIF(btrim(p_post.title),''),'제목 없는 글'), 'content', CASE WHEN v_template = 'report' AND v_text IS NOT NULL THEN v_text ELSE p_post.content END,
        'structured_content', CASE WHEN v_template = 'poem' THEN jsonb_build_object('template','poem','stanzas',v_blocks) ELSE NULL END,
        'input_template', CASE WHEN v_template = 'poem' THEN 'poem' ELSE NULL END,
        'group_title', left(p_mission.title,80), 'updated_at', p_post.updated_at,
        'format', CASE WHEN v_template = 'poem' THEN 'poem' ELSE 'prose' END,
        'kindLabel', CASE v_template WHEN 'poem' THEN '시' WHEN 'letter' THEN '편지' WHEN 'report' THEN '보고서' ELSE '글' END,
        'blocks', v_blocks, 'excerpt', left(regexp_replace(v_body,'[[:space:]]+',' ','g'),96));
END; $function$;

CREATE OR REPLACE FUNCTION public.get_class_agit_candidates_v2(p_class_id uuid, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '3s'
AS $function$
DECLARE v_items JSONB; v_more BOOLEAN; v_limit INTEGER; v_query TEXT; v_sort TEXT; v_mission UUID; v_student UUID; v_cursor JSONB; v_excluded UUID[];
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' OR octet_length(p_filters::TEXT)>12000 THEN
        RAISE EXCEPTION '작품 검색 조건을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    v_limit:=LEAST(GREATEST(COALESCE((p_filters->>'limit')::INTEGER,30),1),50);
    v_query:=btrim(COALESCE(p_filters->>'query','')); v_sort:=COALESCE(p_filters->>'sort','recent');
    v_mission:=(p_filters->>'mission_id')::UUID; v_student:=(p_filters->>'student_id')::UUID; v_cursor:=NULLIF(p_filters->'cursor','null'::JSONB);
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
        WHERE p.class_id=p_class_id AND (v_mission IS NULL OR p.mission_id=v_mission) AND (v_student IS NULL OR p.student_id=v_student)
            AND p.writing_context='assignment' AND p.is_submitted IS TRUE AND p.is_confirmed IS TRUE
            AND p.is_returned IS NOT TRUE AND p.visibility='class'
            AND public.class_agit_post_exhibitable_v1(public.class_agit_mission_format_v1(m.input_template,m.mission_type),p.structured_content)
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
            AND p.is_returned IS NOT TRUE AND p.visibility='class' AND public.class_agit_post_exhibitable_v1(m.format,p.structured_content)
        GROUP BY p.mission_id
    ) SELECT COALESCE((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('supported',public.class_agit_exhibitable_format_v1(m.format),'review_count',COALESCE(c.review_count,0))
        ORDER BY m.created_at DESC,m.id DESC) FROM page m LEFT JOIN counts c ON c.mission_id=m.id),'[]'),
        (SELECT count(*)>v_limit FROM rows) INTO v_items,v_more;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'items',v_items,'has_more',v_more,
        'next_cursor',CASE WHEN v_more THEN jsonb_build_object('id',v_items->-1->>'id','created_at',v_items->-1->>'created_at') ELSE NULL END);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_class_agit_students_v1(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '3s'
AS $function$
DECLARE v_items JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    -- 담을 수 있는 글의 자격은 get_class_agit_candidates_v2 와 같다: 과제 글·제출·확인·미반려·학급 공개·시·글·편지·보고서(사진 없는 것) 미션.
    WITH counts AS (
        SELECT p.student_id, count(*) AS review_count
        FROM public.student_posts p
        JOIN public.writing_missions m ON m.id=p.mission_id AND m.class_id=p.class_id
        WHERE p.class_id=p_class_id AND p.writing_context='assignment' AND p.is_submitted IS TRUE AND p.is_confirmed IS TRUE
            AND p.is_returned IS NOT TRUE AND p.visibility='class'
            AND public.class_agit_post_exhibitable_v1(public.class_agit_mission_format_v1(m.input_template,m.mission_type),p.structured_content)
        GROUP BY p.student_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'name',left(s.name,30),'review_count',COALESCE(c.review_count,0))
        ORDER BY s.name, s.id),'[]') INTO v_items
    FROM public.students s LEFT JOIN counts c ON c.student_id=s.id
    WHERE s.class_id=p_class_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'items',v_items);
END; $function$;

CREATE OR REPLACE FUNCTION public.get_class_agit_sources_v1(p_class_id uuid, p_post_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '3s'
AS $function$
DECLARE v_items JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    IF COALESCE(cardinality(p_post_ids),0) NOT BETWEEN 1 AND 50 OR array_position(p_post_ids,NULL) IS NOT NULL
        OR (SELECT count(DISTINCT x) FROM unnest(p_post_ids) x)<>cardinality(p_post_ids)
    THEN RAISE EXCEPTION '서로 다른 작품을 1~50편 선택해 주세요.' USING ERRCODE='22023'; END IF;
    WITH checked AS MATERIALIZED (
        SELECT x.id,x.n,public.class_agit_current_source_v1(p_class_id,x.id) AS source FROM unnest(p_post_ids) WITH ORDINALITY x(id,n)
    ) SELECT jsonb_agg(jsonb_build_object('id',id,'source',source,'reason',CASE WHEN source IS NOT NULL THEN NULL
        WHEN EXISTS(SELECT 1 FROM public.student_posts q WHERE q.id=checked.id AND q.class_id=p_class_id
            AND public.class_agit_report_has_photo_v1(q.structured_content))
        THEN '사진이 든 보고서는 아직 담을 수 없습니다. 사진 지원은 준비 중입니다.'
        ELSE '현재 수록할 수 없습니다. 제출·확인·공개 상태와 장르를 확인해 주세요.' END) ORDER BY n) INTO v_items FROM checked;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'items',v_items);
END; $function$;

COMMIT;
