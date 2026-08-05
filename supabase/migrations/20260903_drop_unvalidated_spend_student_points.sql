-- 검증 없이 pet_data 를 저장하던 spend_student_points 를 제거한다.
--
-- 이 함수는 클라이언트가 보낸 p_pet_data 를 그대로 students.pet_data 에 썼다.
-- 학생 인증만 있으면 호출할 수 있어, 브라우저에서 직접 부르면 아지트 공방 소품을
-- 구매 없이 소유 목록에 넣거나 교감 기록을 임의로 조작할 수 있었다.
--
-- 마지막 호출처였던 수호룡 교감은 20260902 에서 전용 RPC bond_with_my_dragon() 으로 옮겼다.
-- 앱 코드·엣지 함수·다른 DB 함수·RLS 정책 어디에도 남은 참조가 없음을 확인하고 지운다.
-- 포인트 증감은 increment_student_points / teacher_manage_points 가,
-- 공방 구매·장착은 buy_my_dragon_decor / equip_my_dragon_decor 가 계속 담당한다.

BEGIN;

DROP FUNCTION IF EXISTS public.spend_student_points(integer, text, jsonb);

NOTIFY pgrst, 'reload schema';

COMMIT;
