import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { bookItemGroupLabel, bookItemNeedsReview, findBookItems, moveBookItem, parseOrderNumber } from '../src/modules/class-agit/anthology/orderModel.js';

const read = (file) => readFileSync(file, 'utf8');
const editor = read('src/modules/class-agit/anthology/BookOrderEditor.jsx');
const css = read('src/modules/class-agit/classAgit.css');
const items = (n) => Array.from({ length: n }, (_, i) => ({ sourceId: `p${i + 1}`, title: `글 ${i + 1}`, author: `학생${(i % 3) + 1}`, group: `주제${(i % 2) + 1}` }));
const ids = (list) => list.map((item) => item.sourceId);

/*
 * 2026-09-15 "차례를 수정하는 화면이 불편하다." 100편에서 90번을 5번으로 올리려면 ↑ 를 85번 눌러야 했다.
 * 옮기기는 순수 함수라 여기서 값으로 본다. 끌어 놓기 자체는 미리보기에서 눌러 봤다.
 */
test('한 편을 어느 자리로든 한 번에 옮긴다', () => {
    const list = items(5);
    assert.deepEqual(ids(moveBookItem(list, 4, 0)), ['p5', 'p1', 'p2', 'p3', 'p4'], '맨 위로');
    assert.deepEqual(ids(moveBookItem(list, 0, 4)), ['p2', 'p3', 'p4', 'p5', 'p1'], '맨 아래로');
    assert.deepEqual(ids(moveBookItem(list, 3, 1)), ['p1', 'p4', 'p2', 'p3', 'p5'], '번호로');
    assert.deepEqual(ids(moveBookItem(list, 1, 2)), ['p1', 'p3', 'p2', 'p4', 'p5'], '한 칸 아래');
    // 같은 자리·범위 밖은 망가뜨리지 않는다.
    assert.deepEqual(ids(moveBookItem(list, 2, 2)), ids(list));
    assert.deepEqual(ids(moveBookItem(list, 0, 99)), ['p2', 'p3', 'p4', 'p5', 'p1'], '너무 큰 자리는 끝');
    assert.deepEqual(ids(moveBookItem(list, 0, -3)), ids(list), '음수 자리는 맨 위 = 제자리');
    assert.deepEqual(ids(moveBookItem(list, 9, 0)), ids(list), '없는 편은 무시');
    assert.notEqual(moveBookItem(list, 4, 0), list, '원본을 바꾸지 않는다');
    assert.deepEqual(moveBookItem(null, 0, 1), []);
});

test('사람이 적는 번호는 1부터이고, 범위를 넘으면 마지막 번호로 본다', () => {
    assert.equal(parseOrderNumber('1', 100), 0);
    assert.equal(parseOrderNumber('100', 100), 99);
    assert.equal(parseOrderNumber('250', 100), 99, '있는 편수보다 크면 맨 끝');
    assert.equal(parseOrderNumber(' 7 ', 100), 6);
    assert.equal(parseOrderNumber('0', 100), null);
    assert.equal(parseOrderNumber('-2', 100), null);
    assert.equal(parseOrderNumber('', 100), null);
    assert.equal(parseOrderNumber('둘', 100), null);
    assert.equal(parseOrderNumber(undefined, 100), null);
});

test('묶기 기준에 따라 묶음 제목이 서고, 찾기는 전체 순서의 자리를 그대로 들고 온다', () => {
    const list = items(6);
    assert.equal(bookItemGroupLabel(list[0], 'author'), '학생1');
    assert.equal(bookItemGroupLabel(list[0], 'topic'), '주제1');
    assert.equal(bookItemGroupLabel(list[0], 'custom'), null, '직접 정한 순서에는 묶음이 없다');
    assert.equal(bookItemGroupLabel({ title: 'x' }, 'author'), '지은이 없음');
    // 찾기: 제목·지은이·주제 어느 것이든, 대소문자 무관. 자리는 전체 순서 기준이라 옮기기에 바로 쓴다.
    assert.deepEqual(findBookItems(list, '학생2').map((entry) => entry.index), [1, 4]);
    assert.deepEqual(findBookItems(list, '글 6').map((entry) => entry.index), [5]);
    assert.deepEqual(findBookItems(list, '주제2').map((entry) => entry.index), [1, 3, 5]);
    assert.equal(findBookItems(list, '').length, 6);
    assert.equal(findBookItems(list, '   ').length, 6);
    assert.equal(findBookItems(list, '없는말').length, 0);
    assert.deepEqual(findBookItems(null, 'x'), []);
    // 원글 재확인 표시는 바뀜·사라짐·철회 셋 가운데 하나.
    assert.equal(bookItemNeedsReview({ sourceChanged: true }), true);
    assert.equal(bookItemNeedsReview({ revoked: true }), true);
    assert.equal(bookItemNeedsReview({}), false);
});

test('목차 화면은 안쪽 스크롤 상자가 없고, 끌기는 직접 정한 순서에서만 켜진다', () => {
    /*
     * "우측 사이드바를 내리면 전체 화면이 내려간다" — 680px 상자 안에서 따로 스크롤되던 차례가 원인.
     * 새 목록은 화면 스크롤을 그대로 쓴다. 옛 상자 규칙(.class-agit-order-panel > ol)을 새 목록에 붙이지 않는다.
     */
    assert.doesNotMatch(css, /\.book-order__list \{[^}]*max-height/);
    assert.doesNotMatch(css, /\.book-order__list \{[^}]*overflow-y/);
    assert.doesNotMatch(editor, /class-agit-order-panel|class-agit-book-items/);
    // 끌기: 손잡이를 잡았을 때만(줄 전체를 잡게 하면 단추를 누르다 끌린다), 직접 정한 순서·찾기 아님·잠기지 않음.
    assert.match(editor, /const draggable = book\.grouping === 'custom' && !filtering && !locked;/);
    assert.match(editor, /dragListener=\{false\} dragControls=\{dragControls\}/);
    assert.match(editor, /dragControls\.start\(event\)/);
    // 옮기면 묶기가 '직접 정한 순서' 로 바뀐다 — 학생별로 묶어 둔 채 한 편만 옮기면 다음 정렬에 되돌아간다.
    assert.match(editor, /const setOrder = \(next\) => onEdit\(\{ \.\.\.book, grouping: 'custom', items: next \}\);/);
    // 멀리 옮기는 길 셋과 ⋯ 메뉴 안의 작업들.
    for (const label of ['번호로 옮기기', '맨 위로', '맨 아래로', '읽기', '원글 재확인', '초안에서 빼기', '수록 철회']) {
        assert.ok(editor.includes(label), `${label} 이 없습니다.`);
    }
    // 글자 바닥.
    assert.doesNotMatch(css.slice(css.indexOf('.book-order__toolbar')), /font-size: (?:1[01]px|\.[0-7]\d*rem)/);
});
