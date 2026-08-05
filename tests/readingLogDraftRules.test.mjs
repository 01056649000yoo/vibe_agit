import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyBookSelection,
    autoTitleFor,
    hasCustomTitle,
    readingDraftHasContent
} from '../src/modules/writing/reading-log/draftRules.js';

const EMPTY = {
    title: '',
    titleAutoFilled: false,
    selectedBook: null,
    content: '',
    visibility: 'class',
    readingStatus: 'completed'
};

const BOOK_A = { title: '마당을 나온 암탉', authors: ['황선미'] };
const BOOK_B = { title: '몽실 언니', authors: ['권정생'] };

test('빈 화면은 초안으로 남기지 않는다', () => {
    assert.equal(readingDraftHasContent(EMPTY), false);
});

test('책만 골라 자동 제목이 붙은 상태는 초안이 아니다', () => {
    // 이것을 초안으로 세면 검색만 해 보고 나간 책이 다음 `새 독서록 쓰기` 에 되살아난다.
    const picked = applyBookSelection(EMPTY, BOOK_A);
    assert.equal(picked.title, autoTitleFor(BOOK_A));
    assert.equal(picked.titleAutoFilled, true);
    assert.equal(readingDraftHasContent(picked), false);
});

test('본문을 한 줄이라도 쓰면 초안으로 남긴다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const written = { ...picked, content: '재미있었다.' };
    assert.equal(readingDraftHasContent(written), true);
});

test('학생이 제목을 직접 고치면 초안으로 남긴다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const renamed = { ...picked, title: '내가 지은 제목', titleAutoFilled: false };
    assert.equal(readingDraftHasContent(renamed), true);
});

test('다른 책으로 바꾸면 자동 제목도 새 책 이름으로 바뀐다', () => {
    const first = applyBookSelection(EMPTY, BOOK_A);
    const second = applyBookSelection(first, BOOK_B);
    assert.equal(second.title, autoTitleFor(BOOK_B));
    assert.equal(second.selectedBook, BOOK_B);
});

test('직접 지은 제목도 기본은 새 책 이름으로 바뀐다', () => {
    // 판정이 한 군데라도 어긋나면 옛 책 이름이 남는다. 기본을 `갈아 끼움` 으로 두어 그 위험을 없앤다.
    const renamed = { ...EMPTY, title: '내가 지은 제목', selectedBook: BOOK_A };
    const swapped = applyBookSelection(renamed, BOOK_B);
    assert.equal(swapped.title, autoTitleFor(BOOK_B));
    assert.equal(swapped.titleAutoFilled, true);
});

test('지키기로 하면 직접 지은 제목이 그대로 남는다', () => {
    const renamed = { ...EMPTY, title: '내가 지은 제목', selectedBook: BOOK_A };
    const swapped = applyBookSelection(renamed, BOOK_B, { keepCustomTitle: true });
    assert.equal(swapped.title, '내가 지은 제목');
    assert.equal(swapped.titleAutoFilled, false);
    assert.equal(swapped.selectedBook, BOOK_B);
});

test('자동 제목은 지키기로 해도 새 책 이름으로 바뀐다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const swapped = applyBookSelection(picked, BOOK_B, { keepCustomTitle: true });
    assert.equal(swapped.title, autoTitleFor(BOOK_B));
});

test('직접 지은 제목인지 판정 — 자동 제목·빈 제목은 아니다', () => {
    assert.equal(hasCustomTitle(EMPTY), false);
    assert.equal(hasCustomTitle(applyBookSelection(EMPTY, BOOK_A)), false);
    // 표시가 없는 옛 초안도 모양으로 걸러진다
    assert.equal(hasCustomTitle({ title: autoTitleFor(BOOK_A), selectedBook: BOOK_A }), false);
    assert.equal(hasCustomTitle({ ...EMPTY, title: '내가 지은 제목', selectedBook: BOOK_A }), true);
});

test('책을 비우면 자동 제목도 함께 사라진다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const cleared = applyBookSelection(picked, null);
    assert.equal(cleared.selectedBook, null);
    assert.equal(cleared.title, '');
    assert.equal(readingDraftHasContent(cleared), false);
});

test('책을 비워도 학생이 지은 제목은 남긴다', () => {
    const renamed = { ...EMPTY, title: '내가 지은 제목' };
    const cleared = applyBookSelection(renamed, null);
    assert.equal(cleared.title, '내가 지은 제목');
});

// `titleAutoFilled` 표시가 생기기 전에 태블릿에 남은 초안에는 그 값이 없다.
// 표시만 믿으면 자동 제목이 `학생이 지은 제목` 이 되어 책을 바꿔도 옛 책 이름이 남았다.
test('표시 없는 옛 초안의 자동 제목도 새 책 이름으로 바뀐다', () => {
    const legacyDraft = {
        ...EMPTY,
        title: autoTitleFor(BOOK_A),
        selectedBook: BOOK_A,
        content: '읽고 나서 생각을 적었다.'
    };
    delete legacyDraft.titleAutoFilled;

    const swapped = applyBookSelection(legacyDraft, BOOK_B);
    assert.equal(swapped.title, autoTitleFor(BOOK_B));
    assert.equal(swapped.content, '읽고 나서 생각을 적었다.');
});

test('표시 없는 옛 초안이 자동 제목뿐이면 초안으로 세지 않는다', () => {
    const legacyDraft = { ...EMPTY, title: autoTitleFor(BOOK_A), selectedBook: BOOK_A };
    delete legacyDraft.titleAutoFilled;
    assert.equal(readingDraftHasContent(legacyDraft), false);
});

test('자동 제목을 그대로 두고 본문만 썼어도 책을 바꾸면 제목이 따라간다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const written = { ...picked, content: '재미있었다.' };
    const swapped = applyBookSelection(written, BOOK_B);
    assert.equal(swapped.title, autoTitleFor(BOOK_B));
});

test('다른 책 검색하기로 비운 뒤 새 책을 골라도 제목이 새 책 이름이다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const cleared = applyBookSelection(picked, null);
    const swapped = applyBookSelection(cleared, BOOK_B);
    assert.equal(swapped.title, autoTitleFor(BOOK_B));
});

test('쓰던 글이 있으면 책을 바꿔도 본문은 그대로다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const written = { ...picked, content: '기억에 남는 장면이 있다.' };
    const swapped = applyBookSelection(written, BOOK_B);
    assert.equal(swapped.content, '기억에 남는 장면이 있다.');
    assert.equal(readingDraftHasContent(swapped), true);
});
