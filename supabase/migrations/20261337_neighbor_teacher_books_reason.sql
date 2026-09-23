-- 모두의 아지트 📚 문집 나눔: 교사 문집 목록에 "소개하기가 꺼진 이유" 와 표지 디자인을 싣는다 (2026-09-23)
--
-- 소개하기는 "확정한 판이 있고 그 판을 학생에게 보이게 한" 학급 문집만 켜진다. 예전 화면은
-- "학생에게 보이는 판이 없어요" 한 줄뿐이라, 아직 확정을 안 한 건지·확정했는데 가려 둔 건지 알 수 없었다.
-- any_edition_number(보이기와 상관없는 최근 판)를 더해 화면이 할 일을 정확히 안내하고 글꽃 책방으로 보낸다.
-- 표지 디자인(design·paper)은 목록을 작은 표지 카드로 그리는 데 쓴다. 나머지는 20261335 판과 같다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_books_v1(p_space_id UUID, p_actor_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
