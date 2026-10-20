-- 우리반 아지트 전시·문집에 보고서 사진을 담는다: 서버 기반(2026-10-20, 설계 docs/CLASS_AGIT_PHOTOS_PLAN.md 2b).
--
-- 선생님 결정: 사진에는 얼굴 등 개인을 알아볼 수 있는 정보가 없어야 하고, 담을 때 **선생님이 사진을 직접 보고 확인**해야 사진이 담긴다.
-- 문제가 있으면 사진만 빼고 글만 담는다(확인하지 않은 사진은 담기지 않는다 = 글만 담기).
--
-- 방식(설계 문서의 `media` 필드안에서 바꿈): 사진을 **문단 목록(blocks) 안의 사진 자리표 한 줄**로 담는다.
--   `\x1f` + `photo:` + 사진ID(UUID). 전시·책·공개판·외부 공유가 모두 blocks 를 그대로 고정해 가져가므로, 고정(스냅샷)·철회·동의 규칙이
--   사진에도 저절로 적용되고 서버 함수 십여 곳을 고치지 않아도 된다. 학생 글에 이 제어 문자가 섞여 있어도 정본이 먼저 지운다(자리표를 흉내 낼 수 없다).
-- - 원본 사진(비공개 report-images)은 글쓴이·담임·관리자·같은 반 학생이 읽는다. 책은 담는 순간 **복사본**(class-agit-photos)을 고정한다.
--   복사는 Edge 함수(class-agit-photo-copy)가 원본에서 그대로 한다(브라우저가 올리게 하면 다른 그림을 올릴 수 있다).
-- - 이 단계에서 같은 반 학생과 담임·관리자가 복사본을 읽는다. 외부 공유 방문자(2d)와 이웃 반 문집은 다음 단계.
-- - 사진이 든 보고서는 이제 후보에 오른다(확인한 사진이 없으면 글만 담긴다). 1단계(20261400)의 "사진 보고서 제외"를 걷는다.

BEGIN;

-- ── 사진 자리표 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.class_agit_photo_marker_v1(p_photo_id UUID)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT E'\x1fphoto:' || p_photo_id::TEXT;
$$;

CREATE OR REPLACE FUNCTION public.class_agit_is_photo_marker_v1(p_block TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(p_block ~ E'^\x1fphoto:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', FALSE);
$$;

CREATE OR REPLACE FUNCTION public.class_agit_section_has_photo_v1(p_section JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(jsonb_typeof(p_section) = 'object' AND p_section ? 'image'
        AND p_section->'image' NOT IN ('null'::JSONB, '{}'::JSONB, '""'::JSONB, '[]'::JSONB), FALSE);
$$;

-- 문단 목록(JSONB 배열) 안에 이 사진의 자리표가 있는가 — 구조 비교(@>)라 이스케이프와 상관없다.
CREATE OR REPLACE FUNCTION public.class_agit_blocks_have_photo_v1(p_blocks JSONB, p_photo_id UUID)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(jsonb_typeof(p_blocks) = 'array' AND p_blocks @> to_jsonb(public.class_agit_photo_marker_v1(p_photo_id)), FALSE);
$$;

-- 구조를 모르는 JSON(스냅샷 전체)에서 찾기: JSONB 를 글자로 바꾸면 제어 문자 0x1f 가 `\u001f` 로 바뀐다(위 raw LIKE 는 항상 거짓이 된다).
CREATE OR REPLACE FUNCTION public.class_agit_json_has_photo_v1(p_json JSONB, p_photo_id UUID)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(p_json::TEXT LIKE '%' || btrim(to_jsonb(public.class_agit_photo_marker_v1(p_photo_id))::TEXT, '"') || '%', FALSE);
$$;

-- 보고서 칸의 번호(id 가 없으면 화면 `normalizeReportSections` 와 같은 `section-순번`)
CREATE OR REPLACE FUNCTION public.class_agit_section_id_v1(p_section JSONB, p_ordinal BIGINT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT COALESCE(NULLIF(btrim(p_section->>'id'), ''), 'section-' || p_ordinal);
$$;

REVOKE ALL ON FUNCTION public.class_agit_photo_marker_v1(UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.class_agit_is_photo_marker_v1(TEXT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.class_agit_section_has_photo_v1(JSONB) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.class_agit_section_id_v1(JSONB,BIGINT) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.class_agit_blocks_have_photo_v1(JSONB,UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.class_agit_json_has_photo_v1(JSONB,UUID) FROM PUBLIC,anon,authenticated,service_role;

-- ── 선생님이 사진을 보고 확인한 기록 + 복사본 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_agit_item_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    post_id UUID NOT NULL REFERENCES public.student_posts(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL CHECK (char_length(section_id) BETWEEN 1 AND 80),
    source_path TEXT NOT NULL CHECK (char_length(source_path) <= 300),
    copy_path TEXT NOT NULL UNIQUE CHECK (copy_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|webp)$'),
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/webp')),
    width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 1600),
    height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 1600),
    bytes INTEGER NOT NULL CHECK (bytes BETWEEN 1 AND 262144),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','copied','failed','removed')),
    checked_by UUID NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    check_version SMALLINT NOT NULL DEFAULT 1,
    copied_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ,
    UNIQUE (post_id, section_id, source_path)
);
CREATE INDEX IF NOT EXISTS class_agit_item_photos_post_idx ON public.class_agit_item_photos(post_id) WHERE status = 'copied' AND removed_at IS NULL;
ALTER TABLE public.class_agit_item_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.class_agit_item_photos FROM PUBLIC,anon,authenticated,service_role;

-- 비공개 버킷: 파일은 서비스 권한(Edge 함수)만 쓴다. 읽기만 아래 정책으로 연다.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('class-agit-photos', 'class-agit-photos', FALSE, 262144, ARRAY['image/jpeg','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 복사본을 읽어도 되는 사람: 담임·관리자, 그리고 그 반 학생 가운데 **지금 볼 수 있는 전시·문집에 이 사진 자리표가 든 경우**.
CREATE OR REPLACE FUNCTION public.can_read_class_agit_photo_v1(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT auth.uid() IS NOT NULL AND COALESCE((
        SELECT
            (c.teacher_id = auth.uid() AND public.class_agit_class_is_allowed_v1(c.id))
            OR public.auth_user_role() = 'ADMIN'
            OR (public.auth_student_id() IS NOT NULL AND public.auth_user_class_id() = c.id AND (
                EXISTS (SELECT 1 FROM public.class_agit_published_items i
                        JOIN public.class_agit_exhibitions e ON e.class_id = i.class_id AND e.id = i.exhibition_id
                            AND e.publication_no = i.publication_no AND e.state = 'published'
                        WHERE i.class_id = c.id AND i.revoked_at IS NULL
                          AND public.class_agit_blocks_have_photo_v1(i.blocks, ph.id))
                OR EXISTS (SELECT 1 FROM public.class_agit_book_editions be
                           JOIN public.class_agit_books b ON b.class_id = be.class_id AND b.id = be.book_id
                           WHERE be.class_id = c.id AND be.student_visible AND NOT b.archived
                             AND (b.book_type = 'class' OR b.owner_student_id = public.auth_student_id())
                             AND public.class_agit_json_has_photo_v1(be.snapshot, ph.id))
            ))
        FROM public.class_agit_item_photos ph
        JOIN public.classes c ON c.id = ph.class_id AND c.deleted_at IS NULL
        WHERE ph.copy_path = p_path AND ph.status = 'copied' AND ph.removed_at IS NULL
    ), FALSE);
$$;
REVOKE ALL ON FUNCTION public.can_read_class_agit_photo_v1(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_class_agit_photo_v1(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Class_Agit_Photos_Select_V1" ON storage.objects;
CREATE POLICY "Class_Agit_Photos_Select_V1" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'class-agit-photos' AND public.can_read_class_agit_photo_v1(name));

-- ── 담을 수 있는 글: 사진 보고서도 후보(확인한 사진이 없으면 글만 담는다) ─────────────────
CREATE OR REPLACE FUNCTION public.class_agit_post_exhibitable_v1(p_format TEXT, p_structured JSONB)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT public.class_agit_exhibitable_format_v1(p_format);
$$;

-- ── 글 자격·표시본 정본: 옛 3인자 판을 지우고 사진 자리표를 받는 판으로 ─────────────────────
-- p_photos: { 칸ID: { "id": 사진UUID, "path": 확인한 원본 경로 } } — 선생님이 확인하고 복사가 끝난 사진만, 지금 칸의 사진과 경로가 같은 것만 쓴다.
DROP FUNCTION IF EXISTS public.class_agit_source_data_v1(student_posts, writing_missions, TEXT);
CREATE OR REPLACE FUNCTION public.class_agit_source_data_v1(p_post student_posts, p_mission writing_missions, p_author text, p_photos jsonb DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE v_template TEXT; v_blocks JSONB; v_structured JSONB := p_post.structured_content; v_version TEXT; v_body TEXT; v_text TEXT;
    v_photos JSONB := '{}'::JSONB; v_photo_sections JSONB := '[]'::JSONB;
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
            SELECT 1 FROM jsonb_object_keys(v_structured) k WHERE k NOT IN ('template','version','sections')
        ) THEN RETURN NULL; END IF;
        IF jsonb_typeof(v_structured->'sections') IS DISTINCT FROM 'array'
            OR jsonb_array_length(v_structured->'sections') > 12
            OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_structured->'sections') s WHERE jsonb_typeof(s) <> 'object')
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
        -- 칸 제목(교사의 질문)은 뺀다. 칸마다 [확인한 사진 자리표] → 학생이 쓴 문단 순서. 제어 문자(\x1f)는 먼저 지운다.
        SELECT COALESCE(jsonb_agg(b.value ORDER BY b.ord, b.sub), '[]'::JSONB) INTO v_blocks FROM (
            SELECT sec.ordinality AS ord, 0::BIGINT AS sub, to_jsonb(public.class_agit_photo_marker_v1((v_photos->sec.sid->>'id')::UUID)) AS value
            FROM (SELECT s.ordinality, public.class_agit_section_id_v1(s.value, s.ordinality) AS sid
                  FROM jsonb_array_elements(v_structured->'sections') WITH ORDINALITY s) sec
            WHERE v_photos ? sec.sid
            UNION ALL
            SELECT s.ordinality, t.ordinality, to_jsonb(btrim(t.value))
            FROM jsonb_array_elements(v_structured->'sections') WITH ORDINALITY s
            CROSS JOIN LATERAL regexp_split_to_table(
                replace(replace(replace(COALESCE(s.value->>'body',''),E'\x1f',''),E'\r\n',E'\n'),E'\r',E'\n'), E'\n[[:space:]]*\n') WITH ORDINALITY t(value, ordinality)
            WHERE btrim(t.value) <> ''
        ) b;
    ELSE
        v_text := replace(COALESCE(p_post.content,''), E'\x1f', '');
        SELECT COALESCE(jsonb_agg(to_jsonb(btrim(s.value)) ORDER BY s.ordinality) FILTER (WHERE btrim(s.value) <> ''), '[]'::JSONB)
        INTO v_blocks FROM regexp_split_to_table(replace(replace(v_text,E'\r\n',E'\n'),E'\r',E'\n'), E'\n[[:space:]]*\n') WITH ORDINALITY s(value, ordinality);
    END IF;
    -- 본문 길이·발췌는 글 문단만 센다(사진 자리표는 뺀다). 글이 한 문단도 없으면 사진만으로는 담지 않는다.
    SELECT string_agg(b.value,' ') INTO v_body FROM jsonb_array_elements_text(v_blocks) b(value)
        WHERE NOT public.class_agit_is_photo_marker_v1(b.value);
    IF v_template = 'report' THEN
        SELECT string_agg(b.value, E'\n\n' ORDER BY b.ordinality) INTO v_text FROM jsonb_array_elements_text(v_blocks) WITH ORDINALITY b(value, ordinality)
            WHERE NOT public.class_agit_is_photo_marker_v1(b.value);
    END IF;
    IF v_body IS NULL OR jsonb_array_length(v_blocks) NOT BETWEEN 1 AND 200 OR char_length(v_body) > 20000 OR octet_length(v_blocks::TEXT) > 85000
        OR char_length(COALESCE(v_text,'')) > 20000 THEN RETURN NULL; END IF;
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
        'kindLabel', CASE v_template WHEN 'poem' THEN '시' WHEN 'letter' THEN '편지' WHEN 'report' THEN '보고서' ELSE '글' END,
        'blocks', v_blocks, 'excerpt', left(regexp_replace(v_body,'[[:space:]]+',' ','g'),96),
        'photo_sections', v_photo_sections, 'photos_included', (SELECT count(*) FROM jsonb_object_keys(v_photos)));
END; $function$;
REVOKE ALL ON FUNCTION public.class_agit_source_data_v1(student_posts, writing_missions, TEXT, JSONB) FROM PUBLIC,anon,authenticated,service_role;

-- 현재 원글: 선생님이 확인하고 복사가 끝난 사진을 정본에 넘긴다.
CREATE OR REPLACE FUNCTION public.class_agit_current_source_v1(p_class_id uuid, p_post_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT public.class_agit_source_data_v1(p,m,s.name,(
            SELECT jsonb_object_agg(x.section_id, jsonb_build_object('id', x.id, 'path', x.source_path))
            FROM (SELECT DISTINCT ON (ph.section_id) ph.section_id, ph.id, ph.source_path
                  FROM public.class_agit_item_photos ph
                  WHERE ph.class_id=p.class_id AND ph.post_id=p.id AND ph.status='copied' AND ph.removed_at IS NULL
                    AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p.structured_content->'sections')='array'
                                    THEN p.structured_content->'sections' ELSE '[]'::JSONB END) sec
                                WHERE sec->'image'->>'path' = ph.source_path)
                  ORDER BY ph.section_id, ph.checked_at DESC) x
        ))||jsonb_build_object('mission_id',m.id)
    FROM public.student_posts p
    JOIN public.students s ON s.id=p.student_id AND s.class_id=p.class_id AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE
    JOIN public.writing_missions m ON m.id=p.mission_id AND m.class_id=p.class_id
    WHERE p.class_id=p_class_id AND p.id=p_post_id;
$function$;

-- ── 선생님이 사진을 보고 확인했다고 기록 ────────────────────────────────────────────
-- p_statement_version: 화면에 보인 확인 문구의 판(지금 1). 문구가 바뀌면 판을 올린다.
CREATE OR REPLACE FUNCTION public.confirm_class_agit_photo_use_v1(p_class_id UUID, p_post_id UUID, p_section_ids TEXT[], p_statement_version SMALLINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_actor UUID; v_source JSONB; v_post public.student_posts%ROWTYPE; v_sid TEXT; v_section JSONB; v_ord BIGINT; v_path TEXT;
    v_image JSONB; v_id UUID; v_ext TEXT; v_rows JSONB := '[]'::JSONB; v_row public.class_agit_item_photos%ROWTYPE;
BEGIN
    v_actor := public.assert_class_agit_manager_v1(p_class_id);
    IF p_statement_version IS DISTINCT FROM 1 THEN RAISE EXCEPTION '사진 확인 문구가 바뀌었습니다. 화면을 새로 열어 주세요.' USING ERRCODE='22023'; END IF;
    IF COALESCE(cardinality(p_section_ids),0) NOT BETWEEN 1 AND 3 OR array_position(p_section_ids,NULL) IS NOT NULL
        OR (SELECT count(DISTINCT x) FROM unnest(p_section_ids) x) <> cardinality(p_section_ids)
    THEN RAISE EXCEPTION '확인할 사진을 1~3장 골라 주세요.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_post FROM public.student_posts WHERE id=p_post_id AND class_id=p_class_id;
    IF NOT FOUND THEN RAISE EXCEPTION '글을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    v_source := public.class_agit_current_source_v1(p_class_id, p_post_id);
    IF v_source IS NULL THEN RAISE EXCEPTION '현재 수록할 수 없는 글입니다. 제출·확인·공개 상태를 확인해 주세요.' USING ERRCODE='42501'; END IF;
    FOREACH v_sid IN ARRAY p_section_ids LOOP
        IF NOT (v_source->'photo_sections' @> to_jsonb(v_sid)) THEN RAISE EXCEPTION '사진이 든 칸이 아닙니다.' USING ERRCODE='22023'; END IF;
        SELECT s.value, s.ordinality INTO v_section, v_ord
        FROM jsonb_array_elements(v_post.structured_content->'sections') WITH ORDINALITY s
        WHERE public.class_agit_section_id_v1(s.value, s.ordinality) = v_sid LIMIT 1;
        v_image := v_section->'image';
        v_path := v_image->>'path';
        IF v_path IS NULL OR v_path !~ ('^' || p_post_id::TEXT || '/[A-Za-z0-9_-]{1,80}/[A-Za-z0-9_-]{1,100}[.](webp|jpg)$')
           OR NOT ((v_path ~ '[.]webp$' AND v_image->>'mimeType' = 'image/webp') OR (v_path ~ '[.]jpg$' AND v_image->>'mimeType' = 'image/jpeg'))
           OR COALESCE((v_image->>'bytes')::INTEGER,0) NOT BETWEEN 1 AND 262144
           OR COALESCE((v_image->>'width')::INTEGER,0) NOT BETWEEN 1 AND 1600
           OR COALESCE((v_image->>'height')::INTEGER,0) NOT BETWEEN 1 AND 1600
        THEN RAISE EXCEPTION '사진 정보를 확인할 수 없습니다.' USING ERRCODE='22023'; END IF;
        v_ext := CASE WHEN v_path ~ '[.]webp$' THEN 'webp' ELSE 'jpg' END;
        v_id := gen_random_uuid();
        INSERT INTO public.class_agit_item_photos(id,class_id,post_id,section_id,source_path,copy_path,mime_type,width,height,bytes,status,checked_by,check_version)
        VALUES(v_id,p_class_id,p_post_id,v_sid,v_path,p_class_id::TEXT||'/'||v_id::TEXT||'.'||v_ext,v_image->>'mimeType',
            (v_image->>'width')::INTEGER,(v_image->>'height')::INTEGER,(v_image->>'bytes')::INTEGER,'pending',v_actor,p_statement_version)
        ON CONFLICT (post_id, section_id, source_path) DO UPDATE SET
            status = CASE WHEN class_agit_item_photos.status IN ('failed','removed') THEN 'pending' ELSE class_agit_item_photos.status END,
            removed_at = NULL, checked_by = EXCLUDED.checked_by, checked_at = now(), check_version = EXCLUDED.check_version
        RETURNING * INTO v_row;
        v_rows := v_rows || jsonb_build_array(jsonb_build_object('id',v_row.id,'section_id',v_row.section_id,'status',v_row.status));
    END LOOP;
    RETURN jsonb_build_object('photos', v_rows);
END; $$;
REVOKE ALL ON FUNCTION public.confirm_class_agit_photo_use_v1(UUID,UUID,TEXT[],SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_class_agit_photo_use_v1(UUID,UUID,TEXT[],SMALLINT) TO authenticated;

-- Edge 함수가 복사할 일을 받아 간다(담당 교사가 부른다). 아직 복사 전인 사진만, 같은 학급 것만.
CREATE OR REPLACE FUNCTION public.claim_class_agit_photo_copy_v1(p_class_id UUID, p_photo_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    IF COALESCE(cardinality(p_photo_ids),0) NOT BETWEEN 1 AND 50 OR array_position(p_photo_ids,NULL) IS NOT NULL THEN
        RAISE EXCEPTION '복사할 사진을 1~50장 골라 주세요.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('photos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',ph.id,'source_path',ph.source_path,'copy_path',ph.copy_path,'mime_type',ph.mime_type,'bytes',ph.bytes))
        FROM public.class_agit_item_photos ph
        WHERE ph.class_id=p_class_id AND ph.id=ANY(p_photo_ids) AND ph.status='pending' AND ph.removed_at IS NULL
    ), '[]'::JSONB));
END; $$;
REVOKE ALL ON FUNCTION public.claim_class_agit_photo_copy_v1(UUID,UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_class_agit_photo_copy_v1(UUID,UUID[]) TO authenticated;

-- 복사 결과(서비스 권한만). 성공하면 copied, 실패하면 failed 로 둬서 다시 시도할 수 있다.
CREATE OR REPLACE FUNCTION public.finish_class_agit_photo_copy_v1(p_photo_id UUID, p_ok BOOLEAN)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    UPDATE public.class_agit_item_photos
    SET status = CASE WHEN p_ok THEN 'copied' ELSE 'failed' END, copied_at = CASE WHEN p_ok THEN now() END
    WHERE id = p_photo_id AND status = 'pending' AND removed_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.finish_class_agit_photo_copy_v1(UUID,BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_class_agit_photo_copy_v1(UUID,BOOLEAN) TO service_role;

-- 청소용(서비스 권한만): 어떤 전시·책·공개판·외부 공유에도 자리표가 없는 지 하루 넘은 복사본 목록.
CREATE OR REPLACE FUNCTION public.class_agit_orphan_photo_paths_v1()
RETURNS TABLE(photo_id UUID, copy_path TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT ph.id, ph.copy_path FROM public.class_agit_item_photos ph
    WHERE ph.checked_at < now() - INTERVAL '1 day' AND ph.removed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.class_agit_items i WHERE i.class_id=ph.class_id AND public.class_agit_json_has_photo_v1(i.snapshot, ph.id))
      AND NOT EXISTS (SELECT 1 FROM public.class_agit_book_items i WHERE i.class_id=ph.class_id AND public.class_agit_json_has_photo_v1(i.snapshot, ph.id))
      AND NOT EXISTS (SELECT 1 FROM public.class_agit_published_items i WHERE i.class_id=ph.class_id AND public.class_agit_blocks_have_photo_v1(i.blocks, ph.id))
      AND NOT EXISTS (SELECT 1 FROM public.class_agit_book_editions e WHERE e.class_id=ph.class_id AND public.class_agit_json_has_photo_v1(e.snapshot, ph.id))
      AND NOT EXISTS (SELECT 1 FROM public.class_agit_external_items i WHERE i.class_id=ph.class_id AND public.class_agit_json_has_photo_v1(i.snapshot, ph.id))
    ORDER BY ph.checked_at LIMIT 500;
$$;
REVOKE ALL ON FUNCTION public.class_agit_orphan_photo_paths_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_agit_orphan_photo_paths_v1() TO service_role;

-- ── 수록 불가 까닭: 사진 보고서 전용 문구는 더 이상 없다(글만이라도 담긴다) ───────────────────
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
    ) SELECT jsonb_agg(jsonb_build_object('id',id,'source',source,'reason',CASE WHEN source IS NULL
        THEN '현재 수록할 수 없습니다. 제출·확인·공개 상태와 장르를 확인해 주세요.' ELSE NULL END) ORDER BY n) INTO v_items FROM checked;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'items',v_items);
END; $function$;

COMMIT;
