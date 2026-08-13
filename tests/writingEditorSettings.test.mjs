import test from 'node:test';
import assert from 'node:assert/strict';
import {
    SPELLING_LOOKUP_TOOL_ID,
    LAB_RESULTS_TOOL_ID,
    isWritingToolEnabled,
    normalizeWritingEditorSettings,
    setWritingToolEnabled
} from '../src/modules/writing/editor-settings/settings.js';

test('기존 학급과 잘못된 설정은 맞춤법 찾아보기를 기본으로 켠다', () => {
    assert.equal(isWritingToolEnabled(null, SPELLING_LOOKUP_TOOL_ID), true);
    assert.equal(isWritingToolEnabled({ enabled_tools: '잘못된 값' }, SPELLING_LOOKUP_TOOL_ID), true);
});

test('교사가 맞춤법 찾아보기를 끄고 다시 켤 수 있다', () => {
    const disabled = setWritingToolEnabled(null, SPELLING_LOOKUP_TOOL_ID, false);
    assert.equal(isWritingToolEnabled(disabled, SPELLING_LOOKUP_TOOL_ID), false);

    const enabled = setWritingToolEnabled(disabled, SPELLING_LOOKUP_TOOL_ID, true);
    assert.equal(isWritingToolEnabled(enabled, SPELLING_LOOKUP_TOOL_ID), true);
});

test('연구소 결과 불러오기는 기존 학급에 기본 OFF이고 교사가 켤 수 있다', () => {
    assert.equal(isWritingToolEnabled(null, LAB_RESULTS_TOOL_ID), false);
    const enabled = setWritingToolEnabled(null, LAB_RESULTS_TOOL_ID, true);
    assert.equal(isWritingToolEnabled(enabled, LAB_RESULTS_TOOL_ID), true);
});

test('앞으로 추가될 다른 글쓰기 설정은 토글 변경 때 보존한다', () => {
    const source = {
        enabled_tools: [SPELLING_LOOKUP_TOOL_ID, 'future-outline'],
        layout: { density: 'comfortable' }
    };
    const changed = setWritingToolEnabled(source, SPELLING_LOOKUP_TOOL_ID, false);

    assert.deepEqual(changed.enabled_tools, ['future-outline']);
    assert.deepEqual(changed.layout, source.layout);
    assert.deepEqual(normalizeWritingEditorSettings(changed), changed);
});
