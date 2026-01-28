-- 피드백(버그 제보/개선 요청) 저장용 테이블 생성
create table if not exists feedback_reports (
  id uuid default gen_random_uuid() primary key,
  teacher_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  content text not null,
  status text default 'open',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS 정책 설정 (선생님은 자신의 피드백을 보고(선택적) 쓸 수 있음, 관리자만 전체 조회 가능)
alter table feedback_reports enable row level security;

create policy "Teachers can insert their own feedback"
  on feedback_reports for insert
  with check (auth.uid() = teacher_id);

create policy "Teachers can view their own feedback"
  on feedback_reports for select
  using (auth.uid() = teacher_id);
