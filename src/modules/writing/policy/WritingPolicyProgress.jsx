import React from 'react';
import { calculateWritingReward, evaluateWritingPolicy } from './writingPolicy';
import './writingPolicy.css';

const WritingPolicyProgress = ({
    policy,
    metrics,
    unitLabel = '문단',
    skipParagraphValidation = false,
    dailyRemaining = null,
    className = ''
}) => {
    const evaluation = evaluateWritingPolicy(policy, metrics, { unitLabel, skipParagraphValidation });
    const reward = calculateWritingReward(evaluation.policy, evaluation.metrics);
    const bonusTarget = evaluation.policy.min_chars + evaluation.policy.bonus_threshold;

    return (
        <aside className={`writing-policy-progress ${className}`.trim()} aria-label="글쓰기 완료 조건">
            <div className={evaluation.charComplete ? 'is-complete' : 'is-pending'}>
                <span>글자 수</span>
                <strong>{evaluation.metrics.charCount} / {evaluation.policy.min_chars}자</strong>
            </div>
            {!skipParagraphValidation && (
                <div className={evaluation.paragraphComplete ? 'is-complete' : 'is-pending'}>
                    <span>{unitLabel} 수</span>
                    <strong>{evaluation.metrics.paragraphCount} / {evaluation.policy.min_paragraphs}{unitLabel}</strong>
                </div>
            )}
            <div className="writing-policy-progress__reward">
                <span>완료 보상</span>
                <strong>{reward.total}P</strong>
                {dailyRemaining !== null && <small>오늘 새 독서록 {dailyRemaining}편 작성 가능</small>}
            </div>
            {evaluation.policy.bonus_enabled && evaluation.policy.bonus_threshold > 0 && evaluation.policy.bonus_reward > 0 && (
                <p className={reward.bonusAchieved ? 'is-complete' : ''}>
                    {reward.bonusAchieved
                        ? `🔥 추가 분량 보너스 +${evaluation.policy.bonus_reward}P 달성!`
                        : `${bonusTarget}자를 쓰면 +${evaluation.policy.bonus_reward}P · ${Math.max(0, bonusTarget - evaluation.metrics.charCount)}자 남음`}
                </p>
            )}
        </aside>
    );
};

export default WritingPolicyProgress;
