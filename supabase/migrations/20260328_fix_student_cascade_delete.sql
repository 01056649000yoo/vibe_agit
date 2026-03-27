-- ──────────────────────────────────────────────────────────────────
-- [마이그레이션] 학생 삭제 시 연관 데이터 자동 정리 (CASCADE DELETE 강화)
-- 작성일: 2026-03-28
-- 설명: 학생 삭제 시 고아 데이터가 남지 않도록 외래키 제약조건에 ON DELETE CASCADE를 강제 적용합니다.
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
    -- 1. student_posts (게시글)
    ALTER TABLE public.student_posts DROP CONSTRAINT IF EXISTS student_posts_student_id_fkey;
    ALTER TABLE public.student_posts 
      ADD CONSTRAINT student_posts_student_id_fkey 
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

    -- 2. post_comments (댓글)
    ALTER TABLE public.post_comments DROP CONSTRAINT IF EXISTS post_comments_student_id_fkey;
    ALTER TABLE public.post_comments 
      ADD CONSTRAINT post_comments_student_id_fkey 
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

    -- 3. post_reactions (반응)
    ALTER TABLE public.post_reactions DROP CONSTRAINT IF EXISTS post_reactions_student_id_fkey;
    ALTER TABLE public.post_reactions 
      ADD CONSTRAINT post_reactions_student_id_fkey 
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

    -- 4. point_logs (포인트 내역)
    ALTER TABLE public.point_logs DROP CONSTRAINT IF EXISTS point_logs_student_id_fkey;
    ALTER TABLE public.point_logs 
      ADD CONSTRAINT point_logs_student_id_fkey 
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

    -- 5. agit_honor_roll (명예의 전당)
    ALTER TABLE public.agit_honor_roll DROP CONSTRAINT IF EXISTS agit_honor_roll_student_id_fkey;
    ALTER TABLE public.agit_honor_roll 
      ADD CONSTRAINT agit_honor_roll_student_id_fkey 
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

    -- 6. vocab_tower_rankings (어휘의 탑 랭킹)
    ALTER TABLE public.vocab_tower_rankings DROP CONSTRAINT IF EXISTS vocab_tower_rankings_student_id_fkey;
    ALTER TABLE public.vocab_tower_rankings 
      ADD CONSTRAINT vocab_tower_rankings_student_id_fkey 
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

    -- 7. student_records (생기부 분석 기록)
    ALTER TABLE public.student_records DROP CONSTRAINT IF EXISTS student_records_student_id_fkey;
    ALTER TABLE public.student_records 
      ADD CONSTRAINT student_records_student_id_fkey 
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;

END $$;

-- [보너스] 이미 삭제된 학생의 고아 데이터 즉시 정리 (Cleanup)
DELETE FROM public.student_posts WHERE student_id NOT IN (SELECT id FROM public.students);
DELETE FROM public.post_comments WHERE student_id NOT IN (SELECT id FROM public.students);
DELETE FROM public.post_reactions WHERE student_id NOT IN (SELECT id FROM public.students);
DELETE FROM public.point_logs WHERE student_id NOT IN (SELECT id FROM public.students);
DELETE FROM public.agit_honor_roll WHERE student_id NOT IN (SELECT id FROM public.students);
DELETE FROM public.vocab_tower_rankings WHERE student_id NOT IN (SELECT id FROM public.students);
DELETE FROM public.student_records WHERE student_id NOT IN (SELECT id FROM public.students);

NOTIFY pgrst, 'reload schema';
