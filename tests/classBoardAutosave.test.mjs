import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    CLASS_BOARD_AUTOSAVE_DELAY_MS,
    CLASS_BOARD_SAVE_STATUS_TEXT,
    classBoardContentKey,
    getClassBoardAutosaveBlock,
    isClassBoardConflict,
} from '../src/modules/tool/class-board/host/useClassBoardAutosave.js';
import {
    CLASS_BOARD_UNDO_GROUP_MS,
    CLASS_BOARD_UNDO_LIMIT,
    pushClassBoardUndo,
} from '../src/modules/tool/class-board/host/useClassBoardUndo.js';

/*
 * 우리 반 스크린 자동 저장·되돌리기 (2026-09-29 선생님 요청 — 편집 뒤 `저장`을 또 눌러야 남는 것이 불편하다).
 * 브라우저에서 가짜 서버로 여섯 가지를 확인했다(열자마자 저장 안 함, 연달아 고쳐도 한 번, 저장 중 고친 것 보존,
 * 실패 뒤 저절로 다시 보내지 않음, 되돌리기, 충돌 뒤 멈춤). 여기서는 그 규칙이 코드에서 빠지지 않게 지킨다.
 */

const [autosave, undo, presentation, entry] = await Promise.all([
    readFile('src/modules/tool/class-board/host/useClassBoardAutosave.js', 'utf8'),
    readFile('src/modules/tool/class-board/host/useClassBoardUndo.js', 'utf8'),
    readFile('src/modules/tool/class-board/ClassBoardPresentationPage.jsx', 'utf8'),
    readFile('src/modules/tool/class-board/TeacherEntry.jsx', 'utf8'),
]);

test('"바뀌었나"는 저장되는 세 가지(제목·배치·위젯)로만 본다 — 버전 번호가 바뀌어도 다시 저장하지 않는다', () => {
    const board = { id: 'b', revision: 3, isDefault: true, title: '아침', layout: { version: 2 }, widgets: [{ instanceId: 'w' }] };
    assert.equal(classBoardContentKey(board), classBoardContentKey({ ...board, revision: 4, isDefault: false, serverOnly: 1 }));
    assert.notEqual(classBoardContentKey(board), classBoardContentKey({ ...board, title: '아침!' }));
    assert.equal(classBoardContentKey(null), '');
});

test('탭 이름이 비면 보내지 않고 기다린다(서버가 거절한다)', () => {
    assert.equal(getClassBoardAutosaveBlock({ title: '   ' }), 'untitled');
    assert.equal(getClassBoardAutosaveBlock({ title: '아침' }), null);
    assert.ok(CLASS_BOARD_SAVE_STATUS_TEXT.untitled.includes('탭 이름'));
});

test('다른 창이 먼저 저장했으면(PT409) 충돌로 알아본다', () => {
    assert.equal(isClassBoardConflict({ code: 'PT409', message: '' }), true);
    assert.equal(isClassBoardConflict(new Error('다른 화면에서 먼저 저장했습니다. 새로고침한 뒤 다시 시도해 주세요.')), true);
    assert.equal(isClassBoardConflict(new Error('네트워크 오류')), false);
});

test('자동 저장은 한 번에 하나, 마지막으로 보낸 내용과 견주며, 편집 중인 판을 서버 판으로 덮지 않는다', () => {
    assert.ok(CLASS_BOARD_AUTOSAVE_DELAY_MS >= 800 && CLASS_BOARD_AUTOSAVE_DELAY_MS <= 3000);
    assert.match(autosave, /if \(inFlightRef\.current\) await inFlightRef\.current/);
    assert.match(autosave, /setSavedKey\(key\);/, '보낸 내용의 열쇠를 저장된 것으로 삼는다');
    assert.match(autosave, /stoppedRef\.current = true;\s*\n\s*setStatus\('conflict'\)/, '충돌 뒤에는 멈춘다');
    assert.match(autosave, /currentStatus === 'error'/, '실패 뒤 저절로 다시 보내지 않는다');
    assert.match(autosave, /\['pending', 'paused', 'untitled'\]\.includes\(currentStatus\) \? 'saved'/,
        '저장 전에 되돌려 저장된 상태로 돌아오면 `고치는 중…`에 멈추지 않는다');
    assert.match(autosave, /beforeunload/);
    // 두 화면 모두 저장이 끝나면 아이디·버전만 받고 내용은 편집 중인 것을 둔다.
    assert.match(presentation, /setDraftBoard\(\(current\) => \(current \? \{ \.\.\.current, id: saved\.id, revision: saved\.revision \} : current\)\)/);
    assert.match(entry, /\.\.\.saved,\s*\n\s*title: current\.title,\s*\n\s*layout: current\.layout,\s*\n\s*widgets: current\.widgets,/);
});

test('되돌리기는 잇단 변화를 한 번으로 묶고 상한을 지킨다', () => {
    const a = { title: 'A' };
    const b = { title: 'B' };
    let result = pushClassBoardUndo([], a, 10_000, 0);
    assert.equal(result.stack.length, 1);
    result = pushClassBoardUndo(result.stack, b, 10_000 + CLASS_BOARD_UNDO_GROUP_MS - 1, 10_000);
    assert.equal(result.stack.length, 1, '묶음 시간 안의 변화는 쌓지 않는다');
    result = pushClassBoardUndo(result.stack, b, 10_000 + CLASS_BOARD_UNDO_GROUP_MS + 1, 10_000);
    assert.equal(result.stack.length, 2);
    const full = Array.from({ length: CLASS_BOARD_UNDO_LIMIT }, (_, index) => ({ title: String(index) }));
    assert.equal(pushClassBoardUndo(full, b, 99_999, 0).stack.length, CLASS_BOARD_UNDO_LIMIT);
    // 2026-09-29 브라우저 확인에서 잡힌 것: 직전 시각을 상태 갱신 함수 안에서 읽으면 바로 아래에서 바꾼 값을 읽어
    // 모든 변화가 한 묶음이 됐다. 직전 시각은 갱신 전에 읽어 둔다.
    assert.match(undo, /const lastPushAt = lastPushAtRef\.current;\s*\n\s*setStack\(\(current\) => pushClassBoardUndo\(current, previous, now, lastPushAt\)\.stack\);\s*\n\s*lastPushAtRef\.current = now;/);
});

test('두 편집 화면 모두 `저장` 단추 대신 상태·되돌리기를 두고, 떠나기 전에 남은 것을 먼저 저장한다', () => {
    for (const [name, source] of [['발표 화면', presentation], ['학급운영도구 편집', entry]]) {
        assert.match(source, /useClassBoardAutosave\(\{/, `${name}: 자동 저장 부품`);
        assert.match(source, /useClassBoardUndo\(/, `${name}: 되돌리기 부품`);
        assert.match(source, /const settleEdits = useCallback\(async \(question\) => \{/, `${name}: 떠나기 전 저장`);
        assert.doesNotMatch(source, /저장하지 않은 변경을 버리고/, `${name}: 버리기를 먼저 묻지 않는다`);
    }
});
