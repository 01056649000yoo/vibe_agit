-- 정상 관문 보충 안내에 **어느 층인지**를 담는다.
--
-- 정상 관문의 오답은 열 개 층에 흩어진다(실측: 1·2·3·6층). 그런데 안내가
-- "열 층에 흩어져 있어요"까지만 말해서, 학생이 지도에서 어느 층을 눌러야 할지 알 수 없었다.
-- 서버는 이미 남은 항목 키를 갖고 있으므로 층별로 세어 주면 된다.
--
-- 엔진(`learning_engine_retry_gate_v1`)은 항목 키를 해석하지 않는 콘텐츠 중립 함수라 여기서 못 한다.
-- **층을 아는 것은 어휘 어댑터**이므로 이 파일에서 덧붙인다.

BEGIN;

CREATE OR REPLACE FUNCTION public.vocab_tower_v2_retry_breakdown_v1(
    p_item_keys TEXT[],
    p_grade SMALLINT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'deck_number')::INT), '[]'::JSONB)
    FROM (
        SELECT jsonb_build_object('deck_number', deck.deck_number, 'count', count(*)) AS row
        FROM public.vocab_tower_v2_review_items item
        JOIN public.vocab_tower_v2_review_decks deck ON deck.deck_id = item.deck_id
        WHERE deck.grade = p_grade
          AND item.item_key = ANY(COALESCE(p_item_keys, ARRAY[]::TEXT[]))
        GROUP BY deck.deck_number
    ) grouped;
$$;

REVOKE ALL ON FUNCTION public.vocab_tower_v2_retry_breakdown_v1(TEXT[], SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vocab_tower_v2_retry_breakdown_v1(TEXT[], SMALLINT) TO authenticated, service_role;

COMMIT;
