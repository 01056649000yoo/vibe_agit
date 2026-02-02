-- ====================================================================
-- student_records 테이블 생성 (단계별 실행)
-- ====================================================================

-- 1단계: 기존 정책 삭제
DROP POLICY IF EXISTS "Teachers can view their class student records" ON public.student_records;
DROP POLICY IF EXISTS "Teachers can insert their class student records" ON public.student_records;
DROP POLICY IF EXISTS "Teachers can update their class student records" ON public.student_records;
DROP POLICY IF EXISTS "Teachers can delete their class student records" ON public.student_records;

-- 2단계: 기존 테이블 삭제
DROP TABLE IF EXISTS public.student_records CASCADE;

-- 3단계: 새 테이블 생성
CREATE TABLE public.student_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE NOT NULL,
    record_type TEXT DEFAULT 'record_assistant',
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    mission_ids UUID[] DEFAULT '{}',
    byte_size INTEGER DEFAULT 0,
    activity_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4단계: 인덱스 생성
CREATE INDEX idx_student_records_student_id ON public.student_records(student_id);
CREATE INDEX idx_student_records_class_id ON public.student_records(class_id);
CREATE INDEX idx_student_records_created_at ON public.student_records(created_at DESC);
CREATE INDEX idx_student_records_type ON public.student_records(record_type);

-- 5단계: RLS 활성화
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;

-- 6단계: 정책 생성
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
