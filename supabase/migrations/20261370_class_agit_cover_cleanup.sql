-- 글꽃 책방 표지 그림 보관 규칙(2026-10-06, 선생님 결정):
-- 그 문집(초안·확정판)이 남아 있는 동안은 보관하고, 문집을 지우면 그 문집의 표지 그림도 함께 지운다.
--
-- 저장소가 파일 방식이라 storage.objects 줄만 지우면 실제 파일이 남는다 — 지우기는 저장소 기능으로 한다.
-- ① 선생님 화면이 문집을 지운 직후 그 폴더를 지운다. 이때 문집 줄은 이미 없으므로, 지우기 권한은
--    "그 학급의 담당 교사" 로 본다(문집이 있어야 하는 올리기·읽기 권한과 따로).
-- ② 매주 정리(scripts/class-agit-cover-sweep.mjs)가 문집이 없는 폴더(학급 삭제 등)를 찾아 지운다.

CREATE OR REPLACE FUNCTION public.can_delete_class_agit_cover_v1(p_path TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id::TEXT = split_part(p_path, '/', 1)
          AND c.teacher_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.can_delete_class_agit_cover_v1(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_class_agit_cover_v1(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Class_Agit_Covers_Delete_V1" ON storage.objects;
CREATE POLICY "Class_Agit_Covers_Delete_V1" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'class-agit-covers' AND public.can_delete_class_agit_cover_v1(name));

-- 매주 정리가 읽는 목록: 그 문집이 없어진(또는 학급이 지워진) 표지 그림 파일. service_role 만.
CREATE OR REPLACE FUNCTION public.class_agit_orphan_cover_paths_v1()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT o.name FROM storage.objects o
    WHERE o.bucket_id = 'class-agit-covers'
      AND NOT EXISTS (
          SELECT 1 FROM public.class_agit_books b JOIN public.classes c ON c.id = b.class_id AND c.deleted_at IS NULL
          WHERE b.class_id::TEXT = split_part(o.name, '/', 1) AND b.id::TEXT = split_part(o.name, '/', 2)
      )
    ORDER BY o.name;
$$;
REVOKE ALL ON FUNCTION public.class_agit_orphan_cover_paths_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.class_agit_orphan_cover_paths_v1() TO service_role;
