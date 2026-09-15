import assert from 'node:assert/strict';
import test from 'node:test';
import { collectMissionSources, collectStudentSources, describeBulkResult } from '../src/modules/class-agit/anthology/bulkAdd.js';
import { CLASS_AGIT_LIMITS as limits } from '../src/modules/class-agit/policy.js';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const picker = read('src/modules/class-agit/anthology/SourcePicker.jsx');
const bulk = read('src/modules/class-agit/selection/MissionBulkPicker.jsx');
const studentBulk = read('src/modules/class-agit/selection/StudentBulkPicker.jsx');
const studentMigration = read('supabase/migrations/20261295_anthology_student_bulk_add.sql');
const browser = read('src/modules/class-agit/selection/SourceBrowser.jsx');
const workspace = read('src/modules/class-agit/selection/SelectionWorkspace.jsx');
const tuner = read('src/modules/class-agit/anthology/PageTuner.jsx');

const classId = 'class-1';
// 서버를 흉내 낸다 — 목록은 30편씩(`candidatePage`), 전문 확인은 50편씩(`selectionBatch`) 끊긴다.
const fakeApi = (total, { broken = new Set(), countCalls } = {}) => {
    const all = Array.from({ length: total }, (_, i) => ({ id: `post-${i + 1}` }));
    return {
        async getCandidates(_class, { cursor }) {
            countCalls?.candidates.push(cursor);
            const at = cursor ? Number(cursor.id.split('-')[1]) : 0;
            const items = all.slice(at, at + limits.candidatePage);
            const more = at + items.length < all.length;
            return { items, has_more: more, next_cursor: more ? { id: `post-${at + items.length}` } : null };
        },
        async getSources(_class, ids) {
            countCalls?.sources.push(ids.length);
            if (ids.length > limits.selectionBatch) throw new Error('한 번에 50편까지입니다.');
            return ids.map((id) => (broken.has(id) ? { id, reason: '지금 담을 수 없는 글입니다.' } : { id, source: { id } }));
        },
    };
};

test('미션 하나를 통째로 담으면 끊겨 오는 쪽을 모두 이어 붙인다', async () => {
    /*
     * 2026-09-14 요청: 주제별로 담을 때 작품을 하나씩 고르는 것이 불편하다.
     * 한 번의 누름이지만 뒤에서는 목록을 30편씩, 전문 확인을 50편씩 나눠 부른다.
     */
    const calls = { candidates: [], sources: [] };
    const api = fakeApi(72, { countCalls: calls });
    const result = await collectMissionSources(api, classId, { missionId: 'm1', capacity: limits.anthologyWorks });
    assert.equal(result.sources.length, 72);
    assert.equal(calls.candidates.length, 3, '30편씩 세 쪽을 받아야 합니다.');
    assert.deepEqual(calls.sources, [50, 22], '전문 확인은 50편씩 끊어야 합니다.');
    assert.equal(result.truncated, false);
});

test('남은 자리만큼만 담고 못 담은 수를 알려 준다', async () => {
    const result = await collectMissionSources(fakeApi(40), classId, { missionId: 'm1', capacity: 12 });
    assert.equal(result.sources.length, 12);
    // 못 담은 수를 세자고 남은 쪽을 마저 받지는 않는다 — 담지도 않을 목록이다.
    assert.equal(result.truncated, true);
    assert.match(describeBulkResult({ added: 12, skipped: 0, truncated: true }), /남은 자리가 없어 나머지는 담지 못했습니다/);
    // 자리가 없으면 부르기 전에 막는다 — 서른 번 오간 뒤에 실패를 알리면 늦다.
    await assert.rejects(collectMissionSources(fakeApi(40), classId, { missionId: 'm1', capacity: 0 }), /남은 자리가 없습니다/);
});

test('이미 담은 글과 담을 수 없는 글은 건너뛴다', async () => {
    const added = new Set(['post-1', 'post-2']);
    const result = await collectMissionSources(fakeApi(10, { broken: new Set(['post-5']) }), classId,
        { missionId: 'm1', capacity: 100, added });
    assert.equal(result.sources.length, 7, '이미 담은 2편과 담을 수 없는 1편이 빠져야 합니다.');
    assert.deepEqual(result.skipped.map((item) => item.id), ['post-5']);
    assert.match(describeBulkResult({ added: 7, skipped: 1, truncated: false }), /7편을 초안에 담았습니다\. 1편은 지금 담을 수 없어/);
});

test('커서가 제자리를 돌아도 멈춘다', async () => {
    /*
     * 서버가 같은 커서를 계속 돌려주면 끝없이 부르게 된다. 라운드 수를 한도에서 끊는다.
     * 이 고리가 없으면 교사 화면이 멎고 서버만 두들긴다.
     */
    let rounds = 0;
    const stuck = { async getCandidates() { rounds += 1; return { items: [{ id: 'post-1' }], has_more: true, next_cursor: { id: 'post-0' } }; },
        async getSources(_class, ids) { return ids.map((id) => ({ id, source: { id } })); } };
    const result = await collectMissionSources(stuck, classId, { missionId: 'm1', capacity: limits.anthologyWorks });
    assert.ok(rounds <= Math.ceil(limits.anthologyWorks / limits.candidatePage) + 2, `${rounds}번이나 불렀습니다.`);
    assert.equal(result.sources.length, 1);
});

test('빼는 학생이 서버 한도를 넘으면 거르기를 포기한다', async () => {
    // 서버는 100명까지만 받는다. 그대로 보내면 요청 자체가 튕겨 **한 편도 못 담는다.**
    let sent = null;
    const api = { async getCandidates(_class, filters) { sent = filters.excluded_students; return { items: [], has_more: false, next_cursor: null }; },
        async getSources() { return []; } };
    const many = Array.from({ length: limits.maxCandidates + 1 }, (_, i) => `s${i}`);
    await collectMissionSources(api, classId, { missionId: 'm1', capacity: 10, excludedStudents: many });
    assert.deepEqual(sent, []);
});

test('담는 방법은 셋이고 주제째 담기가 기본이다', () => {
    /*
     * 2026-09-14 요청: 주제별로 담을 때는 주제만 고르면 되는데 작품이 전부 펼쳐져 불편하다.
     * 문집은 대부분 "이 미션 글 다 넣기" 라 주제째가 기본이고, 골라 담기는 몇 편만 고를 때 쓴다.
     * 2026-09-15 요청: 학생별로 문집을 만들고 싶다 → 학생째 담기.
     */
    assert.match(picker, /const \[way, setWay\] = useState\('mission'\)/);
    assert.match(picker, /id: 'mission', label: '주제째 담기'/);
    assert.match(picker, /id: 'student', label: '학생째 담기'/);
    assert.match(picker, /id: 'work', label: '작품 골라 담기'/);
    // 통째로 담는 화면은 작품을 펼치지 않는다 — 한 줄과 담기 단추뿐이다.
    assert.ok(!bulk.includes('getCandidates('), '주제째 담기 화면이 작품 목록을 직접 부르고 있습니다.');
    assert.ok(!studentBulk.includes('getCandidates('), '학생째 담기 화면이 작품 목록을 직접 부르고 있습니다.');
    // 학생 목록은 한 번에 받는다 — 학생마다 검색을 돌리면 30명이면 30번이다.
    assert.match(studentBulk, /api\.getStudents\(classId\)/);
});

test('학생째 담기는 학생으로만 거르고, 이미 담은 학생 빼기는 받지 않는다', async () => {
    /*
     * 2026-09-15 "학생별로 문집을 만드는 기능이 있으면 좋겠어. 기존 기능에 필터링만 추가하면 되는걸까?"
     * — 그렇다. 서버 검색에 student_id 조건 하나를 더하고, 모으는 고리는 주제째 담기와 같은 것을 쓴다.
     */
    const sent = [];
    const api = { async getCandidates(_class, filters) { sent.push(filters); return { items: [{ id: 'post-1' }, { id: 'post-2' }], has_more: false, next_cursor: null }; },
        async getSources(_class, ids) { return ids.map((id) => ({ id, source: { id } })); } };
    const result = await collectStudentSources(api, classId, { studentId: 's1', capacity: 10, excludedStudents: ['s9'] });
    assert.equal(result.sources.length, 2);
    assert.equal(sent[0].student_id, 's1');
    assert.equal(sent[0].mission_id, undefined, '미션 조건이 섞이면 그 학생의 한 미션 글만 담긴다.');
    assert.deepEqual(sent[0].excluded_students, [], '학생 한 명을 담는데 학생을 빼는 조건은 뜻이 없다.');
    await assert.rejects(collectStudentSources(api, classId, { capacity: 10 }), /담을 학생을 골라 주세요/);
    // 자리 검사는 같은 고리라 학생째도 똑같이 막힌다.
    await assert.rejects(collectStudentSources(api, classId, { studentId: 's1', capacity: 0 }), /남은 자리가 없습니다/);

    // 서버 쪽: 검색 함수에 학생 조건이 있고, 학생 목록 함수의 자격이 검색과 같다(승인·미반려·학급 공개·시/글).
    assert.match(studentMigration, /\(v_student IS NULL OR p\.student_id=v_student\)/);
    assert.match(studentMigration, /CREATE OR REPLACE FUNCTION public\.get_class_agit_students_v1\(p_class_id uuid\)/);
    const listBody = studentMigration.slice(studentMigration.indexOf('get_class_agit_students_v1(p_class_id uuid)'));
    for (const gate of ["p.writing_context='assignment'", 'p.is_confirmed IS TRUE', 'p.is_returned IS NOT TRUE', "p.visibility='class'", "IN('prose','poem')"]) {
        assert.ok(listBody.includes(gate), `학생 목록의 글 수가 검색과 다른 자격으로 센다: ${gate}`);
    }
});

test('글 보기로 넘어가면 그 미션이 골라진 채로 열린다', () => {
    // 한두 편만 빼고 싶을 때 쓰는 길이다. 미션을 다시 찾게 하면 두 번 일이다.
    assert.match(picker, /onPickMission=\{\(mission\) => \{ setStartMission\(mission\); setWay\('work'\); \}\}/);
    assert.match(picker, /initialMission=\{startMission\}/);
    assert.match(browser, /const \[mission, setMission\] = useState\(initialMission\);/);
});

test('쪽 다듬기는 목록을 화면에서만 좁힌다', () => {
    /*
     * 300편까지 담기니 목록이 길어졌다. 다만 걸러진 목록으로 쪽을 세면 안 된다 —
     * `첫 작품` 판정과 쪽 번호는 **전체 순서**에서 나온다.
     */
    assert.match(tuner, /const works = placement\?\.pages \|\| \[\];/);
    assert.match(tuner, /const shown = needle/);
    assert.match(tuner, /\{shown\.map\(\(work\) => \{/);
    // 쪽 번호와 첫 작품은 원래 값을 그대로 쓴다.
    assert.match(tuner, /const first = work\.index === 0;/);
});

test('전시관도 같은 방법으로 담는다', () => {
    /*
     * 2026-09-14 요청: 문집에 넣은 담는 방식을 전시관에도. 같은 부품을 함께 쓴다.
     *
     * 다만 자리가 다르다 — 문집은 한 권의 남은 자리지만 전시는 **그 전시실**의 남은 자리다.
     * 전시실 하나는 20편이라 학급 전체 미션이 한 방에 들어가지 않는다. 그래서 미션 이름으로
     * 전시실을 만들어 담는 길을 함께 둔다.
     */
    assert.match(workspace, /import MissionBulkPicker from '\.\/MissionBulkPicker\.jsx'/);
    assert.match(workspace, /const \[way, setWay\] = useState\('mission'\)/);
    assert.match(workspace, /capacity=\{remaining\}/);
    assert.match(workspace, /const remaining = room \? limits\.worksPerRoom - items\.length : limits\.maxWorks - draft\.items\.length;/);
    assert.match(workspace, /label: \(count\) => `새 전시실 만들어 \$\{count\}편 담기`/);
    // 새 전시실에 담을 수 있는 수는 방 하나(20편)와 전시 전체 남은 자리 중 작은 쪽이다.
    assert.match(workspace, /capacity: Math\.min\(limits\.worksPerRoom, limits\.maxWorks - draft\.items\.length\)/);
});

test('전시는 50편씩 끊어 담는다', () => {
    /*
     * `addExhibitionSources` 는 한 번에 50편까지다. 미배정처럼 자리가 넓은 곳에 한꺼번에
     * 넘기면 통째로 튕긴다. 자리를 50으로 줄이는 대신 **끊어서** 넣는다 — 줄이면 덜 담긴다.
     */
    assert.match(workspace, /for \(let at = 0; at < sources\.length; at \+= limits\.selectionBatch\)/);
    assert.match(workspace, /next = addExhibitionSources\(next, sources\.slice\(at, at \+ limits\.selectionBatch\), target\)/);
});
