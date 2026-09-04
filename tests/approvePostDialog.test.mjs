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
    { file: 'src/hooks/useMissionManager.js', fn: 'handleApprovePost' }
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

test('승인하는 동안 버튼이 잠기고 누른 티가 난다', async () => {
    const [hook, viewer] = await Promise.all([
        readFile('src/hooks/useMissionManager.js', 'utf8'),
        readFile('src/components/teacher/PostDetailViewer.jsx', 'utf8')
    ]);

    // 같은 글을 두 번 눌러도 두 번 보내지 않는다.
    const body = bodyOf(hook, 'handleApprovePost');
    assert.match(body, /if \(approvingPostId\) return;/, '두 번 눌러도 막지 않는다');
    assert.match(body, /setApprovingPostId\(post\.id\)/);
    assert.match(body, /setApprovingPostId\(null\)/, '끝난 뒤 잠금을 풀지 않는다');

    // 버튼이 '승인 중...'으로 바뀐다. 이게 없으면 눌렀는지 알 수 없어 또 누르게 된다.
    assert.match(viewer, /loading=\{approvingPostId === selectedPost\.id\}/);
    assert.match(viewer, /loadingText="승인 중\.\.\."/);
});

/*
 * ⚠️ 잠겼다는 것을 흐린 글씨로만 알리면, 눌러도 아무 일이 없는 이유를 알 수 없다.
 *    이것이 "한 번에 안 눌린다"로 겪게 되는 가장 유력한 경로였다.
 */
test('수정 모드로 승인이 잠기면 왜 잠겼는지 말해 준다', async () => {
    const viewer = await readFile('src/components/teacher/PostDetailViewer.jsx', 'utf8');
    assert.match(viewer, /수정 모드를 끄면 승인할 수 있어요/, '잠긴 이유를 알려 주지 않는다');
    assert.match(viewer, /승인 \(수정 모드 끄고\)/, '버튼 글자가 잠긴 것을 드러내지 않는다');
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
