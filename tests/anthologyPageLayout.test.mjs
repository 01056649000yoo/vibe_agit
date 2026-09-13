import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BOOK_PAGE_LAYOUTS, getBookPageLayout, createBookPrintSettings, validBookPrintSettings } from '../src/modules/class-agit/designs.js';
import { buildBookSavePayload } from '../src/modules/class-agit/anthology/contract.js';

const read = (file) => readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20261287_anthology_page_layout.sql');
const print = read('src/modules/class-agit/anthology/print.js');
const pagination = read('src/modules/class-agit/anthology/pagination.js');

test('기본은 지금까지의 모양이다', () => {
    /*
     * 확정판은 되돌릴 수 없다. 설정을 건드리지 않은 문집이 **다른 모양으로 나오면 안 된다.**
     */
    assert.equal(BOOK_PAGE_LAYOUTS[0].id, 'work-per-page');
    assert.equal(getBookPageLayout(undefined).id, 'work-per-page');
    assert.equal(getBookPageLayout('없는값').id, 'work-per-page');
    assert.equal(createBookPrintSettings({}).layout, 'work-per-page');
    assert.match(migration, /page_layout TEXT NOT NULL DEFAULT 'work-per-page'/);
});

test('이 설정이 생기기 전 확정판도 그대로 열린다', () => {
    // 옛 확정판의 print 에는 layout 이 없다. 없다고 막으면 지난 문집을 못 연다.
    const old = { paper: 'A4', design: 'botanical', body_pt: 12, poem_pt: 14, version: 2 };
    assert.equal(validBookPrintSettings(old), true);
    assert.equal(validBookPrintSettings({ ...old, layout: 'continuous' }), true);
    assert.equal(validBookPrintSettings({ ...old, layout: '없는값' }), false);
});

test('고른 배치가 저장까지 이어진다', () => {
    // 화면에서 고르기만 하고 저장 payload 에 안 실으면 다음에 열 때 되돌아간다.
    const payload = buildBookSavePayload({
        id: 'b1', revision: 1, title: '문집', subtitle: '', introduction: '', class_label: '', issue_date: '',
        grouping: 'topic', paper_format: 'A4', design_id: 'botanical', page_layout: 'continuous', items: []
    });
    assert.equal(payload.page_layout, 'continuous');
    assert.match(migration, /page_layout=COALESCE\(p_payload->>'page_layout',v_book\.page_layout\)/);
    // 서버도 아는 값만 받아야 한다.
    assert.match(migration, /v_book\.page_layout\) NOT IN \('work-per-page','continuous'\)/);
    // 확정판 스냅샷에도 실려야 인쇄본이 안다.
    assert.match(migration, /'layout',v_book\.page_layout/);
});

test('이어붙이기에서만 간지를 만든다', () => {
    /*
     * 작품마다 새 쪽인 문집에 간지가 끼면 종이만 늘어난다. 간지는 이어붙이기의 표지 역할이다.
     */
    assert.match(print, /if \(continuous && title && title !== previous\) groupStarts\.set\(index, title\)/);
    assert.match(print, /data-toc-group/);
});

test('이어붙이기 차례는 주제만, 작품 목록은 간지로 간다', () => {
    /*
     * 2026-09-13 지적: 작품까지 모두 차례에 실으니 **주제가 다섯을 넘는 순간 차례가 몇 쪽**이
     * 된다. 간지는 주제 이름 한 줄뿐이라 어차피 비어 있으므로, 작품 목록을 거기 실으면
     * 종이를 한 장도 더 쓰지 않고 차례가 짧아진다.
     */
    // 차례는 주제 줄만 만든다.
    assert.match(print, /if \(continuous\) \{\s*const groupTitle = groupStarts\.get\(i\);/s);
    // 작품 목록은 간지 안에 들어간다.
    assert.match(print, /data-divider-row="\$\{workIndex\}"/);
    assert.match(print, /data-divider-list/);
    // 간지의 작품 줄에도 쪽번호를 채운다 — 못 채우면 거기서 찾을 수가 없다.
    assert.match(pagination, /const dividerRow = \[\.\.\.output\.querySelectorAll\('\[data-divider-row\]'\)\]/);
});

test('한 주제에 작품이 많으면 간지가 다음 쪽으로 이어진다', () => {
    /*
     * 학급 전체가 같은 과제를 쓰면 목록이 한 쪽을 넘는다. 넘친다고 막으면 정작 큰 학급이
     * 문집을 못 만든다. 이름만 둔 쪽에 이어 목록을 다음 쪽으로 넘긴다.
     */
    assert.match(pagination, /flow\(dividerRows, \(\) => \{ const p = dividerPage\(true\);/);
    assert.match(pagination, /\(\) => dividerPage\(false\)/);
});

test('이어붙이기는 쪽 전체를 재고 작품 상자에 담는다', () => {
    /*
     * 상자만 재면 앞 작품이 차지한 자리를 못 봐서 넘친 줄 모른다. 담는 곳과 재는 곳이 달라야 한다.
     */
    assert.match(pagination, /const measureOf = \(current\) => current\.measure \|\| current\.content;/);
    assert.match(pagination, /measure: cursor\.content/);
    // 앞 작품이 있는 쪽에서는 문단을 쪼개지 말고 다음 쪽으로 넘긴다.
    assert.match(pagination, /current\.content\.childElementCount > current\.fixed \|\| current\.hasNeighbours/);
});
