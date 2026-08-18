-- 휘장 카드가 "몇 개"가 아니라 **"몇 층"**을 통과했는지 보여 줄 수 있게 한다.
--
-- 지금까지 요약은 `passed_count`(개수)만 보냈다. 화면은 그 수만큼 앞에서부터 칸을 채웠는데,
-- 학생이 3·5·7층을 통과하면 **1·2·3층이 켜진 것처럼 그려진다.** 개수는 맞고 그림은 틀렸다.
--
-- 묶음 키의 **끝 숫자를 묶음 번호로 본다**(`g4:d7` → 7). 엔진이 콘텐츠를 해석하지 않으면서도
-- 순서를 알 수 있는 가장 가벼운 약속이다. 끝에 숫자가 없는 콘텐츠는 배열이 비고,
-- 화면은 번호 없이 개수만 그리도록 되어 있다.
--
-- 진행도와 같은 등급의 정보라 `p_include_progress` 가 참일 때만 담는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.learning_engine_mastery_summary_v1(
    p_student_id UUID,
    p_class_id UUID,
    p_include_progress BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_items JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'content_type'), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT jsonb_strip_nulls(jsonb_build_object(
            'content_type', content.content_type,
            'display_name', content.display_name,
            'emblem_icon', content.emblem_icon,
            'collection_label', content.collection_label,
            'summit_label', content.summit_label,
            'master_title', content.master_title,
            'collection_count', content.collection_count,
            'summit_reached', award.student_id IS NOT NULL,
            'summit_awarded_at', award.awarded_at,
            'summit_level', award.summit_level,
            'summit_level_count', content.summit_level_count,
            'all_collections_cleared', passed.passed_count >= content.collection_count,
            'passed_count', CASE WHEN p_include_progress THEN passed.passed_count ELSE NULL END,
            -- 통과한 묶음의 **번호** 목록. 화면이 어느 칸을 켤지 이걸로 정한다.
            'passed_ordinals', CASE WHEN p_include_progress THEN passed.passed_ordinals ELSE NULL END
        )) AS entry
        FROM public.learning_content_types content
        LEFT JOIN LATERAL (
            SELECT
                count(*)::INTEGER AS passed_count,
                COALESCE(
                    jsonb_agg(DISTINCT ordinal ORDER BY ordinal) FILTER (WHERE ordinal IS NOT NULL),
                    '[]'::JSONB
                ) AS passed_ordinals
            FROM (
                SELECT DISTINCT
                    attempt.collection_key,
                    -- 끝에 붙은 숫자만 취한다(`g4:d10` → 10). 숫자로 끝나지 않으면 NULL.
                    NULLIF(regexp_replace(attempt.collection_key, '^.*[^0-9]', ''), '')::INTEGER AS ordinal
                FROM public.learning_challenge_attempts attempt
                WHERE attempt.student_id = p_student_id
                  AND attempt.class_id = p_class_id
                  AND attempt.content_type = content.content_type
                  AND attempt.challenge_kind = 'collection'
                  AND attempt.status = 'completed'
                  AND attempt.passed IS TRUE
            ) keys
        ) passed ON TRUE
        LEFT JOIN public.learning_summit_awards award
          ON award.student_id = p_student_id
         AND award.content_type = content.content_type
        WHERE content.is_active
    ) rows;

    RETURN jsonb_build_object('version', 3, 'contents', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.learning_engine_mastery_summary_v1(UUID, UUID, BOOLEAN)
    FROM PUBLIC, anon, authenticated;

COMMIT;
