import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/modules/class-agit/selection/MissionBulkPicker.jsx', 'utf8');

test('주제째 담기: 담을 글이 없는 것과 다 담은 것을 다른 말로 보여 준다', () => {
    // 승인한 글이 0편인 미션을 "다 담았습니다"라고 말하면 진행 중인 미션에서 헷갈린다(2026-10-21 지적).
    assert.match(source, /const noneYet = mission\.supported && total === 0/);
    assert.match(source, /const allAdded = mission\.supported && total > 0 && left === 0/);
    assert.match(source, /noneYet \? '담을 글 없음' : allAdded \? '다 담았습니다 ✓'/);
    assert.doesNotMatch(source, /!left \? '다 담았습니다'/);
});

test('주제째 담기: 승인한 글만 담긴다는 안내와 진행 중·보관함 표시가 있다', () => {
    assert.match(source, /anthology-bulk__hint/);
    // 승인한 글은 진행 중인 미션이어도 담을 수 있다(2026-10-21 통일). 보관함으로 보내라고 요구하지 않는다.
    assert.match(source, /승인한 글<\/strong>은 진행 중인 미션이어도 담을 수 있어요/);
    assert.doesNotMatch(source, /보관함으로 보내/);
    assert.match(source, /mission\.archived \? '지난 과제 보관함' : '진행 중'/);
});
