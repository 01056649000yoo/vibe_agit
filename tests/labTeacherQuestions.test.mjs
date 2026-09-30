import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 연구소 질문 만들기에 선생님이 더한 질문(2026-09-30, `20261361`).
 * 표는 연구소(service_role)만 쓰고, 아지트 `연구소 질문 불러오기` 에는 `선생님` 으로 실린다.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('선생님 질문 표는 브라우저 역할에 닫고 연구소에만 연다', async () => {
    const sql = await read('supabase/migrations/20261361_lab_teacher_questions.sql');
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE ALL ON TABLE writing_helper\.room_teacher_questions FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE writing_helper\.room_teacher_questions TO service_role/);
    assert.match(sql, /ON DELETE CASCADE/, '방을 지우면 선생님 질문도 지워져야 합니다.');
    // 방 목록 수와 꾸러미가 같은 표를 본다(한쪽만 고치면 수와 목록이 어긋난다).
    assert.equal((sql.match(/writing_helper\.room_teacher_questions tq/g) ?? []).length, 2);
    assert.match(sql, /'선생님'::TEXT AS authors/);
});

test('불러오기 창은 선생님 질문을 학생 수 대신 `선생님` 으로, 처음부터 골라 둔다', async () => {
    const api = await read('src/modules/writing/references/labReferenceApi.js');
    const modal = await read('src/components/teacher/MissionLabQuestionsModal.jsx');
    assert.match(api, /fromTeacher: String\(row\.question_id \|\| ''\)\.startsWith\('teacher-'\)/);
    assert.match(modal, /q\.fromTeacher \? '👩‍🏫 선생님'/);
    assert.match(modal, /q\.pickedCount > 1 \|\| q\.fromTeacher/);
});
