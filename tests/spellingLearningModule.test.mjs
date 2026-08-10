import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('supabase/migrations/20261017_spelling_learning_module.sql', 'utf8');
const manifest = await readFile('src/modules/writing/spelling-learning/manifest.js', 'utf8');
const lookup = await readFile('src/modules/writing/tools/spelling-lookup/SpellingLookupTool.jsx', 'utf8');
const lookupManifest = await readFile('src/modules/writing/tools/spelling-lookup/manifest.js', 'utf8');
const underlineTextarea = await readFile('src/modules/writing/tools/spelling-lookup/SpellingUnderlineTextarea.jsx', 'utf8');
const underlineInput = await readFile('src/modules/writing/tools/spelling-lookup/SpellingUnderlineInput.jsx', 'utf8');
const teacherEntry = await readFile('src/modules/writing/spelling-learning/TeacherEntry.jsx', 'utf8');
const {
    ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS,
    ELEMENTARY_SPELLING_DETECTION_RULE_COUNT,
    ELEMENTARY_SPELLING_DETECTION_RULES,
    ELEMENTARY_SPELLING_ENTRY_IDS,
    createRandomElementarySpellingQuiz,
    findElementarySpellingIssues,
    getElementarySpellingEntries,
    getElementarySpellingQuizPool,
    searchElementarySpelling
} = await import(
    '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js'
);
const { ELEMENTARY_SPELLING_QUIZ_QUESTIONS } = await import(
    '../src/modules/writing/tools/spelling-lookup/elementarySpellingQuiz.js'
);

test('맞춤법 학습 기능은 등록 모듈과 성능 계약을 가진다', () => {
    assert.match(manifest, /id: 'spelling-learning'/);
    assert.match(manifest, /load: 'on-open'/);
    assert.match(manifest, /writes: 'rpc'/);
    assert.match(manifest, /realtime: 'none'/);
    assert.match(manifest, /maxInitialRows: 100/);
    assert.match(manifest, /settingsEntry:/);
    assert.doesNotMatch(manifest, /teacherEntry:|part: 'tool'/);
});

test('교사 등록 데이터는 기존 학생 수첩 기본 자료와 우리 반 자료를 함께 보여준다', () => {
    const builtInEntries = getElementarySpellingEntries();
    const referenceEntries = builtInEntries.filter((entry) => entry.contentType === 'reference');
    const practiceEntries = builtInEntries.filter((entry) => entry.contentType === 'practice');
    assert.equal(builtInEntries.length, 300);
    assert.equal(referenceEntries.length, 200);
    assert.equal(practiceEntries.length, 100);
    assert.equal(builtInEntries.length, ELEMENTARY_SPELLING_ENTRY_IDS.length);
    assert.equal(new Set(ELEMENTARY_SPELLING_ENTRY_IDS).size, 300);
    assert.equal(new Set(builtInEntries.map((entry) => entry.question)).size, 300);
    for (const entry of builtInEntries) {
        assert.ok(entry.category, `${entry.id}: 분류가 필요합니다.`);
        assert.ok(entry.explanation.length >= 10, `${entry.id}: 설명이 너무 짧습니다.`);
        assert.equal(entry.examples.length, entry.contentType === 'practice' ? 1 : 2, `${entry.id}: 바른 예문 수가 맞지 않습니다.`);
        assert.match(entry.source.label, /국립국어원/);
        assert.match(entry.source.url, /^https:\/\/(?:stdict\.)?korean\.go\.kr\//);
        assert.equal('sourceQuery' in entry, false);
        assert.equal('sourceType' in entry, false);
    }
    assert.match(teacherEntry, /getElementarySpellingEntries/);
    assert.match(teacherEntry, /기본 자료/);
    assert.match(teacherEntry, /우리 반 자료/);
    assert.match(teacherEntry, /type="search"/);
    assert.match(teacherEntry, /PAGE_SIZE = 20/);
    assert.match(teacherEntry, /entry\.category/);
    assert.match(teacherEntry, /spelling-learning-entry-summary/);
    assert.doesNotMatch(teacherEntry, /초안 저장|적용 중/);
});

test('300개 기본 자료는 틀린 표현과 분류·문장으로 바로 찾을 수 있다', () => {
    assert.equal(searchElementarySpelling('도데체')[0]?.id, 'dodaeche');
    assert.equal(searchElementarySpelling('설레였다')[0]?.id, 'seolletda');
    assert.equal(searchElementarySpelling('수영을 못해요')[0]?.id, 'mot-hada');
    assert.ok(searchElementarySpelling('외래어 표기').every((entry) => entry.category === '외래어 표기'));
    assert.ok(searchElementarySpelling('선생님 말씀대로 따라 했다').some((entry) => entry.id === 'practice-spelling-quiz-100'));
});

test('기본 자료 300개는 모두 글쓰기 밑줄 규칙을 가진다', () => {
    assert.equal(ELEMENTARY_SPELLING_DETECTION_RULE_COUNT, 300);
    assert.equal(ELEMENTARY_SPELLING_DETECTION_RULES.length, 300);
    assert.equal(new Set(ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS).size, 300);
    assert.deepEqual(new Set(ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS), new Set(ELEMENTARY_SPELLING_ENTRY_IDS));
    assert.ok(ELEMENTARY_SPELLING_DETECTION_RULES.every((rule) => rule.patterns.length > 0));
    for (const rule of ELEMENTARY_SPELLING_DETECTION_RULES) {
        assert.ok(findElementarySpellingIssues(rule.patterns[0].text, 300)
            .some((issue) => issue.entryId === rule.entryId), `${rule.entryId}: 대표 오류 문맥을 찾지 못합니다.`);
    }
    assert.equal(findElementarySpellingIssues('김치찌게를 먹었다.')[0]?.right, '찌개');
    assert.equal(findElementarySpellingIssues('카드로 결재했다.')[0]?.right, '결제');
    assert.ok(findElementarySpellingIssues('선생님 말씀데로 따라 했다.')
        .some((issue) => issue.entryId === 'practice-spelling-quiz-100'));
    assert.match(underlineTextarea, /loadElementarySpellingDetector/);
    assert.match(underlineInput, /loadElementarySpellingDetector/);
});

test('초등 맞춤법 문제은행은 순서가 있는 고유 문항 100개와 해설을 가진다', () => {
    assert.equal(ELEMENTARY_SPELLING_QUIZ_QUESTIONS.length, 100);
    assert.equal(new Set(ELEMENTARY_SPELLING_QUIZ_QUESTIONS.map((question) => question.id)).size, 100);
    assert.equal(new Set(ELEMENTARY_SPELLING_QUIZ_QUESTIONS.map((question) => question.question)).size, 100);
    for (const [index, question] of ELEMENTARY_SPELLING_QUIZ_QUESTIONS.entries()) {
        assert.equal(question.number, index + 1);
        assert.ok(question.choices.length >= 2, `${question.number}: 선택지가 부족합니다.`);
        assert.ok(question.choices.includes(question.answer), `${question.number}: 정답이 선택지에 없습니다.`);
        assert.ok(question.explanation.length >= 8, `${question.number}: 설명이 너무 짧습니다.`);
        assert.ok(question.solution.length >= 5, `${question.number}: 완성 문장이 너무 짧습니다.`);
        assert.ok(question.detectionPatterns.length >= 1, `${question.number}: 밑줄 문맥이 없습니다.`);
        assert.doesNotMatch(question.prompt, /\([^()]+\s\/\s[^()]+\)/);
        assert.doesNotMatch(question.solution, /\([^()]+\s\/\s[^()]+\)/);
        for (const detectionPattern of question.detectionPatterns) {
            assert.ok(findElementarySpellingIssues(detectionPattern.text, 300)
                .some((issue) => issue.entryId === `practice-${question.id}`), `${question.number}: 틀린 선택지를 찾지 못합니다.`);
        }
    }
    assert.match(ELEMENTARY_SPELLING_QUIZ_QUESTIONS[33].question, /높이가/);
    assert.match(ELEMENTARY_SPELLING_QUIZ_QUESTIONS[36].question, /서로 답을/);
    assert.deepEqual(ELEMENTARY_SPELLING_QUIZ_QUESTIONS[70].choices, ['든, 든', '던, 던']);
    assert.equal(ELEMENTARY_SPELLING_QUIZ_QUESTIONS[70].solution, '사과든 배든 하나 골라라.');
    assert.match(lookup, /✏️ 랜덤 5문제/);
    assert.match(lookup, /role="progressbar"/);
    assert.match(lookup, /새 문제 5개 풀기/);
    assert.match(lookup, /점수는 저장하지 않아요/);
});

test('퀴즈는 기본 자료 300개 전체에서 열 때마다 중복 없는 5문제를 뽑는다', () => {
    const pool = getElementarySpellingQuizPool();
    assert.equal(pool.length, 300);
    assert.equal(new Set(pool.map((question) => question.id)).size, 300);
    assert.equal(new Set(pool.map((question) => question.sourceEntryId)).size, 300);
    assert.ok(pool.every((question) => question.choices.length >= 2));
    assert.ok(pool.every((question) => question.choices.includes(question.answer)));

    const firstFive = createRandomElementarySpellingQuiz(5, () => 0);
    const anotherFive = createRandomElementarySpellingQuiz(5, () => 0.999999);
    assert.equal(firstFive.length, 5);
    assert.equal(new Set(firstFive.map((question) => question.id)).size, 5);
    assert.deepEqual(firstFive.map((question) => question.sessionNumber), [1, 2, 3, 4, 5]);
    assert.notDeepEqual(firstFive.map((question) => question.id), anotherFive.map((question) => question.id));
    assert.match(lookupManifest, /기본 자료 300개/);
});

test('학생 검색은 입력 중 직접 쓰지 않고 닫을 때 배치 RPC로 모은다', () => {
    assert.match(lookup, /flushSpellingSearches/);
    assert.doesNotMatch(lookup, /setInterval|postgres_changes/);
    assert.match(migration, /record_spelling_search_batch_v1/);
    assert.match(migration, /jsonb_array_length\(p_items\) > 20/);
    assert.match(migration, /ON CONFLICT\(class_id,event_date,entry_key\) DO UPDATE/);
});

test('맞춤법 데이터는 학급 직접 범위와 교사·학생 실제 연결을 검증한다', () => {
    assert.match(migration, /c\.id = p_class_id AND c\.teacher_id = auth\.uid\(\)/);
    assert.match(migration, /s\.auth_id=auth\.uid\(\)/);
    assert.match(migration, /idx_class_spelling_stats_class_date/);
    assert.match(migration, /REVOKE ALL ON public\.class_spelling_daily_stats/);
});

test('학생 원문은 저장하지 않고 미등록 짧은 표현만 제한적으로 남긴다', () => {
    assert.doesNotMatch(migration, /post_content|student_post_id|full_text/);
    assert.match(migration, /v_key LIKE 'unmatched:%'/);
    assert.match(migration, /left\(btrim\(COALESCE\(v_item->>'query',''\)\),80\)/);
});
