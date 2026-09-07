-- 알림에 "누가 했는지"를 id 로 남긴다(2026-09-07, 사용자 요청).
--
-- 문제: 알림은 `최윤 친구가 ‘가을 소풍’에 반응을 남겼어요` 처럼 **사람 이름을 글자로 박아** 둔다.
-- 행동한 학생의 id 가 없어서, 이름을 고칠 때 옛 이름 글자로만 찾을 수 있었다. 그러면 같은 반
-- 동명이인의 알림까지 함께 바뀌므로 `61261` 은 동명이인일 때 아예 건너뛰었다.
-- 운영에 실제로 한 반 두 명이 있어 그 학생들은 이름을 고쳐도 알림이 옛 이름으로 남는다.
--
-- 고침: `actor_student_id` 를 두고 앞으로 쌓이는 알림에 채운다. 그러면 동명이인이어도
-- 그 학생 알림만 정확히 고칠 수 있다.
--
-- **이미 쌓인 6,920건은 소급하지 않는다**(사용자 결정: 지난 알림은 의미 없다).
-- 누가 했는지 알 수 있는 자료가 지금 남아 있지 않아 되살릴 방법도 없다.
-- 그래서 이름 글자로 더듬던 방식은 **버린다** — 옛 알림은 옛 이름 그대로 두는 편이
-- 남의 알림을 잘못 바꾸는 것보다 낫다.
BEGIN;

ALTER TABLE public.student_notification_events
    ADD COLUMN IF NOT EXISTS actor_student_id UUID;

-- 이름 고치기가 이 열로 찾는다. 알림은 학생별로 많아 부분 색인을 둔다.
CREATE INDEX IF NOT EXISTS student_notification_events_actor_idx
    ON public.student_notification_events (actor_student_id)
    WHERE actor_student_id IS NOT NULL;

-- 알림을 만드는 곳은 이 함수 하나뿐이라 여기서만 받으면 된다.
-- 기존 호출은 인자를 안 넘기므로 그대로 동작한다(행동한 사람이 학생이 아닌 알림도 많다).
DROP FUNCTION IF EXISTS public.notification_emit_v1(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, SMALLINT);
CREATE OR REPLACE FUNCTION public.notification_emit_v1(
    p_student_id UUID, p_module_id TEXT, p_event_type TEXT, p_entity_type TEXT, p_entity_id UUID,
    p_payload JSONB, p_event_key TEXT, p_event_version SMALLINT DEFAULT 1,
    p_actor_student_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_event_id UUID;
BEGIN
    IF p_student_id IS NULL THEN
        RAISE EXCEPTION '알림을 받을 학생이 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_module_id, ''))) NOT BETWEEN 1 AND 60
      OR char_length(btrim(COALESCE(p_event_type, ''))) NOT BETWEEN 1 AND 100
      OR char_length(btrim(COALESCE(p_event_key, ''))) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '알림 식별자가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_entity_type IS NOT NULL AND char_length(btrim(p_entity_type)) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION '알림 대상 종류가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_event_version IS NULL OR p_event_version < 1 THEN
        RAISE EXCEPTION '알림 이벤트 버전은 1 이상이어야 합니다.' USING ERRCODE = '22023';
    END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR pg_column_size(p_payload) > 8192 THEN
        RAISE EXCEPTION '알림 부가 정보는 8KB 이하 JSON 객체여야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.class_id
    INTO v_class_id
    FROM public.students student
    JOIN public.classes class ON class.id = student.class_id
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION '활성 학생과 학급을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.student_notification_events (
        class_id, student_id, module_id, event_type, event_version,
        entity_type, entity_id, payload, event_key, actor_student_id
    ) VALUES (
        v_class_id, p_student_id, btrim(p_module_id), btrim(p_event_type), p_event_version,
        NULLIF(btrim(COALESCE(p_entity_type, '')), ''), p_entity_id, p_payload, btrim(p_event_key),
        p_actor_student_id
    )
    ON CONFLICT (student_id, event_key) DO NOTHING
    RETURNING id INTO v_event_id;

    IF v_event_id IS NULL THEN
        SELECT event.id INTO v_event_id
        FROM public.student_notification_events event
        WHERE event.student_id = p_student_id
          AND event.event_key = btrim(p_event_key);
    END IF;
    RETURN v_event_id;
END;
$$;

-- 학생이 행동한 알림은 이 둘뿐이다(반응·댓글). 나머지는 선생님이나 앱이 만든다.
CREATE OR REPLACE FUNCTION public.emit_feedback_reaction_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
    v_post_title TEXT;
    v_actor_name TEXT;
BEGIN
    SELECT post.student_id, left(COALESCE(post.title, ''), 80)
    INTO v_owner_id, v_post_title
    FROM public.student_posts post
    WHERE post.id = NEW.post_id;
    IF v_owner_id IS NULL OR v_owner_id = NEW.student_id THEN
        RETURN NEW;
    END IF;

    -- notification_emit_v1은 비활성 학생·삭제 학급에서 예외를 던진다. 트리거 안에서
    -- 예외가 나면 반응 저장 자체가 막히므로 같은 조건을 미리 걸러 조용히 건너뛴다.
    IF NOT EXISTS (
        SELECT 1
        FROM public.students student
        JOIN public.classes class ON class.id = student.class_id
        WHERE student.id = v_owner_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND class.deleted_at IS NULL
    ) THEN
        RETURN NEW;
    END IF;

    SELECT student.name INTO v_actor_name
    FROM public.students student
    WHERE student.id = NEW.student_id;

    PERFORM public.notification_emit_v1(
        v_owner_id, 'feedback', 'feedback.reaction_received', 'student_post', NEW.post_id,
        jsonb_build_object(
            'post_id', NEW.post_id,
            'post_title', v_post_title,
            'actor_name', COALESCE(v_actor_name, '친구'),
            'reaction_type', NEW.reaction_type
        ),
        format('reaction:%s', NEW.id),
        1::SMALLINT,
        NEW.student_id
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.emit_feedback_comment_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
    v_post_title TEXT;
    v_actor_name TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'feedback'
          AND event_key = format('comment:%s', OLD.id);
        RETURN OLD;
    END IF;

    -- 승인이 풀린 댓글(반려·보류)은 학생 화면에서 사라져야 하므로 알림도 회수한다.
    IF NEW.status IS DISTINCT FROM 'approved' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'feedback'
          AND event_key = format('comment:%s', NEW.id);
        RETURN NEW;
    END IF;

    SELECT post.student_id, post.title
    INTO v_owner_id, v_post_title
    FROM public.student_posts post
    WHERE post.id = NEW.post_id;

    -- 내가 내 글에 단 댓글은 알리지 않는다. 선생님 댓글은 항상 알린다.
    IF v_owner_id IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.teacher_id IS NULL AND (NEW.student_id IS NULL OR NEW.student_id = v_owner_id) THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.students student
        JOIN public.classes class ON class.id = student.class_id
        WHERE student.id = v_owner_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND class.deleted_at IS NULL
    ) THEN
        RETURN NEW;
    END IF;

    IF NEW.teacher_id IS NOT NULL THEN
        v_actor_name := '선생님';
    ELSE
        SELECT student.name INTO v_actor_name
        FROM public.students student
        WHERE student.id = NEW.student_id;
        v_actor_name := COALESCE(v_actor_name, '친구');
    END IF;

    -- 같은 댓글이 다시 승인돼도 event_key가 같아 notification_emit_v1이 중복을 막는다.
    -- 이미 확인한 알림이 다시 미확인으로 돌아가지 않는다.
    PERFORM public.notification_emit_v1(
        v_owner_id, 'feedback', 'feedback.comment_received', 'student_post', NEW.post_id,
        jsonb_build_object(
            'post_id', NEW.post_id,
            'post_title', v_post_title,
            'actor_name', v_actor_name,
            'is_teacher', NEW.teacher_id IS NOT NULL,
            'excerpt', left(COALESCE(NEW.content, ''), 120)
        ),
        format('comment:%s', NEW.id),
        1::SMALLINT,
        -- 선생님 댓글은 학생이 아니므로 비운다.
        CASE WHEN NEW.teacher_id IS NULL THEN NEW.student_id END
    );
    RETURN NEW;
END;
$$;

-- 이름 고치기는 이제 id 로 정확히 찾는다. 이름 글자로 더듬던 방식과 동명이인 예외를 함께 버린다.
CREATE OR REPLACE FUNCTION public.rename_class_student_v1(p_student_id UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_name TEXT := btrim(COALESCE(p_name, ''));
    v_marathon INTEGER := 0;
    v_neighbor INTEGER := 0;
    v_book INTEGER := 0;
    v_exhibition INTEGER := 0;
    v_notice INTEGER := 0;
BEGIN
    SELECT s.class_id INTO v_class_id
      FROM public.students s WHERE s.id = p_student_id AND s.deleted_at IS NULL;
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '학생을 찾을 수 없습니다.' USING ERRCODE = '42704';
    END IF;
    PERFORM public.assert_class_roster_editor_v1(v_class_id);

    -- 학생 추가와 같은 기준을 쓴다(1~30자).
    IF char_length(v_name) NOT BETWEEN 1 AND 30 THEN
        RAISE EXCEPTION '학생 이름은 1~30자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.students SET name = v_name WHERE id = p_student_id;

    -- 아래는 모두 **실명을 복사해 둔 곳**이다. 오타를 고치는 것이 목적이므로 함께 고친다.
    -- 전부 학생 id 로 찾으므로 동명이인이어도 그 학생 것만 바뀐다.
    -- 글·댓글·포인트 내역은 학생 id 로만 이어져 있어 손댈 것이 없다.
    UPDATE public.reading_marathon_participants
       SET name_snapshot = v_name
     WHERE student_id = p_student_id AND name_snapshot IS DISTINCT FROM v_name;
    GET DIAGNOSTICS v_marathon = ROW_COUNT;

    UPDATE public.neighbor_shared_posts
       SET public_author_name = left(v_name, 30)
     WHERE student_id = p_student_id AND public_author_name IS DISTINCT FROM left(v_name, 30);
    GET DIAGNOSTICS v_neighbor = ROW_COUNT;

    UPDATE public.class_agit_book_items
       SET snapshot = jsonb_set(snapshot, '{author}', to_jsonb(v_name))
     WHERE student_id = p_student_id AND snapshot->>'author' IS DISTINCT FROM v_name;
    GET DIAGNOSTICS v_book = ROW_COUNT;

    -- 글꽃 전시관 작품 지은이. 학급 공개 발행본의 지은이가 이 값에서 나온다.
    UPDATE public.class_agit_items
       SET snapshot = jsonb_set(snapshot, '{authorName}', to_jsonb(v_name))
     WHERE student_id = p_student_id AND snapshot->>'authorName' IS DISTINCT FROM v_name;
    GET DIAGNOSTICS v_exhibition = ROW_COUNT;

    -- 알림 문구에 박힌 사람 이름. `61262` 부터 쌓인 알림만 행동한 학생 id 를 갖는다.
    -- 그 전 알림은 누가 했는지 알 길이 없어 옛 이름 그대로 둔다(지난 알림은 곧 지나간다).
    UPDATE public.student_notification_events
       SET payload = jsonb_set(payload, '{actor_name}', to_jsonb(v_name))
     WHERE actor_student_id = p_student_id AND payload->>'actor_name' IS DISTINCT FROM v_name;
    GET DIAGNOSTICS v_notice = ROW_COUNT;

    RETURN jsonb_build_object('status', 'ok', 'id', p_student_id, 'name', v_name,
        'synced', jsonb_build_object('marathon', v_marathon, 'neighbor', v_neighbor, 'book', v_book,
            'exhibition', v_exhibition, 'notification', v_notice));
END;
$$;

REVOKE ALL ON FUNCTION public.rename_class_student_v1(UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rename_class_student_v1(UUID, TEXT) TO authenticated;

COMMIT;
