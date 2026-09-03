import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateWritingReward,
    evaluateWritingPolicy,
    getWritingPolicyError,
    measureWritingContent,
    normalizeWritingPolicy,
    READING_LOG_POLICY_DEFAULTS,
    writingPolicyFromMission
} from '../src/modules/writing/policy/writingPolicy.js';

test('공백은 글자 수에 포함하고 보이지 않는 서식 문자는 제외한다', () => {
    assert.deepEqual(measureWritingContent('한 줄\u200B 글\n\n둘째 줄'), {
        charCount: 11,
        paragraphCount: 2
    });
});

test('독서록 기본 정책은 200자·1문단·100P·하루 1편이다', () => {
    assert.deepEqual(normalizeWritingPolicy(READING_LOG_POLICY_DEFAULTS), {
        is_enabled: true,
        min_chars: 200,
        min_paragraphs: 1,
        base_reward: 100,
        bonus_enabled: false,
        bonus_threshold: 0,
        bonus_reward: 0,
        repeat_bonus_enabled: false,
        repeat_bonus_threshold: 0,
        repeat_bonus_reward: 0,
        repeat_bonus_max_count: 0,
        daily_reward_limit: 1
    });
});

test('글자와 문단 중 하나라도 부족하면 완료할 수 없다', () => {
    const evaluation = evaluateWritingPolicy(
        { min_chars: 100, min_paragraphs: 2 },
        { charCount: 99, paragraphCount: 1 }
    );
    assert.equal(evaluation.complete, false);
    assert.match(getWritingPolicyError(evaluation), /100자/);
});

test('장르 입력 틀이 문단 검사를 맡으면 공용 문단 검사를 건너뛴다', () => {
    const evaluation = evaluateWritingPolicy(
        { min_chars: 10, min_paragraphs: 5 },
        { charCount: 10, paragraphCount: 0 },
        { skipParagraphValidation: true, unitLabel: '연' }
    );
    assert.equal(evaluation.complete, true);
});

test('추가 분량 보너스는 최소 글자와 추가 기준을 모두 넘을 때만 계산한다', () => {
    const policy = {
        min_chars: 100,
        base_reward: 50,
        bonus_enabled: true,
        bonus_threshold: 100,
        bonus_reward: 20
    };
    assert.equal(calculateWritingReward(policy, { charCount: 199 }).total, 50);
    assert.deepEqual(calculateWritingReward(policy, { charCount: 200 }), {
        total: 70,
        base: 50,
        bonus: 20,
        bonusAchieved: true,
        repeatBonus: 0,
        repeatCount: 0,
        repeatStartsAt: 200
    });
});

test('과제 승인 보상은 제출 당시 저장된 보상값을 우선한다', () => {
    const policy = writingPolicyFromMission(
        { min_chars: 100, min_paragraphs: 1, base_reward: 100, bonus_threshold: 100, bonus_reward: 10 },
        { awarded_base_reward: 80, awarded_bonus_threshold: 50, awarded_bonus_reward: 5 }
    );
    assert.equal(calculateWritingReward(policy, { charCount: 150 }).total, 85);
});

test('반복 보너스는 현행 추가 보너스 기준 뒤부터 구간별로 최대 횟수까지만 계산한다', () => {
    const policy = {
        min_chars: 300,
        base_reward: 100,
        bonus_enabled: true,
        bonus_threshold: 200,
        bonus_reward: 30,
        repeat_bonus_enabled: true,
        repeat_bonus_threshold: 200,
        repeat_bonus_reward: 10,
        repeat_bonus_max_count: 3
    };
    assert.equal(calculateWritingReward(policy, { charCount: 499 }).total, 100);
    assert.equal(calculateWritingReward(policy, { charCount: 500 }).total, 130);
    assert.deepEqual(calculateWritingReward(policy, { charCount: 900 }), {
        total: 150,
        base: 100,
        bonus: 30,
        bonusAchieved: true,
        repeatBonus: 20,
        repeatCount: 2,
        repeatStartsAt: 500
    });
    assert.equal(calculateWritingReward(policy, { charCount: 1500 }).total, 160);
});
