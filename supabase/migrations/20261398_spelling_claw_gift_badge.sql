-- 수호룡의 인형뽑기 — 교사 메뉴 배지: 아직 안 준 선생님 선물 수 (2026-10-13)
--
-- 선생님 선물은 서버가 기록만 하고 교사가 직접 챙겨 준다. 지금까지는 놀이터 > 인형뽑기 > 뽑기 내역을
-- 열어야만 당첨을 알 수 있어, 학생이 뽑고 나서도 교사가 모르고 지나갔다.
-- 대시보드가 메뉴를 그릴 때 이 수를 받아 `아지트 놀이터` 메뉴와 인형뽑기 메뉴에 빨간 숫자로 띄운다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_spelling_claw_gift_badge_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- 배지는 메뉴를 그릴 때마다 불리므로, 권한이 없으면 오류 대신 0 을 준다(메뉴가 깨지지 않게).
    IF auth.uid() IS NULL
       OR NOT (public.auth_user_role() = 'ADMIN'
               OR EXISTS (SELECT 1 FROM public.classes c
                          WHERE c.id = p_class_id AND c.teacher_id = auth.uid())) THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    -- ⚠️ 아래 조건은 get_teacher_spelling_claw_history_v1 의 pending_gifts 와 같아야 한다.
    --    어긋나면 배지 숫자와 `아직 안 준 선물` 목록이 달라 교사가 헷갈린다.
    --    tests/spellingClawGiftBadge.test.mjs 가 두 곳을 함께 본다.
    SELECT count(*)::INTEGER INTO v_count
    FROM public.spelling_claw_plays play
    CROSS JOIN LATERAL jsonb_array_elements(play.prizes) prize(value)
    WHERE play.class_id = p_class_id AND play.status = 'done'
      AND prize.value ->> 'kind' = 'gift' AND NOT (prize.value ? 'given_at');

    RETURN jsonb_build_object('count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_spelling_claw_gift_badge_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_spelling_claw_gift_badge_v1(UUID) TO authenticated;
COMMENT ON FUNCTION public.get_teacher_spelling_claw_gift_badge_v1(UUID) IS
    '메뉴 배지용 — 학생이 인형뽑기에서 뽑았지만 교사가 아직 `줬어요` 를 누르지 않은 선생님 선물 수. 세는 기준은 뽑기 내역의 아직 안 준 선물과 같다.';

COMMIT;
