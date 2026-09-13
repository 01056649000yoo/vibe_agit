import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BOOK_PAGE_LAYOUTS, getBookPageLayout, createBookPrintSettings, validBookPrintSettings } from '../src/modules/class-agit/designs.js';
import { buildBookSavePayload } from '../src/modules/class-agit/anthology/contract.js';
import { ANTHOLOGY_MIN_BODY_RATIO } from '../src/modules/class-agit/anthology/pagination.js';

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

test('이어붙이기에서 본문이 조금밖에 못 실리면 글을 통째로 다음 쪽으로 넘긴다', () => {
    /*
     * 2026-09-14 지적: 다음 글의 제목만 쪽 아래에 붙는 초안이 나온다.
     *
     * 처음에는 "제목 아래 세 줄 자리가 있나" 만 봤는데 그것으로는 못 막았다. 이어붙이기에서는
     * 앞 작품이 있는 쪽에서 **문단을 쪼개지 않기 때문에**, 첫 문단이 긴 글은 세 줄 자리가
     * 있어도 문단째 다음 쪽으로 밀리고 제목만 남는다. 그래서 자리가 아니라 **실제로 실릴 몫**을 잰다.
     *
     * 진짜 브라우저(A4·이어붙이기)로 열 가지 책을 짜 본 결과, 고치기 전 쪽 끝에서 시작한
     * 작품 47개 가운데 17개가 본문의 30% 에 못 미쳤고(제목만 실린 것 포함), 고친 뒤에는 0개다.
     * 대신 책 열 권 합쳐 128쪽이 135쪽이 된다 — 한 권에 한 쪽꼴이다.
     */
    assert.equal(ANTHOLOGY_MIN_BODY_RATIO, 0.3);
    // 본문을 다 붙여 보고, 넘치는 문단을 뒤에서부터 뺀 나머지가 이 쪽에 실릴 몫이다.
    assert.match(pagination, /const clones = blocks\.map\(\(block\) => block\.cloneNode\(true\)\);/);
    assert.match(pagination, /for \(let index = clones\.length - 1; index >= 0 && !fits\(cursor\.content\); index--\)/);
    assert.match(pagination, /const placed = box\.offsetHeight - headerHeight;/);
    // 재 보던 문단은 모두 지우고 나온다 — 남으면 그만큼 본문이 밀린다.
    assert.match(pagination, /clones\.forEach\(\(clone\) => clone\.remove\(\)\);/);
    // 자리가 모자라면 상자를 빼고 새 쪽에 다시 놓는다.
    assert.match(pagination, /if \(hasNeighbours && !roomForBody\(box\)\) \{\s*box\.remove\(\);\s*cursor = page\(\);/);
});

test('쪽보다 긴 글은 한 쪽 몫을 기준으로 잰다', () => {
    /*
     * 글 전체의 30% 를 그대로 요구하면 여러 쪽짜리 글은 남은 자리가 아무리 넓어도 늘 다음 쪽으로
     * 밀린다. 이어붙이기인데 쪽 아래가 통째로 비는 셈이다. 기준을 한 쪽 몫에서 끊는다.
     */
    assert.match(pagination, /Math\.min\(whole, cursor\.content\.clientHeight\) \* ANTHOLOGY_MIN_BODY_RATIO/);
});

test('첫 작품은 제 쪽을 통째로 쓰므로 넘기지 않는다', () => {
    // 빈 쪽에서까지 넘기면 끝없이 새 쪽만 연다. 옆에 앞 작품이 있을 때만 넘긴다.
    assert.match(pagination, /if \(hasNeighbours && !roomForBody/);
    // 본문이 아예 없는 작품(제목만 낸 글)은 잴 것이 없으니 그냥 둔다.
    assert.match(pagination, /if \(!blocks\.length\) return true;/);
});

test('제 쪽을 통째로 쓰는 글은 긴 문단을 쪼갠다', () => {
    /*
     * 2026-09-14 지적: 글이 너무 길면 제목이 한 쪽을 차지하고 본문은 다음 쪽부터 나온다.
     *
     * `flow` 는 "이 쪽에 이미 담긴 것"보다 더 들어 있으면 문단을 쪼개지 않고 다음 쪽으로 보낸다.
     * 그런데 이어붙이기의 `first()` 가 `fixed: 0` 을 넘겨, 상자에 든 **제목·글쓴이·줄**을
     * 본문으로 잘못 셌다. 그래서 한 쪽을 넘는 문단이 통째로 밀리고 제목만 남았다.
     *
     * 진짜 브라우저로 책 10권을 짜 보니 제목만 실린 상자 10개 → 0개, 163쪽 → 155쪽이다.
     */
    assert.match(pagination, /fixed: box\.childElementCount, hasNeighbours/);
    // 작품마다 새 쪽일 때도 같은 기준이다 — 머리글 수를 센다.
    assert.match(pagination, /fixed: header\.length/);
});
