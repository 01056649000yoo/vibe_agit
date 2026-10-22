-- 공통 맞춤법 자료 정리(2026-10-22, 문항 교차 점검 결과). 데이터만 고치며 테이블·함수는 바꾸지 않는다.
--  1) 학생에게 보이는 해설에 섞인 만든 사람용 메모("한 학급에서만 나온 …")를 뺀다.
--  2) 틀리다고 한 쪽도 표준어인 `재밌게` 는 끈다(disabled).
--  3) 질문이 어긋나거나 예문이 어색한 자료를 바로잡는다.
-- 같은 문장을 다시 돌려도 결과가 같다. 공통(common) 자료만 건드린다 — 선생님이 만든 학급 자료는 그대로 둔다.
SET LOCAL app.bypass_profile_protection = 'true';

-- 1) 만든 사람용 메모 문장 빼기
UPDATE public.spelling_learning_entries
   SET explanation = btrim(regexp_replace(explanation, '\s*[^.!?。]*(학급에서만|한 번 나온|참고 자료|주의 자료|주의 항목|주의가 필요)[^.!?。]*[.!?。]', '', 'g')),
       updated_at = now()
 WHERE scope = 'common'
   AND explanation ~ '(학급에서만|한 번 나온|참고 자료|주의 자료|주의 항목|주의가 필요)'
   AND char_length(btrim(regexp_replace(explanation, '\s*[^.!?。]*(학급에서만|한 번 나온|참고 자료|주의 자료|주의 항목|주의가 필요)[^.!?。]*[.!?。]', '', 'g'))) >= 1;

-- 2) 재밌게 / 재미있게 — 둘 다 표준어라 정답이 둘이 된다
UPDATE public.spelling_learning_entries SET status = 'disabled', updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '재밌게' AND correct_expression = '재미있게' AND status <> 'disabled';

-- 3) 고쳐 쓰기
UPDATE public.spelling_learning_entries
   SET correct_expression = '놀 수도 있어', label = '놀 수도 있어 / 놀수도있어',
       explanation = '‘놀 수도 있어’처럼 ‘수’와 ‘도’, ‘있어’는 서로 다른 말이라 띄어 써요.',
       examples = '["나는 친구와 놀 수도 있어.", "비가 그치면 운동장에서 놀 수도 있어."]'::jsonb, updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '놀수도있어' AND correct_expression = '놀 수 있어요';

UPDATE public.spelling_learning_entries
   SET explanation = '‘질문하다’는 한 낱말이라 ‘질문 해’처럼 띄지 않아요. ‘질문해 준’이 원칙이고, ‘질문해준’처럼 붙여 써도 돼요.', updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '질문 해준' AND correct_expression = '질문해준';

UPDATE public.spelling_learning_entries
   SET examples = '["동생이 초등학생이 되던 해를 떠올렸다.", "열 살이 되던 해에 이사를 했다."]'::jsonb, updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '되던해' AND correct_expression = '되던 해';

UPDATE public.spelling_learning_entries
   SET examples = '["이것이 바로 내가 찾던 것입니다.", "제가 말씀드린 것입니다."]'::jsonb, updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '것 입니다' AND correct_expression = '것입니다';

UPDATE public.spelling_learning_entries
   SET examples = '["물이 안 나오는 이유를 알아보자.", "목소리가 안 나오는 날이 있다."]'::jsonb, updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '안나오는' AND correct_expression = '안 나오는';

UPDATE public.spelling_learning_entries
   SET examples = '["나도 잘 할 수 있을 것 같다.", "내일은 갈 수 있을 거예요."]'::jsonb, updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '할 수있을' AND correct_expression = '할 수 있을';

UPDATE public.spelling_learning_entries
   SET examples = '["도움이 된다는 점이 중요하다.", "다르다는 점을 기억하자."]'::jsonb, updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '된다는점' AND correct_expression = '된다는 점';

UPDATE public.spelling_learning_entries
   SET examples = '["한 번에 두 개씩 집었어요.", "계단을 한 번에 세 칸씩 뛰었다."]'::jsonb, updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '한번에' AND correct_expression = '한 번에';

UPDATE public.spelling_learning_entries
   SET explanation = '‘내다’에 ‘-어서’가 붙으면 ‘내서’예요. ‘네서’가 아니고, ‘못’은 뒤의 말과 띄어 ‘못 내서’로 써요.', updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '못네서' AND correct_expression = '못 내서';

UPDATE public.spelling_learning_entries
   SET explanation = '‘다행히’는 ‘다행’에 ‘-히’가 붙은 말이에요. ‘다행이’로 쓰지 않아요.', updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '다행이' AND correct_expression = '다행히';

UPDATE public.spelling_learning_entries
   SET explanation = '‘세’와 ‘번’은 서로 다른 낱말이라 띄어 써요. 수를 나타내는 말과 단위는 띄어 쓰는 것이 원칙이에요.', updated_at = now()
 WHERE scope = 'common' AND wrong_expression = '세번' AND correct_expression = '세 번';
