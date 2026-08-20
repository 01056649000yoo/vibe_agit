import React from 'react';
import Button from '../../../components/common/Button';
import './selfWritingReviewWorkspace.css';

const SUMMARY_ITEMS = [
    { id: 'unreviewed', label: '미확인', icon: '🕓' },
    { id: 'reviewed', label: '확인', icon: '✅' },
    { id: 'all', label: '전체', icon: '📚' }
];

export const getSelfWritingRecordTone = (reviewStatus, checkedTone) => (
    reviewStatus === 'checked' || reviewStatus === 'commented' ? checkedTone : 'pending'
);

export const SelfWritingReviewSummary = ({ counts, activeKey, onSelect }) => (
    <div className="self-writing-review-summary" aria-label="글 확인 통계">
        {SUMMARY_ITEMS.map((item) => (
            <button
                key={item.id}
                type="button"
                className={`${activeKey === item.id ? 'is-active' : ''} ${item.id}`}
                onClick={() => onSelect(item.id)}
            >
                <span aria-hidden="true">{item.icon}</span>
                <strong>{Number(item.id === 'all' ? counts?.total || 0 : counts?.[item.id] || 0)}</strong>
                <small>{item.label}</small>
            </button>
        ))}
    </div>
);

export const SelfWritingReviewViewTabs = ({ value, onChange, studentLabel = '학생별' }) => {
    const tabs = [
        { id: 'queue', label: '🕓 검토 대기' },
        { id: 'students', label: `👥 ${studentLabel}` },
        { id: 'archive', label: '🗂️ 전체 기록' }
    ];

    return (
        <div className="self-writing-review-tabs" role="tablist" aria-label="글 확인 목록 보기">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={value === tab.id}
                    className={value === tab.id ? 'is-active' : ''}
                    onClick={() => onChange(tab.id)}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
};

export const SelfWritingBulkToolbar = ({
    typeLabel,
    selectedCount,
    allSelected,
    disabled,
    onToggleAll,
    onConfirm
}) => (
    <div className="self-writing-bulk-toolbar">
        <label>
            <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                disabled={disabled}
            />
            <span>보이는 {typeLabel} 전체 선택</span>
        </label>
        <div>
            <span>{selectedCount > 0 ? `${selectedCount}편 선택` : '확인할 글을 선택하세요'}</span>
            <Button onClick={onConfirm} disabled={selectedCount === 0 || disabled} size="sm">
                {disabled ? '일괄 확인 중...' : `선택한 ${typeLabel} 확인 ✓`}
            </Button>
        </div>
    </div>
);

export const SelfWritingQueueCard = ({
    postId,
    typeLabel,
    studentName,
    dateLabel,
    title,
    secondary,
    selected,
    disabled,
    onToggle,
    onOpen,
    tone = 'pending',
    selectable = true,
    actionLabel = '내용 확인 ›'
}) => (
    <article className={`self-writing-queue-card is-${tone} ${selected ? 'is-selected' : ''} ${selectable ? '' : 'is-record'}`}>
        {selectable ? (
            <label className="self-writing-queue-card__select">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggle(postId)}
                    disabled={disabled}
                    aria-label={`${studentName} 학생의 ${typeLabel} 일괄 확인 선택`}
                />
                <span>{selected ? '선택됨' : '선택'}</span>
            </label>
        ) : null}
        <button type="button" className="self-writing-queue-card__open" onClick={onOpen}>
            <span className="self-writing-queue-card__top">
                <strong>👤 {studentName}</strong>
                <small>{dateLabel}</small>
            </span>
            <strong className="self-writing-queue-card__title">{title}</strong>
            {secondary && <span className="self-writing-queue-card__secondary">{secondary}</span>}
            <span className="self-writing-queue-card__action">{actionLabel}</span>
        </button>
    </article>
);
