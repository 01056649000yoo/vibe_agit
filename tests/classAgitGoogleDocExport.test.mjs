import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ANTHOLOGY_PRINT_SETTINGS } from '../src/modules/class-agit/anthology/contract.js';
import { buildAnthologyDocRequests, ANTHOLOGY_DOC_GUIDE } from '../src/modules/class-agit/anthology/googleDocExport.js';

const editionId = '11111111-1111-4111-8111-111111111111';
const book = {
    title: '우리 책', subtitle: '봄 이야기', introduction: '첫 문단\n\n둘째 문단',
    class_label: '3학년 1반', term: '', issue_date: '2026-09-09', grouping: 'custom',
    print: ANTHOLOGY_PRINT_SETTINGS,
};
const work = (index) => ({
    id: `chapter-${index}`, title: `작품 ${index}`, author: `글쓴이 ${index}`,
    format: 'poem', kindLabel: '시', group: '계절', excerpt: '안녕', blocks: ['안녕\n봄', '또 만나'],
});
const edition = (overrides = {}) => ({
    version: 1, id: editionId, number: 2, book: { ...book, works: [work(1), work(2)] }, ...overrides,
});

/** 요청 목록에서 실제로 문서에 들어가는 글자만 순서대로 모은다. */
const insertedText = (requests) => requests
    .filter((request) => request.insertText)
    .map((request) => request.insertText.text)
    .join('');

/** 특정 문단에 적용된 이름 있는 스타일을 찾는다. */
const styleOf = (requests, text) => {
    const at = requests.findIndex((request) => request.insertText?.text === text);
    if (at < 0) return null;
    return requests[at + 1]?.updateParagraphStyle?.paragraphStyle?.namedStyleType ?? null;
};

test('문집 구글 문서는 표지·여는 글·목차·본문·판권지를 순서대로 담는다', () => {
    const { title, requests } = buildAnthologyDocRequests(edition());
    assert.equal(title, '우리 책 (2판)');

    const text = insertedText(requests);
    const order = ['우리 반의 이야기', '우리 책', '봄 이야기', '3학년 1반', '2026-09-09',
        '여는 글', '첫 문단', '둘째 문단', '목차', '1. 작품 1 · 글쓴이 1', '2. 작품 2 · 글쓴이 2',
        '작품 1', '글쓴이 1 · 계절', '안녕\n봄', '작품 2', '판권지', '글의 권리는 각 글쓴이에게 있습니다.'];
    let cursor = -1;
    for (const piece of order) {
        const at = text.indexOf(piece, cursor + 1);
        assert.ok(at > cursor, `"${piece}" 이 순서대로 들어 있지 않습니다.`);
        cursor = at;
    }
});

test('삽입 위치는 앞에서부터 이어지고 쪽 나눔이 각 부분을 가른다', () => {
    const { requests } = buildAnthologyDocRequests(edition());

    // 순서가 곧 문서 내용이다. 커서가 뒤로 가면 글이 뒤섞인다.
    let expected = 1;
    for (const request of requests) {
        if (request.insertText) {
            assert.equal(request.insertText.location.index, expected, '삽입 위치가 이어지지 않습니다.');
            expected += request.insertText.text.length;
        } else if (request.insertPageBreak) {
            assert.equal(request.insertPageBreak.location.index, expected);
            expected += 1;
        } else if (request.updateParagraphStyle) {
            assert.ok(request.updateParagraphStyle.range.endIndex <= expected);
        }
    }

    // 표지 · 목차 · 작품 2편 사이 · 판권지 앞에서 쪽을 나눈다(여는 글이 있으면 한 번 더).
    assert.equal(requests.filter((request) => request.insertPageBreak).length, 5);
});

test('작품 제목만 HEADING_1 이라 구글 문서 자동 목차가 작품만 잡는다', () => {
    const { requests } = buildAnthologyDocRequests(edition());

    assert.equal(styleOf(requests, '작품 1\n'), 'HEADING_1');
    assert.equal(styleOf(requests, '작품 2\n'), 'HEADING_1');
    assert.equal(styleOf(requests, '여는 글\n'), 'HEADING_1');

    // `목차`·`판권지` 가 HEADING 이면 자동 목차가 목차 자신을 담아 버린다.
    assert.equal(styleOf(requests, '목차\n'), 'NORMAL_TEXT');
    assert.equal(styleOf(requests, '판권지\n'), 'NORMAL_TEXT');
    assert.equal(styleOf(requests, '우리 책\n'), 'TITLE');
});

test('쪽수를 지어내지 않고 구글 문서가 세도록 안내한다', () => {
    const { requests } = buildAnthologyDocRequests(edition());
    const text = insertedText(requests);

    // PDF 는 실제 조판으로 쪽수를 세지만 구글 문서는 여는 기기마다 쪽이 다시 나뉜다.
    // 그 숫자를 베껴 넣으면 틀린 쪽수가 된다. Docs API 에는 목차·자동 쪽번호 요청이 없다.
    assert.ok(text.includes(ANTHOLOGY_DOC_GUIDE));
    assert.match(ANTHOLOGY_DOC_GUIDE, /삽입 → 목차/);
    assert.match(ANTHOLOGY_DOC_GUIDE, /삽입 → 페이지 번호/);
    assert.match(ANTHOLOGY_DOC_GUIDE, /Microsoft Word\(\.docx\)/); // 한글(hwp)로 옮기는 길
    assert.doesNotMatch(text, /\d+쪽/);
});

test('여는 글이 없으면 그 부분과 쪽 나눔을 통째로 뺀다', () => {
    const withoutIntro = edition();
    withoutIntro.book = { ...withoutIntro.book, introduction: '' };
    const { requests } = buildAnthologyDocRequests(withoutIntro);

    assert.ok(!insertedText(requests).includes('여는 글'));
    assert.equal(requests.filter((request) => request.insertPageBreak).length, 4);
});

test('확정판 계약을 어긴 자료는 문서를 만들기 전에 막는다', () => {
    assert.throws(() => buildAnthologyDocRequests({ ...edition(), version: 2 }));
    assert.throws(() => buildAnthologyDocRequests({ ...edition(), book: { ...book, works: [] } }));
    const tooLong = { ...work(1), blocks: ['글'.repeat(20001)] };
    assert.throws(() => buildAnthologyDocRequests({ ...edition(), book: { ...book, works: [tooLong] } }));
});

test('Docs API 호출부는 공용 모듈 하나만 쓴다', () => {
    const hook = readFileSync('src/hooks/useDataExport.js', 'utf8');
    const shared = readFileSync('src/modules/writing/export/googleDocsApi.js', 'utf8');
    const anthology = readFileSync('src/modules/class-agit/anthology/googleDocExport.js', 'utf8');

    // 주소를 두 곳에 적으면 한쪽만 고쳐진다.
    assert.match(shared, /https:\/\/docs\.googleapis\.com\/v1/);
    assert.doesNotMatch(hook, /https:\/\/docs\.googleapis\.com/);
    assert.doesNotMatch(anthology, /https:\/\/docs\.googleapis\.com/);
    assert.match(hook, /from '\.\.\/modules\/writing\/export\/googleDocsApi\.js'/);
    assert.match(anthology, /googleDocsApi\.js'/);

    // 글이 많으면 batchUpdate 를 나눠 보내야 한다. 나눌 때 순서가 뒤집히면 문서가 뒤섞인다.
    assert.match(shared, /requests\.slice\(start, start \+ chunkSize\)/);
});
