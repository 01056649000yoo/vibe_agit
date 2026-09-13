import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeBookPageBreaks, toggleBookPageBreak, buildBookSavePayload } from '../src/modules/class-agit/anthology/contract.js';

const read = (file) => readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20261288_anthology_page_breaks.sql');
const print = read('src/modules/class-agit/anthology/print.js');
const pagination = read('src/modules/class-agit/anthology/pagination.js');
const tuner = read('src/modules/class-agit/anthology/PageTuner.jsx');
const manager = read('src/modules/class-agit/anthology/AnthologyManager.jsx');

const book = (breaks) => ({
    id: 'b1', revision: 1, title: '문집', subtitle: '', introduction: '', class_label: '', issue_date: '',
    grouping: 'topic', paper_format: 'A4', design_id: 'botanical', page_layout: 'continuous',
    page_breaks: breaks, items: [{ sourceId: 'a' }, { sourceId: 'b' }, { sourceId: 'c' }]
});

test('쪽 나누기는 순번이 아니라 원글로 기억한다', () => {
    /*
     * 순번으로 담으면 작품 순서를 바꿨을 때 **엉뚱한 작품**이 쪽을 넘긴다.
     */
    assert.deepEqual(toggleBookPageBreak(book([]), 'b').page_breaks, ['b']);
    assert.deepEqual(toggleBookPageBreak(book(['b']), 'b').page_breaks, []);
    assert.match(print, /book\.works\.findIndex\(\(work\) => work\.sourceId === id\)/);
    // 확정판 작품에도 원글 id 가 실려야 맞출 수 있다.
    assert.match(migration, /'sourceId',v_old\.post_id/);
});

test('문집에서 뺀 작품의 표시는 함께 사라진다', () => {
    // 남겨 두면 그 작품을 다시 담았을 때 정한 적 없는 쪽 넘김이 되살아난다.
    assert.deepEqual(normalizeBookPageBreaks(['a', '없는작품'], book([]).items), ['a']);
    assert.deepEqual(buildBookSavePayload(book(['a', '없는작품'])).page_breaks, ['a']);
});

test('첫 작품 앞에서는 쪽을 넘기지 않는다', () => {
    // 본문 첫 쪽 앞에 빈 쪽이 생긴다. 화면도 첫 작품에는 단추를 주지 않는다.
    assert.match(print, /\.filter\(\(index\) => index > 0\)/);
    assert.ok(tuner.includes('첫 작품'));
});

test('교사가 정한 자리에서 쪽을 새로 연다', () => {
    assert.match(pagination, /if \(forcedBreaks\.has\(index\)\) cursor = null;/);
});

test('다듬기는 앱 안에서 하고 바로 저장한다', () => {
    /*
     * 인쇄 창은 보안상 앱과 연결이 끊겨 있어(`opener=null`) 거기서 누른 선택을 돌려받을 수
     * 없다. 앱 안에서 해야 저장되고 확정판에도 간다.
     */
    assert.match(manager, /const toggleTunerBreak = \(sourceId\) => run\(async \(\) => \{/);
    assert.match(manager, /await api\.saveBook\(classId, next\)/);
    // 이어붙이기에서만 뜻이 있다.
    assert.match(manager, /getBookPageLayout\(book\.page_layout\)\.id === 'continuous' &&/);
});

test('당기기가 늘 되는 것처럼 말하지 않는다', () => {
    /*
     * 앞 쪽에 자리가 없으면 풀어도 올라오지 않는다. 그 사실을 적지 않으면
     * "눌렀는데 안 올라온다" 가 된다.
     */
    assert.ok(tuner.includes('자리가 남아 있을 때만'));
    // 목차가 저절로 맞춰진다는 것도 알려 준다.
    assert.ok(tuner.includes('저절로'));
});
