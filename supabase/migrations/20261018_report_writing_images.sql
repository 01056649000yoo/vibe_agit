BEGIN;

-- 보고서 사진은 본문 JSONB에 넣지 않는다. 학생 기기에서 WebP로 줄인 파일만
-- 비공개 Storage 버킷에 두고 structured_content에는 post_id로 시작하는 경로만 저장한다.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'report-images',
    'report-images',
    false,
    1572864,
    ARRAY['image/webp', 'image/jpeg']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Report_Images_Select_V1" ON storage.objects;
CREATE POLICY "Report_Images_Select_V1"
ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'report-images'
    AND EXISTS (
        SELECT 1
        FROM public.student_posts post
        WHERE post.id::TEXT = split_part(storage.objects.name, '/', 1)
          AND (
              public.auth_user_role() = 'ADMIN'
              OR post.student_id = public.auth_student_id()
              OR (
                  public.auth_user_role() = 'TEACHER'
                  AND EXISTS (
                      SELECT 1
                      FROM public.classes class
                      WHERE class.id = post.class_id
                        AND class.teacher_id = auth.uid()
                        AND class.deleted_at IS NULL
                  )
              )
              OR (
                  public.auth_user_role() = 'STUDENT'
                  AND post.class_id = public.auth_user_class_id()
                  AND post.is_submitted IS TRUE
                  AND post.visibility = 'class'
              )
          )
    )
);

DROP POLICY IF EXISTS "Report_Images_Insert_V1" ON storage.objects;
CREATE POLICY "Report_Images_Insert_V1"
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'report-images'
    AND storage.objects.name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}/[A-Za-z0-9_-]{1,100}[.](webp|jpg)$'
    AND EXISTS (
        SELECT 1
        FROM public.student_posts post
        JOIN public.writing_missions mission
          ON mission.id = post.mission_id
         AND mission.class_id = post.class_id
        WHERE post.id::TEXT = split_part(storage.objects.name, '/', 1)
          AND post.student_id = public.auth_student_id()
          AND post.is_confirmed IS NOT TRUE
          AND (post.is_submitted IS NOT TRUE OR post.is_returned IS TRUE)
          AND mission.input_template = 'report'
          AND mission.is_archived IS NOT TRUE
    )
);

-- 같은 경로를 덮어쓰지 않고 교체할 때마다 새 UUID 경로를 쓰므로 UPDATE는 허용하지 않는다.
DROP POLICY IF EXISTS "Report_Images_Update_V1" ON storage.objects;

DROP POLICY IF EXISTS "Report_Images_Delete_V1" ON storage.objects;
CREATE POLICY "Report_Images_Delete_V1"
ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'report-images'
    AND EXISTS (
        SELECT 1
        FROM public.student_posts post
        WHERE post.id::TEXT = split_part(storage.objects.name, '/', 1)
          AND post.student_id = public.auth_student_id()
          AND post.is_confirmed IS NOT TRUE
          AND (post.is_submitted IS NOT TRUE OR post.is_returned IS TRUE)
    )
);

CREATE OR REPLACE FUNCTION public.validate_report_post_structure()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_template TEXT;
    v_config JSONB;
    v_sections JSONB;
    v_section JSONB;
    v_image JSONB;
    v_section_count INTEGER;
    v_unique_id_count INTEGER;
    v_filled_count INTEGER;
    v_image_count INTEGER := 0;
    v_min_sections INTEGER;
    v_max_sections INTEGER;
    v_max_images INTEGER;
    v_path TEXT;
BEGIN
    SELECT mission.input_template, COALESCE(mission.template_config, '{}'::JSONB)
    INTO v_template, v_config
    FROM public.writing_missions mission
    WHERE mission.id = NEW.mission_id;

    IF v_template IS DISTINCT FROM 'report' THEN
        RETURN NEW;
    END IF;

    -- 사진을 넣기 전 만들어지는 빈 초안은 허용한다. 제출본은 반드시 보고서 구조를 갖는다.
    IF NEW.structured_content IS NULL THEN
        IF NEW.is_submitted IS TRUE THEN
            RAISE EXCEPTION '보고서 칸 정보가 필요합니다.' USING ERRCODE = '22023';
        END IF;
        RETURN NEW;
    END IF;

    IF jsonb_typeof(NEW.structured_content) <> 'object'
       OR NEW.structured_content ->> 'template' IS DISTINCT FROM 'report'
       OR COALESCE((NEW.structured_content ->> 'version')::INTEGER, 0) <> 1
       OR jsonb_typeof(NEW.structured_content -> 'sections') <> 'array' THEN
        RAISE EXCEPTION '보고서 칸 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF octet_length(NEW.structured_content::TEXT) > 131072 THEN
        RAISE EXCEPTION '보고서 구조 정보가 너무 큽니다.' USING ERRCODE = '22023';
    END IF;

    v_sections := NEW.structured_content -> 'sections';
    v_section_count := jsonb_array_length(v_sections);
    v_min_sections := LEAST(12, GREATEST(1, COALESCE((v_config ->> 'min_sections')::INTEGER, 2)));
    v_max_sections := LEAST(12, GREATEST(v_min_sections, COALESCE((v_config ->> 'max_sections')::INTEGER, 12)));
    v_max_images := LEAST(6, GREATEST(1, COALESCE((v_config ->> 'max_images')::INTEGER, 4)));

    IF v_section_count < 1 OR v_section_count > v_max_sections THEN
        RAISE EXCEPTION '보고서 칸 수가 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT count(DISTINCT section ->> 'id'),
           count(*) FILTER (WHERE btrim(COALESCE(section ->> 'body', '')) <> '')
    INTO v_unique_id_count, v_filled_count
    FROM jsonb_array_elements(v_sections) section;

    IF v_unique_id_count <> v_section_count THEN
        RAISE EXCEPTION '보고서 칸 식별자가 겹칩니다.' USING ERRCODE = '22023';
    END IF;
    IF NEW.is_submitted IS TRUE AND v_filled_count < v_min_sections THEN
        RAISE EXCEPTION '내용을 쓴 보고서 칸이 부족합니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_section IN SELECT value FROM jsonb_array_elements(v_sections)
    LOOP
        IF jsonb_typeof(v_section) <> 'object'
           OR char_length(COALESCE(v_section ->> 'id', '')) NOT BETWEEN 1 AND 80
           OR char_length(COALESCE(v_section ->> 'heading', '')) > 80
           OR char_length(COALESCE(v_section ->> 'body', '')) > 12000 THEN
            RAISE EXCEPTION '보고서 칸 내용이 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
        END IF;

        v_image := v_section -> 'image';
        IF v_image IS NULL OR jsonb_typeof(v_image) = 'null' THEN
            CONTINUE;
        END IF;
        IF jsonb_typeof(v_image) <> 'object' THEN
            RAISE EXCEPTION '보고서 사진 정보가 올바르지 않습니다.' USING ERRCODE = '22023';
        END IF;

        v_image_count := v_image_count + 1;
        v_path := COALESCE(v_image ->> 'path', '');
        IF v_path !~ ('^' || NEW.id::TEXT || '/[A-Za-z0-9_-]{1,80}/[A-Za-z0-9_-]{1,100}[.](webp|jpg)$')
           OR NOT (
               (v_path ~ '[.]webp$' AND v_image ->> 'mimeType' = 'image/webp')
               OR (v_path ~ '[.]jpg$' AND v_image ->> 'mimeType' = 'image/jpeg')
           )
           OR COALESCE((v_image ->> 'bytes')::INTEGER, 0) NOT BETWEEN 1 AND 1572864
           OR COALESCE((v_image ->> 'width')::INTEGER, 0) NOT BETWEEN 1 AND 1600
           OR COALESCE((v_image ->> 'height')::INTEGER, 0) NOT BETWEEN 1 AND 1600
           OR char_length(COALESCE(v_image ->> 'caption', '')) > 240
           OR v_image ? 'url'
           OR v_image ? 'signedUrl' THEN
            RAISE EXCEPTION '보고서 사진 경로나 크기 정보가 올바르지 않습니다.' USING ERRCODE = '22023';
        END IF;
        IF NEW.is_submitted IS TRUE AND btrim(COALESCE(v_image ->> 'caption', '')) = '' THEN
            RAISE EXCEPTION '보고서 사진 설명이 필요합니다.' USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF v_image_count > v_max_images THEN
        RAISE EXCEPTION '보고서 사진 수 제한을 넘었습니다.' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_report_post_structure ON public.student_posts;
CREATE TRIGGER trg_validate_report_post_structure
BEFORE INSERT OR UPDATE OF mission_id, class_id, structured_content, is_submitted
ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.validate_report_post_structure();

REVOKE ALL ON FUNCTION public.validate_report_post_structure() FROM PUBLIC, anon, authenticated;

COMMIT;
