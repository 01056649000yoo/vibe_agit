import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    AI_SPELL_CHECK_TOOL_ID,
    DEFAULT_WRITING_EDITOR_SETTINGS,
    isWritingToolEnabled,
    setWritingToolEnabled
} from '../src/modules/writing/editor-settings/settings.js';

const migration = readFileSync('supabase/migrations/20261286_ai_spell_check_on_by_default.sql', 'utf8');

test('화면 기본값과 DB 기본값이 같다', () => {
    /*
     * 새 학급은 DB 기본값으로 만들어지고, 아직 저장한 적 없는 화면은 JS 기본값을 쓴다.
     * 두 곳이 어긋나면 **새 학급과 화면이 다른 것을 보여 준다.**
     */
    const fromDb = migration.match(/SET DEFAULT '(\{[^']+\})'::JSONB/);
    assert.ok(fromDb, 'DB 기본값을 찾지 못했습니다.');
    assert.deepEqual(
        JSON.parse(fromDb[1]).enabled_tools.sort(),
        [...DEFAULT_WRITING_EDITOR_SETTINGS.enabled_tools].sort()
    );
});

test('AI 맞춤법 검사가 기본으로 켜져 있다', () => {
    // 594개 학급 중 13개만 켜 두고 있었는데 끈 학급은 없었다 — 있는 줄 몰랐던 것이다.
    assert.ok(DEFAULT_WRITING_EDITOR_SETTINGS.enabled_tools.includes(AI_SPELL_CHECK_TOOL_ID));
    assert.equal(isWritingToolEnabled(null, AI_SPELL_CHECK_TOOL_ID), true);
});

test('교사가 끄면 꺼진 채로 남는다', () => {
    // 기본이 켜짐이어도 학급마다 끌 수 있어야 한다. 못 끄면 강제가 된다.
    const off = setWritingToolEnabled(null, AI_SPELL_CHECK_TOOL_ID, false);
    assert.equal(isWritingToolEnabled(off, AI_SPELL_CHECK_TOOL_ID), false);
    // 끄더라도 다른 도구는 그대로여야 한다.
    assert.equal(off.enabled_tools.includes('spelling-lookup'), true);
});

test('이미 켠 학급에 두 번 넣지 않는다', () => {
    // 목록에 같은 값이 두 번 들어가면 화면이 중복 항목을 그린다.
    assert.match(migration, /NOT COALESCE\(writing_editor_settings -> 'enabled_tools', '\[\]'::JSONB\) @> '\["ai-spell-check"\]'::JSONB/);
    // 켜지 못한 학급이 남으면 장이 실패해야 한다.
    assert.match(migration, /RAISE EXCEPTION 'AI 맞춤법 검사가 아직 꺼진 학급이/);
});
