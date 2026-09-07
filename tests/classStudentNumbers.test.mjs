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

test('이름 사본 동기화는 화면에 보이는 곳만 고치고 동명이인을 지킨다', () => {
    // 2026-09-07 뒤늦게 찾은 두 곳. 컬럼 이름 훑기로는 JSONB 안이라 안 잡혀 실제 값을 대조해 찾았다.
    const follow = readFileSync('supabase/migrations/20261261_rename_student_syncs_display_copies.sql', 'utf8');
    assert.match(follow, /UPDATE public\.class_agit_items/, '글꽃 전시관 작품 지은이를 고치지 않습니다.');
    assert.match(follow, /UPDATE public\.student_notification_events/, '알림 문구의 이름을 고치지 않습니다.');

    // 알림은 `61262` 부터 행동한 학생 id 를 남겨, 이름 글자가 아니라 id 로 정확히 찾는다.
    const actor = readFileSync('supabase/migrations/20261262_notification_actor_student_id.sql', 'utf8');
    assert.match(actor, /ADD COLUMN IF NOT EXISTS actor_student_id UUID/);
    assert.match(actor, /WHERE actor_student_id = p_student_id/,
        '알림을 이름 글자로 찾으면 동명이인의 알림까지 바뀝니다.');
    assert.doesNotMatch(actor, /other\.name = v_old_name/, '이름 글자로 더듬는 방식이 되살아났습니다.');

    // 아이가 자기 글에 쓴 이름은 고치지 않는다.
    assert.doesNotMatch(follow, /UPDATE public\.student_posts/, '학생 글은 고치지 않습니다.');
});

test('번호를 띄우는 화면은 모두 저장된 학급 번호를 쓴다', () => {
    // 2026-09-07 점검에서 찾음: 활동 보고서가 `번호` 라고 띄우면서 이름순 줄 번호(`idx + 1`)를 썼다.
    // 같은 학생이 명단 화면과 보고서에서 다른 번호로 보였다.
    const report = readFileSync('src/components/teacher/ActivityReport.jsx', 'utf8');
    assert.match(report, /data\.student\.student_no \?\? idx \+ 1/,
        '활동 보고서의 번호 칸이 저장된 학급 번호를 쓰지 않습니다.');
    const reportSql = readFileSync('supabase/migrations/20261263_activity_report_uses_class_number.sql', 'utf8');
    assert.match(reportSql, /'student_no',s\.student_no/, '보고서 조회가 번호를 안 내려 주면 화면이 빈칸이 됩니다.');

    // 고치던 칸을 모르면 번호로 적은 값이 이름으로 저장될 수 있다.
    assert.match(list, /if \(editing\?\.id !== student\.id\) return;/,
        '고치던 칸 확인이 사라지면 번호가 이름으로 저장될 수 있습니다.');
});

test('교사 명단 조회는 번호를 함께 내려 주고 번호순으로 준다', () => {
    // 화면이 번호를 그리려면 조회 결과에 번호가 있어야 한다. 둘 중 하나만 고치면 번호가 빈칸이 된다.
    const snapshot = migration.slice(migration.indexOf('FUNCTION public.get_teacher_point_manager_snapshot'));
    assert.match(snapshot, /'student_no', student\.student_no/);
    assert.match(snapshot, /ORDER BY s\.student_no NULLS LAST/);
});
