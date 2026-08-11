/**
 * 초등 맞춤법 500개를 검색·퀴즈·글쓰기 밑줄 검사에 공통으로 제공한다.
 *
 * 사람이 관리할 때는 catalog/ 아래의 여섯 분류 파일로 나뉘지만, 글쓰기 검사에서는
 * 모든 패턴을 하나의 후보 색인으로 합친 뒤 본문을 한 번만 순회한다.
 */
import { findDetectedEntryIds } from './spellingDetectionRules.js';
import { ELEMENTARY_SPELLING_CATALOG } from './catalog/index.js';
import {
    collectSpellingCandidates,
    createSpellingCandidateIndex
} from '../../spelling-learning/candidateIndex.js';

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

export const ELEMENTARY_SPELLING_DETECTION_RULES = Object.freeze(
    ELEMENTARY_SPELLING_ENTRIES.map((entry) => Object.freeze({
        id: `elementary-${entry.id}`,
        entryId: entry.id,
        label: entry.learningLabel,
        categoryId: entry.categoryId,
        category: entry.category,
        subcategoryId: entry.subcategoryId,
        subcategory: entry.subcategory,
        detectionMode: entry.detectionMode,
        patterns: entry.detectionPatterns
    }))
);

const ELEMENTARY_INDEXED_PATTERNS = Object.freeze(
    ELEMENTARY_SPELLING_DETECTION_RULES.flatMap((rule) => rule.patterns.map((item) => {
        const target = item.target || item.text;
        return Object.freeze({
            rule,
            item,
            target,
            targetOffset: Number.isInteger(item.targetOffset)
                ? item.targetOffset
                : Math.max(0, item.text.indexOf(target))
        });
    }))
);

// 분류별 반복 검사를 만들지 않는다. 500개 전체가 이 후보 색인 하나를 공유한다.
const ELEMENTARY_SPELLING_CANDIDATE_INDEX = createSpellingCandidateIndex(
    ELEMENTARY_INDEXED_PATTERNS,
    (indexedPattern) => indexedPattern.target
);

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
export const findElementarySpellingIssues = (value, limit = 50) => {
    const text = String(value || '').normalize('NFC');
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 50;
    if (!text || safeLimit === 0) return [];

    const issues = [];
    const candidates = collectSpellingCandidates(text, ELEMENTARY_SPELLING_CANDIDATE_INDEX);
    for (const { item: indexedPattern, starts } of candidates) {
        const { rule, item, target, targetOffset } = indexedPattern;
        let nextAllowedMatchStart = 0;
        for (const targetStart of starts) {
            const matchStart = targetStart - targetOffset;
            if (
                matchStart < nextAllowedMatchStart
                || !text.startsWith(item.text, matchStart)
            ) continue;

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
            nextAllowedMatchStart = matchStart + item.text.length;
            if (issues.length >= safeLimit) break;
        }
        if (issues.length >= safeLimit) break;
    }

    return issues.sort((left, right) => left.start - right.start);
};

const splitEntryChoices = (entry) => entry.question.split('/').map((choice) => choice.trim());

const ELEMENTARY_SPELLING_QUIZ_POOL = Object.freeze(
    ELEMENTARY_SPELLING_ENTRIES.map((entry, index) => {
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
        const hasSingleCorrectChoice = choices.includes(entry.answer);
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
            answer: entry.answer,
            explanation: entry.explanation,
            solution: entry.examples[0]
        });
    })
);

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

/** 수첩을 닫거나 다시 열 때 전체 500개 중 겹치지 않는 문제만 뽑는다. */
export const createRandomElementarySpellingQuiz = (count = 5, random = Math.random) => {
    const safeCount = Math.min(Math.max(0, Math.floor(count)), ELEMENTARY_SPELLING_QUIZ_POOL.length);
    const selected = takeRandomItems(ELEMENTARY_SPELLING_QUIZ_POOL, safeCount, random);
    return selected.map((question, index) => ({
        ...question,
        choices: takeRandomItems(question.choices, question.choices.length, random),
        sessionNumber: index + 1
    }));
};

export const ELEMENTARY_SPELLING_ENTRY_IDS = Object.freeze(
    ELEMENTARY_SPELLING_ENTRIES.map((entry) => entry.id)
);

export const getElementarySpellingEntries = () => ELEMENTARY_SPELLING_ENTRIES;

const normalize = (value) => String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s/·,?!."'’“”()_-]/g, '');

export const searchElementarySpelling = (query) => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return [];

    const detectedEntryIds = new Set([
        ...findDetectedEntryIds(query),
        ...findElementarySpellingIssues(query).map((issue) => issue.entryId)
    ]);

    return ELEMENTARY_SPELLING_ENTRIES
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

export const getPopularSpellingEntries = () => POPULAR_SPELLING_ENTRY_IDS
    .map((id) => ELEMENTARY_SPELLING_ENTRIES.find((entry) => entry.id === id))
    .filter(Boolean);

export const createOfficialDictionarySearchUrl = (query) => (
    `${DICTIONARY_SEARCH_URL}${encodeURIComponent(query.trim())}`
);
