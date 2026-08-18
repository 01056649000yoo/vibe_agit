-- 휘장 원판의 그림을 정상(어휘 마스터)에 맞춘다.
--
-- `emblem_icon` 은 휘장 카드의 원판에 들어가는 그림이다. 카드를 다시 짜면서 정상이 주인공이 됐는데
-- 어휘는 🏆 로 등록돼 있었다. 🏆 는 지도에서 **덱마스터** 버튼이 쓰는 그림이라 둘이 같아 보이면
-- "어휘 마스터가 덱마스터의 한 종류"로 읽힌다. 정상은 지도와 같은 👑 로 맞춘다.
UPDATE public.learning_content_types
   SET emblem_icon = '👑', updated_at = NOW()
 WHERE content_type = 'vocab' AND emblem_icon <> '👑';
