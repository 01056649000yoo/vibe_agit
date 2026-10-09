/**
 * 맞춤법 수첩(검색·5문제)이 쓰는 자료 묶음 — 기본 500개 + 교차 점검을 거친 자료(pending, 스위치가 켜졌을 때).
 * (2026-10-09 선생님 결정: 밑줄만이 아니라 수첩과 인형뽑기 퀴즈에도 넣는다. 인형뽑기는 내보낸 파일로 받는다 —
 * scripts/export-spelling-detection.mjs.) 수첩 도구는 열 때만 불러오므로 첫 화면 크기에는 들어가지 않는다.
 */
import {
    ELEMENTARY_SPELLING_DETECTION_RULES,
    createRandomSpellingQuiz,
    createSpellingQuizPool,
    getElementarySpellingEntries,
    searchSpellingEntries
} from './elementarySpellingEntries.js';
import { PENDING_SPELLING_ENABLED } from './pending/config.js';
import { PENDING_SPELLING_ENTRIES } from './pending/pendingSpellingEntries.js';
import { findPendingSpellingIssues, PENDING_SPELLING_DETECTION_RULES } from './pending/pendingSpellingDetector.js';

const BOOK_ENTRIES = Object.freeze(PENDING_SPELLING_ENABLED
    ? [...getElementarySpellingEntries(), ...PENDING_SPELLING_ENTRIES]
    : [...getElementarySpellingEntries()]);
const BOOK_QUIZ_POOL = createSpellingQuizPool(BOOK_ENTRIES);

const BOOK_RULES = Object.freeze(PENDING_SPELLING_ENABLED
    ? [...ELEMENTARY_SPELLING_DETECTION_RULES, ...PENDING_SPELLING_DETECTION_RULES]
    : [...ELEMENTARY_SPELLING_DETECTION_RULES]);

/** 자료 묶음의 원본 — 수첩·내보내기(인형뽑기·주간 검수·연구소가 읽는 공개 파일)·검사가 모두 이것을 본다. */
export const getSpellingBookEntries = () => BOOK_ENTRIES;
export const getSpellingBookDetectionRules = () => BOOK_RULES;
export const getSpellingBookQuizPool = () => BOOK_QUIZ_POOL;

export const searchSpellingBook = (query) => searchSpellingEntries(
    BOOK_ENTRIES,
    query,
    PENDING_SPELLING_ENABLED ? findPendingSpellingIssues(query).map((issue) => issue.entryId) : []
);

/** 공통·반별 자료(관리자 게시·매달 자동 추가·선생님 승인) 행을 수첩 퀴즈 항목 꼴로. 게시되면 저절로 출제된다. */
export const learningEntriesAsBookEntries = (rows = []) => rows
    .filter((row) => row?.wrong_expression && row?.correct_expression && row.wrong_expression !== row.correct_expression)
    .map((row) => ({
        id: `${row.scope || 'common'}-${row.id}`,
        question: `${row.correct_expression} / ${row.wrong_expression}`,
        answer: row.correct_expression,
        explanation: row.explanation || `‘${row.wrong_expression}’ 대신 ‘${row.correct_expression}’라고 써요.`,
        examples: Array.isArray(row.examples) && row.examples.length ? row.examples : [row.correct_expression]
    }));

/** 5문제 — 자료 묶음 + (주면) 공통·반별 자료. */
export const createRandomSpellingBookQuiz = (count = 5, random = Math.random, learningRows = []) => {
    const pool = learningRows.length
        ? [...BOOK_QUIZ_POOL, ...createSpellingQuizPool(learningEntriesAsBookEntries(learningRows))]
        : BOOK_QUIZ_POOL;
    return createRandomSpellingQuiz(pool, count, random);
};
