-- 문집 도서관 방명록 최소 글자 수 (2026-09-25, 선생님 요청)
--
--   · 소개한 문집마다 guestbook_min_chars(기본 100, 1~200). 방명록 최대 200자·한 줄 규칙은 그대로라 최소는 200을 넘을 수 없다.
--   · 바꾸는 사람: 그 문집을 소개한 반의 교사(set_neighbor_book_guestbook_min_v1).
--   · 저장 때 서버가 막는다(save_neighbor_guestbook_v1). 이미 쓰인 방명록은 건드리지 않고, 다시 고쳐 쓸 때 새 기준을 적용한다.
--   · 교사 문집 목록(get_neighbor_teacher_books_v1)과 학생 문집 읽기(get_neighbor_shared_book_v1 의 guestbook.min_chars)에 싣는다.

BEGIN;

ALTER TABLE public.neighbor_shared_books
    ADD COLUMN IF NOT EXISTS guestbook_min_chars SMALLINT NOT NULL DEFAULT 100;
ALTER TABLE public.neighbor_shared_books DROP CONSTRAINT IF EXISTS neighbor_shared_books_guestbook_min_chars_check;
ALTER TABLE public.neighbor_shared_books ADD CONSTRAINT neighbor_shared_books_guestbook_min_chars_check
    CHECK (guestbook_min_chars BETWEEN 1 AND 200);

CREATE OR REPLACE FUNCTION public.set_neighbor_book_guestbook_min_v1(
    p_space_id UUID, p_actor_class_id UUID, p_shared_book_id UUID, p_min_chars INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed INTEGER;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF p_min_chars IS NULL OR p_min_chars NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '방문록 최소 글자 수는 1~200자로 정해 주세요.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.neighbor_shared_books
    SET guestbook_min_chars = p_min_chars
    WHERE id = p_shared_book_id AND space_id = p_space_id AND class_id = p_actor_class_id;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF v_changed = 0 THEN
        RAISE EXCEPTION '우리 반이 소개한 문집만 정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'shared_book_id', p_shared_book_id, 'guestbook_min_chars', p_min_chars);
END;
$$;
REVOKE ALL ON FUNCTION public.set_neighbor_book_guestbook_min_v1(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_neighbor_book_guestbook_min_v1(UUID, UUID, UUID, INTEGER) TO authenticated;

-- 방문록 저장: 운영 정의 + 최소 글자 수.
CREATE OR REPLACE FUNCTION public.save_neighbor_guestbook_v1(p_space_id uuid, p_shared_book_id uuid, p_content text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_id UUID;
    v_min INTEGER;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    IF NOT public.neighbor_book_is_readable_v1(p_shared_book_id, p_space_id) THEN
        RAISE EXCEPTION '지금은 이 문집에 방문록을 남길 수 없어요.' USING ERRCODE = '42501';
    END IF;

    IF p_action = 'delete' THEN
        DELETE FROM public.neighbor_book_guestbook
        WHERE shared_book_id = p_shared_book_id AND student_id = v_student_id
        RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN
            DELETE FROM public.student_notification_events
            WHERE module_id = 'neighbor-agit' AND event_key = format('neighbor-guestbook:%s', v_id);
        END IF;
        RETURN jsonb_build_object('success', TRUE, 'status', 'deleted');
    END IF;
    IF p_action <> 'save' THEN
        RAISE EXCEPTION '방문록 동작이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_content) NOT BETWEEN 1 AND 200 OR v_content ~ E'[\\r\\n]' THEN
        RAISE EXCEPTION '방문록은 줄바꿈 없이 1~200자로 써 주세요.' USING ERRCODE = '22023';
    END IF;
    -- 문집을 소개한 반 선생님이 정한 최소 글자 수(기본 100, 20261346).
    SELECT shared.guestbook_min_chars INTO v_min FROM public.neighbor_shared_books shared WHERE shared.id = p_shared_book_id;
    IF char_length(v_content) < COALESCE(v_min, 1) THEN
        RAISE EXCEPTION '이 문집의 방문록은 %자 이상 써 주세요. (지금 %자)', v_min, char_length(v_content) USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.neighbor_book_guestbook (shared_book_id, space_id, class_id, student_id, content, status)
    VALUES (p_shared_book_id, p_space_id, v_class_id, v_student_id, v_content, 'pending')
    ON CONFLICT (shared_book_id, student_id) DO UPDATE SET
        content = EXCLUDED.content, status = 'pending', updated_at = NOW(), reviewed_at = NULL, reviewed_by = NULL
    RETURNING id INTO v_id;
    -- 고쳐 쓰면 다시 확인을 받는다. 올라갔다는 알림은 거둔다.
    DELETE FROM public.student_notification_events
    WHERE module_id = 'neighbor-agit' AND event_key = format('neighbor-guestbook:%s', v_id);

    RETURN jsonb_build_object('success', TRUE, 'entry_id', v_id, 'status', 'pending');
END;
$function$;

-- 교사 문집 목록: 운영 정의 + 방문록 최소 글자 수.
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
            'shared_number', shared_edition.number,
            -- 소개하기가 왜 꺼졌는지 화면이 정확히 말하게: 보이기 여부와 상관없는 가장 최근 판 번호, 표지 디자인.
            'any_edition_number', (SELECT max(edition.number) FROM public.class_agit_book_editions edition
                WHERE edition.class_id = book.class_id AND edition.book_id = book.id),
            'design', book.design_id,
            'paper', book.paper_format
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

-- 학생 문집 읽기: 운영 정의 + guestbook.min_chars.
CREATE OR REPLACE FUNCTION public.get_neighbor_shared_book_v1(p_space_id uuid, p_shared_book_id uuid, p_work_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            'min_chars', v_shared.guestbook_min_chars,
            'owner_class_name', (SELECT membership.public_class_name FROM public.neighbor_space_classes membership
                WHERE membership.space_id = p_space_id AND membership.class_id = v_shared.class_id)));
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
