-- 글꽃 책방 — 선생님이 만든 표지 그림 올리기 (2026-10-06, 계획 docs/CLASS_AGIT_COVER_UPLOAD_PLAN.md).
--
-- 규격(종이별 비율 ±1%, 최소 150dpi, JPG·PNG, 5MB)에 맞는 그림만 표지로 쓴다. 그림이 곧 표지 전체이고,
-- 목차·여는 글·간지·작품 쪽은 속지 스타일 3가지(plain·warm·fresh) 중 하나로 나온다.
-- 그림은 비공개 버킷 `class-agit-covers` 의 `<학급>/<문집>/<무작위>.jpg|png` — 덮어쓰지 않는다(옛 확정판이 옛 파일을 가리킨다).
-- 종이 크기 원본은 src/modules/class-agit/designs.js 의 BOOK_PAPERS — tests/classAgitCoverImage.test.mjs 가 두 곳을 맞춰 본다.

ALTER TABLE public.class_agit_books ADD COLUMN IF NOT EXISTS cover_image JSONB;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('class-agit-covers', 'class-agit-covers', FALSE, 5242880, ARRAY['image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 그림 파일을 읽고(쓰고) 될지: 담당 교사는 읽기·쓰기, 그 반 학생은 읽기,
-- 모두의 아지트에 공유 중인 문집이면 같은 공간의 반(교사·학생)도 읽기.
CREATE OR REPLACE FUNCTION public.can_access_class_agit_cover_v1(p_path TEXT, p_write BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND COALESCE((
        SELECT
            (c.teacher_id = auth.uid() AND public.class_agit_class_is_allowed_v1(c.id) AND (NOT p_write OR NOT b.archived))
            OR (NOT p_write AND public.auth_user_role() = 'ADMIN')
            OR (NOT p_write AND public.auth_student_id() IS NOT NULL AND public.auth_user_class_id() = c.id)
            OR (NOT p_write AND EXISTS (
                SELECT 1 FROM public.neighbor_shared_books s
                JOIN public.neighbor_space_classes owner_m ON owner_m.space_id = s.space_id AND owner_m.class_id = s.class_id AND owner_m.status = 'active'
                JOIN public.neighbor_space_classes reader_m ON reader_m.space_id = s.space_id AND reader_m.status = 'active'
                WHERE s.book_id = b.id AND s.class_id = c.id AND s.status = 'published'
                  AND (s.shared_until IS NULL OR s.shared_until > NOW())
                  AND (reader_m.class_id = public.auth_user_class_id()
                       OR reader_m.class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid() AND deleted_at IS NULL))
            ))
        FROM public.classes c
        JOIN public.class_agit_books b ON b.class_id = c.id
        WHERE c.id::TEXT = split_part(p_path, '/', 1)
          AND b.id::TEXT = split_part(p_path, '/', 2)
          AND c.deleted_at IS NULL
    ), FALSE);
$$;
REVOKE ALL ON FUNCTION public.can_access_class_agit_cover_v1(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_class_agit_cover_v1(TEXT, BOOLEAN) TO authenticated;

DROP POLICY IF EXISTS "Class_Agit_Covers_Select_V1" ON storage.objects;
DROP POLICY IF EXISTS "Class_Agit_Covers_Insert_V1" ON storage.objects;
DROP POLICY IF EXISTS "Class_Agit_Covers_Delete_V1" ON storage.objects;
CREATE POLICY "Class_Agit_Covers_Select_V1" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'class-agit-covers' AND public.can_access_class_agit_cover_v1(name, FALSE));
CREATE POLICY "Class_Agit_Covers_Insert_V1" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'class-agit-covers'
        AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{8,80}[.](jpg|png)$'
        AND public.can_access_class_agit_cover_v1(name, TRUE));
CREATE POLICY "Class_Agit_Covers_Delete_V1" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'class-agit-covers' AND public.can_access_class_agit_cover_v1(name, TRUE));

-- 표지 그림 켜기·끄기. 서버가 규격을 다시 본다(브라우저 검사만 믿지 않는다).
CREATE OR REPLACE FUNCTION public.class_agit_set_cover_image_v1(p_class_id UUID, p_action TEXT, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_book public.class_agit_books%ROWTYPE;
    v_path TEXT := btrim(COALESCE(p_payload->>'path', ''));
    v_width INTEGER;
    v_height INTEGER;
    v_style TEXT := COALESCE(NULLIF(p_payload->>'inner_style', ''), 'plain');
    v_object RECORD;
    v_pw NUMERIC; v_ph NUMERIC;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_book FROM public.class_agit_books
    WHERE class_id = p_class_id AND id = NULLIF(p_payload->>'book_id', '')::UUID FOR UPDATE;
    IF NOT FOUND OR v_book.archived THEN RAISE EXCEPTION '문집 초안을 찾을 수 없습니다.' USING ERRCODE = '42501'; END IF;

    IF p_action = 'clear_cover_image' THEN
        UPDATE public.class_agit_books SET cover_image = NULL WHERE id = v_book.id;
        RETURN public.get_class_agit_book_workspace_v1(p_class_id, v_book.id);
    END IF;

    IF v_style NOT IN ('plain', 'warm', 'fresh') THEN RAISE EXCEPTION '속지 스타일을 확인해 주세요.' USING ERRCODE = '22023'; END IF;
    IF v_path !~ ('^' || p_class_id::TEXT || '/' || v_book.id::TEXT || '/[A-Za-z0-9_-]{8,80}[.](jpg|png)$') THEN
        RAISE EXCEPTION '표지 그림 위치가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    SELECT name, metadata INTO v_object FROM storage.objects WHERE bucket_id = 'class-agit-covers' AND name = v_path;
    IF NOT FOUND THEN RAISE EXCEPTION '올린 표지 그림을 찾을 수 없습니다. 다시 올려 주세요.' USING ERRCODE = '22023'; END IF;
    IF COALESCE(v_object.metadata->>'mimetype', '') NOT IN ('image/jpeg', 'image/png') THEN
        RAISE EXCEPTION '표지 그림은 JPG·PNG 만 쓸 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF COALESCE((v_object.metadata->>'size')::BIGINT, 0) NOT BETWEEN 1 AND 5242880 THEN
        RAISE EXCEPTION '표지 그림은 5MB 이하여야 합니다.' USING ERRCODE = '22023';
    END IF;

    v_width := NULLIF(p_payload->>'width', '')::INTEGER;
    v_height := NULLIF(p_payload->>'height', '')::INTEGER;
    -- 종이 크기(mm) — designs.js BOOK_PAPERS 와 같아야 한다.
    SELECT w, h INTO v_pw, v_ph FROM (VALUES ('A4', 210::NUMERIC, 297::NUMERIC), ('A5', 148, 210), ('B5', 182, 257)) AS paper(id, w, h)
    WHERE id = v_book.paper_format;
    IF v_width IS NULL OR v_height IS NULL OR v_pw IS NULL THEN RAISE EXCEPTION '표지 그림 크기를 확인해 주세요.' USING ERRCODE = '22023'; END IF;
    IF abs((v_width::NUMERIC / v_height) / (v_pw / v_ph) - 1) > 0.01 THEN
        RAISE EXCEPTION '% 표지는 가로:세로가 %:% 비율이어야 합니다.', v_book.paper_format, v_pw, v_ph USING ERRCODE = '22023';
    END IF;
    IF v_width < round(v_pw / 25.4 * 150) THEN
        RAISE EXCEPTION '% 표지는 가로 %px 이상이어야 합니다.', v_book.paper_format, round(v_pw / 25.4 * 150) USING ERRCODE = '22023';
    END IF;

    UPDATE public.class_agit_books SET cover_image = jsonb_build_object(
        'path', v_path, 'width', v_width, 'height', v_height,
        'mime', v_object.metadata->>'mimetype', 'bytes', (v_object.metadata->>'size')::BIGINT,
        'paper', v_book.paper_format, 'inner_style', v_style, 'uploaded_at', NOW()
    ) WHERE id = v_book.id;
    RETURN public.get_class_agit_book_workspace_v1(p_class_id, v_book.id);
END;
$$;
REVOKE ALL ON FUNCTION public.class_agit_set_cover_image_v1(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- 확정판 기록에 표지 그림을 담는다(발행 때 고정).
CREATE OR REPLACE FUNCTION public.class_agit_book_draft_snapshot_v1(p_class_id uuid, p_book_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_book public.class_agit_books%ROWTYPE; v_old public.class_agit_book_items%ROWTYPE; v_source JSONB; v_items JSONB:='[]'; v_owner TEXT;
BEGIN
    SELECT * INTO v_book FROM public.class_agit_books WHERE class_id=p_class_id AND id=p_book_id FOR SHARE;
    IF NOT FOUND OR v_book.archived THEN RAISE EXCEPTION '문집 초안을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF v_book.book_type='personal' THEN
        SELECT left(name,30) INTO v_owner FROM public.students WHERE class_id=p_class_id AND id=v_book.owner_student_id;
        IF v_owner IS NULL THEN RAISE EXCEPTION '개인 문집의 학생을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    END IF;
    PERFORM p.id FROM public.student_posts p JOIN public.class_agit_book_items i ON i.class_id=p.class_id AND i.post_id=p.id
        WHERE p.class_id=p_class_id AND i.book_id=p_book_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p;
    FOR v_old IN SELECT * FROM public.class_agit_book_items WHERE class_id=p_class_id AND book_id=p_book_id AND removed_at IS NULL ORDER BY position,id LOOP
        v_source:=public.class_agit_current_source_v1(p_class_id,v_old.post_id);
        IF v_source IS NULL OR v_old.revoked_at IS NOT NULL THEN RAISE EXCEPTION '수록할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
        IF v_book.book_type='personal' AND (v_source->>'student_id')::UUID IS DISTINCT FROM v_book.owner_student_id THEN
            RAISE EXCEPTION '개인 문집에는 선택한 학생의 글만 담을 수 있습니다.' USING ERRCODE='42501'; END IF;
        IF v_old.source_revision IS DISTINCT FROM v_source->>'source_revision' THEN RAISE EXCEPTION '원글 전문을 다시 확인하고 저장해 주세요.' USING ERRCODE='PT409'; END IF;
        v_items:=v_items||jsonb_build_array(v_old.snapshot||jsonb_build_object('itemId',v_old.id,'sourceId',v_old.post_id,'consentId',v_old.consent_id));
    END LOOP;
    IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION '문집에는 1~300편의 작품이 필요합니다.' USING ERRCODE='23514'; END IF;
    RETURN jsonb_build_object('title',v_book.title,'subtitle',v_book.subtitle,'cover_kicker',v_book.cover_kicker,'introduction',v_book.introduction,
        'class_label',v_book.class_label,'issue_date',v_book.issue_date,'grouping',v_book.grouping,'page_breaks',v_book.page_breaks,
        'book_type',v_book.book_type,'owner_student_id',v_book.owner_student_id,'owner_student_name',v_owner,'cover_image',v_book.cover_image,
        'print',jsonb_build_object('paper',v_book.paper_format,'design',v_book.design_id,'layout',v_book.page_layout,'body_pt',12,'poem_pt',14,'version',2),'works',v_items);
END; $function$;

-- 학생 서가 목록에도 표지 그림.
CREATE OR REPLACE FUNCTION public.get_my_class_agit_books_v1(p_edition_id uuid DEFAULT NULL::uuid, p_work_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_class UUID; v_student UUID:=public.auth_student_id(); v_ed public.class_agit_book_editions%ROWTYPE; v_books JSONB; v_works JSONB; v_work JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_edition_id IS NULL THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY created_at DESC,id DESC),'[]') INTO v_books FROM (
            SELECT e.id,e.number,e.created_at,e.snapshot->>'title' AS title,e.snapshot->>'subtitle' AS subtitle,COALESCE(e.snapshot->'print'->>'design','botanical') AS design,COALESCE(e.snapshot->'print'->>'paper','A4') AS paper,e.snapshot->>'book_type' AS book_type,e.snapshot->'cover_image' AS cover_image
            FROM public.class_agit_book_editions e JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
            WHERE e.class_id=v_class AND e.student_visible AND (b.book_type='class' OR b.owner_student_id=v_student) ORDER BY e.created_at DESC,e.id DESC LIMIT 120) q;
        RETURN jsonb_build_object('version',1,'books',v_books);
    END IF;
    SELECT e.* INTO v_ed FROM public.class_agit_book_editions e JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
        WHERE e.class_id=v_class AND e.id=p_edition_id AND e.student_visible AND (b.book_type='class' OR b.owner_student_id=v_student);
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 문집을 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    IF p_work_id IS NOT NULL THEN SELECT (snapshot - 'sourceId' - 'studentId')||jsonb_build_object('id',work_id) INTO v_work FROM public.class_agit_book_visible_works_v1(v_class,p_edition_id) WHERE work_id=p_work_id; IF v_work IS NULL THEN RAISE EXCEPTION '이 작품은 지금 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    ELSE SELECT COALESCE(jsonb_agg(jsonb_build_object('id',work_id,'title',snapshot->>'title','author',snapshot->>'author','group',snapshot->>'group') ORDER BY sort_position),'[]') INTO v_works FROM public.class_agit_book_visible_works_v1(v_class,p_edition_id); END IF;
    RETURN jsonb_build_object('version',1,'id',v_ed.id,'number',v_ed.number,'book',(v_ed.snapshot-'works'-'print')||jsonb_build_object('design',COALESCE(v_ed.snapshot->'print'->>'design','botanical'),'paper',COALESCE(v_ed.snapshot->'print'->>'paper','A4')),'works',v_works,'work',v_work);
END; $function$;

-- 모두의 아지트 문집 도서관(공간·내 공유 목록)에도 표지 그림.
CREATE OR REPLACE FUNCTION public.get_neighbor_space_books_v1(p_space_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_books JSONB;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'shared_at' DESC), '[]'::JSONB) INTO v_books
    FROM (
        SELECT jsonb_build_object(
            'shared_book_id', shared.id,
            'class_name', membership.public_class_name,
            'is_own_class', shared.class_id = v_class_id,
            'title', edition.snapshot->>'title',
            'subtitle', COALESCE(edition.snapshot->>'subtitle', ''),
            'design', COALESCE(edition.snapshot->'print'->>'design', 'botanical'),
            'paper', COALESCE(edition.snapshot->'print'->>'paper', 'A4'),
            'cover_image', edition.snapshot->'cover_image',
            'number', edition.number,
            'shared_at', shared.shared_at,
            'shared_until', shared.shared_until,
            'guestbook_count', (
                SELECT count(*) FROM public.neighbor_book_guestbook entry
                JOIN public.neighbor_space_classes writer
                  ON writer.space_id = entry.space_id AND writer.class_id = entry.class_id AND writer.status = 'active'
                WHERE entry.shared_book_id = shared.id AND entry.status = 'approved'),
            'my_entry_status', (SELECT entry.status FROM public.neighbor_book_guestbook entry
                WHERE entry.shared_book_id = shared.id AND entry.student_id = v_student_id)
        ) AS item
        FROM public.neighbor_shared_books shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
        JOIN public.class_agit_book_editions edition ON edition.id = shared.edition_id
        WHERE shared.space_id = p_space_id AND public.neighbor_book_is_readable_v1(shared.id, p_space_id)
        LIMIT 60
    ) books;
    RETURN jsonb_build_object('version', 1, 'books', v_books);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_books_v1(p_space_id uuid, p_actor_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_mine JSONB;
    v_shared JSONB;
    v_approved JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);

    -- 우리 반 학급 문집과 소개 상태.
    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'updated_at' DESC), '[]'::JSONB) INTO v_mine
    FROM (
        SELECT jsonb_build_object(
            'book_id', book.id,
            'title', book.title,
            'updated_at', book.updated_at,
            'latest_edition_id', latest.id,
            'latest_number', latest.number,
            'work_count', (SELECT count(*) FROM public.class_agit_book_visible_works_v1(p_actor_class_id, latest.id)),
            'shared_book_id', shared.id,
            'shared_status', shared.status,
            'guestbook_min_chars', shared.guestbook_min_chars,
            'shared_until', shared.shared_until,
            'shared_number', shared_edition.number,
            -- 소개하기가 왜 꺼졌는지 화면이 정확히 말하게: 보이기 여부와 상관없는 가장 최근 판 번호, 표지 디자인.
            'any_edition_number', (SELECT max(edition.number) FROM public.class_agit_book_editions edition
                WHERE edition.class_id = book.class_id AND edition.book_id = book.id),
            'design', book.design_id,
            'paper', book.paper_format,
            'cover_image', book.cover_image
        ) AS item
        FROM public.class_agit_books book
        LEFT JOIN LATERAL (
            SELECT edition.id, edition.number FROM public.class_agit_book_editions edition
            WHERE edition.class_id = book.class_id AND edition.book_id = book.id AND edition.student_visible
            ORDER BY edition.number DESC LIMIT 1
        ) latest ON TRUE
        LEFT JOIN public.neighbor_shared_books shared ON shared.space_id = p_space_id AND shared.book_id = book.id
        LEFT JOIN public.class_agit_book_editions shared_edition ON shared_edition.id = shared.edition_id
        WHERE book.class_id = p_actor_class_id AND NOT book.archived AND book.book_type = 'class'
        LIMIT 60
    ) mine;

    -- 공간에 소개된 책(모든 참여 반).
    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'shared_at' DESC), '[]'::JSONB) INTO v_shared
    FROM (
        SELECT jsonb_build_object(
            'shared_book_id', shared.id,
            'class_id', shared.class_id,
            'class_name', membership.public_class_name,
            'is_own_class', shared.class_id = p_actor_class_id,
            'title', edition.snapshot->>'title',
            'number', edition.number,
            'shared_at', shared.shared_at,
            'guestbook_min_chars', shared.guestbook_min_chars,
            'shared_until', shared.shared_until,
            'approved_count', (SELECT count(*) FROM public.neighbor_book_guestbook entry WHERE entry.shared_book_id = shared.id AND entry.status = 'approved'),
            'pending_count', (SELECT count(*) FROM public.neighbor_book_guestbook entry WHERE entry.shared_book_id = shared.id AND entry.status = 'pending')
        ) AS item
        FROM public.neighbor_shared_books shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id AND membership.status = 'active'
        JOIN public.class_agit_book_editions edition ON edition.id = shared.edition_id
        WHERE shared.space_id = p_space_id AND shared.status = 'published'
        LIMIT 100
    ) shared_list;

    -- 우리 반 문집에 올라간 방문록(내릴 수 있게).
    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'reviewed_at' DESC), '[]'::JSONB) INTO v_approved
    FROM (
        SELECT jsonb_build_object(
            'entry_id', entry.id,
            'shared_book_id', entry.shared_book_id,
            'book_title', edition.snapshot->>'title',
            'student_name', left(btrim(student.name), 30),
            'class_name', membership.public_class_name,
            'content', entry.content,
            'reviewed_at', entry.reviewed_at
        ) AS item
        FROM public.neighbor_book_guestbook entry
        JOIN public.neighbor_shared_books shared ON shared.id = entry.shared_book_id
        JOIN public.class_agit_book_editions edition ON edition.id = shared.edition_id
        JOIN public.students student ON student.id = entry.student_id
        JOIN public.neighbor_space_classes membership ON membership.space_id = entry.space_id AND membership.class_id = entry.class_id
        WHERE entry.space_id = p_space_id AND shared.class_id = p_actor_class_id AND entry.status = 'approved'
        ORDER BY entry.reviewed_at DESC
        LIMIT 100
    ) approved;

    RETURN jsonb_build_object('version', 1, 'my_books', v_mine, 'shared_books', v_shared, 'approved_entries', v_approved);
END;
$function$;

-- 저장 바깥 층: 그림 켜기·끄기, 종이를 바꾸면 그림 표지 끄기.
CREATE OR REPLACE FUNCTION public.run_class_agit_book_action_v1(p_class_id uuid, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_book public.class_agit_books%ROWTYPE;
    v_type TEXT;
    v_owner UUID;
    v_result JSONB;
BEGIN
    -- 선생님이 만든 표지 그림(2026-10-06): 올린 그림을 표지로 쓰거나 끈다.
    IF p_action IN ('set_cover_image','clear_cover_image') THEN
        RETURN public.class_agit_set_cover_image_v1(p_class_id,p_action,p_payload);
    END IF;
    IF p_action <> 'save' THEN
        RETURN public.run_class_agit_book_cover_core(p_class_id,p_action,p_payload);
    END IF;

    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_book FROM public.class_agit_books
    WHERE class_id=p_class_id AND id=NULLIF(p_payload->>'book_id','')::UUID FOR UPDATE;
    IF NOT FOUND OR v_book.archived THEN RAISE EXCEPTION '문집 초안을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;

    v_type:=COALESCE(NULLIF(p_payload->>'book_type',''),v_book.book_type);
    v_owner:=NULLIF(p_payload->>'owner_student_id','')::UUID;
    IF v_type NOT IN ('class','personal') THEN RAISE EXCEPTION '문집 종류를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    IF v_type='class' THEN v_owner:=NULL; END IF;
    IF v_type='personal' AND v_owner IS NULL THEN RAISE EXCEPTION '개인 문집에 담을 학생을 선택해 주세요.' USING ERRCODE='23514'; END IF;

    IF v_type IS DISTINCT FROM v_book.book_type OR v_owner IS DISTINCT FROM v_book.owner_student_id THEN
        IF EXISTS (SELECT 1 FROM public.class_agit_book_editions WHERE class_id=p_class_id AND book_id=v_book.id) THEN
            RAISE EXCEPTION '확정판이 있는 문집은 종류를 바꿀 수 없습니다.' USING ERRCODE='23514';
        END IF;
        IF v_type='personal' AND NOT EXISTS (
            SELECT 1 FROM public.students WHERE id=v_owner AND class_id=p_class_id AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE
        ) THEN RAISE EXCEPTION '개인 문집에 담을 학생을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        IF v_type='personal' AND EXISTS (
            SELECT 1 FROM public.class_agit_books WHERE class_id=p_class_id AND book_type='personal' AND owner_student_id=v_owner AND id<>v_book.id
        ) THEN RAISE EXCEPTION '이 학생의 개인 문집이 이미 있습니다.' USING ERRCODE='23505'; END IF;
        IF v_type='personal' AND EXISTS (
            SELECT 1 FROM public.class_agit_book_items i
            JOIN public.student_posts p ON p.id=i.post_id AND p.class_id=i.class_id
            WHERE i.class_id=p_class_id AND i.book_id=v_book.id AND i.removed_at IS NULL AND p.student_id IS DISTINCT FROM v_owner
        ) THEN RAISE EXCEPTION '개인 문집에는 선택한 학생의 글만 담을 수 있습니다.' USING ERRCODE='23514'; END IF;

        UPDATE public.class_agit_books SET
            book_type=v_type,
            owner_student_id=v_owner,
            cover_kicker=CASE
                WHEN v_type='personal' AND cover_kicker='우리 반의 이야기' THEN '나의 글 모음'
                WHEN v_type='class' AND cover_kicker='나의 글 모음' THEN '우리 반의 이야기'
                ELSE cover_kicker
            END
        WHERE class_id=p_class_id AND id=v_book.id;
    END IF;

    v_result:=public.run_class_agit_book_cover_core(p_class_id,p_action,p_payload);
    -- 종이 크기를 바꾸면 올린 그림의 비율이 맞지 않는다 — 그림 표지를 끄고 디자인 표지로 돌아간다.
    UPDATE public.class_agit_books SET cover_image=NULL
    WHERE class_id=p_class_id AND id=v_book.id AND cover_image IS NOT NULL AND cover_image->>'paper' IS DISTINCT FROM paper_format;
    IF FOUND THEN RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_book.id); END IF;
    RETURN v_result;
END; $function$;
