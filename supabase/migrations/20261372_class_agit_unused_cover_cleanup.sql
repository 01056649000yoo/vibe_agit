-- 글꽃 책방 — 안 쓰는 표지 그림 자동 지우기(2026-10-07, 선생님 결정).
--
-- 그림은 덮어쓰지 않고 새 파일로 올리므로(옛 확정판이 옛 표지를 쓴다) 표지를 바꿀 때마다 파일이 쌓였다.
-- 남기는 것: 그 문집의 지금 표지(cover_image.path) + 확정판 기록(snapshot.cover_image.path)이 쓰는 표지.
-- 그 밖의 그림은 표지를 바꾸거나 끌 때 화면이 바로 지운다(저장소 기능 — 파일 방식이라 DB 줄만 지우면 파일이 남는다).
-- 바로 지우기가 실패한 것은 매주 정리가 지운다. 다만 올리는 중인 그림을 건드리지 않게 하루 지난 것만.

-- 화면용: 이 문집 폴더에서 아무 데서도 쓰지 않는 그림(담당 교사만).
CREATE OR REPLACE FUNCTION public.get_class_agit_unused_cover_paths_v1(p_class_id UUID, p_book_id UUID)
RETURNS SETOF TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    RETURN QUERY
    SELECT o.name FROM storage.objects o
    WHERE o.bucket_id = 'class-agit-covers'
      AND split_part(o.name, '/', 1) = p_class_id::TEXT
      AND split_part(o.name, '/', 2) = p_book_id::TEXT
      AND NOT EXISTS (SELECT 1 FROM public.class_agit_books b
                      WHERE b.class_id = p_class_id AND b.id = p_book_id AND b.cover_image->>'path' = o.name)
      AND NOT EXISTS (SELECT 1 FROM public.class_agit_book_editions e
                      WHERE e.class_id = p_class_id AND e.book_id = p_book_id AND e.snapshot->'cover_image'->>'path' = o.name)
    ORDER BY o.name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_class_agit_unused_cover_paths_v1(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_agit_unused_cover_paths_v1(UUID, UUID) TO authenticated;

-- 매주 정리용(service_role): 문집이 없어진 그림 + 살아 있는 문집에서 하루 넘게 아무 데서도 쓰지 않는 그림.
CREATE OR REPLACE FUNCTION public.class_agit_orphan_cover_paths_v1()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT o.name FROM storage.objects o
    WHERE o.bucket_id = 'class-agit-covers'
      AND (
          NOT EXISTS (
              SELECT 1 FROM public.class_agit_books b JOIN public.classes c ON c.id = b.class_id AND c.deleted_at IS NULL
              WHERE b.class_id::TEXT = split_part(o.name, '/', 1) AND b.id::TEXT = split_part(o.name, '/', 2)
          )
          OR (
              o.created_at < NOW() - INTERVAL '1 day'
              AND NOT EXISTS (SELECT 1 FROM public.class_agit_books b
                              WHERE b.class_id::TEXT = split_part(o.name, '/', 1) AND b.id::TEXT = split_part(o.name, '/', 2)
                                AND b.cover_image->>'path' = o.name)
              AND NOT EXISTS (SELECT 1 FROM public.class_agit_book_editions e
                              WHERE e.class_id::TEXT = split_part(o.name, '/', 1) AND e.book_id::TEXT = split_part(o.name, '/', 2)
                                AND e.snapshot->'cover_image'->>'path' = o.name)
          )
      )
    ORDER BY o.name;
$$;
