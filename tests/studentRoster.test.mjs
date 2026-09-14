import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseStudentRoster, findExistingNames, STUDENT_ROSTER_MAX, STUDENT_NAME_MAX } from '../src/lib/studentRoster.js';

test('선생님이 가진 모양 그대로 붙여넣어도 이름만 남는다', () => {
    /*
     * 2026-09-14 분석: 학급까지 온 505명 중 학생을 등록한 사람은 168명뿐이었다.
     * 명단은 이미 나이스·엑셀·한글에 있는데 한 명씩 치게 해 둔 탓이다.
     * 엑셀에서 두 칸을 긁으면 번호가 붙어 오고, 한글 표는 `1.`, 손으로는 쉼표로 적는다.
     */
    assert.deepEqual(parseStudentRoster('1\t김민준\n2\t이서연\n3\t박도윤').names, ['김민준', '이서연', '박도윤']);
    assert.deepEqual(parseStudentRoster('1. 김민준\n2. 이서연').names, ['김민준', '이서연']);
    assert.deepEqual(parseStudentRoster('김민준, 이서연; 박도윤').names, ['김민준', '이서연', '박도윤']);
    assert.deepEqual(parseStudentRoster('01 김민준\n02 이서연').names, ['김민준', '이서연']);
    // 빈 줄과 여분의 공백은 지운다.
    assert.deepEqual(parseStudentRoster('  김민준  \n\n\n   이서연\n').names, ['김민준', '이서연']);
});

test('이름이 아닌 줄은 이유와 함께 빼낸다', () => {
    // 조용히 빼면 스물여덟 명을 넣고 스물여섯 명이 들어온 것을 모른다.
    const { names, dropped } = parseStudentRoster('1\n2\n김민준\n' + '가'.repeat(STUDENT_NAME_MAX + 1));
    assert.deepEqual(names, ['김민준']);
    assert.deepEqual(dropped.map((item) => item.reason), ['번호만 있어요', '번호만 있어요', `이름이 ${STUDENT_NAME_MAX}자를 넘어요`]);
});

test('한 번에 넣는 수를 넘기면 넘친 줄을 알려 준다', () => {
    // 서버도 같은 수에서 막는다. 화면이 더 받아 보내면 통째로 튕겨 한 명도 안 들어간다.
    const many = Array.from({ length: STUDENT_ROSTER_MAX + 3 }, (_, i) => `학생${i + 1}`).join('\n');
    const { names, dropped } = parseStudentRoster(many);
    assert.equal(names.length, STUDENT_ROSTER_MAX);
    assert.equal(dropped.length, 3);
    assert.match(dropped.at(0).reason, new RegExp(`${STUDENT_ROSTER_MAX}명까지`));
    const migration = readFileSync('supabase/migrations/20261293_add_students_bulk.sql', 'utf8');
    assert.ok(migration.includes(`BETWEEN 1 AND ${STUDENT_ROSTER_MAX}`), '서버 한도와 화면 한도가 다릅니다.');
    assert.ok(migration.includes(`1~${STUDENT_ROSTER_MAX}명까지`));
});

test('이미 있는 이름은 찾아 주되 동명이인은 막지 않는다', () => {
    /*
     * 실수로 같은 명단을 두 번 붙여넣는 일은 흔하다. 다만 한 반에 김민준이 둘인 것도 흔하다 —
     * 막지 않고 **알려 주기만** 한다. 지우는 것은 선생님이 정한다.
     */
    const found = findExistingNames(['김민준', '이서연'], [{ name: '김민준' }, { name: '박도윤' }]);
    assert.deepEqual(found, ['김민준']);
    assert.deepEqual(parseStudentRoster('김민준\n김민준').names, ['김민준', '김민준']);
});

test('학생 코드 글자는 화면과 DB 가 같다', () => {
    /*
     * 코드는 서버에서 만든다 — 서른 개를 화면에서 만들어 보내면 겹쳤을 때 되돌릴 자리가 없다.
     * 다만 글자는 같아야 한다. 사람이 손으로 옮겨 적으므로 O/0·I/1·L 을 뺀 글자만 쓴다.
     */
    const generator = readFileSync('src/lib/codeGenerator.js', 'utf8');
    const migration = readFileSync('supabase/migrations/20261293_add_students_bulk.sql', 'utf8');
    const alphabet = generator.match(/UNAMBIGUOUS_ALPHABET = '([A-Z0-9]+)'/)[1];
    assert.ok(migration.includes(`v_alphabet CONSTANT TEXT := '${alphabet}'`), 'DB 가 다른 글자를 씁니다.');
    assert.ok(!/[OIL01]/.test(alphabet), '헷갈리는 글자가 섞였습니다.');
});

test('학생 명단 화면에서 붙여넣기로 갈 수 있다', () => {
    /*
     * 화면에 길이 없으면 서버 함수만 있어 봐야 아무도 쓰지 않는다.
     * 한 명씩 넣는 길은 그대로 둔다 — 전학생 한 명을 넣을 때는 그게 빠르다.
     */
    const header = readFileSync('src/components/teacher/StudentManagerHeader.jsx', 'utf8');
    const manager = readFileSync('src/components/teacher/StudentManager.jsx', 'utf8');
    const hook = readFileSync('src/hooks/useStudentManager.js', 'utf8');
    assert.match(header, /명단 일괄 붙여넣기/);
    assert.match(header, /onOpenRosterPaste\?\.\(\)/);
    assert.match(header, /placeholder="이름 입력"/);
    assert.match(manager, /<StudentRosterPasteModal/);
    // 왕복을 서른 번 하지 않는다 — 중간에 실패하면 절반만 들어간 명단이 남는다.
    assert.match(hook, /supabase\.rpc\('add_students_bulk_v1'/);
    assert.ok(!/for .*of names[\s\S]*add_student_with_bonus/.test(hook), '한 명씩 보내고 있습니다.');
});

test('동행 모드와 안내서가 붙여넣기를 알려 준다', () => {
    // 이 단계가 가입 뒤 가장 크게 막히는 자리다. 길이 생겼으면 안내도 같이 바뀌어야 한다.
    const tour = readFileSync('src/guides/teacherTour.js', 'utf8');
    const guide = readFileSync('src/constants/teacherGuides.js', 'utf8');
    assert.match(tour, /'invite-students': Object\.freeze\(\{[\s\S]{0,200}명단 일괄 붙여넣기/);
    assert.match(guide, /`📋 명단 일괄 붙여넣기`로 한 번에 넣습니다/);
});

test('학생 명단 도구는 찾기·넣기·손보기 셋으로 갈린다', () => {
    /*
     * 2026-09-14 지적: 학생 명단 메뉴가 눈에 잘 안 들어온다.
     * 일곱 개가 한 줄에 뒤섞이고 배경색이 셋(파랑·회색·노랑)이었다. 색은 많은데 무엇이
     * 중요한지는 알 수 없었다. 색이 아니라 **자리**로 가른다.
     */
    const header = readFileSync('src/components/teacher/StudentManagerHeader.jsx', 'utf8');
    const css = readFileSync('src/components/teacher/StudentManager.css', 'utf8');
    assert.match(header, /student-toolbar__group--add/);
    assert.match(header, /student-toolbar__group--manage/);
    assert.match(css, /\.student-toolbar__group--manage \{[^}]*border-left/);
    // 손보는 도구는 모두 같은 옷을 입는다. 색을 손으로 박아 두지 않는다.
    assert.ok(!/#EFF6FF|#F7DC6F|#FDFCF0/.test(header), '도구에 색이 박혀 있습니다.');
    // 이 화면에서 제일 자주 하는 일에만 강조를 준다.
    assert.match(header, /명단 일괄 붙여넣기<\/Button>/);
    assert.match(header, /variant="primary">📋 명단 일괄 붙여넣기/);
});

test('학생 추가 자리는 동행 모드가 짚는 그대로 둔다', () => {
    // 묶음을 바꾸면서 이 상자를 흩뜨리면 `학생 등록` 단계에서 테두리를 씌울 곳이 없어진다.
    const header = readFileSync('src/components/teacher/StudentManagerHeader.jsx', 'utf8');
    assert.match(header, /student-toolbar__group--add" \{\.\.\.tourAnchor\(TEACHER_TOUR_ANCHORS\.STUDENT_ADD\)\}/);
    assert.match(header, /placeholder="이름 입력"/);
});
