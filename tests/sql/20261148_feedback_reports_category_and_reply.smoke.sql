-- 제보 확장이 권한 경계 안에 있는지 본다.
DO $$
BEGIN
    -- 익명에게는 어느 것도 열려 있으면 안 된다.
    IF has_function_privilege('anon', 'public.submit_teacher_feedback_v2(text, text, text, jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.get_my_feedback_reports_v1()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_reply_feedback_v1(uuid, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION '익명 사용자에게 제보 RPC 권한이 열려 있습니다.';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.submit_teacher_feedback_v2(text, text, text, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION '인증 교사가 제보를 보낼 수 없습니다.';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.get_my_feedback_reports_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION '인증 교사가 자기 제보를 볼 수 없습니다.';
    END IF;

    -- 표에 직접 쓰는 길은 계속 닫혀 있어야 한다(RPC 로만 들어온다).
    IF has_table_privilege('authenticated', 'public.feedback_reports', 'INSERT') THEN
        RAISE EXCEPTION '교사가 제보 표에 직접 INSERT 할 수 있습니다.';
    END IF;
END;
$$;

-- 종류·상태는 정해진 값만 받아야 한다.
DO $$
DECLARE
    v_teacher UUID;
BEGIN
    SELECT id INTO v_teacher FROM public.profiles WHERE role = 'TEACHER' LIMIT 1;
    IF v_teacher IS NULL THEN RETURN; END IF;

    BEGIN
        INSERT INTO public.feedback_reports(teacher_id, category, title, content, status)
        VALUES (v_teacher, '없는종류', '스모크', '스모크 내용', 'open');
        RAISE EXCEPTION '알 수 없는 종류가 들어갔습니다.';
    EXCEPTION WHEN check_violation THEN
        NULL; -- 기대한 대로 막혔다
    END;

    BEGIN
        INSERT INTO public.feedback_reports(teacher_id, category, title, content, status)
        VALUES (v_teacher, 'bug', '스모크', '스모크 내용', '없는상태');
        RAISE EXCEPTION '알 수 없는 상태가 들어갔습니다.';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END;
$$;

-- 답장 시각은 답장 내용이 바뀔 때만 새로 찍혀야 한다(상태만 옮기면 배지가 다시 켜지면 안 된다).
DO $$
DECLARE
    v_teacher UUID;
    v_id UUID;
    v_first TIMESTAMPTZ;
    v_second TIMESTAMPTZ;
BEGIN
    SELECT id INTO v_teacher FROM public.profiles WHERE role = 'TEACHER' LIMIT 1;
    IF v_teacher IS NULL THEN RETURN; END IF;

    INSERT INTO public.feedback_reports(teacher_id, category, title, content, status)
    VALUES (v_teacher, 'correction', '스모크 제보', '스모크 내용입니다', 'open')
    RETURNING id INTO v_id;

    UPDATE public.feedback_reports
    SET admin_reply = '확인했습니다', replied_at = NOW(), status = 'in_progress'
    WHERE id = v_id;
    SELECT replied_at INTO v_first FROM public.feedback_reports WHERE id = v_id;

    -- 같은 답장으로 상태만 옮긴다
    UPDATE public.feedback_reports
    SET status = 'done',
        replied_at = CASE WHEN '확인했습니다' IS DISTINCT FROM admin_reply THEN NOW() ELSE replied_at END
    WHERE id = v_id;
    SELECT replied_at INTO v_second FROM public.feedback_reports WHERE id = v_id;

    IF v_first IS DISTINCT FROM v_second THEN
        RAISE EXCEPTION '답장 내용이 그대로인데 답장 시각이 바뀌었습니다.';
    END IF;
END;
$$;
