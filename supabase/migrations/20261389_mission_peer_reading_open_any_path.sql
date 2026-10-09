-- "선생님만 읽기" 과제를 어떤 길로 열든(미션 카드의 열기 단추·과제 수정 화면) 같은 규칙이 되게 한다(2026-10-09).
-- 선생님만 → 열림 으로 바뀌는 순간 연 시각을 남긴다 → 승인한 글만 친구에게 보이고, 다시 닫을 수 없다(20261388).
-- 학생 알림은 열기 단추(open_mission_peer_reading_v1)만 보낸다.
CREATE OR REPLACE FUNCTION public.guard_mission_peer_reading_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.peer_reading_opened_at IS NOT NULL
       AND (NEW.peer_reading_opened_at IS NULL OR NEW.peer_reading_enabled IS NOT TRUE) THEN
        RAISE EXCEPTION 'peer_reading_locked: 친구들에게 연 과제는 다시 닫을 수 없어요.' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.peer_reading_enabled IS TRUE AND NEW.peer_reading_enabled IS FALSE
       AND EXISTS (SELECT 1 FROM public.student_posts p
                   WHERE p.mission_id = NEW.id AND (p.is_submitted OR p.is_confirmed)) THEN
        RAISE EXCEPTION 'peer_reading_locked: 이미 낸 글이 있어 선생님만 읽기로 바꿀 수 없어요.' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.peer_reading_enabled IS FALSE AND NEW.peer_reading_enabled IS TRUE THEN
        NEW.peer_reading_opened_at := COALESCE(NEW.peer_reading_opened_at, clock_timestamp());
    ELSIF NEW.peer_reading_opened_at IS NOT NULL AND OLD.peer_reading_opened_at IS NULL THEN
        NEW.peer_reading_opened_at := NULL;  -- 처음부터 열린 과제에는 '연 시각' 이 없다
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_mission_peer_reading_v1() FROM PUBLIC, anon, authenticated;
