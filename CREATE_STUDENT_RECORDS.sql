-- ====================================================================
-- student_records 테이블 생성 스크립트 (수정판)
-- Supabase SQL Editor에서 이 파일 전체를 복사해서 실행하세요
-- ====================================================================

-- 1단계: 기존 테이블 삭제 (정책도 함께 삭제됨)
DROP TABLE IF EXISTS public.student_records CASCADE;

-- 2단계: 새 테이블 생성
CREATE TABLE public.student_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE NOT NULL,
    
    -- 기록 타입: 'record_assistant' (생기부 도우미) 또는 'ai_comment' (AI쫑알이)
    record_type TEXT DEFAULT 'record_assistant',
    
    -- 내용
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    mission_ids UUID[] DEFAULT '{}',
    
    -- 메타 정보
    byte_size INTEGER DEFAULT 0,
    activity_count INTEGER DEFAULT 0,
    
    -- 타임스탬프
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3단계: 인덱스 생성
CREATE INDEX idx_student_records_student_id ON public.student_records(student_id);
CREATE INDEX idx_student_records_class_id ON public.student_records(class_id);
CREATE INDEX idx_student_records_created_at ON public.student_records(created_at DESC);
CREATE INDEX idx_student_records_type ON public.student_records(record_type);

-- 4단계: RLS 활성화
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;

-- 5단계: 정책 생성
CREATE POLICY "Teachers can view their class student records" 
    ON public.student_records FOR SELECT 
    USING (teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid()));

CREATE POLICY "Teachers can insert their class student records" 
    ON public.student_records FOR INSERT 
    WITH CHECK (teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid()));

CREATE POLICY "Teachers can update their class student records" 
    ON public.student_records FOR UPDATE 
    USING (teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid()));

CREATE POLICY "Teachers can delete their class student records" 
    ON public.student_records FOR DELETE 
    USING (teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid()));

-- 완료! 브라우저를 새로고침하세요.
