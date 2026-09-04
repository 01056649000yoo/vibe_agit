/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 * 2026-09-03: 교사가 "승인 버튼이 한 번에 잘 안 눌린다"고 알려 왔다. 원인을 좇다 보니
 * 승인 한 건에 **브라우저 기본 창이 두 번**(`confirm` 으로 묻고 `alert` 로 알림) 떴다.
 * 그 방식의 문제:
 *  - 눌러도 화면 안에서 변화가 없어 "안 눌렸나?" 싶어 또 누른다.
 *  - 크롬이 "추가 대화상자를 표시하지 않음"으로 막으면 `confirm` 이 조용히 거짓을 돌려주어
 *    **버튼을 눌러도 아무 일도 일어나지 않는다.** 사람은 원인을 알 길이 없다.
 *  - 글자 크기를 못 맞춰 아이 이름이 길면 잘린다.
 *
 * ⚠️ 앱 전체에 기본 창이 380곳 넘게 있어 한꺼번에 못 바꾼다. 그래서 **옮긴 자리만** 여기서 지킨다.
 *    새 화면을 옮기면 아래 목록에 한 줄 더한다. 옮긴 자리에 기본 창이 다시 들어오면 실패한다.
 */

// 앱 안 창으로 옮긴 흐름. 이 안에서는 브라우저 기본 창을 쓰지 않는다.
const MIGRATED_FLOWS = [
    { file: 'src/hooks/useMissionManager.js', fn: 'handleApprovePost' },
    // 2026-09-04: 승인 옆의 다시 쓰기 요청도 같은 창으로 옮겼다. 나란한 두 버튼이 서로 다르게 굴면
    // 크롬이 대화상자를 막았을 때 한쪽만 조용히 먹통이 되어 "한 번에 안 눌린다"로 겪게 된다.
    { file: 'src/hooks/useMissionManager.js', fn: 'handleRequestRewrite' },
    /*
     * 2026-09-04: 제출 현황 창의 일괄 단추들도 함께 옮겼다. 한 화면에 기본 창과 앱 안 창이 섞여 있으면,
     * 크롬이 대화상자를 막는 순간 **어떤 단추가 먹통인지 사람이 가려낼 수 없다.**
     */
    { file: 'src/hooks/useMissionManager.js', fn: 'handleBulkAIAction' },
    { file: 'src/hooks/useMissionManager.js', fn: 'handleBulkApprove' },
    { file: 'src/hooks/useMissionManager.js', fn: 'handleBulkRequestRewrite' }
];

const bodyOf = (source, name) => {
    const start = source.indexOf(`const ${name} = async (`);
    assert.ok(start >= 0, `${name} 을(를) 찾지 못했다`);
    // 다음 함수 선언 앞까지를 그 함수의 몸으로 본다.
    const rest = source.slice(start + 10);
    const next = rest.search(/\n    const handle\w+ = /);
    return next < 0 ? rest : rest.slice(0, next);
};

test('앱 안 창으로 옮긴 승인 흐름은 브라우저 기본 창을 쓰지 않는다', async () => {
    for (const { file, fn } of MIGRATED_FLOWS) {
        const body = bodyOf(await readFile(file, 'utf8'), fn);
        assert.doesNotMatch(body, /(^|[^.\w])confirm\(/,
            `${fn} 이(가) 브라우저 기본 확인 창을 다시 쓴다`);
        assert.doesNotMatch(body, /(^|[^.\w])alert\(/,
            `${fn} 이(가) 브라우저 기본 알림 창을 다시 쓴다`);
        // 묻기는 앱 안 창으로, 끝났다는 말은 스스로 사라지는 띠로.
        assert.match(body, /await ask\(\{/, `${fn} 이(가) 앱 안 창으로 묻지 않는다`);
        assert.match(body, /notify\(/, `${fn} 이(가) 알림 띠를 쓰지 않는다`);
    }
});

// 보내는 동안 잠기는 두 흐름. 새로 옮기면 여기 한 줄 더한다.
const BUSY_FLOWS = [
    { fn: 'handleApprovePost', state: 'approvingPostId', label: '승인 중...' },
    { fn: 'handleRequestRewrite', state: 'rewritingPostId', label: '요청 중...' }
];

test('보내는 동안 버튼이 잠기고 누른 티가 난다', async () => {
    const [hook, viewer] = await Promise.all([
        readFile('src/hooks/useMissionManager.js', 'utf8'),
        readFile('src/components/teacher/PostDetailViewer.jsx', 'utf8')
    ]);

    for (const { fn, state, label } of BUSY_FLOWS) {
        // 같은 글을 두 번 눌러도 두 번 보내지 않는다.
        const body = bodyOf(hook, fn);
        assert.match(body, new RegExp(`if \\(${state}\\) return;`), `${fn}: 두 번 눌러도 막지 않는다`);
        assert.ok(body.includes(`set${state[0].toUpperCase()}${state.slice(1)}(post.id)`), `${fn}: 잠그지 않는다`);
        assert.ok(body.includes(`set${state[0].toUpperCase()}${state.slice(1)}(null)`), `${fn}: 끝난 뒤 잠금을 풀지 않는다`);

        // 버튼 글자가 바뀐다. 이게 없으면 눌렀는지 알 수 없어 또 누르게 된다.
        assert.ok(viewer.includes(`loading={${state} === selectedPost.id}`), `${fn}: 누른 티가 나지 않는다`);
        assert.ok(viewer.includes(`loadingText="${label}"`), `${fn}: 보내는 중 글자가 없다`);
    }
});

/*
 * ⚠️ 잠겼다는 것을 흐린 글씨로만 알리면, 눌러도 아무 일이 없는 이유를 알 수 없다.
 *    이것이 "한 번에 안 눌린다"로 겪게 되는 가장 유력한 경로였다.
 */
test('수정 모드로 잠기면 두 버튼 모두 왜 잠겼는지 말해 준다', async () => {
    const viewer = await readFile('src/components/teacher/PostDetailViewer.jsx', 'utf8');
    assert.match(viewer, /수정 모드를 끄면 승인할 수 있어요/, '승인이 잠긴 이유를 알려 주지 않는다');
    assert.match(viewer, /승인 \(수정 모드 끄고\)/, '승인 버튼 글자가 잠긴 것을 드러내지 않는다');
    assert.match(viewer, /수정 모드를 끄면 다시 쓰기를 요청할 수 있어요/, '다시 쓰기가 잠긴 이유를 알려 주지 않는다');
    assert.match(viewer, /다시 쓰기 \(수정 모드 끄고\)/, '다시 쓰기 버튼 글자가 잠긴 것을 드러내지 않는다');
});

test('앱 안 확인 창은 글자 바닥을 지키고 긴 이름을 자르지 않는다', async () => {
    const [dialog, shell] = await Promise.all([
        readFile('src/components/common/useConfirmDialog.jsx', 'utf8'),
        readFile('src/components/common/CenteredDialog.jsx', 'utf8')
    ]);

    // 아이 이름이 들어가는 물음이라 한 줄로 자르면 안 된다.
    assert.match(dialog, /titleLines=\{3\}/, '제목이 한 줄로 잘린다');
    assert.match(shell, /titleLines = 1/, '껍데기가 줄 수를 받지 않는다');
    assert.match(shell, /WebkitLineClamp: titleLines/);

    /*
     * CenteredDialog 의 꼬리표는 --ui-font-xs(0.75rem = 12px)라 글자 바닥(0.8rem)보다 작다.
     * 그래서 이 창에서는 꼬리표를 쓰지 않는다. 필요한 말은 제목에 담는다.
     */
    assert.doesNotMatch(dialog, /eyebrow=\{/, '바닥보다 작은 꼬리표를 다시 쓴다');

    // 답을 기다리던 쪽이 영원히 멈추지 않게, 새 물음이 오면 앞의 것을 닫고 답한다.
    assert.match(dialog, /if \(resolveRef\.current\) settle\(false\)/);
});

/*
 * 2026-09-03 배포 전 다시 읽다가 찾은 것들. 눈으로는 안 보이고 코드 순서에서만 드러난다.
 */
test('실패를 알리기 전에 잠금을 먼저 푼다', async () => {
    const hook = await readFile('src/hooks/useMissionManager.js', 'utf8');
    for (const { fn } of BUSY_FLOWS) {
    const body = bodyOf(hook, fn);
    const catchPart = body.slice(body.indexOf('} catch (err) {'));

    /*
     * ⚠️ `finally` 는 실패 창을 **닫은 뒤에야** 돈다. 창을 먼저 띄우면 그동안 목록이
     *    '글을 불러오고 있어요...'로 멈춰 있어, 뒤에서 무슨 일이 났는지 알 수 없다.
     */
    const unlockAt = catchPart.indexOf('setLoadingPosts(false)');
    const askAt = catchPart.indexOf('await ask(');
    assert.ok(unlockAt >= 0 && askAt >= 0, `${fn}: 실패 처리를 찾지 못했다`);
    assert.ok(unlockAt < askAt, `${fn}: 실패 창을 띄운 뒤에야 잠금을 푼다 — 창 뒤 목록이 멈춘다`);
    }
});

test('알리기만 하는 창은 단추가 하나다', async () => {
    const [dialog, hook] = await Promise.all([
        readFile('src/components/common/useConfirmDialog.jsx', 'utf8'),
        readFile('src/hooks/useMissionManager.js', 'utf8')
    ]);
    // 고를 것이 없는데 단추가 둘이면 어느 쪽이 무엇인지 헷갈린다.
    assert.match(dialog, /request\.acknowledgeOnly \? null : \(/, '단추를 하나로 줄일 방법이 없다');
    const catchPart = bodyOf(hook, 'handleApprovePost');
    assert.match(catchPart.slice(catchPart.indexOf('} catch (err) {')), /acknowledgeOnly: true/,
        '실패 창에 단추가 둘이다');
});

/*
 * ⚠️ 확인 창은 교사 화면의 어떤 창보다 위에 떠야 한다. 밑에 깔리면 눌러도 안 보여
 *    "버튼이 안 눌린다"가 그대로 되풀이된다. 교사 창들은 1000~3000 을 쓴다.
 */
test('확인 창과 알림이 교사 화면의 모든 창보다 위에 뜬다', async () => {
    const [shell, notice, viewer, submission] = await Promise.all([
        readFile('src/components/common/CenteredDialog.jsx', 'utf8'),
        readFile('src/components/common/useNotice.jsx', 'utf8'),
        readFile('src/components/teacher/PostDetailViewer.jsx', 'utf8'),
        readFile('src/components/teacher/SubmissionStatusModal.jsx', 'utf8')
    ]);
    const highestOf = (source) => [...source.matchAll(/zIndex: (\d+)/g)]
        .map((match) => Number(match[1]))
        .reduce((top, value) => Math.max(top, value), 0);

    const dialogLayer = Number(shell.match(/zIndex = (\d+)/)[1]);
    const noticeLayer = highestOf(notice);
    const teacherTop = Math.max(highestOf(viewer), highestOf(submission));

    assert.ok(dialogLayer > teacherTop, `확인 창(${dialogLayer})이 교사 창(${teacherTop})보다 밑이다`);
    assert.ok(noticeLayer >= dialogLayer, `알림(${noticeLayer})이 확인 창(${dialogLayer})보다 밑이다`);
});

/*
 * 회수·되돌리기는 훅이 아니라 제출 현황 창이 묻는다(결과를 받아 화면이 판단한다).
 * 그래서 `ask`·`notify` 를 내려받아 쓴다 — 창을 하나 더 만들면 어느 것이 위에 뜰지 알 수 없다.
 */
test('제출 현황 창의 회수·되돌리기도 앱 안 창으로 묻는다', async () => {
    const [modal, manager, hook] = await Promise.all([
        readFile('src/components/teacher/SubmissionStatusModal.jsx', 'utf8'),
        readFile('src/components/teacher/MissionManager.jsx', 'utf8'),
        readFile('src/hooks/useMissionManager.js', 'utf8')
    ]);

    assert.doesNotMatch(modal, /(^|[^.\w])confirm\(/, '제출 현황 창이 브라우저 기본 확인 창을 다시 쓴다');
    assert.doesNotMatch(modal, /(^|[^.\w])alert\(/, '제출 현황 창이 브라우저 기본 알림 창을 다시 쓴다');
    assert.match(modal, /await ask\(\{[\s\S]{0,200}걷어올까요/, '회수를 앱 안 창으로 묻지 않는다');
    assert.match(modal, /await ask\(\{[\s\S]{0,200}다시 돌려줄까요/, '되돌리기를 앱 안 창으로 묻지 않는다');
    assert.match(modal, /notify\(/, '끝났다는 말을 띠로 알리지 않는다');

    // 창을 새로 만들지 않고 화면이 이미 그리고 있는 것을 내려받는다.
    assert.doesNotMatch(modal, /useConfirmDialog|useNotice/, '제출 현황 창이 자기 창을 따로 만든다');
    assert.match(manager, /ask=\{ask\}/);
    assert.match(manager, /notify=\{notify\}/);
    assert.match(hook, /confirmDialog, notice, ask, notify,/, '훅이 ask·notify 를 내주지 않는다');

    // 일부만 된 경우는 띠로 흘리지 않는다 — 남은 것을 다시 처리해야 한다.
    assert.match(modal, /못 걷었습니다[\s\S]{0,200}acknowledgeOnly: true/);
});

/*
 * 2026-09-04: 과제 화면(글쓰기 미션)의 기본 창을 **한 화면 통째로** 옮겼다.
 * 한 곳이라도 남으면 크롬이 대화상자를 막는 순간 그 단추만 조용히 먹통이 되므로,
 * 이 화면은 파일 단위로 0개를 지킨다. 새 파일이 이 화면에 들어오면 아래 목록에 더한다.
 */
const DIALOG_FREE_FILES = [
    'src/hooks/useMissionManager.js',
    'src/components/teacher/MissionManager.jsx',
    'src/components/teacher/MissionForm.jsx',
    'src/components/teacher/PostDetailViewer.jsx',
    'src/components/teacher/SubmissionStatusModal.jsx',
    // 2026-09-04: 학생·학급 관리 화면. 되돌릴 수 없는 일(영구 삭제)이 있어 먼저 옮겼다.
    'src/hooks/useStudentManager.js',
    'src/components/teacher/StudentManager.jsx',
    'src/components/teacher/ClassManager.jsx'
];

test('과제 화면에는 브라우저 기본 창이 하나도 없다', async () => {
    for (const file of DIALOG_FREE_FILES) {
        const source = await readFile(file, 'utf8');
        assert.doesNotMatch(source, /(^|[^.\w])confirm\(/, `${file}: 브라우저 기본 확인 창이 남아 있다`);
        assert.doesNotMatch(source, /(^|[^.\w])alert\(/, `${file}: 브라우저 기본 알림 창이 남아 있다`);
    }
});

test('물어볼 것이 없는 안내는 창을 띄우지 않는다', async () => {
    const hook = await readFile('src/hooks/useMissionManager.js', 'utf8');
    /*
     * `승인 대기 중인 글이 없어요` 같은 말은 고를 것이 없다. 창으로 띄우면 닫으려고 한 번 더 눌러야 한다.
     * 반대로 **실패와 '일부만 됨'** 은 창으로 멈춰 세운다 — 지나가면 다 된 줄 알고 넘어간다.
     */
    for (const line of ['승인을 기다리는 글이 없어요', '다시 쓰기를 요청할 미확인 제출글이 없어요', '피드백이 필요한 새로운 미확인 글이 없어요']) {
        assert.ok(hook.includes(`notify('${line}.')`) || hook.includes(`notify('${line}')`), `'${line}' 를 띠로 알리지 않는다`);
    }
    assert.match(hook, /명은 됐고 \$\{failedCount\}명은 못 했습니다[\s\S]{0,220}acknowledgeOnly: true/,
        '일부만 처리된 것을 띠로 흘린다');

    /*
     * 되돌릴 수 없는 일은 붉은 단추로 묻는다.
     * ⚠️ 낱개와 일괄의 제목이 서로를 품고 있어(`…명의 승인을 취소…`), 느슨하게 찾으면 한쪽만 고쳐도
     *    다른 쪽에 걸려 통과한다. 그래서 **제목 줄 통째로** 못 박는다(2026-09-04 변이 검증에서 드러났다).
     */
    for (const title of [
        "title: '승인을 취소하고 포인트를 회수할까요?'",
        "title: `${toRecover.length}명의 승인을 취소하고 포인트를 회수할까요?`"
    ]) {
        const at = hook.indexOf(title);
        assert.ok(at >= 0, `${title} 을(를) 찾지 못했다`);
        assert.match(hook.slice(at, at + 260), /tone: 'danger'/, `${title}: 붉은 단추로 묻지 않는다`);
    }
});

test('창 머리말은 옅은 바탕에 진한 글씨다 — 대시보드보다 짙지 않게', async () => {
    const dialog = await readFile('src/components/common/CenteredDialog.jsx', 'utf8');

    /*
     * 2026-09-04: 예전 머리말은 진한 파랑 위 흰 글씨였다. 대시보드의 다른 카드보다 짙어 창만 튀었고,
     * **그라데이션 오른쪽 끝(#0EA5E9)은 흰 글씨 대비가 2.77:1** 로 큰 글씨 기준(3:1)에도 못 미쳤다.
     * 꼬리표·설명은 12px 라 4.5:1 이 필요한데 한참 모자랐다.
     * 옅은 바탕(#eff6ff)에 진한 파랑 글씨(#1d4ed8)로 뒤집으면 6.16:1 — 더 옅으면서 더 잘 읽힌다.
     * 되돌리려면 이 숫자부터 다시 재야 한다.
     */
    assert.match(dialog, /background: 'linear-gradient\(135deg,var\(--ui-primary-soft\),#e0f2fe\)'/);
    assert.match(dialog, /color: 'var\(--ui-primary-hover\)'/, '제목이 옅은 바탕에 묻히는 색이다');
    assert.doesNotMatch(dialog, /color: 'white'/, '옅은 바탕에 흰 글씨가 남아 있다');
    assert.doesNotMatch(dialog, /tone="onDark"/, '밝은 머리말에 어두운 배경용 닫기 단추를 쓴다');
    // 바탕과 본문이 모두 밝아 경계가 사라지므로 아래 선으로 가른다.
    assert.match(dialog, /borderBottom: '1px solid var\(--ui-primary-border\)'/);
});

test('되돌릴 수 없는 일은 붉은 단추로 묻는다', async () => {
    /*
     * 영구 삭제는 취소가 없다. 다른 물음과 같은 파란 단추로 두면 손이 먼저 나간다.
     * 2026-09-04: 학생 영구 삭제·학급 삭제를 옮기며 못 박는다.
     */
    const cases = [
        { file: 'src/hooks/useStudentManager.js', title: '학생을 영구 삭제할까요?' },
        { file: 'src/components/teacher/ClassManager.jsx', title: '학급을 삭제할까요?' },
        { file: 'src/hooks/useMissionManager.js', title: '승인을 취소하고 포인트를 회수할까요?' }
    ];
    for (const { file, title } of cases) {
        const source = await readFile(file, 'utf8');
        const at = source.indexOf(title);
        assert.ok(at >= 0, `${file}: '${title}' 물음을 찾지 못했다`);
        assert.match(source.slice(at, at + 300), /tone: 'danger'/, `${file}: 붉은 단추로 묻지 않는다`);
    }
});
