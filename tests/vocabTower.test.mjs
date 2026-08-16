import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    buildRoomQuiz,
    getRoomType,
    isInputQuestion,
    mapV2Question,
    replaceWordWithBlank
} from '../src/modules/game/vocab-tower/vocabTowerEngine.js';

const vocabulary = [
    { word: '감각', category: '몸', level: 1, definition: '자극을 느끼는 능력', example: '감각을 이용해 냄새를 맡았다.' },
    { word: '관찰', category: '공부', level: 1, definition: '자세히 살펴봄', example: '식물을 관찰하고 기록했다.' },
    { word: '공경', category: '마음', level: 2, definition: '어른을 높이는 마음', example: '할머니를 공경하는 마음을 가졌다.' },
    { word: '추론', category: '공부', level: 3, definition: '근거로 답을 생각함', example: '단서를 보고 범인을 추론했다.' },
    { word: '협동', category: '마음', level: 2, definition: '힘을 합쳐 일함', example: '친구와 협동하여 문제를 풀었다.' }
];

const [v2DeckMap, vocabularyGame, vocabularyStyles, studentDashboard, studentEntry, teacherManager, teacherManagerStyles, v2PracticeMigration, v2RewardMigration, v2ItemLearningMigration, v2DefaultMigration, v2DirectInputMigration] = await Promise.all([
    readFile('src/modules/game/vocab-tower/V2DeckMap.jsx', 'utf8'),
    readFile('src/modules/game/vocab-tower/VocabularyTowerGame.jsx', 'utf8'),
    readFile('src/modules/game/vocab-tower/vocabularyTowerGame.css', 'utf8'),
    readFile('src/components/student/StudentDashboard.jsx', 'utf8'),
    readFile('src/modules/game/vocab-tower/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/game/vocab-tower/TeacherManager.jsx', 'utf8'),
    readFile('src/modules/game/vocab-tower/teacherManager.css', 'utf8'),
    readFile('supabase/migrations/20261107_vocab_tower_v2_deck_practice.sql', 'utf8'),
    readFile('supabase/migrations/20261108_vocab_tower_v2_perfect_practice_reward.sql', 'utf8'),
    readFile('supabase/migrations/20261109_vocab_tower_v2_item_learning.sql', 'utf8'),
    readFile('supabase/migrations/20261110_vocab_tower_v2_default_content.sql', 'utf8'),
    readFile('supabase/migrations/20261111_vocab_tower_v2_direct_input.sql', 'utf8')
]);

test('층의 세 번째 방은 보통 구별의 방이고 5·10층에서는 복습 보스가 된다', () => {
    assert.equal(getRoomType(2, 0), 'meaning');
    assert.equal(getRoomType(2, 1), 'sentence');
    assert.equal(getRoomType(2, 2), 'distinction');
    assert.equal(getRoomType(5, 2), 'boss');
    assert.equal(getRoomType(10, 2), 'boss');
});

test('문장의 정답 낱말은 빈칸으로 가려져 답을 미리 보여주지 않는다', () => {
    assert.equal(replaceWordWithBlank('친구와 협동하여 문제를 풀었다.', '협동'), '친구와 ＿＿＿＿하여 문제를 풀었다.');
});

test('복습 보스는 앞에서 틀린 낱말을 우선 다시 출제한다', () => {
    const quiz = buildRoomQuiz({
        vocabulary,
        floor: 5,
        roomIndex: 2,
        reviewWords: ['추론'],
        random: () => 0
    });
    assert.equal(quiz.roomType, 'boss');
    assert.equal(quiz.correctAnswer, '추론');
    assert.equal(quiz.isReview, true);
    assert.equal(quiz.options.includes('추론'), true);
});

test('선택 지우개 능력은 보기를 4개에서 3개로 줄인다', () => {
    const regular = buildRoomQuiz({ vocabulary, floor: 1, roomIndex: 0, random: () => 0 });
    const reduced = buildRoomQuiz({ vocabulary, floor: 1, roomIndex: 0, reduceOptions: true, random: () => 0 });
    assert.equal(regular.options.length, 4);
    assert.equal(reduced.options.length, 3);
});

test('V2 서버 문항은 정답 없이 기존 게임 카드 형태로 변환된다', () => {
    const quiz = mapV2Question({
        question_key: '44c45aa4-b659-4bfc-9035-59640613f11f',
        room_type: 'meaning',
        question_type: 'meaningChoice',
        prompt: '‘관찰’의 뜻은?',
        options: ['자세히 살펴봄', '힘을 합침'],
        word: { word: '관찰', definition: '자세히 살펴봄', example: '식물을 관찰했다.', level: 1, category: '공부' },
        is_review: false
    });
    assert.equal(quiz.room.name, '뜻의 방');
    assert.equal(quiz.correctAnswer, null);
    assert.deepEqual(quiz.options, ['자세히 살펴봄', '힘을 합침']);
    assert.equal(quiz.practiceFocus, 'new');
});

test('V2 학생 화면은 10개 덱 지도에서 12문항 개인 연습을 시작한다', () => {
    assert.match(v2DeckMap, /어휘의 탑 지도/);
    assert.match(v2DeckMap, /explorationDecks\.map/);
    assert.match(v2DeckMap, /한 번의 연습에서 12문항을 모두 맞히면/);
    assert.match(vocabularyGame, /get_my_vocab_tower_v2_overview_v1/);
    assert.match(vocabularyGame, /start_my_vocab_tower_v2_practice_v1/);
    assert.match(vocabularyGame, /finish_my_vocab_tower_v2_practice_v1/);
});

test('어휘의 탑 전체 화면은 모바일 가시 높이 안에서 세로 스크롤할 수 있다', () => {
    assert.match(vocabularyStyles, /\.vocab-journey\s*\{[\s\S]*?height:\s*100dvh;/);
    assert.match(vocabularyStyles, /\.vocab-journey\s*\{[\s\S]*?overflow-y:\s*auto;/);
    assert.match(vocabularyStyles, /\.vocab-journey\s*\{[\s\S]*?-webkit-overflow-scrolling:\s*touch;/);
    assert.match(studentDashboard, /height:\s*'100dvh'/);
    assert.match(studentDashboard, /overflowY:\s*'auto'/);
});

test('V2 개인 연습은 덱별 결과를 저장하고 시작 자체에는 포인트를 주지 않는다', () => {
    assert.match(v2PracticeMigration, /CREATE TABLE IF NOT EXISTS public\.vocab_tower_v2_deck_progress/);
    assert.match(v2PracticeMigration, /target_question_count[\s\S]*DEFAULT 30/);
    assert.match(v2PracticeMigration, /'practice_question_count', 12/);
    assert.match(v2PracticeMigration, /reward_cap, content_version, v2_deck_number, target_question_count/);
    assert.match(v2PracticeMigration, /0, 'v2', p_deck_number, 12/);
    assert.match(v2PracticeMigration, /'reward_points', 0/);
});

test('V2 개인 연습은 덱별 최초 12\/12에 교사 설정 포인트를 한 번만 지급한다', () => {
    assert.match(v2RewardMigration, /vocab_tower_v2_perfect_reward_points INTEGER NOT NULL DEFAULT 100/);
    assert.match(v2RewardMigration, /v_run\.correct_count = v_run\.target_question_count/);
    assert.match(v2RewardMigration, /public\.point_engine_apply\(/);
    assert.match(v2RewardMigration, /'vocab-v2-perfect:%s:%s:%s'/);
    assert.match(v2RewardMigration, /'perfect_reward_already_earned'/);
    assert.match(teacherManager, /최초 완벽 연습 보상/);
    assert.match(teacherManager, /vocab_tower_v2_perfect_reward_points/);
    assert.match(v2DeckMap, /포인트 목표 완료/);
    assert.match(v2DeckMap, /포인트를 이미 받았어요/);
    assert.match(vocabularyGame, /perfect_reward_earned/);
});

test('V2는 낱말별 상태를 기록하고 약점·새 낱말·복습을 적응 출제한다', () => {
    assert.match(v2ItemLearningMigration, /CREATE TABLE IF NOT EXISTS public\.vocab_tower_v2_item_progress/);
    assert.match(v2ItemLearningMigration, /learning_state IN \('learning', 'familiar', 'needs_review', 'mastered'\)/);
    assert.match(v2ItemLearningMigration, /cardinality\(v_correct_types\) >= 2 AND v_streak >= 2/);
    assert.match(v2ItemLearningMigration, /v_target_focus := CASE MOD\(v_sequence - 1, 12\)/);
    assert.match(v2ItemLearningMigration, /'practice_focus', v_existing\.selection_focus/);
    assert.match(v2ItemLearningMigration, /'mastered_count', v_mastered_count/);
    assert.match(v2DeckMap, /처음 볼 낱말/);
    assert.match(v2DeckMap, /연습 중/);
    assert.match(v2DeckMap, /다시 볼 낱말/);
    assert.match(v2DeckMap, /완전히 익힘/);
    assert.match(v2DeckMap, /deck\.learning_count[\s\S]*deck\.familiar_count/);
    assert.match(vocabularyGame, /복습할 낱말/);
});

test('V2 덱 카드는 학습량과 포인트 목표 완료를 한 카드에서 설명한다', () => {
    assert.match(v2DeckMap, /한 번 이상 학습한 낱말/);
    assert.match(v2DeckMap, /12문항 완료/);
    assert.match(v2DeckMap, /최고 정답률/);
    assert.match(v2DeckMap, /포인트 목표 도전 중/);
    assert.match(v2DeckMap, /포인트 목표 완료/);
    assert.match(v2DeckMap, /포인트를 이미 받았어요/);
    assert.match(v2DeckMap, /aria-label=\{`\$\{deckNumber\}층/);
});

test('V2 덱 지도는 정상부터 입구까지 이어지는 탐험 경로와 정복 상태를 보여준다', () => {
    assert.match(v2DeckMap, /어휘의 정상/);
    assert.match(v2DeckMap, /탑 입구/);
    assert.match(v2DeckMap, /vocab-tower-route__stop/);
    assert.match(v2DeckMap, /bestAccuracy >= 100/);
    assert.match(v2DeckMap, /정복 완료/);
    assert.match(v2DeckMap, /aria-current=\{isActive \? 'step'/);
    assert.match(v2DeckMap, /scrollIntoView\(\{ block: 'center' \}\)/);
    assert.match(vocabularyStyles, /\.vocab-tower-route::before/);
    assert.match(vocabularyStyles, /\.vocab-tower-route__stop\.is-left/);
    assert.match(vocabularyStyles, /\.vocab-tower-route__stop\.is-right/);
    assert.match(vocabularyStyles, /\.vocab-deck-card\.is-conquered/);
});

test('교사 화면은 V1 선택을 없애고 현재 잠긴 덱을 기본 출제자료로 자동 연결한다', () => {
    assert.doesNotMatch(teacherManager, /V1 기존 출제/);
    assert.doesNotMatch(teacherManager, /option value="v1"/);
    assert.match(teacherManager, /현재 덱 10개/);
    assert.match(teacherManager, /자동 설정/);
    assert.match(teacherManager, /p_content_version: 'v2'/);
    assert.match(studentEntry, /contentVersion: 'v2'/);
    assert.match(v2DefaultMigration, /ALTER COLUMN vocab_tower_content_version SET DEFAULT 'v2'/);
    assert.match(v2DefaultMigration, /vocab_tower_content_version = 'v2'/);
});

test('교사 어휘 설정은 운영 요약과 핵심 입력을 한 화면에 밀도 있게 배치한다', () => {
    assert.match(teacherManager, /vocab-teacher__overview/);
    assert.match(teacherManager, /vocab-teacher__controls/);
    assert.match(teacherManager, /현재 운영 요약/);
    assert.match(teacherManagerStyles, /\.vocab-teacher\s*\{[\s\S]*?gap:\s*10px;/);
    assert.match(teacherManagerStyles, /\.vocab-teacher__overview, \.vocab-teacher__panel\s*\{[\s\S]*?padding:\s*13px 14px;/);
    assert.match(teacherManagerStyles, /\.vocab-teacher__summary\s*\{[\s\S]*?margin-top:\s*7px;/);
});

test('직접 입력형은 한 유형을 이미 성공한 낱말에서만 열린다', () => {
    assert.match(v2DirectInputMigration, /v_is_input := v_learning_state IN \('familiar', 'mastered'\)/);
    assert.match(v2DirectInputMigration, /'definitionInput'[\s\S]*'clozeInput'/);
    // 허용 정답이 없거나 검수 전이면 선택형으로 되돌려 학생이 막히지 않게 한다.
    assert.match(v2DirectInputMigration, /v_is_input := FALSE;/);
    assert.match(v2DirectInputMigration, /question_type = ANY \(ARRAY\[\s*'meaningChoice', 'clozeChoice', 'usageDistinction', 'definitionInput', 'clozeInput'/);
});

test('직접 입력형 채점은 공백·문장부호만 무시하고 낱말은 그대로 본다', () => {
    assert.match(v2DirectInputMigration, /CREATE OR REPLACE FUNCTION public\.normalize_vocab_tower_v2_answer/);
    assert.match(v2DirectInputMigration, /regexp_replace\(lower\(btrim\(COALESCE\(p_answer, ''\)\)\), '\[\[:space:\]\[:punct:\]\]', '', 'g'\)/);
    assert.match(v2DirectInputMigration, /FROM jsonb_array_elements_text\(v_question\.accepted_answers\) accepted/);
    // 선택형은 기존 정확 일치 채점을 그대로 유지한다.
    assert.match(v2DirectInputMigration, /v_is_correct := p_selected_answer = v_question\.correct_answer;/);
});

test('직접 입력형 문항은 정답 낱말과 예문을 학생 화면에 내려보내지 않는다', () => {
    assert.match(v2DirectInputMigration, /CREATE OR REPLACE FUNCTION public\.build_vocab_tower_v2_question_payload_v1/);
    assert.match(v2DirectInputMigration, /'word', CASE WHEN p_question\.question_type IN \('definitionInput', 'clozeInput'\)\s*\n\s*THEN '' ELSE p_question\.word END/);
    assert.match(v2DirectInputMigration, /'example', CASE WHEN p_question\.question_type IN \('definitionInput', 'clozeInput'\)\s*\n\s*THEN '' ELSE p_question\.example END/);
    assert.match(v2DirectInputMigration, /'definition', CASE WHEN p_question\.question_type = 'clozeInput'/);
    // 가린 정보는 채점 응답으로 되돌려줘야 해설을 만들 수 있다.
    assert.match(v2DirectInputMigration, /'word', v_question\.word, 'example', v_question\.example,\s*\n\s*'definition', v_question\.definition,/);
    assert.match(vocabularyGame, /word: data\.word \|\| currentQuiz\.word\.word/);
});

test('학생 화면은 보기 대신 직접 쓰는 칸을 보여준다', () => {
    assert.equal(isInputQuestion('definitionInput'), true);
    assert.equal(isInputQuestion('clozeInput'), true);
    assert.equal(isInputQuestion('meaningChoice'), false);
    const inputQuestion = mapV2Question({
        question_key: 'q1', room_type: 'meaning', question_type: 'definitionInput',
        prompt: '이 뜻에 맞는 낱말을 직접 쓰세요.', options: [],
        word: { word: '', definition: '자세히 살펴봄', example: '', level: 1, category: '공부' },
        sequence_number: 1, target_question_count: 12, deck_number: 8
    });
    assert.equal(inputQuestion.isInput, true);
    assert.match(inputQuestion.room.guide, /직접 써요/);
    const choiceQuestion = mapV2Question({
        question_key: 'q2', room_type: 'meaning', question_type: 'meaningChoice',
        prompt: '뜻에 맞는 낱말은?', options: ['관찰', '감각'],
        word: { word: '관찰', definition: '자세히 살펴봄', example: '식물을 관찰했다.', level: 1, category: '공부' },
        sequence_number: 2, target_question_count: 12, deck_number: 8
    });
    assert.equal(choiceQuestion.isInput, false);
    assert.match(vocabularyGame, /currentQuiz\.isInput \? \(/);
    assert.match(vocabularyGame, /낱말을 직접 써 보세요/);
    assert.match(vocabularyGame, /setNotice\('낱말을 입력한 뒤 확인을 눌러주세요\.'\)/);
    assert.match(vocabularyStyles, /\.vocab-question-card__input input\.is-correct/);
});
