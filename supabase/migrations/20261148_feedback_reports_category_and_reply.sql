-- 선생님 의견 제보를 "오류·정정을 알리는 곳" 으로 다시 세운다 (2026-08-21)
--
-- 배경: 선생님 203명에 제보 0건이었다. 백지 제목·내용 두 칸뿐이라 낱말 하나 틀린 것을
--       알리려 해도 제목을 지어내야 했고, 보낸 뒤에는 읽혔는지조차 알 수 없었다.
--
-- 이 마이그레이션이 더하는 것:
--   1) category  — 무엇에 대한 말인지 먼저 고르게 한다(내용 정정 / 오류 / 제안 / 사용법).
--   2) context   — 어느 화면·어느 기기였는지 앱이 자동으로 담는다. 학생 개인정보는 담지 않는다.
--   3) 답장      — 관리자가 한 줄 답을 달고, 선생님이 그 답을 자기 화면에서 본다.
--                  답이 보이지 않으면 아무도 두 번 제보하지 않는다. 이 기능의 핵심이다.
--
-- 기존 열은 건드리지 않고 더하기만 한다.

BEGIN;

ALTER TABLE public.feedback_reports
    ADD COLUMN IF NOT EXISTS category      TEXT        NOT NULL DEFAULT 'other',
    ADD COLUMN IF NOT EXISTS context       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS admin_reply   TEXT,
    ADD COLUMN IF NOT EXISTS replied_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reply_seen_at TIMESTAMPTZ;

-- 종류와 상태는 정해진 값만 받는다. 화면에서 자유 문자열을 보내 표가 흐려지는 것을 막는다.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_category_check') THEN
        ALTER TABLE public.feedback_reports
            ADD CONSTRAINT feedback_reports_category_check
            CHECK (category IN ('correction', 'bug', 'idea', 'howto', 'other'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_reports_status_check') THEN
        ALTER TABLE public.feedback_reports
            ADD CONSTRAINT feedback_reports_status_check
            CHECK (status IN ('open', 'in_progress', 'done'));
    END IF;
END;
$$;

-- 관리자 목록은 최신순, 선생님 목록은 본인 것만 최신순으로 읽는다.
CREATE INDEX IF NOT EXISTS feedback_reports_created_idx ON public.feedback_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_reports_teacher_idx ON public.feedback_reports (teacher_id, created_at DESC);

COMMIT;

BEGIN;

-- 제보 보내기. v1 과 달리 종류와 맥락을 함께 받는다.
-- v1 은 남겨 둔다 — 배포 사이에 옛 화면이 잠깐 살아 있어도 제보가 끊기지 않게 한다.
CREATE OR REPLACE FUNCTION public.submit_teacher_feedback_v2(
    p_category TEXT,
    p_title TEXT,
    p_content TEXT,
    p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_category TEXT := COALESCE(NULLIF(btrim(COALESCE(p_category, '')), ''), 'other');
    v_title TEXT := btrim(COALESCE(p_title, ''));
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_context JSONB := COALESCE(p_context, '{}'::jsonb);
    v_feedback_id UUID;
BEGIN
    IF public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '승인된 교사만 의견을 보낼 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF v_category NOT IN ('correction', 'bug', 'idea', 'howto', 'other') THEN
        RAISE EXCEPTION '알 수 없는 제보 종류입니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_title) NOT BETWEEN 2 AND 120 THEN
        RAISE EXCEPTION '제목은 2~120자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_content) NOT BETWEEN 5 AND 5000 THEN
        RAISE EXCEPTION '내용은 5~5000자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    -- 맥락은 화면이 만들어 보내는 값이라 크기를 서버가 막는다. 통째로 로그를 밀어 넣지 못하게 한다.
    IF jsonb_typeof(v_context) <> 'object' OR char_length(v_context::TEXT) > 2000 THEN
        RAISE EXCEPTION '함께 보낸 화면 정보가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('feedback:' || v_user_id::TEXT, 0));
    IF (SELECT count(*) FROM public.feedback_reports
        WHERE teacher_id = v_user_id AND created_at > NOW() - INTERVAL '1 hour') >= 3 THEN
        RAISE EXCEPTION '의견은 한 시간에 3번까지 보낼 수 있습니다.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.feedback_reports(teacher_id, category, title, content, context, status)
    VALUES (v_user_id, v_category, v_title, v_content, v_context, 'open')
    RETURNING id INTO v_feedback_id;

    RETURN jsonb_build_object('version', 2, 'feedback_id', v_feedback_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_teacher_feedback_v2(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_teacher_feedback_v2(TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

COMMIT;

BEGIN;

-- 선생님이 자기 제보와 관리자 답장을 본다. 본인 것만 나간다.
CREATE OR REPLACE FUNCTION public.get_my_feedback_reports_v1()
RETURNS TABLE (
    id UUID,
    category TEXT,
    title TEXT,
    content TEXT,
    status TEXT,
    admin_reply TEXT,
    replied_at TIMESTAMPTZ,
    reply_seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT r.id, r.category, r.title, r.content, r.status,
           r.admin_reply, r.replied_at, r.reply_seen_at, r.created_at
    FROM public.feedback_reports r
    WHERE r.teacher_id = auth.uid()
    ORDER BY r.created_at DESC
    LIMIT 50;
END;
$$;

-- 아직 못 본 답장 개수. 화면에 배지를 붙이는 데만 쓴다.
CREATE OR REPLACE FUNCTION public.get_my_feedback_reply_badge_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_unread INTEGER := 0;
BEGIN
    IF public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RETURN jsonb_build_object('unread', 0);
    END IF;

    SELECT count(*) INTO v_unread
    FROM public.feedback_reports r
    WHERE r.teacher_id = auth.uid()
      AND r.admin_reply IS NOT NULL
      AND (r.reply_seen_at IS NULL OR r.reply_seen_at < r.replied_at);

    RETURN jsonb_build_object('unread', v_unread);
END;
$$;

-- 답장을 읽었다고 표시한다. 배지를 끄는 용도라 본인 것만 건드린다.
CREATE OR REPLACE FUNCTION public.mark_my_feedback_replies_seen_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_marked INTEGER := 0;
BEGIN
    IF public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '교사 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.feedback_reports
    SET reply_seen_at = NOW()
    WHERE teacher_id = auth.uid()
      AND admin_reply IS NOT NULL
      AND (reply_seen_at IS NULL OR reply_seen_at < replied_at);
    GET DIAGNOSTICS v_marked = ROW_COUNT;

    RETURN jsonb_build_object('success', TRUE, 'marked', v_marked);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_feedback_reports_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_feedback_reply_badge_v1() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_my_feedback_replies_seen_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_feedback_reports_v1() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_feedback_reply_badge_v1() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_my_feedback_replies_seen_v1() TO authenticated, service_role;

COMMIT;

BEGIN;

-- 관리자가 답장을 달고 상태를 옮긴다.
-- 화면에서 표를 직접 UPDATE 하지 않고 이 RPC 하나로 모은다 — 답장 시각을 서버가 쥐어야
-- "답장이 달렸다" 판정과 선생님 쪽 배지가 어긋나지 않는다.
CREATE OR REPLACE FUNCTION public.admin_reply_feedback_v1(
    p_feedback_id UUID,
    p_reply TEXT,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reply TEXT := NULLIF(btrim(COALESCE(p_reply, '')), '');
    v_status TEXT := btrim(COALESCE(p_status, ''));
    v_updated INTEGER := 0;
BEGIN
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 답장할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_feedback_id IS NULL THEN
        RAISE EXCEPTION '어떤 제보인지 지정해주세요.' USING ERRCODE = '22023';
    END IF;
    IF v_status NOT IN ('open', 'in_progress', 'done') THEN
        RAISE EXCEPTION '알 수 없는 처리 상태입니다.' USING ERRCODE = '22023';
    END IF;
    IF v_reply IS NOT NULL AND char_length(v_reply) > 2000 THEN
        RAISE EXCEPTION '답장은 2000자까지 쓸 수 있습니다.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.feedback_reports
    SET status = v_status,
        admin_reply = COALESCE(v_reply, admin_reply),
        -- 답장 내용이 실제로 바뀔 때만 시각을 새로 찍는다. 상태만 옮겼는데 배지가 다시
        -- 켜지면 선생님이 새 답장인 줄 알고 열어 본다.
        replied_at = CASE
            WHEN v_reply IS NOT NULL AND v_reply IS DISTINCT FROM admin_reply THEN NOW()
            ELSE replied_at
        END
    WHERE id = p_feedback_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        RAISE EXCEPTION '해당 제보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'feedback_id', p_feedback_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reply_feedback_v1(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reply_feedback_v1(UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
