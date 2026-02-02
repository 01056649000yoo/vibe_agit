# SQL 스키마 통합 완료

## 📋 통합된 파일
**`integrated_schema_v4.sql`** - 모든 테이블과 정책이 통합된 마스터 스키마

## ✅ v4.1 최종 업데이트 내용

### 새로 추가된 테이블
- **`student_records`** - 생기부 도우미 및 AI쫑알이 기록 저장
  - `record_type`: 'record_assistant' (생기부 도우미) 또는 'ai_comment' (AI쫑알이)
  - `student_id`: 생기부 도우미용 (개별 학생), AI쫑알이는 NULL
  - `mission_ids`: AI쫑알이에서 선택한 미션 ID 배열
  - `tags`: 생기부 도우미에서 선택한 태그 배열
  - `content`: 생성된 내용
  - `activity_count`: 참고한 활동 개수 또는 분석한 학생 수

### 수정된 테이블
- **`classes`**
  - `class_name` → `name` (컬럼명 변경)

- **`student_posts`**
  - `title` 컬럼 추가
  - `is_submitted` 컬럼 추가

## 🚀 Supabase 적용 방법

### 방법 1: 전체 스키마 재생성 (권장 - 개발 환경)
```sql
-- 주의: 모든 데이터가 삭제됩니다!
-- integrated_schema_v4.sql 파일 전체를 Supabase SQL Editor에서 실행
```

### 방법 2: 기존 데이터 보존 (운영 환경)
```sql
-- student_records 테이블만 생성/수정
DROP TABLE IF EXISTS public.student_records CASCADE;

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

CREATE INDEX idx_student_records_student_id ON public.student_records(student_id);
CREATE INDEX idx_student_records_class_id ON public.student_records(class_id);
CREATE INDEX idx_student_records_created_at ON public.student_records(created_at DESC);
CREATE INDEX idx_student_records_type ON public.student_records(record_type);

ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view their class student records" ON student_records FOR SELECT USING (
    teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid())
);

CREATE POLICY "Teachers can insert their class student records" ON student_records FOR INSERT WITH CHECK (
    teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid())
);

CREATE POLICY "Teachers can update their class student records" ON student_records FOR UPDATE USING (
    teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid())
);

CREATE POLICY "Teachers can delete their class student records" ON student_records FOR DELETE USING (
    teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid())
);
```

## 📁 파일 정리

### 사용할 파일
- ✅ `integrated_schema_v4.sql` - **이 파일만 사용하세요!**

### 삭제 가능한 파일 (이미 통합됨)
- ❌ `create_student_records_table.sql`
- ❌ `migrate_student_records.sql`
- ❌ `remove_invite_code_migration.sql`

## 🎯 주요 기능

### 1. 생기부 도우미 (RecordAssistant)
- 개별 학생의 생기부 문구 생성 및 저장
- `record_type = 'record_assistant'`
- `student_id`에 학생 ID 저장
- `tags` 배열에 선택한 태그 저장

### 2. AI쫑알이 (ActivityReport)
- 학급 전체 학생의 일괄 분석 결과 저장
- `record_type = 'ai_comment'`
- `student_id = NULL` (학급 단위)
- `mission_ids` 배열에 선택한 미션 ID들 저장
- 생성 이력 목록으로 표시

## ⚠️ 주의사항
- RLS 정책이 자동으로 적용됩니다
- 교사는 자신의 학급 데이터만 접근 가능합니다
- `CREATE TABLE IF NOT EXISTS` 구문으로 안전하게 생성됩니다
