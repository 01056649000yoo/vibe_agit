-- 모두의 아지트: 📚 문집 나눔 + 방문록(교사 승인) (2026-09-23, 선생님 결정)
--
-- 교사가 우리 반 학급 문집(글꽃 책방에서 확정한 판)을 모두의 아지트에 소개하면, 참여한 모든 반 학생이
-- 그 책을 읽고 방문록을 한 줄 남긴다. 방문록은 **문집 주인 반 교사가 승인해야** 모두에게 보인다.
-- AI 검사는 거치지 않는다(교사가 문지기). 승인되면 쓴 학생과, 그 문집에 글이 실린 학생들에게 알린다.
--
--   · 원본은 옮기지 않는다: 확정판(class_agit_book_editions) 을 가리키기만 한다. 읽을 때마다
--     class_agit_book_visible_works_v1 로 걸러 **학생이 철회한 작품은 빠진다**(우리 반 서가와 같은 규칙).
--   · 소개할 수 있는 책: 우리 반 학급 문집(book_type='class')·보관 안 됨·학생에게 보이게 한 판이 있는 것.
--     개인 문집은 소개하지 않는다. 교사가 우리 반 학생에게 가리면 이웃에게도 보이지 않는다.
--   · 한 공간에 같은 책은 한 번(새 판으로 바꾸면 방문록은 그대로 이어진다).
--   · 방문록은 학생 한 명이 책 한 권에 한 줄(200자). 고쳐 쓰면 다시 확인 대기가 된다.
--   · 공간 종료·나가기는 지금 글과 같다 — 소개와 방문록이 더 이상 보이지 않고, 우리 반 문집은 그대로다.
--   · 알림: 쓴 학생에게 "방문록이 올라갔어요"(방문록마다 1건), 글이 실린 학생에게 "우리 문집에 방문록이
--     달렸어요"(책마다 하루 1건 — 방문록이 많이 와도 알림이 넘치지 않게).

BEGIN;

CREATE TABLE IF NOT EXISTS public.neighbor_shared_books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    book_id UUID NOT NULL REFERENCES public.class_agit_books(id) ON DELETE CASCADE,
    edition_id UUID NOT NULL REFERENCES public.class_agit_book_editions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'withdrawn')),
    shared_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    withdrawn_at TIMESTAMPTZ,
    CONSTRAINT neighbor_shared_books_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL)),
    UNIQUE (space_id, book_id),
    UNIQUE (id, space_id)
);

CREATE TABLE IF NOT EXISTS public.neighbor_book_guestbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_book_id UUID NOT NULL,
    space_id UUID NOT NULL,
    class_id UUID NOT NULL,
    student_id UUID NOT NULL,
    content TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 200 AND content !~ E'[\\r\\n]'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT neighbor_book_guestbook_book_fkey
        FOREIGN KEY (shared_book_id, space_id)
        REFERENCES public.neighbor_shared_books(id, space_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_book_guestbook_membership_fkey
        FOREIGN KEY (space_id, class_id)
        REFERENCES public.neighbor_space_classes(space_id, class_id) ON DELETE CASCADE,
    CONSTRAINT neighbor_book_guestbook_student_fkey
        FOREIGN KEY (student_id, class_id)
        REFERENCES public.students(id, class_id) ON DELETE CASCADE,
    UNIQUE (shared_book_id, student_id)
);
CREATE INDEX IF NOT EXISTS neighbor_book_guestbook_pending_idx
    ON public.neighbor_book_guestbook (shared_book_id, created_at) WHERE status = 'pending';

ALTER TABLE public.neighbor_shared_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_book_guestbook ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.neighbor_shared_books, public.neighbor_book_guestbook FROM PUBLIC, anon, authenticated, service_role;

-- 지금 이웃에게 보여 줄 수 있는 소개인가(소개 중 · 소개한 반이 참여 중 · 책이 살아 있고 학생에게 보이는 판).
CREATE OR REPLACE FUNCTION public.neighbor_book_is_readable_v1(p_shared_book_id UUID, p_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.neighbor_shared_books shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id AND membership.status = 'active'
        JOIN public.class_agit_books book ON book.id = shared.book_id AND book.class_id = shared.class_id
        JOIN public.class_agit_book_editions edition ON edition.id = shared.edition_id AND edition.class_id = shared.class_id
        WHERE shared.id = p_shared_book_id AND shared.space_id = p_space_id
          AND shared.status = 'published'
          AND NOT book.archived AND book.book_type = 'class' AND edition.student_visible
    );
$$;

-- 우리 반 학급 문집 중 소개할 수 있는 것(학생에게 보이게 한 가장 최근 판).
CREATE OR REPLACE FUNCTION public.neighbor_latest_book_edition_v1(p_class_id UUID, p_book_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT edition.id
    FROM public.class_agit_book_editions edition
    JOIN public.class_agit_books book ON book.id = edition.book_id AND book.class_id = edition.class_id
    WHERE edition.class_id = p_class_id AND edition.book_id = p_book_id
      AND edition.student_visible AND NOT book.archived AND book.book_type = 'class'
    ORDER BY edition.number DESC
    LIMIT 1;
$$;

-- ───────────── 교사 ─────────────

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
            'shared_number', shared_edition.number
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

CREATE OR REPLACE FUNCTION public.share_neighbor_book_v1(p_space_id UUID, p_actor_class_id UUID, p_book_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_edition UUID;
    v_id UUID;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    v_edition := public.neighbor_latest_book_edition_v1(p_actor_class_id, p_book_id);
    IF v_edition IS NULL THEN
        RAISE EXCEPTION '우리 반 학급 문집 중 학생에게 보이게 확정한 판만 소개할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.class_agit_book_visible_works_v1(p_actor_class_id, v_edition)) THEN
        RAISE EXCEPTION '지금 읽을 수 있는 작품이 없는 문집입니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.neighbor_shared_books (space_id, class_id, book_id, edition_id, status, shared_by, shared_at)
    VALUES (p_space_id, p_actor_class_id, p_book_id, v_edition, 'published', auth.uid(), NOW())
    ON CONFLICT (space_id, book_id) DO UPDATE SET
        edition_id = EXCLUDED.edition_id,
        status = 'published',
        withdrawn_at = NULL,
        shared_by = EXCLUDED.shared_by,
        shared_at = CASE WHEN neighbor_shared_books.status = 'withdrawn' THEN NOW() ELSE neighbor_shared_books.shared_at END
    WHERE neighbor_shared_books.class_id = p_actor_class_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION '다른 학급이 소개한 문집은 바꿀 수 없습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'shared_book_id', v_id, 'edition_id', v_edition);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_neighbor_book_v1(p_space_id UUID, p_actor_class_id UUID, p_shared_book_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    UPDATE public.neighbor_shared_books
    SET status = 'withdrawn', withdrawn_at = NOW()
    WHERE id = p_shared_book_id AND space_id = p_space_id AND class_id = p_actor_class_id AND status = 'published';
    IF NOT FOUND THEN
        RAISE EXCEPTION '우리 반이 소개 중인 문집만 내릴 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'shared_book_id', p_shared_book_id);
END;
$$;

-- 방문록 승인·거절(문집 주인 반 교사). 승인된 것도 거절로 내릴 수 있다.
CREATE OR REPLACE FUNCTION public.review_neighbor_guestbook_v1(
    p_space_id UUID, p_actor_class_id UUID, p_entry_id UUID, p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_entry public.neighbor_book_guestbook%ROWTYPE;
    v_shared public.neighbor_shared_books%ROWTYPE;
    v_title TEXT;
    v_owner_class_name TEXT;
    v_writer_class_name TEXT;
    v_writer_name TEXT;
    v_contributor UUID;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION '승인 또는 거절만 할 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    SELECT entry.* INTO v_entry FROM public.neighbor_book_guestbook entry
    WHERE entry.id = p_entry_id AND entry.space_id = p_space_id
    FOR UPDATE;
    SELECT shared.* INTO v_shared FROM public.neighbor_shared_books shared WHERE shared.id = v_entry.shared_book_id;
    IF v_entry.id IS NULL OR v_shared.class_id IS DISTINCT FROM p_actor_class_id THEN
        RAISE EXCEPTION '우리 반 문집에 남겨진 방문록만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.neighbor_book_guestbook
    SET status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
        reviewed_at = NOW(), reviewed_by = auth.uid(), updated_at = NOW()
    WHERE id = p_entry_id;

    IF p_action = 'reject' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'neighbor-agit' AND event_key = format('neighbor-guestbook:%s', p_entry_id);
        RETURN jsonb_build_object('success', TRUE, 'entry_id', p_entry_id, 'status', 'rejected');
    END IF;

    SELECT edition.snapshot->>'title' INTO v_title FROM public.class_agit_book_editions edition WHERE edition.id = v_shared.edition_id;
    SELECT membership.public_class_name INTO v_owner_class_name FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.class_id = v_shared.class_id;
    SELECT membership.public_class_name INTO v_writer_class_name FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.class_id = v_entry.class_id;
    SELECT left(btrim(student.name), 30) INTO v_writer_name FROM public.students student WHERE student.id = v_entry.student_id;

    -- 알림이 실패해도 승인은 된다.
    BEGIN
        PERFORM public.notification_emit_v1(
            v_entry.student_id, 'neighbor-agit', 'neighbor.guestbook_approved', 'neighbor_shared_book', v_shared.id,
            jsonb_build_object('shared_book_id', v_shared.id, 'space_id', p_space_id, 'book_title', v_title,
                'owner_class_name', COALESCE(v_owner_class_name, '이웃 반')),
            format('neighbor-guestbook:%s', p_entry_id), 1::SMALLINT, NULL
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '방문록 승인 알림을 만들지 못했습니다(%): %', p_entry_id, SQLERRM;
    END;

    -- 그 판에 글이 실린 학생들(철회한 작품 제외)에게 책마다 하루 한 번.
    FOR v_contributor IN
        SELECT DISTINCT item.student_id
        FROM public.class_agit_book_editions edition
        CROSS JOIN LATERAL jsonb_array_elements(edition.snapshot->'works') work
        JOIN public.class_agit_book_items item
          ON item.class_id = edition.class_id AND item.book_id = edition.book_id AND item.id = (work->>'itemId')::UUID
        WHERE edition.id = v_shared.edition_id AND item.revoked_at IS NULL
          AND item.student_id IS DISTINCT FROM v_entry.student_id
    LOOP
        BEGIN
            PERFORM public.notification_emit_v1(
                v_contributor, 'neighbor-agit', 'neighbor.guestbook_received', 'neighbor_shared_book', v_shared.id,
                jsonb_build_object('shared_book_id', v_shared.id, 'space_id', p_space_id, 'book_title', v_title,
                    'actor_class_name', COALESCE(v_writer_class_name, '이웃 반'), 'actor_name', COALESCE(v_writer_name, '친구'),
                    'excerpt', left(v_entry.content, 80)),
                format('neighbor-guestbook-book:%s:%s', v_shared.id, to_char(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD')),
                1::SMALLINT, v_entry.student_id
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '방문록 알림을 만들지 못했습니다(%): %', v_contributor, SQLERRM;
        END;
    END LOOP;

    RETURN jsonb_build_object('success', TRUE, 'entry_id', p_entry_id, 'status', 'approved');
END;
$$;

-- ───────────── 학생 ─────────────

CREATE OR REPLACE FUNCTION public.get_neighbor_space_books_v1(p_space_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
            'number', edition.number,
            'shared_at', shared.shared_at,
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
$$;

-- 책 한 권(우리 반 서가와 같은 응답 모양) + 방문록. 작품 전문은 p_work_id 를 줄 때만.
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
        SELECT visible.snapshot || jsonb_build_object('id', visible.work_id) INTO v_work
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

CREATE OR REPLACE FUNCTION public.save_neighbor_guestbook_v1(p_space_id UUID, p_shared_book_id UUID, p_content TEXT, p_action TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_id UUID;
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
$$;

REVOKE ALL ON FUNCTION public.neighbor_book_is_readable_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.neighbor_latest_book_edition_v1(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_books_v1(UUID, UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.share_neighbor_book_v1(UUID, UUID, UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.withdraw_neighbor_book_v1(UUID, UUID, UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.review_neighbor_guestbook_v1(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_space_books_v1(UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_shared_book_v1(UUID, UUID, TEXT) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.save_neighbor_guestbook_v1(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_books_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_neighbor_book_v1(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_neighbor_book_v1(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_neighbor_guestbook_v1(UUID, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_space_books_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_shared_book_v1(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_neighbor_guestbook_v1(UUID, UUID, TEXT, TEXT) TO authenticated;

-- 교사 작업 공간: 운영 정의(20261310) + 확인할 방문록 수·목록.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_workspace_v1(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_base JSONB;
    v_space_id UUID;
    v_my_role TEXT;
    v_last_seen TIMESTAMPTZ;
    v_new_posts INTEGER := 0;
    v_new_comments INTEGER := 0;
    v_pending_approvals INTEGER := 0;
    v_pending_joins INTEGER := 0;
    v_blocked JSONB := '[]'::JSONB;
    v_blocked_count INTEGER := 0;
    v_guestbook JSONB := '[]'::JSONB;
    v_guestbook_count INTEGER := 0;
    v_notifications JSONB;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    v_base := public.get_neighbor_teacher_workspace_core_20261237(p_class_id);
    v_space_id := CASE WHEN v_base #>> '{space,my_status}' = 'active'
        THEN NULLIF(v_base #>> '{space,id}', '')::UUID ELSE NULL END;
    v_my_role := v_base #>> '{space,my_role}';

    IF v_space_id IS NOT NULL THEN
        v_last_seen := COALESCE((
            SELECT visit.last_seen_at FROM public.neighbor_space_teacher_visits visit
            WHERE visit.space_id = v_space_id AND visit.class_id = p_class_id
        ), NOW());

        SELECT count(*)::INTEGER INTO v_new_posts
        FROM public.neighbor_shared_posts shared
        WHERE shared.space_id = v_space_id AND shared.class_id <> p_class_id
          AND shared.status = 'published' AND shared.published_at > v_last_seen;

        SELECT count(*)::INTEGER INTO v_new_comments
        FROM public.neighbor_comments comment
        WHERE comment.space_id = v_space_id AND comment.class_id <> p_class_id
          AND comment.status = 'visible' AND comment.created_at > v_last_seen;

        SELECT count(*)::INTEGER INTO v_pending_approvals
        FROM public.neighbor_activity_approvals approval
        WHERE approval.space_id = v_space_id AND approval.class_id = p_class_id
          AND approval.status = 'pending';

        IF v_my_role = 'host' THEN
            SELECT count(*)::INTEGER INTO v_pending_joins
            FROM public.neighbor_space_classes membership
            WHERE membership.space_id = v_space_id AND membership.status = 'pending';
        END IF;

        -- 우리 반 학생이 쓴, AI가 막은 이웃 댓글(교사가 검토함에서 되살리거나 지운다).
        -- 배지에 쓰는 수는 **자르기 전 전체**를 센다. 예전에는 아래 LIMIT 100 안에서 세어
        -- 메뉴 배지(전체)와 검토함 배지(100까지)가 어긋났다(2026-09-18).
        SELECT count(*)::INTEGER INTO v_blocked_count
        FROM public.neighbor_comments comment
        WHERE comment.space_id = v_space_id AND comment.class_id = p_class_id
          AND comment.status = 'blocked';

        SELECT COALESCE(jsonb_agg(item.row ORDER BY item.created_at DESC), '[]'::JSONB)
        INTO v_blocked
        FROM (
            SELECT comment.created_at,
                jsonb_build_object(
                    'comment_id', comment.id,
                    'content', comment.content,
                    'created_at', comment.created_at,
                    'student_name', left(btrim(student.name), 30),
                    'shared_post_id', comment.shared_post_id,
                    'post_title', post.title,
                    'reason', comment.moderation_reason
                ) AS row
            FROM public.neighbor_comments comment
            JOIN public.students student
              ON student.id = comment.student_id AND student.class_id = comment.class_id
            JOIN public.neighbor_shared_posts shared ON shared.id = comment.shared_post_id
            JOIN public.student_posts post ON post.id = shared.post_id
            WHERE comment.space_id = v_space_id
              AND comment.class_id = p_class_id
              AND comment.status = 'blocked'
            ORDER BY comment.created_at DESC
            LIMIT 100
        ) item;

        -- 우리 반 문집에 들어온 방문록 중 확인할 것(20261335). 세는 문장은 자르기 전 전체.
        SELECT count(*)::INTEGER INTO v_guestbook_count
        FROM public.neighbor_book_guestbook entry
        JOIN public.neighbor_shared_books shared ON shared.id = entry.shared_book_id
        WHERE entry.space_id = v_space_id AND shared.class_id = p_class_id AND entry.status = 'pending';
        SELECT COALESCE(jsonb_agg(item.row ORDER BY item.created_at), '[]'::JSONB) INTO v_guestbook
        FROM (
            SELECT entry.updated_at AS created_at,
                jsonb_build_object(
                    'entry_id', entry.id,
                    'shared_book_id', entry.shared_book_id,
                    'book_title', edition.snapshot->>'title',
                    'student_name', left(btrim(student.name), 30),
                    'class_name', membership.public_class_name,
                    'content', entry.content,
                    'created_at', entry.updated_at
                ) AS row
            FROM public.neighbor_book_guestbook entry
            JOIN public.neighbor_shared_books shared ON shared.id = entry.shared_book_id
            JOIN public.class_agit_book_editions edition ON edition.id = shared.edition_id
            JOIN public.students student ON student.id = entry.student_id
            JOIN public.neighbor_space_classes membership
              ON membership.space_id = entry.space_id AND membership.class_id = entry.class_id
            WHERE entry.space_id = v_space_id AND shared.class_id = p_class_id AND entry.status = 'pending'
            ORDER BY entry.updated_at
            LIMIT 100
        ) item;
    END IF;

    v_notifications := jsonb_build_object(
        'pending_reviews', COALESCE((v_base->>'review_total')::INTEGER, 0),
        'pending_approvals', v_pending_approvals,
        'pending_joins', v_pending_joins,
        'new_posts', v_new_posts,
        'new_comments', v_new_comments,
        'blocked_comments', v_blocked_count,
        'pending_guestbook', v_guestbook_count
    );

    RETURN v_base || jsonb_build_object(
        'activities', CASE WHEN v_space_id IS NULL THEN '[]'::JSONB
            ELSE public.get_neighbor_teacher_activities_v1(v_space_id, p_class_id) END,
        'blocked_comments', v_blocked,
        'notifications', v_notifications,
        'pending_guestbook', v_guestbook
    );
END;
$function$;

-- 메뉴 배지: 20261333 판 + 확인할 방문록(검토함과 같은 셋).
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_badge_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space_id UUID;
    v_role TEXT;
    v_approvals INTEGER := 0;
    v_joins INTEGER := 0;
    v_blocked INTEGER := 0;
    v_guestbook INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL
       OR NOT (public.auth_user_role() = 'ADMIN'
               OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id AND c.teacher_id = auth.uid())) THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT membership.space_id, membership.role INTO v_space_id, v_role
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id
      AND membership.status = 'active'
      AND space.status = 'active'
    LIMIT 1;
    IF v_space_id IS NULL THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT count(*)::INTEGER INTO v_approvals
    FROM public.neighbor_activity_approvals approval
    WHERE approval.space_id = v_space_id AND approval.class_id = p_class_id AND approval.status = 'pending';

    SELECT count(*)::INTEGER INTO v_blocked
    FROM public.neighbor_comments comment
    WHERE comment.space_id = v_space_id AND comment.class_id = p_class_id AND comment.status = 'blocked';

    SELECT count(*)::INTEGER INTO v_guestbook
    FROM public.neighbor_book_guestbook entry
    JOIN public.neighbor_shared_books shared ON shared.id = entry.shared_book_id
    WHERE entry.space_id = v_space_id AND shared.class_id = p_class_id AND entry.status = 'pending';

    IF v_role = 'host' THEN
        SELECT count(*)::INTEGER INTO v_joins
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space_id AND membership.status = 'pending';
    END IF;

    RETURN jsonb_build_object('count', v_approvals + v_joins + v_blocked + v_guestbook);
END;
$$;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_badge_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_badge_v1(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
