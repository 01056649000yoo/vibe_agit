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
    moveFeedbackPhrase,
    normalizeFeedbackPhrases,
    reorderFeedbackPhrases,
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

test('자주 쓰는 문장을 위로 올리고 아래로 내린다', () => {
    const list = ['첫째', '둘째', '셋째'];

    assert.deepEqual(moveFeedbackPhrase(list, 2, -1), ['첫째', '셋째', '둘째']);
    assert.deepEqual(moveFeedbackPhrase(list, 0, 1), ['둘째', '첫째', '셋째']);

    // 끝에서 더 갈 곳이 없으면 그대로 둔다
    assert.deepEqual(moveFeedbackPhrase(list, 0, -1), list);
    assert.deepEqual(moveFeedbackPhrase(list, 2, 1), list);
    assert.deepEqual(moveFeedbackPhrase(list, 9, -1), list);

    // 원래 목록은 건드리지 않는다
    assert.deepEqual(list, ['첫째', '둘째', '셋째']);
});

test('문장을 끌어 아무 자리로나 옮긴다', () => {
    const list = ['첫째', '둘째', '셋째', '넷째'];

    // 맨 아래를 맨 위로 (한 칸씩이 아니라 한 번에)
    assert.deepEqual(reorderFeedbackPhrases(list, 3, 0), ['넷째', '첫째', '둘째', '셋째']);
    // 맨 위를 가운데로
    assert.deepEqual(reorderFeedbackPhrases(list, 0, 2), ['둘째', '셋째', '첫째', '넷째']);

    // 제자리·범위 밖은 그대로 둔다
    assert.deepEqual(reorderFeedbackPhrases(list, 1, 1), list);
    assert.deepEqual(reorderFeedbackPhrases(list, 0, 9), list);
    assert.deepEqual(reorderFeedbackPhrases(list, -1, 0), list);

    // 원래 목록은 건드리지 않는다
    assert.deepEqual(list, ['첫째', '둘째', '셋째', '넷째']);
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
    assert.ok(
        migration.includes(`jsonb_array_length(feedback_phrases) <= ${MAX_FEEDBACK_PHRASES}`),
        `DB CHECK 한도가 화면 한도(${MAX_FEEDBACK_PHRASES})와 다릅니다.`
    );
    assert.match(migration, /jsonb_typeof\(feedback_phrases\) = 'array'/);
    assert.match(migration, /@\? '\$\[\*\] \? \(@\.type\(\) != "string"\)'/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS feedback_phrases JSONB NOT NULL DEFAULT '\[\]'::JSONB/);
});

test('개발 실험실에서 두 폭을 DB 없이 미리 본다', async () => {
    const [registry, preview] = await Promise.all([
        read('src/dev/devLabRegistry.js'),
        read('src/dev/FeedbackPhrasePreview.jsx')
    ]);

    assert.match(registry, /id: 'feedback-phrases'/);
    assert.match(registry, /lazy\(\(\) => import\('\.\/FeedbackPhrasePreview\.jsx'\)\)/);

    // 좁은 사이드바(380px)와 넓은 폭을 한 화면에서 나란히 본다 — 좁은 쪽에서 문장이 끊기는 문제를 겪었다
    assert.match(preview, /width: '380px'/);
    assert.match(preview, /FeedbackPhrasePicker/);

    // 실험실은 운영 데이터 클라이언트를 부르지 않는다(src/dev/README.md 원칙).
    // 글로 적힌 다짐이 아니라 **실제 import·호출**만 본다.
    assert.ok(!/from '[^']*supabase/i.test(preview), '개발 미리보기가 운영 데이터 클라이언트를 불러오면 안 됩니다.');
    assert.ok(!/supabase\s*\./.test(preview), '개발 미리보기가 운영 데이터 클라이언트를 부르면 안 됩니다.');
    assert.ok(!/useFeedbackPhrases/.test(preview), '개발 미리보기는 저장 훅 대신 메모리 fixture 를 씁니다.');
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

    // 보낼 사람이 없으면 두 갈래 버튼이 **같이** 잠긴다(한쪽만 늘 눌리면 안 된다)
    assert.match(statusModal, /disabled=\{isGenerating \|\| loadingPosts \|\| !canBulkAiFeedback\}/);
    assert.match(statusModal, /disabled=\{isGenerating \|\| loadingPosts \|\| !canBulkPhraseRewrite\}/);

    // 순서 바꾸기가 화면과 보관함 양쪽에 연결돼 있다
    const phraseHook = await read('src/hooks/useFeedbackPhrases.js');
    const picker = await read('src/components/teacher/FeedbackPhrasePicker.jsx');
    assert.match(phraseHook, /const reorderPhrases = useCallback/);
    assert.match(picker, /handleMove\(index, -1\)/);
    assert.match(picker, /handleMove\(index, 1\)/);

    // 줄을 통째로 끌어 옮기고, 순번이 문장 앞에 보인다
    assert.match(picker, /draggable=\{editMode && !isEditing\}/);
    assert.match(picker, /handleDrop\(index\)/);
    assert.match(picker, /\{index \+ 1\}/);

    // 일괄도 덮어쓰지 않는다
    assert.match(missionHook, /const handleBulkPhraseRewrite = async \(message\)/);
    assert.match(missionHook, /appendFeedbackMessage\(post\.ai_feedback, text\)/);
    // AI 갈래는 그대로 남아 있어야 한다(투트랙)
    assert.match(missionHook, /const handleBulkAIAction = async/);
});
