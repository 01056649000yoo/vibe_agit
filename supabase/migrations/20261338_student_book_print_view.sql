-- 학생도 문집을 "책으로" 본다: 교사 미리보기와 같은 모양의 확정판 전체 (2026-09-23, 선생님 요청)
--
-- 지금 학생은 문집을 열면 차례(제목·글쓴이)만 보고 작품을 한 편씩 연다. 교사 미리보기처럼 표지·여는 글·
-- 차례·본문 쪽으로 넘겨 보게, 교사 미리보기가 쓰는 확정판 모양(get_class_agit_book_edition_v1 과 같은
-- {version,id,number,created_at,book:{…print, works:[…blocks]}})을 학생 권한으로 돌려준다.
--
--   · 작품은 읽을 때마다 class_agit_book_visible_works_v1 로 걸러 **철회한 작품은 빠진다**(교사 판처럼 멈추지 않고
--     남은 작품만 보여 준다 — 학생은 고칠 수 없으므로).
--   · 학생·원본 id 는 싣지 않는다(owner_student_id 제거, 작품의 itemId·consentId 는 visible_works 가 이미 뺀다).
--   · 모두의 아지트(이웃 반 문집)와 우리 반 서가(글꽃 책방) 두 길. 읽는 자격은 각자의 기존 판정 그대로다.
--   · 함께 고친다: 학생이 작품 한 편을 열면 거절되던 문제(아래 '고침' 참고).

BEGIN;

-- 학생에게 줄 작품 목록: 철회 작품 제외(visible_works) + 원글 id(sourceId·studentId) 제거.
-- 교사가 정한 쪽 넘김(page_breaks = 원글 id 목록)은 차례 id 로 바꿔, 작품의 sourceId 도 차례 id 로 둔다 —
-- 미리보기 렌더러(print.js)는 page_breaks 와 work.sourceId 를 맞춰 보기만 하므로 쪽 배치는 교사 판과 같다.
CREATE OR REPLACE FUNCTION public.class_agit_student_book_works_v1(p_class_id UUID, p_edition_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH edition AS (
        SELECT e.snapshot FROM public.class_agit_book_editions e WHERE e.class_id = p_class_id AND e.id = p_edition_id
    ), source_map AS (
        SELECT 'chapter-' || w.ordinality AS work_id, w.value->>'sourceId' AS source_id
        FROM edition CROSS JOIN LATERAL jsonb_array_elements(edition.snapshot->'works') WITH ORDINALITY w
    )
    SELECT jsonb_build_object(
        'works', COALESCE((
            SELECT jsonb_agg((visible.snapshot - 'sourceId' - 'studentId')
                || jsonb_build_object('id', visible.work_id, 'sourceId', visible.work_id) ORDER BY visible.sort_position)
            FROM public.class_agit_book_visible_works_v1(p_class_id, p_edition_id) visible), '[]'::JSONB),
        'page_breaks', COALESCE((
            SELECT jsonb_agg(source_map.work_id)
            FROM source_map, edition
            WHERE source_map.source_id IS NOT NULL
              AND jsonb_typeof(edition.snapshot->'page_breaks') = 'array'
              AND edition.snapshot->'page_breaks' ? source_map.source_id), '[]'::JSONB)
    );
$$;
REVOKE ALL ON FUNCTION public.class_agit_student_book_works_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;

-- 모두의 아지트 📚 문집 나눔: 소개된 이웃 반 문집을 책 모양으로.
CREATE OR REPLACE FUNCTION public.get_neighbor_shared_book_print_v1(p_space_id UUID, p_shared_book_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shared public.neighbor_shared_books%ROWTYPE;
    v_edition public.class_agit_book_editions%ROWTYPE;
    v_works JSONB;
BEGIN
    PERFORM public.assert_neighbor_student_access_v1(p_space_id);
    IF NOT public.neighbor_book_is_readable_v1(p_shared_book_id, p_space_id) THEN
        RAISE EXCEPTION '지금은 이 문집을 읽을 수 없어요.' USING ERRCODE = '42501';
    END IF;
    SELECT shared.* INTO v_shared FROM public.neighbor_shared_books shared WHERE shared.id = p_shared_book_id;
    SELECT edition.* INTO v_edition FROM public.class_agit_book_editions edition WHERE edition.id = v_shared.edition_id;
    v_works := public.class_agit_student_book_works_v1(v_shared.class_id, v_edition.id);
    RETURN jsonb_build_object('version', 1, 'id', v_edition.id, 'number', v_edition.number, 'created_at', v_edition.created_at,
        'book', (v_edition.snapshot - 'works' - 'owner_student_id' - 'page_breaks') || v_works);
END;
$$;

-- 우리 반 서가(글꽃 책방): 학생에게 공개한 확정판을 책 모양으로. 자격은 get_my_class_agit_books_v1 과 같다.
CREATE OR REPLACE FUNCTION public.get_my_class_agit_book_print_v1(p_edition_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class UUID;
    v_student UUID := public.auth_student_id();
    v_edition public.class_agit_book_editions%ROWTYPE;
    v_works JSONB;
BEGIN
    v_class := public.class_agit_reader_class_v1();
    SELECT edition.* INTO v_edition FROM public.class_agit_book_editions edition
    JOIN public.class_agit_books book ON book.class_id = edition.class_id AND book.id = edition.book_id AND NOT book.archived
    WHERE edition.class_id = v_class AND edition.id = p_edition_id AND edition.student_visible
      AND (book.book_type = 'class' OR book.owner_student_id = v_student);
    IF NOT FOUND THEN
        RAISE EXCEPTION '지금은 이 문집을 읽을 수 없어요.' USING ERRCODE = '42501';
    END IF;
    v_works := public.class_agit_student_book_works_v1(v_class, v_edition.id);
    RETURN jsonb_build_object('version', 1, 'id', v_edition.id, 'number', v_edition.number, 'created_at', v_edition.created_at,
        'book', (v_edition.snapshot - 'works' - 'owner_student_id' - 'page_breaks') || v_works);
END;
$$;


-- ───── 고침: 학생이 작품 한 편을 열면 "문집 응답을 확인하지 못했어요" ─────
-- 20261296 부터 확정판 작품에 원글 id(sourceId)가 실리는데, 학생 응답 검사(studentContract.js)는 허용한 칸만
-- 받아 작품 응답을 거절했다 → 학생은 차례(제목·글쓴이)만 보고 글을 못 열었다(우리 반 서가·모두의 아지트 모두).
-- 학생에게는 원글 id 를 보내지 않는 것이 맞으므로 서버에서 뺀다(검사를 느슨하게 하지 않는다).
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
            SELECT e.id,e.number,e.created_at,e.snapshot->>'title' AS title,e.snapshot->>'subtitle' AS subtitle,COALESCE(e.snapshot->'print'->>'design','botanical') AS design,COALESCE(e.snapshot->'print'->>'paper','A4') AS paper,e.snapshot->>'book_type' AS book_type
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

CREATE OR REPLACE FUNCTION public.get_neighbor_shared_book_v1(p_space_id UUID, p_shared_book_id UUID, p_work_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_shared public.neighbor_shared_books%ROWTYPE;
    v_edition public.class_agit_book_editions%ROWTYPE;
    v_works JSONB;
    v_work JSONB;
    v_entries JSONB;
    v_mine JSONB;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    IF NOT public.neighbor_book_is_readable_v1(p_shared_book_id, p_space_id) THEN
        RAISE EXCEPTION '지금은 이 문집을 읽을 수 없어요.' USING ERRCODE = '42501';
    END IF;
    SELECT shared.* INTO v_shared FROM public.neighbor_shared_books shared WHERE shared.id = p_shared_book_id;
    SELECT edition.* INTO v_edition FROM public.class_agit_book_editions edition WHERE edition.id = v_shared.edition_id;

    IF p_work_id IS NOT NULL THEN
        SELECT (visible.snapshot - 'sourceId' - 'studentId') || jsonb_build_object('id', visible.work_id) INTO v_work
        FROM public.class_agit_book_visible_works_v1(v_shared.class_id, v_edition.id) visible
        WHERE visible.work_id = p_work_id;
        IF v_work IS NULL THEN
            RAISE EXCEPTION '이 작품은 지금 읽을 수 없어요.' USING ERRCODE = '42501';
        END IF;
        RETURN jsonb_build_object('version', 1, 'id', v_edition.id, 'number', v_edition.number,
            'book', (v_edition.snapshot - 'works' - 'print' - 'owner_student_id' - 'owner_student_name')
                || jsonb_build_object('design', COALESCE(v_edition.snapshot->'print'->>'design', 'botanical'),
                                      'paper', COALESCE(v_edition.snapshot->'print'->>'paper', 'A4')),
            'works', NULL, 'work', v_work);
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', visible.work_id, 'title', visible.snapshot->>'title',
            'author', visible.snapshot->>'author', 'group', COALESCE(visible.snapshot->>'group', '')) ORDER BY visible.sort_position), '[]'::JSONB)
    INTO v_works
    FROM public.class_agit_book_visible_works_v1(v_shared.class_id, v_edition.id) visible;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'entry_id', entry.id, 'student_name', left(btrim(student.name), 30), 'class_name', writer.public_class_name,
            'content', entry.content, 'is_mine', entry.student_id = v_student_id, 'created_at', entry.reviewed_at
        ) ORDER BY entry.reviewed_at DESC), '[]'::JSONB)
    INTO v_entries
    FROM (
        SELECT * FROM public.neighbor_book_guestbook g
        WHERE g.shared_book_id = p_shared_book_id AND g.status = 'approved'
        ORDER BY g.reviewed_at DESC LIMIT 100
    ) entry
    JOIN public.students student ON student.id = entry.student_id
    JOIN public.neighbor_space_classes writer
      ON writer.space_id = entry.space_id AND writer.class_id = entry.class_id AND writer.status = 'active';

    SELECT jsonb_build_object('entry_id', entry.id, 'content', entry.content, 'status', entry.status) INTO v_mine
    FROM public.neighbor_book_guestbook entry
    WHERE entry.shared_book_id = p_shared_book_id AND entry.student_id = v_student_id;

    RETURN jsonb_build_object('version', 1, 'id', v_edition.id, 'number', v_edition.number,
        'book', (v_edition.snapshot - 'works' - 'print' - 'owner_student_id' - 'owner_student_name')
            || jsonb_build_object('design', COALESCE(v_edition.snapshot->'print'->>'design', 'botanical'),
                                  'paper', COALESCE(v_edition.snapshot->'print'->>'paper', 'A4')),
        'works', v_works, 'work', NULL,
        'guestbook', jsonb_build_object('entries', v_entries, 'mine', v_mine,
            'owner_class_name', (SELECT membership.public_class_name FROM public.neighbor_space_classes membership
                WHERE membership.space_id = p_space_id AND membership.class_id = v_shared.class_id)));
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_shared_book_print_v1(UUID, UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_my_class_agit_book_print_v1(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_neighbor_shared_book_print_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_book_print_v1(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
