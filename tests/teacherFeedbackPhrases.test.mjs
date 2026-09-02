/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    DEFAULT_FEEDBACK_PHRASES,
    MAX_FEEDBACK_PHRASES,
    MAX_FEEDBACK_PHRASE_LENGTH,
    appendFeedbackMessage,
    buildFeedbackPhraseMessage,
    normalizeFeedbackPhrases,
    validateFeedbackPhrase
} from '../src/constants/feedbackPhrases.js';

const read = (path) => readFile(path, 'utf8');

test('문장 목록을 저장 전에 다듬는다', () => {
    assert.deepEqual(
        normalizeFeedbackPhrases(['  문단을 나누세요.  ', '', '문단을 나누세요.', null, 42]),
        ['문단을 나누세요.']
    );
    assert.deepEqual(normalizeFeedbackPhrases('배열이 아님'), []);

    const tooMany = Array.from({ length: MAX_FEEDBACK_PHRASES + 5 }, (_, index) => `문장 ${index}`);
    assert.equal(normalizeFeedbackPhrases(tooMany).length, MAX_FEEDBACK_PHRASES);
});

test('저장할 수 없는 문장은 이유를 말해 준다', () => {
    assert.equal(validateFeedbackPhrase('AI 맞춤법 검사 후 제출하세요.', []), '');
    assert.match(validateFeedbackPhrase('   ', []), /입력/);
    assert.match(validateFeedbackPhrase('가'.repeat(MAX_FEEDBACK_PHRASE_LENGTH + 1), []), /이내/);
    assert.match(validateFeedbackPhrase('같은 문장', ['같은 문장']), /이미/);

    const full = Array.from({ length: MAX_FEEDBACK_PHRASES }, (_, index) => `문장 ${index}`);
    assert.match(validateFeedbackPhrase('하나 더', full), /지워/);
});

test('하나면 그대로, 둘 이상이면 번호를 붙인다', () => {
    assert.equal(buildFeedbackPhraseMessage([]), '');
    assert.equal(buildFeedbackPhraseMessage(['AI 맞춤법 검사 후 제출하세요.']), 'AI 맞춤법 검사 후 제출하세요.');
    assert.equal(
        buildFeedbackPhraseMessage(['문단을 나누세요.', 'AI 맞춤법 검사 후 제출하세요.']),
        '1. 문단을 나누세요.\n2. AI 맞춤법 검사 후 제출하세요.'
    );
});

test('이미 적힌 피드백을 덮어쓰지 않고 아래에 붙인다', () => {
    assert.equal(appendFeedbackMessage('', '문단을 나누세요.'), '문단을 나누세요.');
    assert.equal(appendFeedbackMessage('AI 초안입니다.  \n', '문단을 나누세요.'), 'AI 초안입니다.\n\n문단을 나누세요.');
    assert.equal(appendFeedbackMessage('AI 초안입니다.', '   '), 'AI 초안입니다.');
});

test('기본 문장은 그대로 저장할 수 있는 형태다', () => {
    assert.ok(DEFAULT_FEEDBACK_PHRASES.length > 0);
    assert.deepEqual(normalizeFeedbackPhrases([...DEFAULT_FEEDBACK_PHRASES]), [...DEFAULT_FEEDBACK_PHRASES]);
});

test('화면 한도와 DB CHECK 제약이 같은 값을 쓴다', async () => {
    const migration = await read('supabase/migrations/20261227_teacher_feedback_phrases.sql');

    // 한도 원본은 src/constants/feedbackPhrases.js 다. 두 곳이 어긋나면 저장이 조용히 막힌다.
    assert.match(migration, new RegExp(`jsonb_array_length\\(feedback_phrases\\) <= ${MAX_FEEDBACK_PHRASES}`));
    assert.match(migration, /jsonb_typeof\(feedback_phrases\) = 'array'/);
    assert.match(migration, /@\? '\$\[\*\] \? \(@\.type\(\) != "string"\)'/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS feedback_phrases JSONB NOT NULL DEFAULT '\[\]'::JSONB/);
});

test('저장 문장 갈래가 낱개·일괄 두 곳에 모두 연결돼 있다', async () => {
    const [viewer, statusModal, manager, missionHook] = await Promise.all([
        read('src/components/teacher/PostDetailViewer.jsx'),
        read('src/components/teacher/SubmissionStatusModal.jsx'),
        read('src/components/teacher/MissionManager.jsx'),
        read('src/hooks/useMissionManager.js')
    ]);

    // 낱개: 글 상세 피드백 칸
    assert.match(viewer, /import FeedbackPhrasePicker from '\.\/FeedbackPhrasePicker'/);
    assert.match(viewer, /📌 자주 쓰는 말/);
    assert.match(viewer, /setTempFeedback\(appendFeedbackMessage\(tempFeedback, message\)\)/);

    // 일괄: 제출 현황 창
    assert.match(statusModal, /📌 문장으로 일괄 다시쓰기/);
    assert.match(statusModal, /handleBulkPhraseRewrite\(message\)/);

    // 두 곳이 같은 목록을 본다 — 훅은 한 번만 부른다
    assert.equal((manager.match(/useFeedbackPhrases\(\)/g) || []).length, 1);
    assert.match(manager, /phraseStore=\{phraseStore\}/);

    // 펼칠 때 읽는다 — 과제 화면을 열 때마다 조회가 붙으면 안 된다
    assert.match(viewer, /ensurePhrasesLoaded\?\.\(\)/);
    assert.match(statusModal, /ensurePhrasesLoaded\?\.\(\)/);

    // 일괄도 덮어쓰지 않는다
    assert.match(missionHook, /const handleBulkPhraseRewrite = async \(message\)/);
    assert.match(missionHook, /appendFeedbackMessage\(post\.ai_feedback, text\)/);
    // AI 갈래는 그대로 남아 있어야 한다(투트랙)
    assert.match(missionHook, /const handleBulkAIAction = async/);
});
