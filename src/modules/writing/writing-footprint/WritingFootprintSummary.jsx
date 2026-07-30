import React, { memo } from 'react';

export const EMPTY_FOOTPRINT = {
    posts_written_count: 0,
    revisions_count: 0,
    feedbacks_received_count: 0,
    comments_given_count: 0,
    comments_received_count: 0,
    reactions_given_count: 0,
    reactions_received_count: 0,
    active_days_count: 0,
    snapshot_date: null,
    tracking_started_at: null
};

const SELF_METRICS = [
    { key: 'posts_written_count', icon: '📝', label: '완성한 글', unit: '편', color: '#5C6BC0', bg: '#EEF2FF' },
    { key: 'revisions_count', icon: '✍️', label: '고쳐 쓴 횟수', unit: '회', color: '#EF6C00', bg: '#FFF3E0' },
    { key: 'feedbacks_received_count', icon: '💡', label: '받은 피드백', unit: '회', color: '#00897B', bg: '#E0F2F1' },
    { key: 'active_days_count', icon: '🔥', label: '꾸준히 쓴 날', unit: '일', color: '#D84315', bg: '#FBE9E7' },
    { key: 'comments_given_count', icon: '💬', label: '남긴 댓글', unit: '개', color: '#1976D2', bg: '#E3F2FD' },
    { key: 'comments_received_count', icon: '🗨️', label: '받은 댓글', unit: '개', color: '#7B1FA2', bg: '#F3E5F5' },
    { key: 'reactions_given_count', icon: '🙌', label: '보낸 반응', unit: '개', color: '#558B2F', bg: '#F1F8E9' },
    { key: 'reactions_received_count', icon: '💖', label: '받은 반응', unit: '개', color: '#C2185B', bg: '#FCE4EC' }
];

// 친구에게 보여 줄 항목. `revisions_count`(고쳐 쓴 횟수)는 이벤트 표에만 있던 값이라
// 실제 글·댓글 표에서 같은 정의로 셀 근거가 없어 뺐다 — 내 발자국 화면도 이미 안 보여 준다.
const FRIEND_METRICS = SELF_METRICS.filter((metric) => [
    'posts_written_count',
    'active_days_count',
    'comments_given_count',
    'comments_received_count',
    'reactions_received_count'
].includes(metric.key));

export const formatSnapshotDate = (value) => {
    if (!value) return '첫 기록을 모으는 중';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '최근 기록 기준';
    return `${date.getMonth() + 1}월 ${date.getDate()}일 기준`;
};

const WritingFootprintSummary = ({ data = EMPTY_FOOTPRINT, compact = false }) => {
    const metrics = compact ? FRIEND_METRICS : SELF_METRICS;

    return (
        <div
            className={`writing-footprint-metrics ${compact ? 'compact' : ''}`}
            style={{
                display: 'grid',
                gridTemplateColumns: compact ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
                gap: compact ? '9px' : '14px'
            }}
        >
            {metrics.map((metric) => (
                <div
                    key={metric.key}
                    style={{
                        minWidth: 0,
                        padding: compact ? '12px 8px' : '18px 16px',
                        borderRadius: compact ? '15px' : '20px',
                        background: metric.bg,
                        border: `1px solid ${metric.color}22`,
                        textAlign: 'center'
                    }}
                >
                    <span style={{ display: 'block', fontSize: compact ? '1.15rem' : '1.5rem' }}>{metric.icon}</span>
                    <strong style={{ display: 'block', margin: '5px 0 2px', color: metric.color, fontSize: compact ? '1.05rem' : '1.4rem' }}>
                        {Number(data?.[metric.key] || 0).toLocaleString()}<small style={{ marginLeft: '2px', fontSize: '.66em' }}>{metric.unit}</small>
                    </strong>
                    <small style={{ display: 'block', color: '#607D8B', fontSize: compact ? '.65rem' : '.76rem', fontWeight: '850' }}>{metric.label}</small>
                </div>
            ))}

            <style>{`
                @media (max-width:720px) {
                    .writing-footprint-metrics { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
                    .writing-footprint-metrics.compact { grid-template-columns:repeat(3,minmax(0,1fr)) !important; }
                }
                @media (max-width:390px) {
                    .writing-footprint-metrics.compact { grid-template-columns:repeat(2,minmax(0,1fr)) !important; }
                }
            `}</style>
        </div>
    );
};

export default memo(WritingFootprintSummary);
