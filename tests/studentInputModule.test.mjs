import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
    checkSpelling,
    issuesSafeWhileTyping,
    uniqueSpellingIssues,
    MAX_SPELLING_ISSUES
} from '../src/modules/writing/student-input/checker/spellingEngine.js';
import { findElementarySpellingIssues } from '../src/modules/writing/student-input/checker/elementarySpellingEntries.js';

const engine = (text, entries = []) => checkSpelling(text, { elementaryDetector: findElementarySpellingIssues, entries });

test('학생 입력기 엔진: 빠른 규칙·기본 자료·공통 자료를 겹치지 않게 합쳐 위치 순으로 돌려준다', () => {
    const entries = [{ id: 'c1', wrong_expression: '설겆이', correct_expression: '설거지', label: '설거지' }];
    const issues = engine('김치찌게를 먹고 설겆이를 했다.', entries);
    assert.ok(issues.some((issue) => issue.right === '찌개'));
    assert.ok(issues.some((issue) => issue.right === '설거지'));
    for (let i = 1; i < issues.length; i += 1) {
        assert.ok(issues[i - 1].end <= issues[i].start, '밑줄끼리 겹치면 안 된다');
    }
});

test('학생 입력기 엔진: 바른 글에는 밑줄이 없고, 개수 상한을 넘지 않는다', () => {
    assert.deepEqual(engine('책을 반듯이 놓았어요.'), []);
    assert.deepEqual(engine(''), []);
    const many = Array.from({ length: 80 }, () => '김치찌게').join(' ');
    assert.equal(engine(many).length, MAX_SPELLING_ISSUES);
});

test('학생 입력기 엔진: 기본 자료가 아직 안 왔어도 빠른 규칙만으로 동작한다', () => {
    assert.doesNotThrow(() => checkSpelling('되요 안되요', {}));
});

test('손을 멈추기 전에는 훑은 글과 같은 앞부분의 밑줄만 남긴다', () => {
    const issues = [{ start: 0, end: 3 }, { start: 10, end: 13 }];
    assert.deepEqual(issuesSafeWhileTyping(issues, '0123456789abc', '0123456789abc'), issues);
    assert.deepEqual(issuesSafeWhileTyping(issues, '0123456789abc', '01234X'), [{ start: 0, end: 3 }]);
});

test('같은 항목의 칩은 한 번만', () => {
    const issues = [{ entryId: 'a' }, { entryId: 'a' }, { entryId: 'b' }];
    assert.deepEqual(uniqueSpellingIssues(issues).map((issue) => issue.entryId), ['a', 'b']);
});

test('글을 쓰는 칸은 학생 입력기 모듈 하나로만 만든다(옛 부품·따로 합치는 검사가 다시 생기지 않게)', async () => {
    const index = await readFile('src/modules/writing/student-input/index.js', 'utf8');
    assert.match(index, /StudentTextArea/);
    assert.match(index, /StudentTextField/);
    const toolFiles = await readdir('src/modules/writing/tools/spelling-lookup');
    assert.ok(!toolFiles.includes('SpellingUnderlineTextarea.jsx'));
    assert.ok(!toolFiles.includes('SpellingUnderlineInput.jsx'));
    // 빨간 줄을 구하는 스크립트도 같은 엔진을 쓴다
    for (const script of ['scripts/spelling-shadow.mjs', 'scripts/spelling-scorecard.mjs']) {
        const source = await readFile(script, 'utf8');
        assert.match(source, /checkSpelling\(/, `${script} 는 학생 입력기 엔진을 써야 한다`);
        assert.doesNotMatch(source, /findClassSpellingIssues/, `${script} 가 빨간 줄을 따로 합치고 있다`);
    }
});

test('검토 중 자료 862개: 스위치는 꺼져 있고(선생님 검토 전), 켜면 엔진이 같은 자리에서 찾는다', async () => {
    const { PENDING_SPELLING_ENABLED } = await import('../src/modules/writing/student-input/checker/pending/config.js');
    const { findPendingSpellingIssues } = await import('../src/modules/writing/student-input/checker/pending/pendingSpellingDetector.js');
    const { PENDING_SPELLING_ENTRIES } = await import('../src/modules/writing/student-input/checker/pending/pendingSpellingEntries.js');
    assert.equal(PENDING_SPELLING_ENABLED, false, '선생님 검토 전에는 학생에게 보이지 않아야 한다');
    assert.equal(PENDING_SPELLING_ENTRIES.length, 862);
    const sentence = '이집트의 피라밋을 보았다.';
    assert.ok(!engine(sentence).some((issue) => issue.right === '피라미드'));
    const withPending = checkSpelling(sentence, { elementaryDetector: findElementarySpellingIssues, pendingDetector: findPendingSpellingIssues });
    const found = withPending.find((issue) => issue.right === '피라미드');
    assert.equal(found?.source, 'pending');
    // 검토 중 자료는 첫 화면 청크에 섞이지 않는다 — 훅은 스위치가 켜졌을 때만 뒤에서 받는다
    const hook = await readFile('src/modules/writing/student-input/checker/useSpellingCheck.js', 'utf8');
    assert.match(hook, /if \(!enabled \|\| !pending\) return undefined;/);
    const config = await readFile('src/modules/writing/student-input/checker/pending/config.js', 'utf8');
    assert.match(config, /import\('\.\/pendingSpellingDetector\.js'\)/);
});

test('회색 점선: 바뀐 문단만 보내고, 결과를 지금 글 자리에 맞추고, 빨간 물결·그대로 두기와 겹치면 뺀다', async () => {
    const {
        splitParagraphs, pickParagraphsToSend, placeGraySuggestions, visibleGrayIssues, applyGraySuggestion,
        GRAY_MAX_PARAGRAPHS, GRAY_MAX_PARAGRAPH_CHARS
    } = await import('../src/modules/writing/student-input/checker/gray/paragraphs.js');
    const text = '먹을것을 샀다.\n\n선생님 한테 갔다.';
    const paragraphs = splitParagraphs(text);
    assert.deepEqual(paragraphs.map((p) => p.start), [0, 10]);
    const cache = new Map([[paragraphs[0].text, [{ start: 0, end: 4, original: '먹을것을', suggestion: '먹을 것을', category: 'modifier_noun' }]]]);
    assert.deepEqual(pickParagraphsToSend(paragraphs, cache).map((p) => p.text), ['선생님 한테 갔다.'], '이미 물은 문단은 다시 보내지 않는다');
    cache.set(paragraphs[1].text, [{ start: 0, end: 6, original: '선생님 한테', suggestion: '선생님한테', category: 'particle_attach' }]);
    const placed = placeGraySuggestions(paragraphs, cache);
    assert.deepEqual(placed.map((g) => [g.start, g.end]), [[0, 4], [10, 16]]);
    assert.equal(text.slice(10, 16), '선생님 한테');
    // 빨간 물결이 있는 자리·그대로 두기 한 것은 뺀다
    assert.equal(visibleGrayIssues(placed, [{ start: 0, end: 3 }], new Set()).length, 1);
    assert.equal(visibleGrayIssues(placed, [], new Set(['선생님 한테→선생님한테'])).length, 1);
    // 고치기는 그 자리가 원래 조각일 때만
    assert.equal(applyGraySuggestion(text, placed[1]), '먹을것을 샀다.\n\n선생님한테 갔다.');
    assert.equal(applyGraySuggestion('다른 글', placed[1]), null);
    // 상한: 문단 12개·긴 문단은 보내지 않음
    const many = Array.from({ length: 20 }, (_, i) => ({ start: i * 10, text: `문단 ${i} 입니다` }));
    assert.equal(pickParagraphsToSend(many, new Map()).length, GRAY_MAX_PARAGRAPHS);
    assert.equal(pickParagraphsToSend([{ start: 0, text: '가'.repeat(GRAY_MAX_PARAGRAPH_CHARS + 1) }], new Map()).length, 0);
});

test('회색 점선은 기본 켜짐(2026-10-08 선생님 결정)이고, 서버 함수가 학급 켜짐·학생 인증·상한을 다시 본다', async () => {
    const { DEFAULT_WRITING_EDITOR_SETTINGS, SPELLING_GRAY_TOOL_ID } = await import('../src/modules/writing/editor-settings/settings.js');
    assert.ok(DEFAULT_WRITING_EDITOR_SETTINGS.enabled_tools.includes(SPELLING_GRAY_TOOL_ID));
    const manifest = await readFile('src/modules/writing/tools/spelling-gray/manifest.js', 'utf8');
    assert.match(manifest, /defaultEnabled: true/);
    assert.match(manifest, /surface: 'inline'/);
    const fn = await readFile('supabase/functions/spelling-look-closer/index.ts', 'utf8');
    assert.match(fn, /auth\.getUser\(\)/);
    assert.match(fn, /enabledTools\.includes\(GRAY_TOOL_ID\)/);
    assert.match(fn, /MAX_PARAGRAPHS = 12/);
    assert.match(fn, /allowRequest\(user\.id\)/);
    assert.doesNotMatch(fn, /console\.(log|error)\([^)]*text/, '학생 글을 기록에 남기지 않는다');
    const server = await readFile('services/spelling-analyzer/server.py', 'utf8');
    assert.match(server, /HOST = '127\.0\.0\.1'/, '분석 창구는 맥미니 밖에서 보이지 않는다');
    assert.match(server, /hmac\.compare_digest/);
    // 입력기는 미리보기 흉내(grayLineSource)일 때 기록하지 않는다
    const area = await readFile('src/modules/writing/student-input/StudentTextArea.jsx', 'utf8');
    assert.match(area, /if \(!grayLineSource\) recordGrayChoice\(issue, 'applied'\)/);
    const ops = await readFile('scripts/check-operational-security.mjs', 'utf8');
    assert.match(ops, /spelling-look-closer/);
});

test('회색 점선: 입력칸이 여러 개여도 요청은 하나로 모으고, 막히면 잠시 뒤 다시 보낸다(2026-10-09 시뮬레이션)', async () => {
    const api = await import('../src/modules/writing/student-input/checker/gray/grayApi.js');
    const calls = [];
    let limitOnce = true;
    api.setGraySenderForTest(async (texts) => {
        calls.push([...texts]);
        if (limitOnce) { limitOnce = false; return { status: 'limited' }; }
        return { status: 'ok', results: new Map(texts.map((text) => [text, []])) };
    });
    const got = [];
    const stop = api.onGrayResult((text) => got.push(text));
    // 시의 연 세 칸이 같은 순간에 묻는다
    api.requestGraySuggestions(['첫째 연입니다']);
    api.requestGraySuggestions(['둘째 연입니다']);
    api.requestGraySuggestions(['셋째 연입니다', '첫째 연입니다']);
    await new Promise((resolve) => setTimeout(resolve, 2300));
    stop();
    api.setGraySenderForTest(null);
    assert.deepEqual(calls[0], ['첫째 연입니다', '둘째 연입니다', '셋째 연입니다'], '세 칸이 한 번에, 같은 문단은 한 번만');
    assert.equal(calls.length, 2, '막힌 뒤 한 번 더 보냈다');
    assert.deepEqual(got.sort(), ['둘째 연입니다', '셋째 연입니다', '첫째 연입니다']);
});

test('맞춤법 수첩을 끈 반은 회색 점선도 꺼진다(화면·서버 같은 기준, 2026-10-09 선생님 결정)', async () => {
    const sw = await readFile('src/modules/writing/student-input/useSpellingSwitch.js', 'utf8');
    assert.match(sw, /isToolEnabled\(SPELLING_LOOKUP_TOOL_ID\) && isToolEnabled\(SPELLING_GRAY_TOOL_ID\)/);
    const fn = await readFile('supabase/functions/spelling-look-closer/index.ts', 'utf8');
    assert.match(fn, /!enabledTools\.includes\(LOOKUP_TOOL_ID\)/);
});
