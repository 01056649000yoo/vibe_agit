import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/migrations/20261260_class_student_numbers.sql', 'utf8');
const hook = readFileSync('src/hooks/useStudentManager.js', 'utf8');
const list = readFileSync('src/components/teacher/StudentManagementList.jsx', 'utf8');
const manager = readFileSync('src/components/teacher/StudentManager.jsx', 'utf8');
const header = readFileSync('src/components/teacher/StudentManagerHeader.jsx', 'utf8');

test('학급 번호는 저장된 값이며 화면이 자리 번호로 다시 매기지 않는다', () => {
    // 2026-09-07 이전에는 명단의 번호가 `idx + 1` 이었다. 그래서 이름을 잘못 적어 지우고 다시 넣으면
    // 등록 시각이 가장 최근이 되어 그 학생만 번호가 맨 뒤로 갔다.
    assert.match(migration, /ADD COLUMN IF NOT EXISTS student_no SMALLINT/);
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS students_class_student_no_key/);
    assert.match(migration, /WHERE deleted_at IS NULL AND student_no IS NOT NULL/);

    // 화면이 저장된 번호를 쓴다. `idx + 1` 로 되돌아가면 같은 문제가 다시 생긴다.
    assert.match(list, /s\.student_no \?\? idx \+ 1/);
    assert.doesNotMatch(list, /const studentNo = idx \+ 1;/);
    // 번호순 정렬도 등록 시각이 아니라 번호를 본다.
    assert.match(manager, /a\.student_no \?\? 999\) - \(b\.student_no \?\? 999\)/);
});

test('교사는 번호를 직접 고치고 한꺼번에 다시 매길 수 있다', () => {
    for (const fn of ['set_class_student_numbers_v1', 'renumber_class_students_v1', 'rename_class_student_v1']) {
        assert.ok(migration.includes(`CREATE OR REPLACE FUNCTION public.${fn}`), `${fn} 이 없습니다.`);
        assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION public.${fn}`), `${fn} 을 화면이 부를 수 없습니다.`);
        assert.ok(hook.includes(fn), `${fn} 을 부르는 화면 코드가 없습니다.`);
    }
    // 세 함수 모두 같은 관문을 지난다 — 남의 학급 명단을 고칠 수 없어야 한다.
    assert.equal((migration.match(/PERFORM public\.assert_class_roster_editor_v1/g) || []).length, 3);

    // 번호를 서로 맞바꿀 때 잠깐 겹치므로, 한 줄씩 고치지 않고 한꺼번에 비웠다 채운다.
    assert.match(migration, /UPDATE public\.students s SET student_no = NULL/);
    assert.match(hook, /p_assignments: \[\{ id: studentId, no: Number\(studentNo\) \}\]/);

    assert.match(header, /번호 다시 매기기/);
    assert.match(list, /번호 \$\{studentNo\} 고치기/);
    assert.match(list, /이름 고치기/);
});

test('이름을 고치면 실명을 복사해 둔 곳도 함께 고친다', () => {
    // 기록 대부분은 학생 id 로 이어져 저절로 따라오지만, 세 곳은 실명을 복사해 둔다.
    // 오타를 고치는 것이 목적이므로 그 사본이 옛 이름으로 남으면 안 된다.
    const rename = migration.slice(migration.indexOf('FUNCTION public.rename_class_student_v1'));
    assert.match(rename, /UPDATE public\.reading_marathon_participants/, '독서마라톤 명단 사본을 고치지 않습니다.');
    assert.match(rename, /UPDATE public\.neighbor_shared_posts/, '이웃 아지트 공유글 지은이를 고치지 않습니다.');
    assert.match(rename, /UPDATE public\.class_agit_book_items/, '글꽃 책방 작품 지은이를 고치지 않습니다.');

    // 학생 추가와 같은 이름 길이 기준을 쓴다.
    assert.match(rename, /char_length\(v_name\) NOT BETWEEN 1 AND 30/);
});

test('교사 명단 조회는 번호를 함께 내려 주고 번호순으로 준다', () => {
    // 화면이 번호를 그리려면 조회 결과에 번호가 있어야 한다. 둘 중 하나만 고치면 번호가 빈칸이 된다.
    const snapshot = migration.slice(migration.indexOf('FUNCTION public.get_teacher_point_manager_snapshot'));
    assert.match(snapshot, /'student_no', student\.student_no/);
    assert.match(snapshot, /ORDER BY s\.student_no NULLS LAST/);
});
