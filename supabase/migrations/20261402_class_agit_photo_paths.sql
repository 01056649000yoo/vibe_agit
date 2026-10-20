-- 보고서 사진 읽기(2c): 문단 목록 속 사진 자리표의 사진ID → 복사본 경로(2026-10-20, 설계 docs/CLASS_AGIT_PHOTOS_PLAN.md).
--
-- 자리표에는 사진ID 만 있고 복사본 경로는 `학급ID/사진ID.jpg|webp` 라서, 읽는 화면(전시실·책 미리보기·인쇄)은 서버에 물어 경로를 받아
-- 서명 주소를 만든다. **저장소 읽기 정책과 같은 판단(`can_read_class_agit_photo_v1`)** 을 쓰므로 읽을 수 없는 사람에게는 빈 목록이다.
-- 외부 공유 방문자는 로그인이 없어 이 함수를 못 부른다(2d 에서 공개 읽기 함수가 따로 한다).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_class_agit_photo_paths_v1(p_photo_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE='42501'; END IF;
    IF COALESCE(cardinality(p_photo_ids),0) NOT BETWEEN 1 AND 50 OR array_position(p_photo_ids,NULL) IS NOT NULL THEN
        RAISE EXCEPTION '사진을 1~50장 골라 주세요.' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('photos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',ph.id,'path',ph.copy_path,'width',ph.width,'height',ph.height,'mime_type',ph.mime_type))
        FROM public.class_agit_item_photos ph
        WHERE ph.id = ANY(p_photo_ids) AND ph.status = 'copied' AND ph.removed_at IS NULL
          AND public.can_read_class_agit_photo_v1(ph.copy_path)
    ), '[]'::JSONB));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_photo_paths_v1(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_agit_photo_paths_v1(UUID[]) TO authenticated;

COMMIT;
