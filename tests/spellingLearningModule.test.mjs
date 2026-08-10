import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20261017_spelling_learning_module.sql', 'utf8');
const manifest = await readFile('src/modules/writing/spelling-learning/manifest.js', 'utf8');
const lookup = await readFile('src/modules/writing/tools/spelling-lookup/SpellingLookupTool.jsx', 'utf8');
const teacherEntry = await readFile('src/modules/writing/spelling-learning/TeacherEntry.jsx', 'utf8');
const { ELEMENTARY_SPELLING_ENTRY_IDS, getElementarySpellingEntries, searchElementarySpelling } = await import(
    '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js'
);

test('맞춤법 학습 기능은 등록 모듈과 성능 계약을 가진다', () => {
    assert.match(manifest, /id: 'spelling-learning'/);
    assert.match(manifest, /load: 'on-open'/);
    assert.match(manifest, /writes: 'rpc'/);
    assert.match(manifest, /realtime: 'none'/);
    assert.match(manifest, /maxInitialRows: 100/);
    assert.match(manifest, /settingsEntry:/);
    assert.doesNotMatch(manifest, /teacherEntry:|part: 'tool'/);
});

test('교사 등록 데이터는 기존 학생 수첩 기본 자료와 우리 반 자료를 함께 보여준다', () => {
    const builtInEntries = getElementarySpellingEntries();
    assert.equal(builtInEntries.length, 200);
    assert.equal(builtInEntries.length, ELEMENTARY_SPELLING_ENTRY_IDS.length);
    assert.equal(new Set(ELEMENTARY_SPELLING_ENTRY_IDS).size, 200);
    assert.equal(new Set(builtInEntries.map((entry) => entry.question)).size, 200);
    for (const entry of builtInEntries) {
        assert.ok(entry.category, `${entry.id}: 분류가 필요합니다.`);
        assert.ok(entry.explanation.length >= 10, `${entry.id}: 설명이 너무 짧습니다.`);
        assert.equal(entry.examples.length, 2, `${entry.id}: 바른 예문은 2개여야 합니다.`);
        assert.match(entry.source.label, /국립국어원/);
        assert.match(entry.source.url, /^https:\/\/(?:stdict\.)?korean\.go\.kr\//);
        assert.equal('sourceQuery' in entry, false);
        assert.equal('sourceType' in entry, false);
    }
    assert.match(teacherEntry, /getElementarySpellingEntries/);
    assert.match(teacherEntry, /기본 자료/);
    assert.match(teacherEntry, /우리 반 자료/);
    assert.match(teacherEntry, /type="search"/);
    assert.match(teacherEntry, /PAGE_SIZE = 20/);
    assert.match(teacherEntry, /entry\.category/);
    assert.match(teacherEntry, /spelling-learning-entry-summary/);
    assert.doesNotMatch(teacherEntry, /초안 저장|적용 중/);
});

test('200개 기본 자료는 틀린 표현과 분류로 바로 찾을 수 있다', () => {
    assert.equal(searchElementarySpelling('도데체')[0]?.id, 'dodaeche');
    assert.equal(searchElementarySpelling('설레였다')[0]?.id, 'seolletda');
    assert.equal(searchElementarySpelling('수영을 못해요')[0]?.id, 'mot-hada');
    assert.ok(searchElementarySpelling('외래어 표기').every((entry) => entry.category === '외래어 표기'));
});

test('학생 검색은 입력 중 직접 쓰지 않고 닫을 때 배치 RPC로 모은다', () => {
    assert.match(lookup, /flushSpellingSearches/);
    assert.doesNotMatch(lookup, /setInterval|postgres_changes/);
    assert.match(migration, /record_spelling_search_batch_v1/);
    assert.match(migration, /jsonb_array_length\(p_items\) > 20/);
    assert.match(migration, /ON CONFLICT\(class_id,event_date,entry_key\) DO UPDATE/);
});

test('맞춤법 데이터는 학급 직접 범위와 교사·학생 실제 연결을 검증한다', () => {
    assert.match(migration, /c\.id = p_class_id AND c\.teacher_id = auth\.uid\(\)/);
    assert.match(migration, /s\.auth_id=auth\.uid\(\)/);
    assert.match(migration, /idx_class_spelling_stats_class_date/);
    assert.match(migration, /REVOKE ALL ON public\.class_spelling_daily_stats/);
});

test('학생 원문은 저장하지 않고 미등록 짧은 표현만 제한적으로 남긴다', () => {
    assert.doesNotMatch(migration, /post_content|student_post_id|full_text/);
    assert.match(migration, /v_key LIKE 'unmatched:%'/);
    assert.match(migration, /left\(btrim\(COALESCE\(v_item->>'query',''\)\),80\)/);
});
