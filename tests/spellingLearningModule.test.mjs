import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20261017_spelling_learning_module.sql', 'utf8');
const manifest = await readFile('src/modules/writing/spelling-learning/manifest.js', 'utf8');
const lookup = await readFile('src/modules/writing/tools/spelling-lookup/SpellingLookupTool.jsx', 'utf8');

test('맞춤법 학습 기능은 등록 모듈과 성능 계약을 가진다', () => {
    assert.match(manifest, /id: 'spelling-learning'/);
    assert.match(manifest, /load: 'on-open'/);
    assert.match(manifest, /writes: 'rpc'/);
    assert.match(manifest, /realtime: 'none'/);
    assert.match(manifest, /maxInitialRows: 100/);
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
