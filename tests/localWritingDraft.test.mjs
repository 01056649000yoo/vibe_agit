import test from 'node:test';
import assert from 'node:assert/strict';
import { isClearedDraft } from '../src/modules/writing/drafts/localWritingDraft.js';

/*
 * 왜 이 규칙이 있는가 — 완성 저장이 끝나면 화면은 임시본을 지운다. 그런데 그 직후
 * `저장했어요` 알림창이 화면을 붙드는 동안, 1.5초 뒤로 예약돼 있던 자동 저장이 깨어나
 * **방금 지운 내용을 그대로 다시 쓴다**. 학생이 확인을 누르기까지는 반드시 1.5초가 넘으므로
 * 사실상 매번 되살아났다. 되살아난 임시본은 다음 `새 글` 화면에 올라와 학생을
 * "이미 한 편 있어요" 앞에 가둔다(2026-08-25 독서록·일기에서 확인).
 */

const KEY = 'reading_log_draft_s1_new';
const DRAFT = { title: '『몽실 언니』을 읽고', content: '슬펐다.', visibility: 'class' };
const clearedWith = (key, draft) => ({ key, fingerprint: JSON.stringify(draft) });

test('아무것도 지운 적 없으면 잠그지 않는다', () => {
    assert.equal(isClearedDraft(null, KEY, DRAFT), false);
});

test('방금 지운 그 내용은 다시 쓰지 않는다', () => {
    assert.equal(isClearedDraft(clearedWith(KEY, DRAFT), KEY, DRAFT), true);
});

test('학생이 한 글자라도 다시 쓰면 잠금이 풀린다', () => {
    const edited = { ...DRAFT, content: '슬펐다. 그리고 몽실이가 대단했다.' };
    assert.equal(isClearedDraft(clearedWith(KEY, DRAFT), KEY, edited), false);
});

test('제목만 달라져도 잠금이 풀린다', () => {
    const edited = { ...DRAFT, title: '몽실 언니를 읽고 나서' };
    assert.equal(isClearedDraft(clearedWith(KEY, DRAFT), KEY, edited), false);
});

test('다른 글 화면(열쇠가 다름)은 잠그지 않는다', () => {
    // 독서록을 완성한 뒤 일기로 넘어갔는데 내용이 우연히 같더라도 일기는 저장돼야 한다.
    assert.equal(isClearedDraft(clearedWith(KEY, DRAFT), 'diary_draft_s1_2026-08-25', DRAFT), false);
});

test('열쇠가 없으면 잠그지 않는다', () => {
    assert.equal(isClearedDraft(clearedWith(KEY, DRAFT), null, DRAFT), false);
});

test('내용을 한 줄로 못 적으면 잠그지 않는다 — 저장이 우선', () => {
    // 순환 참조 등으로 지문을 못 만들면 `null` 이 된다. 그때 잠그면 글이 안 남는다.
    assert.equal(isClearedDraft({ key: KEY, fingerprint: null }, KEY, DRAFT), false);
});
