import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 2026-09-14 요청: "투표 활동도 할 수 있지만, 그냥 학생들이 준 질문을 교사가 가공해서 제공하는 것도 필요하다."
 *
 * 전에는 `연구소 질문 불러오기` 가 투표방(question_voting)만 보여 줘서, 질문 만들기(question_generator)만
 * 하고 투표를 안 한 방의 질문은 교사가 쓸 수 없었다.
 *
 * 두 활동은 질문이 있는 자리가 다르다 — 투표방은 방 설정에 한 벌, 질문 만들기는 학생마다 따로.
 * 그래서 **같은 모양의 질문 꾸러미**로 맞춰 돌려주고, 화면은 활동별로 갈라 두지 않는다.
 */
const MIGRATION = 'supabase/migrations/20261294_teacher_question_pool_from_lab.sql';

test('교사는 투표방과 질문 만들기 방 양쪽에서 질문을 가져올 수 있다', async () => {
    const raw = await readFile(MIGRATION, 'utf8');
    const sql = raw.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');

    /*
     * 방 목록과 질문 꾸러미 **두 함수 모두** 두 활동을 받아야 한다.
     * 한쪽만 열어 두면 목록에는 떠도 눌렀을 때 "방을 찾지 못했다" 로 막힌다.
     * (같은 구절이 두 곳에 있어, 하나만 세면 한쪽을 막아도 검사가 통과한다.)
     */
    const bothKinds = sql.split("activity_type IN ('question_voting', 'question_generator')").length - 1;
    assert.equal(bothKinds, 2, `두 함수 모두 두 활동을 받아야 하는데 ${bothKinds}곳만 그렇다`);
    assert.match(sql, /r\.activity_type::TEXT/, '화면이 활동 종류를 알 수 없으면 탭을 나눌 수 없다');

    // 질문 만들기 방의 질문은 학생별 결과에서 모은다.
    assert.match(sql, /portable_results pr/);
    assert.match(sql, /pr\.result_kind = 'questions'/);

    // 같은 문장은 묶고, 몇 명이 썼는지 센다 — 투표의 표와 같은 구실이다.
    assert.match(sql, /COUNT\(DISTINCT q\.agit_student_id\)/);
    assert.match(sql, /GROUP BY q\.q_text/);

    // 브라우저에 직접 열지 않는다. 담당 교사 확인을 거친다.
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_teacher_question_rooms_v1\(uuid\) FROM PUBLIC, anon/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_teacher_room_question_pool_v1\(uuid, uuid\) FROM PUBLIC, anon/);
    assert.match(sql, /teacher authentication required/);
    assert.match(sql, /r\.teacher_id = auth\.uid\(\)/);
});

test('화면은 두 활동을 탭으로 나누고 같은 꾸러미를 읽는다', async () => {
    const [api, modal, css] = await Promise.all([
        readFile('src/modules/writing/references/labReferenceApi.js', 'utf8'),
        readFile('src/components/teacher/MissionLabQuestionsModal.jsx', 'utf8'),
        readFile('src/components/teacher/MissionLabQuestionsModal.css', 'utf8'),
    ]);

    // 옛 이름(투표 전용)은 더 쓰지 않는다.
    assert.doesNotMatch(api, /get_teacher_question_voting_rooms_v1/);
    assert.doesNotMatch(api, /get_teacher_question_voting_ranking_v1/);
    assert.match(api, /get_teacher_question_rooms_v1/);
    assert.match(api, /get_teacher_room_question_pool_v1/);
    assert.match(api, /isVoting: voting/);

    // 탭 두 개가 있고, 고른 탭의 방만 보인다.
    assert.match(modal, /roomKind/);
    assert.match(modal, /'question_generator', label: '✍️ 학생이 만든 질문'/);
    assert.match(modal, /visibleRooms\.map\(\(room\) => \(/);
    assert.match(modal, /room\.activityType === roomKind/);

    // 표시가 활동에 맞아야 한다 — 질문 만들기 방에 `표` 라고 쓰면 거짓말이 된다.
    assert.match(modal, /selectedRoom\?\.isVoting/);
    assert.match(modal, /\$\{q\.pickedCount\}표/);
    assert.match(modal, /\$\{q\.pickedCount\}명/);
    // 누가 썼는지 보여 준다(질문 만들기 방에서만).
    assert.match(modal, /mission-lab-question-authors/);
    assert.match(css, /\.mission-lab-questions-tab \{/);

    // 가져온 질문은 과제의 핵심 질문으로 들어가 그대로 고칠 수 있어야 한다.
    const form = await readFile('src/components/teacher/MissionForm.jsx', 'utf8');
    assert.match(form, /handleImportLabQuestions/);
    assert.match(form, /guide_questions: combined/);
});

test('도움말이 두 갈래를 모두 알려 준다', async () => {
    const guides = await readFile('src/constants/teacherGuides.js', 'utf8');
    assert.match(guides, /학생이 만든 질문/);
    assert.match(guides, /투표/);
});
