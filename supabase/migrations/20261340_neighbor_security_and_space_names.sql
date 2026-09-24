-- 모두의 아지트 보안 점검 고침 + 세 공간 새 이름 (2026-09-24)
--
--   ① 다른 반이 숨긴 글을 교사 상세로 계속 열 수 있었다. 2026-09-19 결정(숨긴 글은 올린 학급에게만)이
--      목록(20261320)에만 걸리고 글 상세 get_neighbor_teacher_post_detail_v1 에는 빠져 있었다.
--      → hidden 은 자기 학급 글일 때만.
--   ② 댓글을 새로 쓰거나 고칠 때마다 AI 검사가 다시 돌아, 한 학생이 수백 번 고치면 그만큼 AI 를 불렀다.
--      우리 반 댓글(create/update_my_post_comment_v1)과 이웃 댓글(save_neighbor_comment_v1)이 같은 큐를 쓰므로
--      **학생 한 명이 10분에 AI 검사 요청 20번**을 한 곳(consume_comment_review_quota_v1)에서 센다.
--      넘으면 PT429(HTTP 429) — 저장 자체가 되돌려진다.
--   ③ 세 공간 새 이름: 글 나눔 공간 → 이웃 글 마당, 함께 쓰는 주제 → 같이 쓰기 광장, 문집 나눔 → 문집 도서관.
--      서버 문구 두 곳과, 주제 과제에 붙는 보이는 태그(`함께 쓰는 주제` → `같이 쓰기 광장`)를 바꾼다.
--      화면이 과제를 알아보는 태그 `이웃 아지트` 는 그대로 둔다.

BEGIN;

-- ② AI 검사 요청 기록(학생별 최근 10분만 의미 있다). 표에는 누구도 직접 접근하지 않는다.
CREATE TABLE IF NOT EXISTS public.comment_review_submissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comment_review_submissions_student_idx
    ON public.comment_review_submissions (student_id, submitted_at DESC);
ALTER TABLE public.comment_review_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.comment_review_submissions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_comment_review_quota_v1(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recent INTEGER;
BEGIN
    -- 같은 학생의 요청이 동시에 들어와도 한 줄로 센다.
    PERFORM pg_advisory_xact_lock(hashtextextended('comment_review_quota:' || p_student_id::TEXT, 0));
    DELETE FROM public.comment_review_submissions
    WHERE student_id = p_student_id AND submitted_at < NOW() - INTERVAL '1 day';
    SELECT count(*)::INTEGER INTO v_recent
    FROM public.comment_review_submissions
    WHERE student_id = p_student_id AND submitted_at > NOW() - INTERVAL '10 minutes';
    IF v_recent >= 20 THEN
        RAISE EXCEPTION '댓글을 너무 자주 쓰거나 고쳤어요. 10분쯤 뒤에 다시 해 주세요.' USING ERRCODE = 'PT429';
    END IF;
    INSERT INTO public.comment_review_submissions (student_id) VALUES (p_student_id);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_comment_review_quota_v1(UUID) FROM PUBLIC, anon, authenticated;

-- ② 우리 반 댓글 쓰기: 운영 정의 + 요청 횟수.
CREATE OR REPLACE FUNCTION public.create_my_post_comment_v1(p_post_id uuid, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_post public.student_posts%ROWTYPE;
    v_comment public.post_comments%ROWTYPE;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_student FROM public.students
    WHERE auth_id = auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501'; END IF;
    IF char_length(regexp_replace(v_content, '\s', '', 'g')) < 8 OR char_length(v_content) > 1000 THEN
        RAISE EXCEPTION '댓글은 8~1000자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_post FROM public.student_posts
    WHERE id = p_post_id AND class_id = v_student.class_id
      AND is_submitted IS TRUE AND visibility = 'class';
    IF v_post.id IS NULL THEN RAISE EXCEPTION '댓글을 남길 수 있는 글이 아닙니다.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.post_comments(
        post_id, student_id, class_id, content, status,
        ai_review_attempts, ai_review_enqueued_at, ai_review_next_at,
        ai_review_lease_until, ai_review_last_error_code, ai_review_token
    ) VALUES (
        p_post_id, v_student.id, v_student.class_id, v_content, 'pending',
        0, v_now, v_now, NULL, NULL, NULL
    ) RETURNING * INTO v_comment;
    PERFORM public.consume_comment_review_quota_v1(v_student.id);
    RETURN jsonb_build_object('version', 2, 'comment', to_jsonb(v_comment) || jsonb_build_object('student_name', v_student.name));
END;
$function$;

-- ② 우리 반 댓글 고치기: 운영 정의 + 요청 횟수.
CREATE OR REPLACE FUNCTION public.update_my_post_comment_v1(p_comment_id uuid, p_content text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_comment public.post_comments%ROWTYPE;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_student FROM public.students
    WHERE auth_id = auth.uid() AND is_active IS DISTINCT FROM false AND deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501'; END IF;
    IF char_length(regexp_replace(v_content, '\s', '', 'g')) < 8 OR char_length(v_content) > 1000 THEN
        RAISE EXCEPTION '댓글은 8~1000자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.post_comments SET
        content = v_content,
        status = 'pending',
        moderation_reason = NULL,
        moderated_at = NULL,
        moderated_by = NULL,
        ai_review_token = NULL,
        ai_review_attempts = 0,
        ai_review_enqueued_at = v_now,
        ai_review_next_at = v_now,
        ai_review_lease_until = NULL,
        ai_review_last_error_code = NULL
    WHERE id = p_comment_id
      AND student_id = v_student.id
      AND class_id = v_student.class_id
      AND ai_review_token IS NULL
    RETURNING * INTO v_comment;
    IF v_comment.id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.post_comments
            WHERE id = p_comment_id AND student_id = v_student.id AND ai_review_token IS NOT NULL
        ) THEN
            RAISE EXCEPTION '댓글을 검사하고 있어요. 잠시 후에 다시 고쳐 주세요.' USING ERRCODE = '55000';
        END IF;
        RAISE EXCEPTION '수정할 수 있는 댓글이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    PERFORM public.consume_comment_review_quota_v1(v_student.id);
    RETURN jsonb_build_object('version', 2, 'comment', to_jsonb(v_comment) || jsonb_build_object('student_name', v_student.name));
END;
$function$;

-- ② 이웃 댓글 저장: 운영 정의 + 요청 횟수(삭제는 AI 검사가 없어 세지 않는다).
CREATE OR REPLACE FUNCTION public.save_neighbor_comment_v1(p_space_id uuid, p_shared_post_id uuid, p_content text, p_action text DEFAULT 'save'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_owner_student_id UUID;
    v_student_name TEXT;
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_comment public.neighbor_comments%ROWTYPE;
    v_public_class_name TEXT;
    v_comment_count INTEGER;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF p_action NOT IN ('save', 'delete') THEN
        RAISE EXCEPTION '댓글 작업이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'save' AND (char_length(v_content) NOT BETWEEN 1 AND 300 OR v_content ~ E'[\r\n]') THEN
        RAISE EXCEPTION '댓글은 줄바꿈 없이 1~300자로 작성해 주세요.' USING ERRCODE = '22023';
    END IF;
    SELECT access.requester_student_id, access.requester_class_id, access.owner_student_id
    INTO v_student_id, v_class_id, v_owner_student_id
    FROM public.assert_neighbor_student_post_access_v1(p_space_id, p_shared_post_id) access;
    SELECT left(btrim(student.name), 30) INTO v_student_name
    FROM public.students student WHERE student.id = v_student_id AND student.class_id = v_class_id;

    SELECT comment.* INTO v_comment FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.student_id = v_student_id FOR UPDATE;

    IF p_action = 'delete' THEN
        -- 검사 대기 중인 내 댓글도 거둘 수 있어야 한다.
        IF v_comment.id IS NULL OR v_comment.status NOT IN ('visible', 'pending') THEN
            RAISE EXCEPTION '삭제할 내 댓글이 없습니다.' USING ERRCODE = '55000';
        END IF;
        UPDATE public.neighbor_comments
        SET content = '', status = 'deleted', hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = '',
            ai_review_token = NULL, ai_review_next_at = NULL, ai_review_lease_until = NULL
        WHERE id = v_comment.id RETURNING * INTO v_comment;
    ELSIF v_comment.id IS NULL THEN
        INSERT INTO public.neighbor_comments (
            shared_post_id, space_id, class_id, student_id, content, status,
            ai_review_attempts, ai_review_enqueued_at, ai_review_next_at,
            ai_review_lease_until, ai_review_last_error_code, ai_review_token)
        VALUES (p_shared_post_id, p_space_id, v_class_id, v_student_id, v_content, 'pending',
            0, v_now, v_now, NULL, NULL, NULL)
        RETURNING * INTO v_comment;
    ELSE
        IF v_comment.status = 'hidden' THEN
            RAISE EXCEPTION '선생님이 숨긴 댓글은 직접 다시 공개할 수 없습니다.' USING ERRCODE = '42501';
        END IF;
        -- 고쳐 쓴 댓글도 처음처럼 다시 검사받는다. 검사 뒤 몰래 바꿔치기하지 못하게 한다.
        UPDATE public.neighbor_comments
        SET content = v_content, status = 'pending',
            hidden_at = NULL, hidden_by = NULL, hidden_by_class_id = NULL, hidden_reason = '',
            moderation_reason = NULL, moderated_at = NULL, moderated_by = NULL,
            ai_review_attempts = 0, ai_review_enqueued_at = v_now, ai_review_next_at = v_now,
            ai_review_lease_until = NULL, ai_review_last_error_code = NULL, ai_review_token = NULL
        WHERE id = v_comment.id RETURNING * INTO v_comment;
    END IF;

    IF p_action = 'save' THEN
        PERFORM public.consume_comment_review_quota_v1(v_student_id);
    END IF;

    SELECT membership.public_class_name INTO v_public_class_name
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.class_id = v_class_id
      AND membership.status = 'active';
    SELECT count(*)::INTEGER INTO v_comment_count FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible';

    -- 원장 기록 모양은 예전 그대로 둔다(표에 허용된 event_type·열만 쓴다).
    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_class_id, auth.uid(), 'student', 'comment_changed', 'comment', v_comment.id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', v_comment.status,
        'comment_id', v_comment.id,
        'comment_count', v_comment_count,
        -- 화면이 “검사 중”을 알려 줄 수 있어야 아이가 댓글이 사라진 줄 알지 않는다.
        'pending_review', v_comment.status = 'pending',
        'comment', CASE WHEN v_comment.status = 'visible' THEN jsonb_build_object(
            'comment_id', v_comment.id, 'content', v_comment.content,
            'author_name', v_student_name, 'class_name', v_public_class_name,
            'created_at', v_comment.created_at, 'updated_at', v_comment.updated_at, 'is_mine', TRUE
        ) ELSE NULL END);
END;
$function$;

-- ① 교사 글 상세: 숨긴 글은 자기 학급 것만.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_post_detail_v1(p_space_id uuid, p_actor_class_id uuid, p_shared_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_result JSONB;
    v_comments JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT shared.* INTO v_shared FROM public.neighbor_shared_posts shared
    WHERE shared.id = p_shared_post_id AND shared.space_id = p_space_id
      AND (shared.status = 'published' OR (shared.class_id = p_actor_class_id AND shared.status IN ('hidden', 'pending')));
    IF v_shared.id IS NULL THEN
        RAISE EXCEPTION '확인할 수 있는 이웃 글이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_build_object(
        'version', 1, 'shared_post_id', shared.id, 'activity_id', shared.activity_id,
        'source_revision', public.neighbor_source_revision_v1(post), 'title', post.title, 'content', post.content, 'author_name', shared.public_author_name,
        'class_name', membership.public_class_name, 'status', shared.status,
        'is_own_class', shared.class_id = p_actor_class_id, 'published_at', shared.published_at
    ) INTO v_result
    FROM public.neighbor_shared_posts shared
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
    JOIN public.student_posts post
      ON post.id = shared.post_id AND post.class_id = shared.class_id AND post.student_id = shared.student_id
    WHERE shared.id = p_shared_post_id AND public.neighbor_source_is_shareable_v1(post)
      AND membership.status = 'active'
      AND (shared.status = 'published'
           OR (shared.class_id = p_actor_class_id AND shared.status IN ('hidden', 'pending')));
    IF v_result IS NULL THEN RAISE EXCEPTION '공유할 수 없는 원글입니다.' USING ERRCODE = '42501'; END IF;

    SELECT COALESCE(jsonb_agg(comment_row.item ORDER BY comment_row.created_at, comment_row.comment_id), '[]'::JSONB)
    INTO v_comments
    FROM (
        SELECT comment.id AS comment_id, comment.created_at,
            jsonb_build_object(
                'comment_id', comment.id, 'content', comment.content, 'status', comment.status,
                'author_name', left(btrim(comment_student.name), 30),
                'class_name', membership.public_class_name,
                'is_own_class', comment.class_id = p_actor_class_id,
                'created_at', comment.created_at
            ) AS item
        FROM public.neighbor_comments comment
        JOIN public.students comment_student
          ON comment_student.id = comment.student_id AND comment_student.class_id = comment.class_id
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = comment.space_id AND membership.class_id = comment.class_id
        WHERE comment.shared_post_id = p_shared_post_id
          AND (comment.status = 'visible' OR (comment.status = 'hidden' AND comment.class_id = p_actor_class_id))
        ORDER BY comment.created_at, comment.id LIMIT 100
    ) comment_row;
    RETURN v_result || jsonb_build_object('comments', v_comments);
END;
$function$;

-- ③ 주제 제안: 문구와 과제 태그만 새 이름.
CREATE OR REPLACE FUNCTION public.create_neighbor_activity_v1(p_space_id uuid, p_actor_class_id uuid, p_activity_type text, p_title text, p_prompt text, p_exchange_class_ids uuid[] DEFAULT NULL::uuid[], p_exchange_share_scope text DEFAULT 'partners'::text, p_genre text DEFAULT NULL::text, p_guide_questions jsonb DEFAULT NULL::jsonb, p_min_chars integer DEFAULT NULL::integer, p_min_paragraphs integer DEFAULT NULL::integer, p_mission_type_id text DEFAULT NULL::text, p_base_reward integer DEFAULT NULL::integer, p_bonus_threshold integer DEFAULT NULL::integer, p_bonus_reward integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_class_id UUID;
    v_mission_id UUID;
    v_class_ids UUID[];
    v_min_students INTEGER;
    v_max_students INTEGER;
    -- 과제 만들기와 같은 값을 받는다. 안 보내면 예전처럼 기본값으로 만든다.
    v_genre TEXT := NULLIF(btrim(COALESCE(p_genre, '')), '');
    v_questions JSONB := CASE WHEN jsonb_typeof(p_guide_questions) = 'array'
        THEN p_guide_questions ELSE '[]'::JSONB END;
    v_min_chars INTEGER := COALESCE(p_min_chars, 50);
    v_min_paragraphs INTEGER := COALESCE(p_min_paragraphs, 1);
    -- 전용 틀이 있는 글 종류(시·편지·보고서·회의)는 `mission_type`·`input_template` 에 그 틀 id 가 들어간다.
    -- 자유 글쓰기는 둘 다 글 종류 이름과 `freeform` 이다(운영 자료에서 확인한 모양 그대로).
    v_type_id TEXT := NULLIF(btrim(COALESCE(p_mission_type_id, '')), '');
    -- 포인트는 학급 과제와 같은 기준으로 받는다(2026-09-07 선생님 결정).
    -- 예전에는 0 으로 박혀 있어 이웃 주제로 쓴 글만 포인트가 없었다.
    v_base_reward INTEGER := COALESCE(p_base_reward, 0);
    v_bonus_threshold INTEGER := COALESCE(p_bonus_threshold, 0);
    v_bonus_reward INTEGER := COALESCE(p_bonus_reward, 0);
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.status = 'active'
    ) THEN
        RAISE EXCEPTION '현재 활동을 제안할 수 있는 이웃 공간이 아닙니다.' USING ERRCODE = '55000';
    END IF;
    -- 2026-09-06: 글짝 교환 활동을 제품에서 뺐다. 아래 exchange 분기는 도달하지 않는다.
    IF p_activity_type <> 'topic' THEN
        RAISE EXCEPTION '지원하지 않는 이웃 활동입니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 80
       OR char_length(btrim(COALESCE(p_prompt, ''))) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION '활동 제목과 글쓰기 안내를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    -- 글 종류는 학급 과제와 같은 칸에 들어가므로 길이만 확인한다(목록의 정본은 화면의 genreCatalog).
    IF v_genre IS NOT NULL AND char_length(v_genre) > 30 THEN
        RAISE EXCEPTION '글 종류가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_type_id IS NOT NULL AND v_type_id !~ '^[a-z][a-z0-9_-]{1,29}$' THEN
        RAISE EXCEPTION '글쓰기 양식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_questions) > 10 THEN
        RAISE EXCEPTION '길잡이 질문은 10개까지 넣을 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_questions) q
                WHERE char_length(btrim(q)) NOT BETWEEN 1 AND 200) THEN
        RAISE EXCEPTION '길잡이 질문은 1~200자로 적어 주세요.' USING ERRCODE = '22023';
    END IF;
    IF v_min_chars NOT BETWEEN 1 AND 5000 OR v_min_paragraphs NOT BETWEEN 1 AND 20 THEN
        RAISE EXCEPTION '최소 글자 수는 1~5,000자, 문단 수는 1~20개로 정해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF v_base_reward NOT BETWEEN 0 AND 1000 OR v_bonus_reward NOT BETWEEN 0 AND 1000
       OR v_bonus_threshold NOT BETWEEN 0 AND 5000 THEN
        RAISE EXCEPTION '포인트는 0~1,000P, 추가 분량 기준은 0~5,000자로 정해 주세요.' USING ERRCODE = '22023';
    END IF;

    IF p_activity_type = 'exchange' THEN
        IF p_exchange_share_scope NOT IN ('partners', 'space') THEN
            RAISE EXCEPTION '글짝 글 공개 범위를 확인해 주세요.' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(cardinality(p_exchange_class_ids), 0) <> 2
           OR array_position(p_exchange_class_ids, NULL) IS NOT NULL
           OR p_exchange_class_ids[1] = p_exchange_class_ids[2]
           OR NOT (p_actor_class_id = ANY(p_exchange_class_ids)) THEN
            RAISE EXCEPTION '글짝 교환 활동은 우리 학급을 포함한 서로 다른 두 학급을 골라야 합니다.' USING ERRCODE = '22023';
        END IF;
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id
          AND membership.status = 'active'
          AND membership.class_id = ANY(p_exchange_class_ids);
        IF COALESCE(cardinality(v_class_ids), 0) <> 2 THEN
            RAISE EXCEPTION '현재 참여 중인 두 학급만 글짝 교환 활동에 넣을 수 있습니다.' USING ERRCODE = '42501';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.neighbor_spaces space
            WHERE space.id = p_space_id AND space.host_class_id = ANY(v_class_ids)) THEN
            RAISE EXCEPTION '글짝 교환 활동에는 호스트 학급이 포함되어야 합니다.' USING ERRCODE = '22023';
        END IF;
        SELECT min(student_count), max(student_count) INTO v_min_students, v_max_students
        FROM (SELECT count(student.id)::INTEGER student_count FROM unnest(v_class_ids) selected(class_id)
            LEFT JOIN public.students student ON student.class_id = selected.class_id
              AND student.auth_id IS NOT NULL AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
            GROUP BY selected.class_id) counts;
        IF v_min_students < 1 OR v_max_students > 100 OR v_max_students > v_min_students * 2 THEN
            RAISE EXCEPTION '두 학급 모두 로그인 가능한 학생이 1~100명이고 인원 차이가 두 배 이내여야 합니다.' USING ERRCODE = '22023';
        END IF;
    ELSE
        p_exchange_share_scope := NULL;
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id AND membership.status = 'active';
        IF COALESCE(cardinality(v_class_ids), 0) < 2 THEN
            RAISE EXCEPTION '두 학급 이상 참여한 뒤 같이 쓰기 광장에 주제를 제안할 수 있습니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    INSERT INTO public.neighbor_activities (
        space_id, activity_type, title, prompt, status, created_by, exchange_share_scope
    ) VALUES (
        p_space_id, p_activity_type, btrim(p_title), btrim(p_prompt),
        'pending_approval', v_user_id, p_exchange_share_scope
    ) RETURNING * INTO v_activity;

    FOREACH v_class_id IN ARRAY v_class_ids LOOP
        INSERT INTO public.writing_missions (
            class_id, teacher_id, title, guide, genre, mission_type, input_template,
            min_chars, min_paragraphs, base_reward, bonus_threshold,
            bonus_reward, allow_comments, guide_questions, tags, is_archived
        )
        SELECT
            class.id, class.teacher_id, btrim(p_title), btrim(p_prompt),
            COALESCE(v_genre, '글쓰기'),
            COALESCE(v_type_id, v_genre, '글쓰기'),
            COALESCE(v_type_id, 'freeform'),
            v_min_chars, v_min_paragraphs,
            v_base_reward, v_bonus_threshold, v_bonus_reward,
            -- 우리 반 친구도 댓글을 달 수 있게 한다. 예전에는 꺼져 있어 이웃 학급만 댓글이 됐다.
            TRUE, v_questions,
            jsonb_build_array('이웃 아지트', CASE WHEN p_activity_type = 'topic' THEN '같이 쓰기 광장' ELSE '글짝 교환 활동' END),
            TRUE
        FROM public.classes class
        WHERE class.id = v_class_id AND class.deleted_at IS NULL
        RETURNING id INTO v_mission_id;

        IF v_mission_id IS NULL THEN
            RAISE EXCEPTION '참여 학급 글쓰기 과제를 만들 수 없습니다.' USING ERRCODE = '55000';
        END IF;
        INSERT INTO public.neighbor_activity_classes (activity_id, space_id, class_id, mission_id)
        VALUES (v_activity.id, p_space_id, v_class_id, v_mission_id);
        INSERT INTO public.neighbor_activity_approvals (
            activity_id, space_id, class_id, status, is_proposer, decided_by, decided_at
        ) VALUES (
            v_activity.id, p_space_id, v_class_id,
            CASE WHEN v_class_id = p_actor_class_id THEN 'approved' ELSE 'pending' END,
            v_class_id = p_actor_class_id,
            CASE WHEN v_class_id = p_actor_class_id THEN v_user_id ELSE NULL END,
            CASE WHEN v_class_id = p_actor_class_id THEN NOW() ELSE NULL END
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', v_activity.id,
        'activity_type', v_activity.activity_type, 'status', v_activity.status,
        'exchange_share_scope', v_activity.exchange_share_scope,
        'class_count', cardinality(v_class_ids),
        'pending_approval_count', cardinality(v_class_ids) - 1
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION '같은 종류의 제안 또는 진행 중인 활동을 먼저 마쳐 주세요.' USING ERRCODE = '55000';
END;
$function$;

-- ③ 글 올리기: 문구만 새 이름.
CREATE OR REPLACE FUNCTION public.publish_neighbor_class_post_v1(p_space_id uuid, p_actor_class_id uuid, p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_student_id UUID;
    v_student_name TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT post.student_id, left(btrim(student.name), 30)
    INTO v_student_id, v_student_name
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id AND student.class_id = post.class_id
     AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
    WHERE post.id = p_post_id
      AND post.class_id = p_actor_class_id
      AND public.neighbor_source_is_shareable_v1(post)
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
      );
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '이웃 글 마당에 올릴 수 있는 자기 학급 제출 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.space_id = p_space_id AND shared.post_id = p_post_id
    FOR UPDATE;
    IF FOUND AND v_shared.status = 'hidden' THEN
        RAISE EXCEPTION '숨김 처리된 글은 복원한 뒤 다시 공유할 수 있습니다.' USING ERRCODE = '55000';
    ELSIF FOUND AND v_shared.status = 'published' THEN
        RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
    ELSIF FOUND THEN
        UPDATE public.neighbor_shared_posts
        SET activity_id = NULL, public_author_name = v_student_name, status = 'published',
            requested_at = NOW(), reviewed_at = NOW(), reviewed_by = v_user_id,
            review_note = '', published_at = NOW(), hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_shared.id RETURNING * INTO v_shared;
    ELSE
        INSERT INTO public.neighbor_shared_posts (
            space_id, class_id, post_id, student_id, public_author_name, activity_id,
            status, reviewed_at, reviewed_by, published_at
        ) VALUES (
            p_space_id, p_actor_class_id, p_post_id, v_student_id, v_student_name, NULL,
            'published', NOW(), v_user_id, NOW()
        ) RETURNING * INTO v_shared;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_actor_class_id, v_user_id, v_actor,
        'post_published_by_teacher', 'post', v_shared.id
    );
    RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
END;
$function$;

-- ③ 이미 만든 주제 과제의 보이는 태그도 바꾼다.
UPDATE public.writing_missions mission
SET tags = (
    SELECT jsonb_agg(CASE WHEN tag.value = '"함께 쓰는 주제"'::JSONB THEN '"같이 쓰기 광장"'::JSONB ELSE tag.value END
                     ORDER BY tag.ordinality)
    FROM jsonb_array_elements(mission.tags) WITH ORDINALITY tag
)
WHERE jsonb_typeof(mission.tags) = 'array' AND mission.tags ? '함께 쓰는 주제';

NOTIFY pgrst, 'reload schema';

COMMIT;
