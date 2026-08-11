BEGIN;

-- student_posts 임시 저장은 (student_id, mission_id) 기준 UPSERT를 사용한다.
-- PostgreSQL은 ON CONFLICT 처리 전에 BEFORE INSERT 트리거를 실행하므로, 기존 글을
-- 갱신하는 요청도 잠깐 새 NEW.id를 가진다. 사진 경로는 기존 글 id로 시작하기 때문에
-- 이 단계에서 NEW.id와 바로 비교하면 정상 사진까지 거부된다.
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
    v_existing_post_id UUID;
    v_expected_post_id UUID;
BEGIN
    SELECT mission.input_template, COALESCE(mission.template_config, '{}'::JSONB)
    INTO v_template, v_config
    FROM public.writing_missions mission
    WHERE mission.id = NEW.mission_id;

    IF v_template IS DISTINCT FROM 'report' THEN
        RETURN NEW;
    END IF;

    -- INSERT 시도라도 같은 학생·과제 글이 이미 있으면 ON CONFLICT 뒤에는 그 행을
    -- 갱신한다. Storage 경로도 그 기존 글 id를 사용하므로 같은 기준으로 검증한다.
    v_expected_post_id := NEW.id;
    IF TG_OP = 'INSERT' THEN
        SELECT post.id
        INTO v_existing_post_id
        FROM public.student_posts post
        WHERE post.student_id = NEW.student_id
          AND post.mission_id = NEW.mission_id
        ORDER BY post.updated_at DESC, post.id
        LIMIT 1;

        v_expected_post_id := COALESCE(v_existing_post_id, NEW.id);
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
    v_max_images := LEAST(3, GREATEST(1, COALESCE((v_config ->> 'max_images')::INTEGER, 3)));

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
        IF v_path !~ ('^' || v_expected_post_id::TEXT || '/[A-Za-z0-9_-]{1,80}/[A-Za-z0-9_-]{1,100}[.](webp|jpg)$')
           OR NOT (
               (v_path ~ '[.]webp$' AND v_image ->> 'mimeType' = 'image/webp')
               OR (v_path ~ '[.]jpg$' AND v_image ->> 'mimeType' = 'image/jpeg')
           )
           OR COALESCE((v_image ->> 'bytes')::INTEGER, 0) NOT BETWEEN 1 AND 262144
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

REVOKE ALL ON FUNCTION public.validate_report_post_structure() FROM PUBLIC, anon, authenticated;

COMMIT;
