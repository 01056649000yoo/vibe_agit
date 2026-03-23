-- ============================================================
-- 🔧 [버그 수정] 어휘의 탑 랭킹이 보이지 않는 문제 수정
-- 작성일: 2026-03-23
--
-- 원인:
--   vocab_tower_rankings 테이블의 unique constraint가 (student_id)만
--   설정되어 있어, ON CONFLICT (student_id) upsert 시 class_id가
--   이전 반 값으로 유지됨.
--   학생이 반을 이동했거나 재등록한 경우, class_id가 현재 반과 달라
--   fetchRankings()의 .eq('class_id', classId) 필터에 걸리지 않아
--   랭킹 데이터가 빈 배열로 반환됨.
--
-- 수정:
--   1. unique constraint를 (student_id, class_id) 복합키로 변경
--   2. update_tower_max_floor 함수도 ON CONFLICT (student_id, class_id)
--      방식으로 업데이트
-- ============================================================

-- [1] 기존 unique constraint 제거 및 복합 unique constraint 추가
ALTER TABLE public.vocab_tower_rankings
    DROP CONSTRAINT IF EXISTS vocab_tower_rankings_student_id_key;

-- student_id + class_id 조합이 유니크하도록 설정
-- (한 학생이 여러 반에서 각각 독립적인 랭킹을 가질 수 있음)
ALTER TABLE public.vocab_tower_rankings
    ADD CONSTRAINT vocab_tower_rankings_student_class_uniq
    UNIQUE (student_id, class_id);


-- [2] update_tower_max_floor 함수 수정
--     ON CONFLICT (student_id) → ON CONFLICT (student_id, class_id)
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

    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (p_student_id, p_class_id, p_floor, now())
    ON CONFLICT (student_id, class_id)
    DO UPDATE SET
        max_floor = GREATEST(vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = now()
    WHERE vocab_tower_rankings.max_floor < EXCLUDED.max_floor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
