import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const draft = readFileSync('src/modules/class-agit/exhibitionDraft.js', 'utf8');
const sharing = readFileSync('src/modules/class-agit/public/sharingPolicy.js', 'utf8');
const readme = readFileSync('src/modules/class-agit/README.md', 'utf8');

test('공개되는 지은이는 실명 한 갈래뿐이고, 묵은 가명 칸이 되살아나지 않는다', () => {
    // 2026-09-07: `publicAlias` 의 기본값이 `새싹 작가 01` 이라, DB 만 보면 공개본에 가명이 나가는 것처럼
    // 보였다(실제로 두 번 잘못 판단했다). 공개되는 이름은 학급 공개도 외부 공개도 실명(`authorName`)이다.
    // 묵은 칸에 실명을 넣지 않는다 — 저장 요청은 개인정보를 싣지 않는다(classAgitPersistence.test.mjs).
    assert.doesNotMatch(draft, /publicAlias: [^\n]*student_name/,
        'publicAlias 에 실명을 넣으면 저장 요청이 개인정보를 싣게 됩니다.');
    // 대신 어느 칸이 진짜 공개 이름인지 코드가 말해 준다.
    assert.match(draft, /`publicAlias` 는 옛 판[^\n]*묵은 칸/);
    assert.match(draft, /공개되는 지은이는 학급 공개도 외부 공개도 `authorName`/);

    // 외부 공개의 지은이는 교사가 고친 값이며, 기본값은 실명(authorName)이다.
    assert.match(sharing, /export const externalAuthor = \(item\) => item\.shareAuthor \?\? item\.authorName \?\? item\.author/);

    // 다음 사람이 같은 오독을 하지 않도록 README 가 어느 칸이 진짜인지 말해 준다.
    assert.match(readme, /공개되는 지은이는 `authorName`\(학생 실명\) 하나뿐이다/);
    assert.match(readme, /묵은 칸/);
});
