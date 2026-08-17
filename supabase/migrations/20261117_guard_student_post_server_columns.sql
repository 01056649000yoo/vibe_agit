-- 학생이 자기 글의 "서버가 정하는 값"을 직접 고치지 못하게 막는다.
--
-- 무엇이 문제였나 (2026-08-17 운영 스키마에서 전 구간 재현):
--   student_posts 의 UPDATE 정책(Post_Update_V19)은 student_id = auth_student_id() 이면
--   **모든 컬럼**을 쓰게 허용하고, 컬럼을 지키는 guard_student_post_identity 는
--   작성자·학급·출처 5개만 막는다. 그래서 학생이 PostgREST 로
--       PATCH /rest/v1/student_posts?id=eq.<내 글> { "awarded_base_reward": 50000 }
--   를 보내면 값이 그대로 저장되고, approve_assignment_post 가
--       v_base_reward := COALESCE(v_post.awarded_base_reward, v_mission.base_reward, 0)
--   로 **글 행의 값을 먼저** 신뢰하기 때문에 아무것도 모르는 교사가 평소대로 승인하는 순간
--   그 금액이 실제로 지급된다(재현: 총점 600 → 50,620). char_count 도 같은 방식으로
--   보너스 조건을 통과시킬 수 있고, is_confirmed 를 직접 켜면 교사의 승인 대기 목록에서
--   글이 사라져 채점 없이 누락된다.
--
-- 왜 이렇게 고치나:
--   ① approve 의 COALESCE 순서를 뒤집지 않는다. awarded_* 는 "제출 시점의 약속"을 담는
--      스냅샷이라, 교사가 나중에 미션 보상을 바꿔도 학생에게 약속한 금액이 지켜져야 한다.
--      순서를 뒤집으면 그 보호가 사라진다. 고칠 곳은 "누가 그 값을 쓸 수 있는가"다.
--   ② 기존 RPC 는 한 줄도 바꾸지 않는다. 신뢰 경로(SECURITY DEFINER)와 직접 테이블 쓰기는
--      트리거 안에서 current_user 로 구분된다(직접 쓰기 = 'authenticated',
--      RPC 안 = 정의자 롤). 실측으로 확인했다.
--   ③ 막을 때 예외를 던지지 않고 **조용히 서버 값으로 되돌린다**. 지금 클라이언트는 임시저장마다
--      awarded_* 를 함께 보내는데(useMissionSubmit 의 upsert), 예외를 던지면 프런트 배포 전까지
--      전교생의 임시저장이 즉시 깨진다. 되돌리기는 정상 클라이언트에 아무 영향이 없고
--      공격자에게는 단서를 주지 않는다.

BEGIN;

-- ⚠️ SECURITY INVOKER 여야 한다(기본값). SECURITY DEFINER 로 만들면 함수 안의 current_user 가
--    항상 정의자(supabase_admin)가 되어 직접 쓰기와 신뢰 RPC 를 구분하지 못하고 가드가 통째로
--    무력화된다. 기존 guard_student_post_identity 도 같은 이유로 INVOKER 다.
CREATE OR REPLACE FUNCTION public.guard_student_post_server_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- 신뢰 경로: 제출·승인·독서록·일기 RPC는 SECURITY DEFINER 라 current_user 가 정의자 롤이다.
    -- 이 경로들은 이미 서버에서 값을 계산하므로 그대로 통과시킨다.
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    -- 교사·관리자는 학급 글의 승인·반려·수정을 직접 처리하는 화면이 있어 대상이 아니다.
    IF public.auth_user_role() IS DISTINCT FROM 'STUDENT' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- 새 초안은 아직 아무 약속도 받지 않은 상태여야 한다. 제출 RPC 가 미션 값으로 채운다.
        NEW.awarded_base_reward := NULL;
        NEW.awarded_bonus_reward := NULL;
        NEW.awarded_bonus_threshold := NULL;
        NEW.is_submitted := false;
        NEW.is_returned := false;
        NEW.is_confirmed := false;
    ELSE
        -- 임시저장은 제목·본문·답변만 바꾼다. 상태와 보상은 서버가 쥔 값을 유지한다.
        NEW.awarded_base_reward := OLD.awarded_base_reward;
        NEW.awarded_bonus_reward := OLD.awarded_bonus_reward;
        NEW.awarded_bonus_threshold := OLD.awarded_bonus_threshold;
        NEW.is_submitted := OLD.is_submitted;
        NEW.is_returned := OLD.is_returned;
        NEW.is_confirmed := OLD.is_confirmed;
    END IF;

    -- 보너스 지급 조건이 char_count 를 보므로 클라이언트 값을 믿지 않고 다시 센다.
    -- 제출 RPC(writing_engine_submit_assignment)와 같은 함수를 써서 기준을 일치시킨다.
    NEW.char_count := public.writing_content_char_count(COALESCE(NEW.content, ''));

    RETURN NEW;
END;
$$;

-- 호출자 권한으로 도는 가드라, 학생 세션이 글자 수 계산 함수를 실행할 수 있어야 한다.
-- 이 함수는 문자열 길이만 세는 순수 함수라 노출해도 읽히는 데이터가 없다.
GRANT EXECUTE ON FUNCTION public.writing_content_char_count(TEXT) TO authenticated;

-- 기존 신원 가드(작성자·학급·출처)와 별개의 트리거로 둔다. 역할이 다르고,
-- 하나가 바뀌어도 다른 하나의 보호가 흔들리지 않게 하기 위함이다.
-- 이름 순서상 guard_archived... 뒤, identity 앞에 오지만 BEFORE 트리거는 서로 독립이다.
DROP TRIGGER IF EXISTS trg_guard_student_post_server_columns ON public.student_posts;
CREATE TRIGGER trg_guard_student_post_server_columns
BEFORE INSERT OR UPDATE ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.guard_student_post_server_columns();

COMMIT;
