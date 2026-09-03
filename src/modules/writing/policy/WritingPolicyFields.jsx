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
                onChange={(event) => {
                    const rawValue = event.target.value;
                    if (rawValue === '') {
                        onChange('');
                        return;
                    }
                    onChange(Math.max(min, Math.min(max, Number.parseInt(rawValue, 10) || 0)));
                }}
                onBlur={() => {
                    if (value === '') onChange(min);
                }}
            />
            {suffix && <strong>{suffix}</strong>}
        </span>
    </label>
);

const WritingPolicyFields = ({ value, onChange, showDailyLimit = false, showBonus = true }) => {
    const policy = normalizeWritingPolicy(value);
    const update = (key, nextValue) => onChange({ ...value, [key]: nextValue });
    const fieldValue = (key) => Reflect.get(value || {}, key) ?? Reflect.get(policy, key);

    return (
        <div className="writing-policy-fields">
            <div className="writing-policy-fields__group">
                <h4>📏 완료 분량</h4>
                <div className="writing-policy-fields__grid">
                    <NumberField label="최소 글자 수" value={fieldValue('min_chars')} step={50} onChange={(next) => update('min_chars', next)} suffix="자" />
                    <NumberField label="최소 문단 수" value={fieldValue('min_paragraphs')} max={100} onChange={(next) => update('min_paragraphs', next)} suffix="문단" />
                </div>
            </div>

            <div className="writing-policy-fields__group">
                <h4>🪙 포인트 보상</h4>
                <div className="writing-policy-fields__grid">
                    <NumberField label="기본 포인트" value={fieldValue('base_reward')} max={10000} step={10} onChange={(next) => update('base_reward', next)} suffix="P" />
                    {showDailyLimit && (
                        <NumberField label="하루 확인 보상" value={fieldValue('daily_reward_limit')} min={1} max={20} onChange={(next) => update('daily_reward_limit', next)} suffix="편" />
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
                            <NumberField label="추가 글자 수" value={fieldValue('bonus_threshold')} max={20000} step={50} onChange={(next) => update('bonus_threshold', next)} suffix="자" />
                            <NumberField label="추가 포인트" value={fieldValue('bonus_reward')} max={10000} step={10} onChange={(next) => update('bonus_reward', next)} suffix="P" />
                        </div>
                    )}
                </div>
            )}

            {showBonus && (
                <div className="writing-policy-fields__group writing-policy-fields__bonus">
                    <label className="writing-policy-switch">
                        <input type="checkbox" checked={policy.repeat_bonus_enabled} onChange={(event) => update('repeat_bonus_enabled', event.target.checked)} />
                        <span>글자 수 구간별 반복 보너스 사용</span>
                    </label>
                    {policy.repeat_bonus_enabled && (
                        <div className="writing-policy-fields__grid">
                            <NumberField label="반복 글자 수" value={fieldValue('repeat_bonus_threshold')} min={1} max={20000} step={50} onChange={(next) => update('repeat_bonus_threshold', next)} suffix="자마다" />
                            <NumberField label="구간당 포인트" value={fieldValue('repeat_bonus_reward')} min={1} max={10000} step={10} onChange={(next) => update('repeat_bonus_reward', next)} suffix="P" />
                            <NumberField label="최대 반복 횟수" value={fieldValue('repeat_bonus_max_count')} min={1} max={20} onChange={(next) => update('repeat_bonus_max_count', next)} suffix="회" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WritingPolicyFields;
