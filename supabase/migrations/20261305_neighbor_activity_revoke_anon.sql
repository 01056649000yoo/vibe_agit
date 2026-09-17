-- 이웃 아지트 create_neighbor_activity_v1 의 anon 실행 권한 회수 (2026-09-17)
--
-- 왜: 20261266 이 이 함수를 DROP 후 재생성하며 REVOKE 를 빠뜨려 기본 PUBLIC/anon EXECUTE 가
-- 다시 붙었다. 내부에서 교사 인증을 검사해 지금도 뚫리지는 않지만(anon 호출 시 401), 다른
-- 교사용 RPC 와 같은 기준으로 anon 을 걷어 표면을 좁힌다. 공개(rollout) 전 정리 항목.
-- (rpc-surface 허용목록의 해당 항목도 이 회수와 함께 제거한다.)

BEGIN;

REVOKE ALL ON FUNCTION public.create_neighbor_activity_v1(
    UUID, UUID, TEXT, TEXT, TEXT, UUID[], TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_neighbor_activity_v1(
    UUID, UUID, TEXT, TEXT, TEXT, UUID[], TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT, INTEGER, INTEGER, INTEGER
) TO authenticated, service_role;

COMMIT;
