import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyBookSelection,
    autoTitleFor,
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

test('학생이 직접 지은 제목은 책을 바꿔도 지킨다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const renamed = { ...picked, title: '내가 지은 제목', titleAutoFilled: false };
    const swapped = applyBookSelection(renamed, BOOK_B);
    assert.equal(swapped.title, '내가 지은 제목');
    assert.equal(swapped.titleAutoFilled, false);
    assert.equal(swapped.selectedBook, BOOK_B);
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

test('쓰던 글이 있으면 책을 바꿔도 본문은 그대로다', () => {
    const picked = applyBookSelection(EMPTY, BOOK_A);
    const written = { ...picked, content: '기억에 남는 장면이 있다.' };
    const swapped = applyBookSelection(written, BOOK_B);
    assert.equal(swapped.content, '기억에 남는 장면이 있다.');
    assert.equal(readingDraftHasContent(swapped), true);
});
