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
    { file: 'src/hooks/useMissionManager.js', fn: 'handleRequestRewrite' }
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
