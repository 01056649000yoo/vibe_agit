-- 회색 줄 기록에 교차 확인 두 칸을 더한다(2026-10-08, 선생님 결정: Kiwi 와 다른 오픈소스를 겹쳐 쓴다).
--   agree_hunspell : hunspell 한국어 사전의 판정(TRUE 같은 말 · FALSE 반대 · NULL 모름)
--   agree_mecab    : MeCab-ko 의 띄어쓰기 자리 판정(같은 뜻, 오타 갈래는 늘 NULL)
ALTER TABLE public.spelling_shadow_suggestions
    ADD COLUMN IF NOT EXISTS agree_hunspell BOOLEAN,
    ADD COLUMN IF NOT EXISTS agree_mecab BOOLEAN;
