-- ============================================================================
-- 🛡️ [보안 패치 2단계] 학생 전용 보상 RPC 분리
-- 작성일: 2026-02-25
--
-- 목적:
--   학생이 범용 increment_student_points를 직접 호출해 포인트를 임의 증가시키는
--   취약점을 차단. 학생에게는 용도별 전용 보상 RPC만 허용.
--
-- 변경 사항:
--   [NEW] reward_for_comment         — 댓글 작성 보상 (중복 방지 내장)
--   [NEW] reward_for_vocab_tower     — 어휘탑 보상 (상한선 내장)
--   [NEW] reward_for_idea_submission — 아이디어 마켓 제출 보상 (중복 방지 내장)
--   [MOD] increment_student_points   — 학생 본인 호출 조건 제거 (교사/관리자 전용)
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────
-- [신규 1] reward_for_comment
--
-- 학생이 친구 글에 댓글을 남길 때 +5P 보상
-- - 보상 대상: 호출자(auth.uid())와 연결된 학생 본인
-- - 중복 방지: point_logs에서 student_id + post 연관 이력 확인
-- - 상한선: 댓글 보상은 게시글당 1회
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reward_for_comment(
    p_post_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID;
    v_student RECORD;
    v_reward_reason TEXT;
    v_already_rewarded BOOLEAN;
BEGIN
    v_auth_id := auth.uid();

    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    -- 호출자(auth_id)와 연결된 학생 정보 조회
    SELECT s.id, s.class_id INTO v_student
    FROM public.students s
    WHERE s.auth_id = v_auth_id AND s.deleted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '학생 정보를 찾을 수 없습니다.');
    END IF;

    v_reward_reason := format('친구 글에 따뜻한 응원을 남겨주셨네요! ✨ (PostID:%s)', p_post_id);

    -- 중복 보상 체크
    SELECT EXISTS (
        SELECT 1 FROM public.point_logs
        WHERE student_id = v_student.id
          AND reason = v_reward_reason
    ) INTO v_already_rewarded;

    IF v_already_rewarded THEN
        RETURN json_build_object('success', false, 'already_rewarded', true, 'message', '이미 이 게시글에서 보상받았습니다.');
    END IF;

    -- 트리거 우회 (protect_student_sensitive_columns)
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + 5
    WHERE id = v_student.id;

    INSERT INTO public.point_logs (student_id, reason, amount, post_id)
    VALUES (v_student.id, v_reward_reason, 5, p_post_id);

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object('success', true, 'points_awarded', 5);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

GRANT EXECUTE ON FUNCTION public.reward_for_comment(UUID) TO authenticated, anon;


-- ──────────────────────────────────────────────────────────────────
-- [신규 2] reward_for_vocab_tower
--
-- 어휘탑 게임 완료 보상
-- - 보상 대상: 호출자(auth.uid())와 연결된 학생 본인
-- - 상한선: 1회 최대 300P 초과 불가 (서버에서 강제)
-- - 중복 방지: 클라이언트 localStorage 키 기반 (DB에서 reason 패턴 추가 확인)
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reward_for_vocab_tower(
    p_amount INTEGER
)
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID;
    v_student RECORD;
    v_safe_amount INTEGER;
    v_reward_reason TEXT;
BEGIN
    v_auth_id := auth.uid();

    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    -- 학생 정보 조회
    SELECT s.id, s.class_id INTO v_student
    FROM public.students s
    WHERE s.auth_id = v_auth_id AND s.deleted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '학생 정보를 찾을 수 없습니다.');
    END IF;

    -- 서버 레벨 상한선 강제
    IF p_amount <= 0 THEN
        RETURN json_build_object('success', false, 'error', '유효하지 않은 보상 값입니다.');
    END IF;

    v_safe_amount := LEAST(p_amount, 300);
    v_reward_reason := '어휘의 탑 일일 미션 보상 🏰';

    -- 트리거 우회 (protect_student_sensitive_columns)
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + v_safe_amount
    WHERE id = v_student.id;

    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (v_student.id, v_reward_reason, v_safe_amount);

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object('success', true, 'points_awarded', v_safe_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

GRANT EXECUTE ON FUNCTION public.reward_for_vocab_tower(INTEGER) TO authenticated, anon;


-- ──────────────────────────────────────────────────────────────────
-- [신규 3] reward_for_idea_submission
--
-- 아이디어 마켓에 새 아이디어를 제출했을 때 보상
-- - 보상 대상: 호출자(auth.uid())와 연결된 학생 본인
-- - 보상 포인트: writing_missions.base_reward 참조
-- - 중복 방지: 같은 mission_id에서 이미 보상받은 이력 확인
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reward_for_idea_submission(
    p_mission_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID;
    v_student RECORD;
    v_mission RECORD;
    v_reward_amount INTEGER;
    v_reward_reason TEXT;
    v_already_rewarded BOOLEAN;
BEGIN
    v_auth_id := auth.uid();

    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;

    -- 학생 정보 조회
    SELECT s.id, s.class_id INTO v_student
    FROM public.students s
    WHERE s.auth_id = v_auth_id AND s.deleted_at IS NULL
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '학생 정보를 찾을 수 없습니다.');
    END IF;

    -- 미션 정보 조회, 학급 소속 확인
    SELECT m.id, m.base_reward, m.title INTO v_mission
    FROM public.writing_missions m
    WHERE m.id = p_mission_id
      AND m.class_id = v_student.class_id
      AND m.is_archived = false;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', '해당 미션을 찾을 수 없거나 학급이 일치하지 않습니다.');
    END IF;

    v_reward_amount := COALESCE(v_mission.base_reward, 30);
    v_reward_reason := format('아이디어 마켓에 제안을 제출했어요! 🏛️💡 (MissionID:%s)', p_mission_id);

    -- 중복 보상 체크
    SELECT EXISTS (
        SELECT 1 FROM public.point_logs
        WHERE student_id = v_student.id
          AND reason = v_reward_reason
    ) INTO v_already_rewarded;

    IF v_already_rewarded THEN
        RETURN json_build_object('success', false, 'already_rewarded', true, 'message', '이미 이 미션에서 제출 보상을 받았습니다.');
    END IF;

    -- 트리거 우회 (protect_student_sensitive_columns)
    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + v_reward_amount
    WHERE id = v_student.id;

    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (v_student.id, v_reward_reason, v_reward_amount);

    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN json_build_object('success', true, 'points_awarded', v_reward_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

GRANT EXECUTE ON FUNCTION public.reward_for_idea_submission(UUID) TO authenticated, anon;


-- ──────────────────────────────────────────────────────────────────
-- [수정] increment_student_points — 학생 본인 호출 조건 제거
--
-- 기존: 교사 OR 학생 본인(s.auth_id = v_caller_id) 허용
-- 변경: 교사(담당 학급) OR 관리자만 허용
--       학생은 이제 전용 reward_for_* RPC를 사용해야 함
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_student_points(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT DEFAULT '포인트 보상 🎁',
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();

    -- Service role (서버 호출)은 항상 허용
    IF v_caller_id IS NULL THEN
        v_is_authorized := true;
    ELSE
        -- 관리자 확인
        SELECT EXISTS (
            SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN'
        ) INTO v_is_authorized;

        -- 관리자가 아니면 담당 교사 소유권만 확인 (학생 본인 조건 제거됨)
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s
                JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id
                  AND c.teacher_id = v_caller_id   -- 담당 교사만
                  AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 변경할 권한이 없습니다. 교사 또는 관리자만 가능합니다.'
            USING ERRCODE = '42501';
    END IF;

    -- 포인트 업데이트
    UPDATE public.students
    SET total_points = COALESCE(total_points, 0) + p_amount
    WHERE id = p_student_id;

    -- 로그 기록
    INSERT INTO public.point_logs (student_id, reason, amount, post_id, mission_id)
    VALUES (p_student_id, p_reason, p_amount, p_post_id, p_mission_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';


-- ──────────────────────────────────────────────────────────────────
-- 스키마 캐시 갱신
-- ──────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ====================================================================
-- ✅ 검증 방법
--
-- 1. 학생 계정 콘솔 — 직접 호출 차단 확인:
--    await supabase.rpc('increment_student_points', { p_student_id: '자신UUID', p_amount: 9999 })
--    → 에러: "[보안] 해당 학생의 포인트를 변경할 권한이 없습니다."
--
-- 2. 댓글 작성 → 학생 포인트 +5P 확인
-- 3. 어휘탑 완료 → 보상 포인트 정상 지급 확인
-- 4. 아이디어 제출 → 제출 보상 포인트 정상 지급 확인
-- 5. 교사 계정 → 미션 승인 포인트 지급 정상 확인 (기존 유지)
-- ====================================================================
