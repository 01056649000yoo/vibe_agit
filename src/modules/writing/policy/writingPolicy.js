import { countContentChars } from '../../../lib/textMetrics.js';

const DEFAULT_WRITING_POLICY = Object.freeze({
    is_enabled: true,
    min_chars: 0,
    min_paragraphs: 0,
    base_reward: 0,
    bonus_enabled: false,
    bonus_threshold: 0,
    bonus_reward: 0,
    daily_reward_limit: 3
});

export const READING_LOG_POLICY_DEFAULTS = Object.freeze({
    ...DEFAULT_WRITING_POLICY,
    min_chars: 200,
    min_paragraphs: 1,
    base_reward: 100,
    daily_reward_limit: 1
});

const toSafeInteger = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback;
};

export const normalizeWritingPolicy = (source = {}, defaults = DEFAULT_WRITING_POLICY) => ({
    is_enabled: source.is_enabled ?? defaults.is_enabled ?? true,
    min_chars: toSafeInteger(source.min_chars, defaults.min_chars),
    min_paragraphs: toSafeInteger(source.min_paragraphs, defaults.min_paragraphs),
    base_reward: toSafeInteger(source.base_reward, defaults.base_reward),
    bonus_enabled: source.bonus_enabled
        ?? (toSafeInteger(source.bonus_threshold) > 0 && toSafeInteger(source.bonus_reward) > 0),
    bonus_threshold: toSafeInteger(source.bonus_threshold, defaults.bonus_threshold),
    bonus_reward: toSafeInteger(source.bonus_reward, defaults.bonus_reward),
    daily_reward_limit: Math.max(1, toSafeInteger(source.daily_reward_limit, defaults.daily_reward_limit || 1))
});

const countWritingParagraphs = (value = '') => (
    String(value)
        .split(/\n+/)
        .filter((paragraph) => paragraph.trim().length > 0)
        .length
);

export const measureWritingContent = (content = '', paragraphCountOverride) => ({
    charCount: countContentChars(content),
    paragraphCount: Number.isFinite(paragraphCountOverride)
        ? Math.max(0, Math.trunc(paragraphCountOverride))
        : countWritingParagraphs(content)
});

export const evaluateWritingPolicy = (
    sourcePolicy,
    metrics,
    { skipParagraphValidation = false, unitLabel = '문단' } = {}
) => {
    const policy = normalizeWritingPolicy(sourcePolicy);
    const charCount = toSafeInteger(metrics?.charCount);
    const paragraphCount = toSafeInteger(metrics?.paragraphCount);
    const charComplete = !policy.is_enabled || charCount >= policy.min_chars;
    const paragraphComplete = !policy.is_enabled
        || skipParagraphValidation
        || paragraphCount >= policy.min_paragraphs;

    return {
        policy,
        metrics: { charCount, paragraphCount },
        charComplete,
        paragraphComplete,
        complete: charComplete && paragraphComplete,
        charRemaining: Math.max(0, policy.min_chars - charCount),
        paragraphRemaining: Math.max(0, policy.min_paragraphs - paragraphCount),
        unitLabel
    };
};

export const getWritingPolicyError = (evaluation) => {
    if (!evaluation || evaluation.complete) return '';
    if (!evaluation.charComplete) {
        return `최소 ${evaluation.policy.min_chars}자 이상 써야 해요! 조금 더 힘내볼까요? 💪`;
    }
    if (!evaluation.paragraphComplete) {
        return `최소 ${evaluation.policy.min_paragraphs}${evaluation.unitLabel} 이상이 필요해요! 내용을 나눠서 적어보세요. 📏`;
    }
    return '글쓰기 완료 조건을 다시 확인해 주세요.';
};

export const calculateWritingReward = (sourcePolicy, metrics) => {
    const policy = normalizeWritingPolicy(sourcePolicy);
    if (!policy.is_enabled) return { total: 0, base: 0, bonus: 0, bonusAchieved: false };

    const charCount = toSafeInteger(metrics?.charCount);
    const bonusAchieved = policy.bonus_enabled
        && policy.bonus_threshold > 0
        && policy.bonus_reward > 0
        && charCount >= policy.min_chars + policy.bonus_threshold;
    const bonus = bonusAchieved ? policy.bonus_reward : 0;

    return {
        total: policy.base_reward + bonus,
        base: policy.base_reward,
        bonus,
        bonusAchieved
    };
};

export const writingPolicyFromMission = (mission = {}, post = null) => normalizeWritingPolicy({
    min_chars: mission.min_chars,
    min_paragraphs: mission.min_paragraphs,
    base_reward: post?.awarded_base_reward ?? mission.base_reward,
    bonus_enabled: (post?.awarded_bonus_threshold ?? mission.bonus_threshold ?? 0) > 0
        && (post?.awarded_bonus_reward ?? mission.bonus_reward ?? 0) > 0,
    bonus_threshold: post?.awarded_bonus_threshold ?? mission.bonus_threshold,
    bonus_reward: post?.awarded_bonus_reward ?? mission.bonus_reward,
    daily_reward_limit: 1
});
