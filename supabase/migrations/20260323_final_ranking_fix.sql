-- ============================================================
-- 🛡️ [마지막 수단] 어휘의 탑 랭킹 시스템 최종 복구 스크립트
-- 
-- 설명: 기존의 모든 충돌 가능성을 제거하고, 
--       반드시 작동하는 랭킹 업데이트 함수를 설치합니다.
-- ============================================================

DO $$ 
BEGIN
    -- 1. 기존의 잘못된(student_id 단독) 제약 조건 제거
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vocab_tower_rankings_student_id_key') THEN
        ALTER TABLE public.vocab_tower_rankings DROP CONSTRAINT vocab_tower_rankings_student_id_key;
    END IF;

    -- 2. 복합 unique 제약 조건이 없으면 추가
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'vocab_tower_rankings_student_class_uniq' 
        AND conrelid = 'public.vocab_tower_rankings'::regclass
    ) THEN
        ALTER TABLE public.vocab_tower_rankings 
        ADD CONSTRAINT vocab_tower_rankings_student_class_uniq UNIQUE (student_id, class_id);
    END IF;
END $$;

-- 3. 랭킹 업데이트 함수 (SECURITY DEFINER로 권한 우회 해결)
CREATE OR REPLACE FUNCTION public.update_tower_max_floor(
    p_student_id UUID, 
    p_class_id UUID, 
    p_floor INTEGER
)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();
    
    -- 권한 체크 (어드민, 본인, 또는 해당 반 교사)
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

    -- 데이터 삽입 또는 업데이트 (ON CONFLICT 구문 수정)
    -- WHERE 조건을 제거하여 무조건 최신 기록으로 갱신될 수 있도록 하되,
    -- 기존 기록보다 낮은 층수는 GREATEST로 방어합니다.
    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (p_student_id, p_class_id, p_floor, now())
    ON CONFLICT (student_id, class_id)
    DO UPDATE SET
        max_floor = GREATEST(vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. RLS 정책 재확인 (혹시 모를 차단 확인)
DROP POLICY IF EXISTS "Tower_Rankings_Read" ON public.vocab_tower_rankings;
CREATE POLICY "Tower_Rankings_Read" ON public.vocab_tower_rankings FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.students s 
        WHERE s.class_id = vocab_tower_rankings.class_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

-- 스키마 캐시 리로드
NOTIFY pgrst, 'reload schema';
