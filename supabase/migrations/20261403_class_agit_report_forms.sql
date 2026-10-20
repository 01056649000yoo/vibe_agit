-- 우리반 아지트(문집·글꽃 책방·전시)에 담기는 보고서가 관찰·조사 양식을 따른다 (2026-10-21, 선생님 결정).
-- · 보고서 저장 구조(structured_content)에 머리말 `meta` 를 허용한다(관찰: 대상·기간·장소·날씨·방법, 조사: 주제·기간·방법).
--   모르는 칸·글자가 아닌 값·100자 초과가 있으면 그 글은 담지 않는다(허용 목록 방식은 그대로).
-- · 문단 목록(blocks): 머리말 한 줄 → 칸마다 [확인한 사진 자리표] → ▲ 사진 설명 → 학생 문단(첫 문단 앞에 [칸 날짜]) → 참고 자료 한 줄.
--   양식 종류(meta)가 없는 예전 보고서는 결과가 달라지지 않는다.
-- · 발췌·길이·"글이 있는가"는 학생이 쓴 문단만 본다(머리말·설명·출처만으로는 담기지 않는다). kindLabel 은 관찰 보고서/조사 보고서.
-- · 함수 모양(인자·반환)은 20261401 과 같다. 권한도 같다(직접 호출 불가).

CREATE OR REPLACE FUNCTION public.class_agit_source_data_v1(p_post student_posts, p_mission writing_missions, p_author text, p_photos jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_template TEXT; v_blocks JSONB; v_structured JSONB := p_post.structured_content; v_version TEXT; v_body TEXT; v_text TEXT;
    v_photos JSONB := '{}'::JSONB; v_photo_sections JSONB := '[]'::JSONB; v_body_raw TEXT;
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
    IF v_template = 'letter' AND v_structured IS NOT NULL AND v_structured <> 'null'::JSONB THEN
        IF jsonb_typeof(v_structured) <> 'object' OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_structured) k WHERE k NOT IN ('template','version','recipient','greeting','body','closing')
        ) THEN RETURN NULL; END IF;
    END IF;
    -- 보고서: 칸 목록 구조만. 칸 구조가 없는 보고서는 칸 제목이 본문에 섞여 있을 수 있어 담지 않는다.
    IF v_template = 'report' THEN
        IF jsonb_typeof(v_structured) IS DISTINCT FROM 'object' OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(v_structured) k WHERE k NOT IN ('template','version','sections','meta')
        ) THEN RETURN NULL; END IF;
        -- 양식 종류(관찰·조사) 머리말: 정해진 칸 이름의 글자 값만, 칸마다 100자 이하. 모르는 칸이나 값이 있으면 담지 않는다.
        IF v_structured ? 'meta' THEN
            IF jsonb_typeof(v_structured->'meta') IS DISTINCT FROM 'object' THEN RETURN NULL; END IF;
            IF COALESCE(v_structured->'meta'->>'kind','') NOT IN ('observation','research')
                OR EXISTS (SELECT 1 FROM jsonb_each(v_structured->'meta') e
                    WHERE e.key NOT IN ('kind','target','topic','period','place','weather','method')
                       OR jsonb_typeof(e.value) <> 'string' OR char_length(e.value #>> '{}') > 100)
            THEN RETURN NULL; END IF;
        END IF;
        IF jsonb_typeof(v_structured->'sections') IS DISTINCT FROM 'array'
            OR jsonb_array_length(v_structured->'sections') > 12
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_structured->'sections') s WHERE jsonb_typeof(s) <> 'object'
                       OR (s ? 'body' AND jsonb_typeof(s->'body') NOT IN ('string','null')))
        THEN RETURN NULL; END IF;
        -- 칸 id 는 서로 달라야 하고 80자 이하여야 한다(같은 id 로 확인한 사진을 다른 칸에 붙이는 일을 막는다).
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_structured->'sections') WITH ORDINALITY s
                   WHERE char_length(public.class_agit_section_id_v1(s.value, s.ordinality)) > 80)
            OR (SELECT count(DISTINCT public.class_agit_section_id_v1(s.value, s.ordinality))
                FROM jsonb_array_elements(v_structured->'sections') WITH ORDINALITY s) <> jsonb_array_length(v_structured->'sections')
        THEN RETURN NULL; END IF;
        -- 사진이 든 칸 번호(화면이 확인할 사진을 고를 때 쓴다). 경로는 돌려주지 않는다.
        SELECT COALESCE(jsonb_agg(to_jsonb(public.class_agit_section_id_v1(s.value, s.ordinality)) ORDER BY s.ordinality), '[]'::JSONB)
            INTO v_photo_sections
        FROM jsonb_array_elements(v_structured->'sections') WITH ORDINALITY s
        WHERE public.class_agit_section_has_photo_v1(s.value);
        -- 선생님이 확인한 사진만: 칸에 실제로 있고, 확인한 경로와 지금 경로가 같고, 사진ID 가 UUID 모양인 것.
        IF jsonb_typeof(p_photos) = 'object' THEN
            SELECT COALESCE(jsonb_object_agg(sec.sid, p_photos->sec.sid), '{}'::JSONB) INTO v_photos FROM (
                SELECT public.class_agit_section_id_v1(s.value, s.ordinality) AS sid, s.value AS value
                FROM jsonb_array_elements(v_structured->'sections') WITH ORDINALITY s
            ) sec
            WHERE jsonb_typeof(p_photos->sec.sid) = 'object'
              AND (p_photos->sec.sid->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND public.class_agit_section_has_photo_v1(sec.value)
              AND sec.value->'image'->>'path' IS NOT NULL
              AND sec.value->'image'->>'path' = p_photos->sec.sid->>'path';
        END IF;
    END IF;
    IF v_template = 'poem' AND jsonb_typeof(v_structured->'stanzas') = 'array' THEN
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_structured->'stanzas') s WHERE jsonb_typeof(s) <> 'string') THEN RETURN NULL; END IF;
        SELECT COALESCE(jsonb_agg(to_jsonb(btrim(replace(replace(replace(s.value,E'\x1f',''),E'\r\n',E'\n'),E'\r',E'\n'))) ORDER BY s.ordinality)
            FILTER (WHERE btrim(replace(s.value,E'\x1f','')) <> ''), '[]'::JSONB) INTO v_blocks
        FROM jsonb_array_elements_text(v_structured->'stanzas') WITH ORDINALITY s;
    ELSIF v_template = 'report' THEN
        -- 칸 제목(소제목)은 뺀다. 순서: 머리말(양식 종류가 있을 때 한 줄) → 칸마다 [확인한 사진 자리표] → [사진 설명] → 학생이 쓴 문단
        -- (양식 종류가 있으면 첫 문단 앞에 칸 날짜) → 참고 자료(양식 종류가 있고 출처를 쓴 경우 한 줄). 제어 문자(\x1f)는 먼저 지운다.
        WITH secs AS (
            SELECT s.ordinality AS ord, public.class_agit_section_id_v1(s.value, s.ordinality) AS sid, s.value AS value
            FROM jsonb_array_elements(v_structured->'sections') WITH ORDINALITY s
        ), parts AS (
            SELECT 0::BIGINT AS ord, 0::BIGINT AS sub, 'head'::TEXT AS kind, h.line AS value, h.line AS raw
            FROM (
                SELECT string_agg(f.label || ': ' || btrim(replace(left(v_structured->'meta'->>f.key, 100), E'\x1f', '')), ' · ' ORDER BY f.pos) AS line
                FROM (VALUES
                    ('observation','target','관찰 대상',1), ('observation','period','관찰 기간·날짜',2), ('observation','place','관찰 장소',3),
                    ('observation','weather','날씨',4), ('observation','method','관찰 방법·도구',5),
                    ('research','topic','조사 주제',1), ('research','period','조사 기간',2), ('research','method','조사 방법',3)
                ) AS f(kind, key, label, pos)
                WHERE v_structured ? 'meta' AND f.kind = v_structured->'meta'->>'kind'
                  AND btrim(replace(COALESCE(v_structured->'meta'->>f.key, ''), E'\x1f', '')) <> ''
            ) h WHERE h.line IS NOT NULL
            UNION ALL
            SELECT sec.ord, 0::BIGINT, 'photo'::TEXT, public.class_agit_photo_marker_v1((v_photos->sec.sid->>'id')::UUID), NULL::TEXT
            FROM secs sec WHERE v_photos ? sec.sid
            UNION ALL
            SELECT sec.ord, 1::BIGINT, 'caption'::TEXT, '▲ ' || left(btrim(replace(COALESCE(sec.value->'image'->>'caption', ''), E'\x1f', '')), 80), NULL::TEXT
            FROM secs sec
            WHERE v_structured ? 'meta' AND v_photos ? sec.sid
              AND btrim(replace(COALESCE(sec.value->'image'->>'caption', ''), E'\x1f', '')) <> ''
            UNION ALL
            SELECT sec.ord, t.ordinality + 1, 'body'::TEXT,
                   CASE WHEN t.ordinality = 1 AND v_structured ? 'meta' AND btrim(replace(left(COALESCE(sec.value->>'date', ''), 30), E'\x1f', '')) <> ''
                        THEN '[' || btrim(replace(left(sec.value->>'date', 30), E'\x1f', '')) || '] ' || btrim(t.value)
                        ELSE btrim(t.value) END,
                   btrim(t.value)
            FROM secs sec
            CROSS JOIN LATERAL regexp_split_to_table(
                btrim(replace(replace(replace(COALESCE(sec.value->>'body',''),E'\x1f',''),E'\r\n',E'\n'),E'\r',E'\n'), E' \t\n'), E'\n[[:space:]]*\n') WITH ORDINALITY t(value, ordinality)
            WHERE btrim(t.value) <> ''
            UNION ALL
            SELECT 1000::BIGINT, 0::BIGINT, 'source'::TEXT, '참고 자료: ' || string_agg(chr(9311 + d.n::INTEGER) || ' ' || d.txt, ' / ' ORDER BY d.n), NULL::TEXT
            FROM (
                SELECT row_number() OVER (ORDER BY min(q.ord)) AS n, q.txt
                FROM (SELECT sec.ord, btrim(regexp_replace(replace(left(COALESCE(sec.value->>'source', ''), 200), E'\x1f', ''), '[[:space:]]+', ' ', 'g')) AS txt
                      FROM secs sec WHERE v_structured ? 'meta') q
                WHERE q.txt <> '' GROUP BY q.txt
            ) d HAVING count(*) > 0
        )
        SELECT COALESCE(jsonb_agg(to_jsonb(p.value) ORDER BY p.ord, p.sub), '[]'::JSONB),
               string_agg(p.raw, ' ' ORDER BY p.ord, p.sub) FILTER (WHERE p.kind = 'body')
        INTO v_blocks, v_body_raw FROM parts p WHERE p.value IS NOT NULL;
    ELSE
        v_text := replace(COALESCE(p_post.content,''), E'\x1f', '');
        SELECT COALESCE(jsonb_agg(to_jsonb(btrim(s.value)) ORDER BY s.ordinality) FILTER (WHERE btrim(s.value) <> ''), '[]'::JSONB)
        INTO v_blocks FROM regexp_split_to_table(replace(replace(v_text,E'\r\n',E'\n'),E'\r',E'\n'), E'\n[[:space:]]*\n') WITH ORDINALITY s(value, ordinality);
    END IF;
    -- 본문 길이·발췌는 글 문단만 센다(사진 자리표는 뺀다). 글이 한 문단도 없으면 사진만으로는 담지 않는다.
    SELECT string_agg(b.value,' ') INTO v_body FROM jsonb_array_elements_text(v_blocks) b(value)
        WHERE NOT public.class_agit_is_photo_marker_v1(b.value);
    IF v_template = 'report' THEN
        -- 본문 길이·발췌·"글이 있는가"는 학생이 쓴 문단만 본다(머리말·사진 설명·참고 자료만으로는 담지 않는다).
        v_body := v_body_raw;
        SELECT string_agg(b.value, E'\n\n' ORDER BY b.ordinality) INTO v_text FROM jsonb_array_elements_text(v_blocks) WITH ORDINALITY b(value, ordinality)
            WHERE NOT public.class_agit_is_photo_marker_v1(b.value);
    END IF;
    IF v_body IS NULL OR jsonb_array_length(v_blocks) NOT BETWEEN 1 AND 200 OR char_length(v_body) > 20000 OR octet_length(v_blocks::TEXT) > 85000
        OR char_length(COALESCE(v_text,'')) > 23000 THEN RETURN NULL; END IF;
    v_version := encode(extensions.digest(jsonb_build_array(p_post.id, p_post.updated_at, p_post.title, p_post.content,
        p_post.structured_content, p_post.is_submitted, p_post.is_confirmed, p_post.is_returned, p_post.visibility,
        p_post.recalled_at, p_mission.input_template, p_mission.mission_type, p_author, v_photos)::TEXT, 'sha256'), 'hex');
    RETURN jsonb_build_object('id', p_post.id, 'class_id', p_post.class_id, 'student_id', p_post.student_id,
        'student_name', left(p_author,30), 'source_revision', v_version, 'writing_context', 'assignment',
        'is_submitted', TRUE, 'is_confirmed', TRUE, 'is_returned', FALSE, 'visibility', 'class',
        'title', COALESCE(NULLIF(btrim(p_post.title),''),'제목 없는 글'), 'content', CASE WHEN v_template = 'report' AND v_text IS NOT NULL THEN v_text ELSE p_post.content END,
        'structured_content', CASE WHEN v_template = 'poem' THEN jsonb_build_object('template','poem','stanzas',v_blocks) ELSE NULL END,
        'input_template', CASE WHEN v_template = 'poem' THEN 'poem' ELSE NULL END,
        'group_title', left(p_mission.title,80), 'updated_at', p_post.updated_at,
        'format', CASE WHEN v_template = 'poem' THEN 'poem' ELSE 'prose' END,
        'kindLabel', CASE v_template WHEN 'poem' THEN '시' WHEN 'letter' THEN '편지' WHEN 'report' THEN CASE v_structured->'meta'->>'kind' WHEN 'observation' THEN '관찰 보고서' WHEN 'research' THEN '조사 보고서' ELSE '보고서' END ELSE '글' END,
        'blocks', v_blocks, 'excerpt', left(regexp_replace(v_body,'[[:space:]]+',' ','g'),96),
        'photo_sections', v_photo_sections, 'photos_included', (SELECT count(*) FROM jsonb_object_keys(v_photos)));
END; $function$;
REVOKE ALL ON FUNCTION public.class_agit_source_data_v1(student_posts, writing_missions, TEXT, JSONB) FROM PUBLIC,anon,authenticated,service_role;
