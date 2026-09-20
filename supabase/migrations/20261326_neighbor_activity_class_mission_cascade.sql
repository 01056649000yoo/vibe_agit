-- 활동에 쓰인 과제를 지울 수 있게, 그리고 학급 삭제·교사 탈퇴가 막히지 않게 고친다(2026-09-20).
--
-- 문제: neighbor_activity_classes.mission_id → writing_missions 가 ON DELETE RESTRICT 라,
--   함께 쓰는 주제(활동) 때 자동 생성된 과제를 지우려 하면 막혔고("...violates foreign key
--   constraint neighbor_activity_classes_mission_id_fkey"), 링크를 푸는 경로도 없었다.
--   더 위험하게는, 그런 과제가 하나라도 있으면 학급 삭제·교사 탈퇴(DELETE FROM classes)의
--   미션 CASCADE 삭제가 RESTRICT(즉시 검사)에 걸려 작업 전체가 롤백될 수 있었다.
--
-- 해결: RESTRICT → CASCADE. 과제를 지우면 그 활동-학급 링크가 함께 정리되고(딸린 승인행도
--   activity_id,class_id CASCADE 로 정리), 학급/탈퇴 삭제도 안 막힌다. 진행 중 활동 과제를
--   실수로 지우지 않도록 하는 안내는 화면(UI)에서 한다.

BEGIN;

ALTER TABLE public.neighbor_activity_classes
    DROP CONSTRAINT IF EXISTS neighbor_activity_classes_mission_id_fkey;

ALTER TABLE public.neighbor_activity_classes
    ADD CONSTRAINT neighbor_activity_classes_mission_id_fkey
    FOREIGN KEY (mission_id) REFERENCES public.writing_missions(id) ON DELETE CASCADE;

COMMIT;
