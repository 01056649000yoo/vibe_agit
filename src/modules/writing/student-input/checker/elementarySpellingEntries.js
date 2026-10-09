/**
 * 초등 맞춤법 500개를 검색·퀴즈·글쓰기 밑줄 검사에 공통으로 제공한다.
 *
 * 사람이 관리할 때는 catalog/ 아래의 여섯 분류 파일로 나뉘지만, 글쓰기 검사에서는
 * 모든 패턴을 하나의 후보 색인으로 합친 뒤 본문을 한 번만 순회한다.
 */
import { findDetectedEntryIds } from './spellingDetectionRules.js';
import { ELEMENTARY_SPELLING_CATALOG } from './catalog/index.js';
import { createCatalogDetector } from './catalogDetector.js';

const DICTIONARY_SEARCH_URL = 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=';

const POPULAR_SPELLING_ENTRY_IDS = [
    'dwae-doe',
    'an-anh',
    'wen-waen',
    'eotteoke-eotteokhae',
    'hal-su-itda',
    'myeochil'
];

const ELEMENTARY_SPELLING_ENTRIES = ELEMENTARY_SPELLING_CATALOG;

// 분류별 반복 검사를 만들지 않는다. 500개 전체가 후보 색인 하나를 공유한다(catalogDetector).
const ELEMENTARY_DETECTOR = createCatalogDetector(ELEMENTARY_SPELLING_ENTRIES);
export const ELEMENTARY_SPELLING_DETECTION_RULES = ELEMENTARY_DETECTOR.rules;
const ELEMENTARY_INDEXED_PATTERNS = ELEMENTARY_DETECTOR.indexedPatterns;

export const ELEMENTARY_SPELLING_DETECTION_RULE_COUNT = ELEMENTARY_SPELLING_DETECTION_RULES.length;
export const ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS = Object.freeze(
    ELEMENTARY_SPELLING_DETECTION_RULES.map((rule) => rule.entryId)
);
export const ELEMENTARY_SPELLING_LABEL_COUNT = new Set(
    ELEMENTARY_SPELLING_DETECTION_RULES.map((rule) => rule.label)
).size;
export const ELEMENTARY_SPELLING_TRIGGER_COUNT = new Set(
    ELEMENTARY_INDEXED_PATTERNS.map((indexedPattern) => indexedPattern.target)
).size;

/** 500개 기본 자료에서 본문 후보를 한 번 찾은 뒤 해당 규칙의 문맥만 확인한다. */
export const findElementarySpellingIssues = (value, limit = 50) => ELEMENTARY_DETECTOR.find(value, limit);

const splitEntryChoices = (entry) => entry.question.split('/').map((choice) => choice.trim());

/**
 * 수첩 5문제 후보를 만든다(기본 자료·검토 거친 자료가 같은 방식). 문맥 항목(`문이 닫혔다 / 문이 다쳤다` → 정답 `닫혔`)은
 * 정답을 품은 선택지 하나를 정답으로 삼는다(2026-10-09 — 그대로 두면 정답이 선택지에 없었다).
 */
export const createSpellingQuizPool = (entries) => Object.freeze(
    entries.map((entry, index) => {
        if (entry.quiz) {
            return Object.freeze({
                id: `pool-${entry.id}`,
                number: index + 1,
                sourceEntryId: entry.id,
                question: entry.question,
                prompt: entry.quiz.prompt,
                choices: entry.quiz.choices,
                answer: entry.answer,
                explanation: entry.explanation,
                solution: entry.quiz.solution
            });
        }

        const choices = splitEntryChoices(entry);
        const containing = choices.filter((choice) => choice !== entry.answer && choice.includes(entry.answer));
        const answer = choices.includes(entry.answer) ? entry.answer : containing.length === 1 ? containing[0] : entry.answer;
        const hasSingleCorrectChoice = choices.includes(answer);
        return Object.freeze({
            id: `pool-${entry.id}`,
            number: index + 1,
            sourceEntryId: entry.id,
            question: entry.question,
            prompt: hasSingleCorrectChoice
                ? `바른 표현을 골라 보세요. ${entry.question}`
                : `‘${entry.question}’는 어떻게 써야 할까요?`,
            choices: Object.freeze(hasSingleCorrectChoice
                ? choices
                : [entry.answer, '둘 중 하나만 언제나 맞아요.']),
            answer,
            explanation: entry.explanation,
            solution: entry.examples[0]
        });
    })
);

const ELEMENTARY_SPELLING_QUIZ_POOL = createSpellingQuizPool(ELEMENTARY_SPELLING_ENTRIES);

export const getElementarySpellingQuizPool = () => ELEMENTARY_SPELLING_QUIZ_POOL;

const takeRandomItems = (items, count, random) => {
    const remaining = [...items];
    const selected = [];
    while (selected.length < count) {
        const randomIndex = Math.floor(random() * remaining.length);
        const [item] = remaining.splice(randomIndex, 1);
        selected.push(item);
    }
    return selected;
};

/** 후보 묶음에서 겹치지 않는 문제만 뽑는다. */
export const createRandomSpellingQuiz = (pool, count = 5, random = Math.random) => {
    const safeCount = Math.min(Math.max(0, Math.floor(count)), pool.length);
    const selected = takeRandomItems(pool, safeCount, random);
    return selected.map((question, index) => ({
        ...question,
        choices: takeRandomItems(question.choices, question.choices.length, random),
        sessionNumber: index + 1
    }));
};

/** 수첩을 닫거나 다시 열 때 기본 500개 중 겹치지 않는 문제만 뽑는다. */
export const createRandomElementarySpellingQuiz = (count = 5, random = Math.random) => (
    createRandomSpellingQuiz(ELEMENTARY_SPELLING_QUIZ_POOL, count, random)
);

export const ELEMENTARY_SPELLING_ENTRY_IDS = Object.freeze(
    ELEMENTARY_SPELLING_ENTRIES.map((entry) => entry.id)
);

export const getElementarySpellingEntries = () => ELEMENTARY_SPELLING_ENTRIES;

const normalize = (value) => String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s/·,?!."'’“”()_-]/g, '');

/** 자료 목록에서 찾는다. `extraDetectedIds` 는 다른 찾기 장치가 문장에서 찾은 항목(검토 거친 자료 등). */
export const searchSpellingEntries = (entries, query, extraDetectedIds = []) => {
    const normalizedQuery = normalize(String(query || '').trim());
    if (!normalizedQuery) return [];

    const detectedEntryIds = new Set([
        ...findDetectedEntryIds(query),
        ...findElementarySpellingIssues(query).map((issue) => issue.entryId),
        ...extraDetectedIds
    ]);

    return entries
        .map((entry) => {
            const candidates = [
                entry.question,
                entry.answer,
                entry.category,
                entry.subcategory,
                entry.detectionModeLabel,
                entry.learningLabel,
                ...entry.searchable,
                ...entry.examples
            ];
            const normalizedCandidates = candidates.map(normalize);
            const exact = normalizedCandidates.some((candidate) => candidate === normalizedQuery);
            const startsWith = normalizedCandidates.some((candidate) => candidate.startsWith(normalizedQuery));
            const includes = normalizedCandidates.some((candidate) => (
                (normalizedQuery.length >= 2 && candidate.includes(normalizedQuery))
                || (candidate.length >= 2 && normalizedQuery.includes(candidate))
            ));
            const explanationMatch = normalize(entry.explanation).includes(normalizedQuery);

            const detectedInSentence = detectedEntryIds.has(entry.id);
            const score = exact
                ? 100
                : detectedInSentence
                    ? 90
                    : startsWith
                        ? 75
                        : includes
                            ? 55
                            : explanationMatch ? 25 : 0;
            return { entry, score };
        })
        .filter(({ score }) => score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 6)
        .map(({ entry }) => entry);
};

export const searchElementarySpelling = (query) => searchSpellingEntries(ELEMENTARY_SPELLING_ENTRIES, query);

export const getPopularSpellingEntries = () => POPULAR_SPELLING_ENTRY_IDS
    .map((id) => ELEMENTARY_SPELLING_ENTRIES.find((entry) => entry.id === id))
    .filter(Boolean);

export const createOfficialDictionarySearchUrl = (query) => (
    `${DICTIONARY_SEARCH_URL}${encodeURIComponent(query.trim())}`
);
