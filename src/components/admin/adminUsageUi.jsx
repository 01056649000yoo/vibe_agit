import React from 'react';
import { USAGE_STATUS, USAGE_STATUS_META } from '../../hooks/useAdminUsage';

/**
 * 관리자 사용량 화면에서 공용으로 쓰는 표시 요소.
 * 사용량·장기 미접속·정리 탭이 같은 표 모양과 같은 배지를 쓰도록 여기에 모았다.
 */

export const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('ko-KR');
};

export const formatRelativeTime = (value) => {
    if (!value) return '기록 없음';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '기록 없음';

    const minutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;

    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}일 전`;

    return date.toLocaleDateString('ko-KR', { year: '2-digit', month: 'short', day: 'numeric' });
};

/** 객체 동적 인덱싱 대신 switch — 알 수 없는 상태값이 와도 안전하게 기본값 반환 */
export const getUsageStatusMeta = (status) => {
    switch (status) {
        case USAGE_STATUS.ACTIVE: return USAGE_STATUS_META.ACTIVE;
        case USAGE_STATUS.IDLE: return USAGE_STATUS_META.IDLE;
        case USAGE_STATUS.DORMANT: return USAGE_STATUS_META.DORMANT;
        case USAGE_STATUS.NO_STUDENT: return USAGE_STATUS_META.NO_STUDENT;
        case USAGE_STATUS.NEVER_STARTED: return USAGE_STATUS_META.NEVER_STARTED;
        default: return { label: '확인 필요', color: '#718096', background: '#F7FAFC', border: '#CBD5E0' };
    }
};

export const UsageStatusBadge = ({ status }) => {
    const meta = getUsageStatusMeta(status);
    return (
        <span style={{
            display: 'inline-block', whiteSpace: 'nowrap',
            fontSize: '0.75rem', fontWeight: 'bold',
            padding: '4px 10px', borderRadius: '20px',
            color: meta.color, background: meta.background, border: `1px solid ${meta.border}`
        }}>
            {meta.label}
        </span>
    );
};

export const SectionCard = ({ children, style }) => (
    <div style={{
        background: 'white', borderRadius: '12px', border: '1px solid #E9ECEF',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', ...style
    }}>
        {children}
    </div>
);

export const PanelHeader = ({ title, description, right }) => (
    <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: '16px', flexWrap: 'wrap', padding: '20px', borderBottom: '1px solid #EDF2F7', background: '#F8FAFC'
    }}>
        <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#2D3748', fontWeight: 800 }}>{title}</h3>
            {description && (
                <p style={{ margin: '6px 0 0 0', color: '#718096', fontSize: '0.88rem', lineHeight: 1.5 }}>
                    {description}
                </p>
            )}
        </div>
        {right && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{right}</div>}
    </div>
);

export const DayRangeSelect = ({ label, value, options, onChange, disabled }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#4A5568' }}>
        {label}
        <select
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{
                padding: '6px 10px', borderRadius: '8px', border: '1px solid #CBD5E0',
                fontSize: '0.85rem', background: 'white', color: '#2D3748'
            }}
        >
            {options.map(day => (
                <option key={day} value={day}>{day}일</option>
            ))}
        </select>
    </label>
);

export const EmptyState = ({ children }) => (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#A0AEC0' }}>{children}</div>
);

export const tableStyle = {
    width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', minWidth: '900px'
};

export const theadRowStyle = {
    background: '#F8F9FA', borderBottom: '2px solid #E9ECEF', color: '#546E7A'
};

export const thStyle = { padding: '14px 12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' };
export const thLeftStyle = { ...thStyle, textAlign: 'left' };
export const tdStyle = { padding: '14px 12px', textAlign: 'center', color: '#546E7A', whiteSpace: 'nowrap' };
export const tdLeftStyle = { ...tdStyle, textAlign: 'left' };

/** 숫자 셀 — 0이면 회색으로 흐리게 해 "안 쓰는 계정"이 눈에 띄게 한다 */
export const CountCell = ({ value, highlightZero = false }) => {
    const isZero = !value;
    return (
        <td style={{
            ...tdStyle,
            fontWeight: 700,
            color: isZero ? (highlightZero ? '#E53E3E' : '#CBD5E0') : '#2C5282'
        }}>
            {value || 0}
        </td>
    );
};
