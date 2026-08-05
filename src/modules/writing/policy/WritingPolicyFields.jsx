import React from 'react';
import { normalizeWritingPolicy } from './writingPolicy';
import './writingPolicy.css';

const NumberField = ({ label, value, onChange, min = 0, max = 20000, step = 1, suffix }) => (
    <label className="writing-policy-field">
        <span>{label}</span>
        <span className="writing-policy-field__input">
            <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Math.max(min, Math.min(max, Number.parseInt(event.target.value, 10) || 0)))}
            />
            {suffix && <strong>{suffix}</strong>}
        </span>
    </label>
);

const WritingPolicyFields = ({ value, onChange, showDailyLimit = false, showBonus = true }) => {
    const policy = normalizeWritingPolicy(value);
    const update = (key, nextValue) => onChange({ ...value, [key]: nextValue });

    return (
        <div className="writing-policy-fields">
            <div className="writing-policy-fields__group">
                <h4>📏 완료 분량</h4>
                <div className="writing-policy-fields__grid">
                    <NumberField label="최소 글자 수" value={policy.min_chars} step={50} onChange={(next) => update('min_chars', next)} suffix="자" />
                    <NumberField label="최소 문단 수" value={policy.min_paragraphs} max={100} onChange={(next) => update('min_paragraphs', next)} suffix="문단" />
                </div>
            </div>

            <div className="writing-policy-fields__group">
                <h4>🪙 완료 보상</h4>
                <div className="writing-policy-fields__grid">
                    <NumberField label="기본 포인트" value={policy.base_reward} max={10000} step={10} onChange={(next) => update('base_reward', next)} suffix="P" />
                    {showDailyLimit && (
                        <NumberField label="하루 보상 가능" value={policy.daily_reward_limit} min={1} max={20} onChange={(next) => update('daily_reward_limit', next)} suffix="편" />
                    )}
                </div>
            </div>

            {showBonus && (
                <div className="writing-policy-fields__group writing-policy-fields__bonus">
                    <label className="writing-policy-switch">
                        <input type="checkbox" checked={policy.bonus_enabled} onChange={(event) => update('bonus_enabled', event.target.checked)} />
                        <span>추가 분량 보너스 사용</span>
                    </label>
                    {policy.bonus_enabled && (
                        <div className="writing-policy-fields__grid">
                            <NumberField label="추가 글자 수" value={policy.bonus_threshold} max={20000} step={50} onChange={(next) => update('bonus_threshold', next)} suffix="자" />
                            <NumberField label="추가 포인트" value={policy.bonus_reward} max={10000} step={10} onChange={(next) => update('bonus_reward', next)} suffix="P" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WritingPolicyFields;
