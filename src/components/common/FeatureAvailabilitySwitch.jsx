import React from 'react';
import './FeatureAvailabilitySwitch.css';

/**
 * 교사가 학생 화면의 기능 노출을 켜고 끌 때 쓰는 공용 스위치.
 * 저장 방식은 각 기능이 소유하고, 이 컴포넌트는 상태·설명·접근 가능한 조작 모양만 통일한다.
 */
const FeatureAvailabilitySwitch = ({
    checked,
    onChange,
    enabledLabel = '학생 기능 사용 중',
    disabledLabel = '학생 기능 사용 안 함',
    enabledDescription = '학생 화면에 이 기능이 보입니다.',
    disabledDescription = '학생 화면에서 이 기능을 숨깁니다.',
    ariaLabel = '학생 기능 사용',
    disabled = false,
    loading = false,
    fullWidth = false,
    className = ''
}) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-busy={loading || undefined}
        className={`feature-availability-switch ${checked ? 'is-enabled' : 'is-disabled'} ${fullWidth ? 'is-full-width' : ''} ${className}`.trim()}
        disabled={disabled || loading}
        onClick={() => onChange?.(!checked)}
    >
        <span className="feature-availability-switch__copy">
            <strong>{checked ? enabledLabel : disabledLabel}</strong>
            <small>{checked ? enabledDescription : disabledDescription}</small>
        </span>
        <span className="feature-availability-switch__control" aria-hidden="true" />
    </button>
);

export default FeatureAvailabilitySwitch;
