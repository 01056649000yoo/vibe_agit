-- 문집을 지운 직후 화면이 표지 그림을 지우려면, 저장소가 지우기 전에 하는 "볼 수 있는지" 확인도 통과해야 한다
-- (2026-10-06 실제 점검: 문집 줄이 없어져 보기 권한이 사라지면 지우기가 400 으로 실패).
-- 담당 교사는 자기 학급 폴더의 표지 그림을 볼 수 있게 한다(문집이 있든 없든). 학생·다른 반 읽기 규칙은 그대로.
DROP POLICY IF EXISTS "Class_Agit_Covers_Select_V1" ON storage.objects;
CREATE POLICY "Class_Agit_Covers_Select_V1" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'class-agit-covers'
        AND (public.can_access_class_agit_cover_v1(name, FALSE) OR public.can_delete_class_agit_cover_v1(name)));
