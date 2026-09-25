-- 문집 도서관 게시 기한 (2026-09-25, 선생님 요청: 문집 게시 기한을 정하거나 정하지 않을 수 있게)
--
--   · neighbor_shared_books.shared_until(없으면 기한 없음). 바꾸는 사람: 그 문집을 소개한 반 교사(set_neighbor_book_shared_until_v1).
--   · 기한이 지나면 **바로** 학생이 못 연다 — 목록·읽기·방문록이 모두 거치는 neighbor_book_is_readable_v1 에 조건을 넣었다.
--     그리고 5분마다 withdraw_due_neighbor_books_v1 이 소개를 내린다(같이 쓰기 광장 자동 종료와 같은 방식).
--   · 다시 소개하면(내린 뒤 또는 기한이 지난 뒤) 기한을 비운다 — 지난 기한 때문에 곧바로 다시 내려가지 않게.

BEGIN;

ALTER TABLE public.neighbor_shared_books ADD COLUMN IF NOT EXISTS shared_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_neighbor_book_shared_until_v1(
    p_space_id UUID, p_actor_class_id UUID, p_shared_book_id UUID, p_shared_until TIMESTAMPTZ)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changed INTEGER;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF p_shared_until IS NOT NULL AND p_shared_until <= NOW() THEN
        RAISE EXCEPTION '게시 기한은 지금 이후로 정해 주세요.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.neighbor_shared_books
    SET shared_until = p_shared_until
    WHERE id = p_shared_book_id AND space_id = p_space_id AND class_id = p_actor_class_id AND status = 'published';
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    IF v_changed = 0 THEN
        RAISE EXCEPTION '우리 반이 소개 중인 문집만 정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'shared_book_id', p_shared_book_id, 'shared_until', p_shared_until);
END;
$$;
REVOKE ALL ON FUNCTION public.set_neighbor_book_shared_until_v1(UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_neighbor_book_shared_until_v1(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated;

-- 기한이 지난 소개를 내린다(예약 작업 전용).
CREATE OR REPLACE FUNCTION public.withdraw_due_neighbor_books_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.neighbor_shared_books
    SET status = 'withdrawn', withdrawn_at = NOW()
    WHERE status = 'published' AND shared_until IS NOT NULL AND shared_until <= NOW();
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_due_neighbor_books_v1() FROM PUBLIC, anon, authenticated, service_role;

SELECT cron.unschedule('neighbor-withdraw-due-books')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'neighbor-withdraw-due-books');
SELECT cron.schedule(
    'neighbor-withdraw-due-books', '*/5 * * * *',
    $job$SELECT public.withdraw_due_neighbor_books_v1()$job$
);

-- 읽을 수 있는가: 운영 정의 + 게시 기한.
CREATE OR REPLACE FUNCTION public.neighbor_book_is_readable_v1(p_shared_book_id uuid, p_space_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.neighbor_shared_books shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id AND membership.status = 'active'
        JOIN public.class_agit_books book ON book.id = shared.book_id AND book.class_id = shared.class_id
        JOIN public.class_agit_book_editions edition ON edition.id = shared.edition_id AND edition.class_id = shared.class_id
        WHERE shared.id = p_shared_book_id AND shared.space_id = p_space_id
          AND shared.status = 'published'
          AND (shared.shared_until IS NULL OR shared.shared_until > NOW())
          AND NOT book.archived AND book.book_type = 'class' AND edition.student_visible
    );
$function$;

-- 소개하기: 운영 정의 + 다시 소개할 때 기한 비우기.
CREATE OR REPLACE FUNCTION public.share_neighbor_book_v1(p_space_id uuid, p_actor_class_id uuid, p_book_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        shared_at = CASE WHEN neighbor_shared_books.status = 'withdrawn' THEN NOW() ELSE neighbor_shared_books.shared_at END,
        -- 내린 뒤 다시 소개하거나 기한이 이미 지났으면 기한을 비운다(판만 바꿀 때는 그대로).
        shared_until = CASE WHEN neighbor_shared_books.status = 'withdrawn'
                             OR neighbor_shared_books.shared_until <= NOW() THEN NULL
                            ELSE neighbor_shared_books.shared_until END
    WHERE neighbor_shared_books.class_id = p_actor_class_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION '다른 학급이 소개한 문집은 바꿀 수 없습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'shared_book_id', v_id, 'edition_id', v_edition);
END;
$function$;

-- 학생 문집 목록: 운영 정의 + 게시 기한(카드에 '~까지').
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

-- 교사 문집 목록: 운영 정의 + 게시 기한.
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

NOTIFY pgrst, 'reload schema';

COMMIT;
