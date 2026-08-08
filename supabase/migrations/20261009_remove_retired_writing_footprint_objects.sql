BEGIN;

-- 친구 프로필에서 제거된 카드와, 2026-07-30에 중단한 일일 스냅샷 작업의
-- 전용 객체만 정리한다. 현재 칭호·교사 통계가 쓰는 writing_activity_events와
-- record_writing_activity_event()는 계속 사용하므로 건드리지 않는다.
DROP FUNCTION IF EXISTS public.get_friend_point_activity_summary(UUID);
DROP FUNCTION IF EXISTS public.get_friend_writing_footprint(UUID);
DROP FUNCTION IF EXISTS public.get_my_writing_footprint();
DROP FUNCTION IF EXISTS public.refresh_writing_footprint_snapshots(DATE);

DROP TABLE IF EXISTS public.student_writing_daily_snapshots;
DROP TABLE IF EXISTS public.writing_footprint_settings;

COMMIT;
