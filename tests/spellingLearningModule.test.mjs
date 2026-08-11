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
    ELEMENTARY_SPELLING_LABEL_COUNT,
    ELEMENTARY_SPELLING_TRIGGER_COUNT,
    createRandomElementarySpellingQuiz,
    findElementarySpellingIssues,
    getElementarySpellingEntries,
    getElementarySpellingQuizPool,
    searchElementarySpelling
} = await import(
    '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js'
);
const {
    ELEMENTARY_SPELLING_CATEGORY_COUNTS,
    SPELLING_CATEGORY_DEFINITIONS,
    SPELLING_DETECTION_MODES
} = await import('../src/modules/writing/tools/spelling-lookup/catalog/index.js');
const ALL_ELEMENTARY_SPELLING_ENTRIES = getElementarySpellingEntries();
const EXPANDED_ELEMENTARY_SPELLING_ENTRIES = ALL_ELEMENTARY_SPELLING_ENTRIES
    .filter((entry) => entry.origin === 'expansion');
const ELEMENTARY_SPELLING_QUIZ_QUESTIONS = ALL_ELEMENTARY_SPELLING_ENTRIES
    .filter((entry) => entry.origin === 'practice')
    .map((entry, index) => ({
        id: entry.id,
        number: index + 1,
        question: entry.question,
        choices: entry.quiz.choices,
        answer: entry.answer,
        explanation: entry.explanation,
        solution: entry.quiz.solution,
        prompt: entry.quiz.prompt,
        detectionPatterns: entry.detectionPatterns
    }));

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
    assert.equal(builtInEntries.length, 500);
    assert.equal(referenceEntries.length, 400);
    assert.equal(practiceEntries.length, 100);
    assert.equal(EXPANDED_ELEMENTARY_SPELLING_ENTRIES.length, 200);
    assert.equal(builtInEntries.length, ELEMENTARY_SPELLING_ENTRY_IDS.length);
    assert.equal(new Set(ELEMENTARY_SPELLING_ENTRY_IDS).size, 500);
    assert.equal(new Set(builtInEntries.map((entry) => entry.question)).size, 500);
    for (const entry of builtInEntries) {
        assert.ok(entry.category, `${entry.id}: 분류가 필요합니다.`);
        assert.ok(entry.subcategory, `${entry.id}: 세부 분류가 필요합니다.`);
        assert.match(entry.detectionMode, /^(?:exact|phrase|context)$/);
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
    assert.match(teacherEntry, /entry\.subcategory/);
    assert.match(teacherEntry, /SPELLING_CATEGORY_DEFINITIONS/);
    assert.match(teacherEntry, /entry\.learningLabel/);
    assert.match(teacherEntry, /라벨 ·/);
    assert.match(teacherEntry, /spelling-learning-entry-summary/);
    assert.doesNotMatch(teacherEntry, /초안 저장|적용 중/);
});

test('500개 기본 자료는 틀린 표현과 큰·세부 분류로 바로 찾을 수 있다', () => {
    assert.equal(searchElementarySpelling('도데체')[0]?.id, 'dodaeche');
    assert.equal(searchElementarySpelling('설레였다')[0]?.id, 'seolletda');
    assert.equal(searchElementarySpelling('수영을 못해요')[0]?.id, 'mot-hada');
    assert.equal(searchElementarySpelling('괜찬다')[0]?.id, 'expansion-gwaenchanhda');
    assert.equal(searchElementarySpelling('이번주')[0]?.id, 'expansion-ibeon-ju');
    assert.ok(searchElementarySpelling('외래어').every((entry) => entry.categoryId === 'loanword'));
    assert.ok(searchElementarySpelling('조사').every((entry) => entry.subcategoryId === 'particle'));
    assert.ok(searchElementarySpelling('선생님 말씀대로 따라 했다').some((entry) => entry.id === 'practice-spelling-quiz-100'));
});

test('500개는 성능과 정확도를 위한 여섯 분류·세 검출 방식 계약을 지킨다', () => {
    assert.deepEqual(ELEMENTARY_SPELLING_CATEGORY_COUNTS, {
        conjugation: 55,
        meaning: 64,
        word: 156,
        grammar: 130,
        compound: 49,
        loanword: 46
    });
    assert.deepEqual(SPELLING_DETECTION_MODES.map((mode) => mode.id), ['exact', 'phrase', 'context']);
    assert.deepEqual(SPELLING_CATEGORY_DEFINITIONS.map((category) => category.id), [
        'grammar', 'conjugation', 'meaning', 'word', 'compound', 'loanword'
    ]);
    assert.deepEqual(ALL_ELEMENTARY_SPELLING_ENTRIES.map((entry) => entry.sortOrder),
        Array.from({ length: 500 }, (_, index) => index + 1));

    for (const entry of ALL_ELEMENTARY_SPELLING_ENTRIES) {
        const category = SPELLING_CATEGORY_DEFINITIONS.find((item) => item.id === entry.categoryId);
        assert.ok(category, `${entry.id}: 알 수 없는 큰 분류입니다.`);
        assert.ok(category.subcategories.some((item) => item.id === entry.subcategoryId),
            `${entry.id}: 큰 분류와 세부 분류가 맞지 않습니다.`);

        const hasContext = entry.detectionPatterns.some((pattern) => {
            const target = pattern.target || pattern.text;
            return pattern.text !== target || (pattern.targetOffset || 0) > 0;
        });
        const expectedMode = hasContext
            ? 'context'
            : entry.detectionPatterns.some((pattern) => pattern.text.includes(' ')) ? 'phrase' : 'exact';
        assert.equal(entry.detectionMode, expectedMode, `${entry.id}: 검출 방식이 패턴과 맞지 않습니다.`);
    }
});

test('기본 자료 500개는 모두 글쓰기 밑줄 규칙을 가진다', () => {
    assert.equal(ELEMENTARY_SPELLING_DETECTION_RULE_COUNT, 500);
    assert.equal(ELEMENTARY_SPELLING_DETECTION_RULES.length, 500);
    assert.equal(new Set(ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS).size, 500);
    assert.deepEqual(new Set(ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS), new Set(ELEMENTARY_SPELLING_ENTRY_IDS));
    assert.ok(ELEMENTARY_SPELLING_DETECTION_RULES.every((rule) => rule.patterns.length > 0));
    assert.ok(ELEMENTARY_SPELLING_DETECTION_RULES.every((rule) => rule.label && rule.category));
    assert.ok(ELEMENTARY_SPELLING_LABEL_COUNT >= 400);
    assert.ok(ELEMENTARY_SPELLING_TRIGGER_COUNT >= 400);
    for (const rule of ELEMENTARY_SPELLING_DETECTION_RULES) {
        assert.ok(findElementarySpellingIssues(rule.patterns[0].text, 500)
            .some((issue) => issue.entryId === rule.entryId), `${rule.entryId}: 대표 오류 문맥을 찾지 못합니다.`);
    }
    assert.equal(findElementarySpellingIssues('김치찌게를 먹었다.')[0]?.right, '찌개');
    assert.equal(findElementarySpellingIssues('카드로 결재했다.')[0]?.right, '결제');
    assert.equal(findElementarySpellingIssues('카드로 결재했다.')[0]?.label, '결재 / 결제');
    assert.equal(findElementarySpellingIssues('숙제는 반듯이 해야 해요.')[0]?.right, '반드시');
    assert.equal(findElementarySpellingIssues('내일 반듯이 참석하세요.')[0]?.right, '반드시');
    assert.equal(findElementarySpellingIssues('책을 반듯이 놓았어요.').length, 0);
    assert.equal(findElementarySpellingIssues('책을 반드시 놓아야 해요.').length, 0);
    assert.ok(findElementarySpellingIssues('선생님 말씀데로 따라 했다.')
        .some((issue) => issue.entryId === 'practice-spelling-quiz-100'));
    assert.match(underlineTextarea, /loadElementarySpellingDetector/);
    assert.match(underlineInput, /loadElementarySpellingDetector/);
});

test('후보 색인 검사는 500개 순차 검사와 같은 결과를 낸다', () => {
    const findWithLegacyLoop = (value, limit = 50) => {
        const text = String(value || '').normalize('NFC');
        const issues = [];
        for (const rule of ELEMENTARY_SPELLING_DETECTION_RULES) {
            for (const item of rule.patterns) {
                const target = item.target || item.text;
                const targetOffset = Number.isInteger(item.targetOffset)
                    ? item.targetOffset
                    : Math.max(0, item.text.indexOf(target));
                let matchStart = text.indexOf(item.text);
                while (matchStart >= 0 && issues.length < limit) {
                    const start = matchStart + targetOffset;
                    issues.push({
                        id: `${rule.id}-${start}`,
                        ruleId: rule.id,
                        entryId: rule.entryId,
                        label: rule.label,
                        categoryId: rule.categoryId,
                        category: rule.category,
                        subcategoryId: rule.subcategoryId,
                        subcategory: rule.subcategory,
                        detectionMode: rule.detectionMode,
                        start,
                        end: start + target.length,
                        text: text.slice(start, start + target.length),
                        wrong: target,
                        right: item.right,
                        lookup: item.lookup || item.right
                    });
                    matchStart = text.indexOf(item.text, matchStart + item.text.length);
                }
                if (issues.length >= limit) break;
            }
            if (issues.length >= limit) break;
        }
        return issues.sort((left, right) => left.start - right.start);
    };

    const representativeTexts = ELEMENTARY_SPELLING_DETECTION_RULES.flatMap((rule) => (
        rule.patterns.map((item) => `😀 ${item.text} 다시 ${item.text}`)
    ));
    const combinedText = representativeTexts.join(' / ');
    for (const text of [...representativeTexts, combinedText]) {
        assert.deepEqual(findElementarySpellingIssues(text), findWithLegacyLoop(text));
    }
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
            assert.ok(findElementarySpellingIssues(detectionPattern.text, 500)
                .some((issue) => issue.entryId === question.id), `${question.number}: 틀린 선택지를 찾지 못합니다.`);
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

test('퀴즈는 기본 자료 500개 전체에서 열 때마다 중복 없는 5문제를 뽑는다', () => {
    const pool = getElementarySpellingQuizPool();
    assert.equal(pool.length, 500);
    assert.equal(new Set(pool.map((question) => question.id)).size, 500);
    assert.equal(new Set(pool.map((question) => question.sourceEntryId)).size, 500);
    assert.ok(pool.every((question) => question.choices.length >= 2));
    assert.ok(pool.every((question) => question.choices.includes(question.answer)));

    const firstFive = createRandomElementarySpellingQuiz(5, () => 0);
    const anotherFive = createRandomElementarySpellingQuiz(5, () => 0.999999);
    assert.equal(firstFive.length, 5);
    assert.equal(new Set(firstFive.map((question) => question.id)).size, 5);
    assert.deepEqual(firstFive.map((question) => question.sessionNumber), [1, 2, 3, 4, 5]);
    assert.notDeepEqual(firstFive.map((question) => question.id), anotherFive.map((question) => question.id));
    assert.match(lookupManifest, /기본 자료 500개/);
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
