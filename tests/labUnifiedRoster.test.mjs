import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  "supabase/migrations/20261030_lab_unified_roster.sql",
  "utf8",
);

test("연구소 활동은 아지트 학급과 학생을 직접 참조한다", () => {
  assert.match(migration, /ALTER TABLE writing_helper\.rooms[\s\S]*agit_class_id UUID REFERENCES public\.classes\(id\)/);
  assert.match(migration, /ALTER TABLE writing_helper\.student_sessions[\s\S]*agit_student_id UUID REFERENCES public\.students\(id\)/);
  assert.match(migration, /rooms_agit_class_id_created_at_idx/);
  assert.match(migration, /student_sessions_room_agit_student_uidx/);
});

test("과거 결과는 확정된 명단 연결만 보강하고 불확실한 행은 추정하지 않는다", () => {
  assert.match(migration, /roster\.student_number = session\.student_number/);
  assert.match(migration, /roster\.student_name = session\.student_name/);
  assert.match(migration, /roster\.agit_student_id IS NOT NULL/);
  assert.doesNotMatch(migration, /ILIKE|similarity|levenshtein/);
});
