import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRoomQuiz,
    getRoomType,
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
});
