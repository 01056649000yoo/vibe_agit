-- 문집 "학생째 담기"(2026-09-15).
--
-- 담는 방법이 주제째·작품 골라 담기뿐이라 한 아이의 글을 모으려면 이름으로 검색해 한 편씩 체크해야 했고,
-- 같은 성의 두 아이가 섞여 나왔다. 학생을 기준으로 고르는 길을 연다.
--
-- [1] 작품 검색(get_class_agit_candidates_v2)에 student_id 조건을 더한다. 나머지 자격·정렬·커서는 그대로다.
-- [2] 학생 명단과 각자 담을 수 있는 글 수(get_class_agit_students_v1) — 미션 목록의 review_count 와 같은 자격이다.
--     화면이 학생마다 검색을 돌리지 않도록 한 번에 준다(동시 500명 원칙: 집계는 미리, 화면은 한 줄 읽기).

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
    -- 담을 수 있는 글의 자격은 get_class_agit_candidates_v2 와 같다: 과제 글·제출·확인·미반려·학급 공개·시/글 미션.
    WITH counts AS (
        SELECT p.student_id, count(*) AS review_count
        FROM public.student_posts p
        JOIN public.writing_missions m ON m.id=p.mission_id AND m.class_id=p.class_id
        WHERE p.class_id=p_class_id AND p.writing_context='assignment' AND p.is_submitted IS TRUE AND p.is_confirmed IS TRUE
            AND p.is_returned IS NOT TRUE AND p.visibility='class'
            AND public.class_agit_mission_format_v1(m.input_template,m.mission_type) IN('prose','poem')
        GROUP BY p.student_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'name',left(s.name,30),'review_count',COALESCE(c.review_count,0))
        ORDER BY s.name, s.id),'[]') INTO v_items
    FROM public.students s LEFT JOIN counts c ON c.student_id=s.id
    WHERE s.class_id=p_class_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'items',v_items);
END; $function$;

REVOKE ALL ON FUNCTION public.get_class_agit_students_v1(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_agit_students_v1(UUID) TO authenticated;

