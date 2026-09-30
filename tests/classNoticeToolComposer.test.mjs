import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * 학급운영도구 `알림장`의 입력칸은 내용만큼 늘어나 모든 줄이 보인다(2026-09-30 선생님 요청).
 * 예전에는 넓고 낮은 칸에 64px 글씨라 두세 줄만 보이고 나머지는 칸 안에서 숨었다.
 */

const composer = readFileSync('src/modules/tool/class-board/widgets/notice-board/NoticeComposer.jsx', 'utf8');
const css = readFileSync('src/modules/tool/class-board/widgets/notice-board/noticeComposer.css', 'utf8');
const tool = readFileSync('src/modules/tool/class-notice/TeacherEntry.jsx', 'utf8');

test('알림장 도구는 tool 모양으로 입력 부품을 연다', () => {
    assert.match(tool, /<NoticeComposer[\s\S]*?variant="tool"[\s\S]*?\/>/);
});

test('입력칸 높이는 내용에 맞춰 재고(화면 전체 쓰기 제외), 글·글씨 크기·창 폭이 바뀌면 다시 잰다', () => {
    assert.match(composer, /const autoGrow = variant !== 'sheet';/);
    assert.match(composer, /node\.style\.height = `\$\{node\.scrollHeight \+ node\.offsetHeight - node\.clientHeight\}px`;/);
    assert.match(composer, /useLayoutEffect\(fitBodyHeight, \[fitBodyHeight, state\.body, fontStepId\]\);/);
    assert.match(composer, /window\.addEventListener\('resize', fitBodyHeight\)/);
    assert.match(composer, /<textarea\s+ref=\{bodyRef\}/);
});

test('도구에서는 높이 상한이 없고 칸 안에 숨는 줄이 없으며, 저장 상태 줄은 화면 아래에 붙는다', () => {
    assert.match(css, /\.class-board-notice-composer--tool \.class-board-notice-composer__body \{[^}]*max-height:none;[^}]*overflow:hidden;/);
    assert.match(css, /\.class-board-notice-composer--tool \.class-board-notice-composer__actions \{[^}]*position:sticky; bottom:0;/);
    // 높이는 화면이 재므로 손으로 끌어 늘리는 모서리는 두지 않는다(끌어도 다음 글자에서 되돌아간다).
    assert.match(css, /\.class-board-notice-composer \.class-board-notice-composer__body \{ resize:none;/);
});
