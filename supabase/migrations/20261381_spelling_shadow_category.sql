-- 회색 줄 기록에 갈래·보여 줄지·뺀 까닭을 더한다(2026-10-08, 선생님 결정: 잘 맞는 갈래만 골라 보여 주는 방식).
--   category : particle_attach(조사·어미 붙이기) · modifier_noun(꾸미는 말+명사 띄우기) · typo(받침·글자 오타) · other_spacing(그 밖)
--   shown    : 2단계에서 학생에게 보였을지(고른 갈래 + 거르기를 지나고 빨간 줄과 안 겹침)
--   filter_reason : 거른 까닭(auxiliary 제47항 · neunde '-는데' · repeat 반복어 · ambiguous 뜻 갈림 · proper_noun 이름)
ALTER TABLE public.spelling_shadow_suggestions
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other_spacing'
        CHECK (category IN ('particle_attach', 'modifier_noun', 'typo', 'other_spacing')),
    ADD COLUMN IF NOT EXISTS shown BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS filter_reason TEXT
        CHECK (filter_reason IS NULL OR filter_reason IN ('auxiliary', 'neunde', 'repeat', 'ambiguous', 'proper_noun', 'red_overlap'));
