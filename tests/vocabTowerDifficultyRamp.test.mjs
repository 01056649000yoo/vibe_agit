import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    getVocabPracticeDifficultyStage,
    getVocabPracticeNextFloorHint
} from '../src/modules/game/vocab-tower/practiceDifficulty.js';

const [migration, smoke, deckMap, game, styles] = await Promise.all([
    readFile('supabase/migrations/20261211_vocab_tower_practice_difficulty_ramp.sql', 'utf8'),
    readFile('tests/sql/20261211_vocab_tower_practice_difficulty_ramp.smoke.sql', 'utf8'),
    readFile('src/modules/game/vocab-tower/V2DeckMap.jsx', 'utf8'),
    readFile('src/modules/game/vocab-tower/VocabularyTowerGame.jsx', 'utf8'),
    readFile('src/modules/game/vocab-tower/vocabularyTowerGame.css', 'utf8')
]);

test('층별 개인 연습 정책은 문항 구성·보기 수·우선 난이도를 서버 한 곳에서 정한다', () => {
    assert.match(migration, /FUNCTION public\.vocab_tower_v2_practice_floor_policy_v1/);
    assert.match(migration, /'question_types'/);
    assert.match(migration, /'choice_option_count'/);
    assert.match(migration, /'preferred_difficulties'/);
    assert.match(migration, /item\.difficulty = ANY\(v_preferred_difficulties\)/);
    assert.match(migration, /candidate\.selection_focus = NEW\.selection_focus/);
    assert.match(migration, /IF v_run\.id IS NULL[\s\S]*v_run\.practice_policy_version < 2[\s\S]*NEW\.is_retry/);
    assert.match(migration, /CREATE TRIGGER apply_vocab_tower_v2_practice_floor_policy_v1/);
    assert.match(smoke, /ARRAY\[6,6,0,0\]/);
    assert.match(smoke, /ARRAY\[2,2,3,5\]/);
});

test('직접 입력 위치는 층별 정책에서 파생되어 두 번째 원본을 만들지 않는다', () => {
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.vocab_tower_v2_practice_input_slots_v1/);
    assert.match(migration, /vocab_tower_v2_practice_floor_policy_v1\(p_deck_number\)->'question_types'/);
    assert.doesNotMatch(migration, /WHEN 10 THEN ARRAY\[4, 6, 8, 10, 12\]/);
});

test('학생 화면의 다섯 난이도 단계는 한 UI 모듈에서 지도·수련·결과에 함께 쓰인다', () => {
    assert.equal(getVocabPracticeDifficultyStage(1)?.label, '낱말 발견');
    assert.equal(getVocabPracticeDifficultyStage(4)?.label, '문맥 연결');
    assert.equal(getVocabPracticeDifficultyStage(6)?.label, '쓰임 구별');
    assert.equal(getVocabPracticeDifficultyStage(8)?.label, '직접 떠올리기');
    assert.equal(getVocabPracticeDifficultyStage(10)?.label, '정상 수련');
    assert.match(getVocabPracticeNextFloorHint(9), /다섯 문항/);
    assert.match(deckMap, /getVocabPracticeDifficultyStage/);
    assert.match(deckMap, /practicePolicyVersion/);
    assert.match(game, /practice_policy_version/);
    assert.match(game, /getVocabPracticeNextFloorHint/);
    assert.match(styles, /\.vocab-deck-card__difficulty/);
    assert.match(styles, /\.vocab-summary-card__difficulty/);
});

test('난이도 단계 UI는 정책 2 제한 공개 응답에서만 나타난다', () => {
    assert.match(migration, /'practice_policy_version', v_practice_policy_version/);
    assert.match(deckMap, /Number\(practicePolicyVersion\) >= 2/);
    assert.match(game, /Number\(status\?\.practicePolicyVersion\) >= 2/);
});
