import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { commentTextIssue, commentWords } from '../supabase/functions/_shared/commentQuality.js';

const LOW = new Set(['와', '대박', '굿', 'ㅋㅋ', '와!']);
const issue = (text) => commentTextIssue(text, { lowEffort: LOW });

test('느낌표·물음표·물결이 많아도 내용이 있는 댓글은 막지 않는다', () => {
    for (const text of [
        '정말 재밌어요!!!!!!!!',
        '너무 재미있어!!!!!! 다음 글도 기대돼??????',
        '와 이 부분 진짜 웃겼어~~~~~~ 또 써 줘!!!!',
        '어떻게 이런 생각을 했어????? 대단하다!!!!!!',
        '정말 재밌었어요 ㅋㅋㅋㅋㅋㅋㅋㅋ 다음 글도 읽고 싶어요',
        '감동이었어요 ㅠㅠㅠㅠㅠ 마지막 문장이 마음에 남아요',
        '최고예요!!!!!!!!!! 😍😍😍😍😍 또 보고 싶어요',
    ]) assert.equal(issue(text), null, text);
});

test('낱말이 없거나 같은 낱말을 되풀이하면 막는다', () => {
    assert.equal(issue('!!!!!!!!!!!!'), 'no_words');
    assert.equal(issue('????????????'), 'no_words');
    assert.equal(issue('ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ'), 'no_words');
    assert.equal(issue('😍😍😍😍😍😍😍😍😍'), 'no_words');
    assert.equal(issue('좋아요좋아요좋아요좋아요 좋아요'), 'repeat');
    assert.equal(issue('와와와와와와와와와와'), 'repeat');
    assert.equal(issue('asdfasdfasdfasdfasdf'), 'repeat');
});

test('길이 기준은 예전 그대로(공백 빼고 8자, 200자 이내)', () => {
    assert.equal(issue('좋아요'), 'short');
    assert.equal(issue('와!'), 'short');
    assert.equal(issue('가'.repeat(201)), 'long');
});

test('웃음·울음 자모는 낱말에서 뺀다', () => {
    assert.equal(commentWords('재밌어요ㅋㅋㅋㅋ!!!'), '재밌어요');
});

test('서버와 브라우저가 같은 파일을 쓴다(따로 적지 않는다)', () => {
    const server = readFileSync('supabase/functions/vibe-ai/index.ts', 'utf8');
    const client = readFileSync('src/hooks/usePostInteractions.js', 'utf8');
    assert.match(server, /from '\.\.\/_shared\/commentQuality\.js'/);
    assert.match(client, /_shared\/commentQuality\.js/);
    assert.doesNotMatch(server, /\(\.\{1,8\}\)\\1\{3,\}/);   // 서버에 옛 반복 규칙이 남아 있지 않다
    assert.match(readFileSync('supabase/functions/_shared/model.js', 'utf8'), /export const OPENAI_MODEL = 'gpt-6-luna';/);
});
