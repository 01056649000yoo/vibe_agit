-- Stage 2b: 연구소(writing_helper) ↔ 아지트(public) 학생/학급 매핑
-- 대상: 유승현·최원진 확정 학급쌍. (2026-07-24 선생님 확정)
--   여수진남초4(8a0dd5e0) → 진남초 AI글쓰기 대회 4학년(23c7a4d4)
--   동백 5학년1반(b6dbca6c) → 26년 동백 5-1(cdba274b)
--   테스트(c8b25ce1) 및 나머지 = 매핑 제외(NULL)
-- 규칙: 학급쌍 내 이름이 정확히 1명만 일치할 때만 연결. 미일치/중복(예: 신율희 2명)은 NULL로 둠(수동 확인).
-- 적용 대상 DB: 새 통합 스택 agit-db (owner supabase_admin). 되돌리기: 두 컬럼 DROP.

BEGIN;

-- 1) 매핑 컬럼 (추가만, 되돌리기 쉬움)
ALTER TABLE writing_helper.classes
  ADD COLUMN IF NOT EXISTS agit_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;
ALTER TABLE writing_helper.class_students
  ADD COLUMN IF NOT EXISTS agit_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

-- 2) 학급 매핑 (확정 2쌍)
UPDATE writing_helper.classes SET agit_class_id='23c7a4d4-ac0a-4f05-aca7-15f2e0414ccc'
  WHERE id='8a0dd5e0-97c0-465a-a1eb-7b880b39dd02';
UPDATE writing_helper.classes SET agit_class_id='cdba274b-b683-4944-b978-0b0266fb403d'
  WHERE id='b6dbca6c-812a-4550-8f98-924807ff7c58';

-- 3) 학생 매핑: 학급쌍 내 이름이 정확히 1명 일치할 때만
UPDATE writing_helper.class_students cs
SET agit_student_id = m.sid
FROM (
  SELECT csid, sid FROM (
    SELECT cs2.id AS csid, s.id AS sid,
           count(*) OVER (PARTITION BY cs2.id) AS n
    FROM writing_helper.class_students cs2
    JOIN writing_helper.classes c ON c.id = cs2.class_id AND c.agit_class_id IS NOT NULL
    JOIN public.students s ON s.class_id = c.agit_class_id AND s.name = cs2.student_name
  ) x WHERE n = 1
) m
WHERE cs.id = m.csid;

COMMIT;
