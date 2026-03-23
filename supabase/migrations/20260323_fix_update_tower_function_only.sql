-- ============================================================
-- 🔧 [핫픽스] update_tower_max_floor 함수만 단독 업데이트
-- 
-- 이전 마이그레이션(20260323_fix_vocab_tower_ranking.sql)에서
-- constraint 중복 오류로 트랜잭션이 롤백되어 함수 업데이트가
-- 적용되지 않은 경우 이 파일만 실행하세요.
--
-- 전제조건: vocab_tower_rankings_student_class_uniq 가 이미 존재해야 함
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_tower_max_floor(p_student_id UUID, p_class_id UUID, p_floor INTEGER)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        IF current_setting('role') = 'service_role' THEN
            v_is_authorized := true;
        END IF;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_authorized;
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id AND s.class_id = p_class_id AND s.deleted_at IS NULL
                  AND (s.auth_id = v_caller_id OR c.teacher_id = v_caller_id)
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 랭킹을 변경할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    -- ON CONFLICT (student_id, class_id) 로 업데이트 — 반드시 복합 unique constraint 필요
    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (p_student_id, p_class_id, p_floor, now())
    ON CONFLICT (student_id, class_id)
    DO UPDATE SET
        max_floor = GREATEST(vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 적용 확인용 (이 결과 확인 가능)
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'update_tower_max_floor';

NOTIFY pgrst, 'reload schema';
