import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';
import DashboardCardHost from '../../modules/dashboard/DashboardCardHost';
import {
    DASHBOARD_IDS, getDashboardCards, getDashboardValue, getFirstDashboardValue
} from '../../modules/dashboard/cardRegistry';
import { CLASS_OPERATIONS_CORE_CARDS } from './classOperationsCards';

const CLASS_OPERATIONS_CARDS = getDashboardCards(
    DASHBOARD_IDS.CLASS_OPERATIONS,
    CLASS_OPERATIONS_CORE_CARDS,
    { renderers: { summary: ['metric'], actions: ['action'] } }
);

const CACHE_TTL_MS = 30000;

const PERIOD_OPTIONS = [
    { id: '7d', label: '최근 7일' },
    { id: '30d', label: '최근 30일' },
    { id: 'all', label: '전체' }
];

const EMPTY_DATA = {
    summary: {
        students: 0,
        active_students: 0,
        submitted_posts: 0,
        revisions: 0,
        comments: 0,
        feedbacks: 0,
        avg_chars: 0
    },
    actions: {
        assignment_pending: { count: 0, items: [] },
        reading_pending: { count: 0, items: [] },
        evaluation_pending: { count: 0, items: [] },
        inactive_students: { count: 0, items: [] }
    },
    missions: []
};

const normalizeData = (value) => ({
    ...EMPTY_DATA,
    ...(value || {}),
    summary: { ...EMPTY_DATA.summary, ...(value?.summary || {}) },
    actions: {
        ...EMPTY_DATA.actions,
        ...(value?.actions || {})
    },
    missions: Array.isArray(value?.missions) ? value.missions : []
});

const formatDate = (value) => {
    if (!value) return '활동 기록 없음';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '날짜 확인 필요';
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

const missionTypeLabel = (type) => {
    if (type === 'meeting') return '회의 안건';
    if (type === 'poem') return '시 쓰기';
    if (type === 'report') return '보고하는 글쓰기';
    return '자유 글쓰기';
};

const resolveMetricCard = (card, data) => {
    const metric = card.metric || {};
    if (metric.type === 'ratio') {
        const numerator = Number(getDashboardValue(data, metric.numeratorPath, 0));
        const denominator = Number(getDashboardValue(data, metric.denominatorPath, 0));
        const percent = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
        return {
            value: `${numerator.toLocaleString()}/${denominator.toLocaleString()}${metric.unit || ''}`,
            note: `${metric.noteLabel || '비율'} ${percent}%`
        };
    }
    return {
        value: `${Number(getDashboardValue(data, metric.path, 0)).toLocaleString()}${metric.unit || ''}`,
        note: card.note
    };
};

const resolveActionDetail = (card, item) => {
    if (card.detailRenderer === 'last-activity') {
        return item.last_activity_at ? `마지막 ${formatDate(item.last_activity_at)}` : '활동 기록 없음';
    }
    return getFirstDashboardValue(item, card.detailPaths, card.detailFallback || '내용 없음');
};

const buildNavigationTarget = (card, action) => {
    if (typeof card.navigate === 'function') return card.navigate(action);
    if (!card.navigate) return null;
    const { includeFirstItem, ...target } = card.navigate;
    return includeFirstItem
        ? { ...target, item: action?.items?.[0] || null }
        : target;
};

const MetricCard = ({ icon, label, value, note, background, color }) => (
    <div style={{
        minWidth: 0,
        padding: '14px',
        borderRadius: '15px',
        border: '1px solid #E2E8F0',
        background: background || '#F8FAFC'
    }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', color: '#64748B', fontSize: '0.75rem', fontWeight: '800' }}>
            <span aria-hidden="true">{icon}</span>
            <span>{label}</span>
        </div>
        <div style={{ marginTop: '7px', color: color || '#0F172A', fontSize: '1.35rem', fontWeight: '900', lineHeight: 1.15 }}>
            {value}
        </div>
        {note && <div style={{ marginTop: '5px', color: '#94A3B8', fontSize: '0.68rem', lineHeight: 1.35 }}>{note}</div>}
    </div>
);

const ActionCard = ({ icon, title, description, action, tone, renderDetail, onActivate, actionLabel }) => {
    const items = Array.isArray(action?.items) ? action.items : [];
    const count = Number(action?.count || 0);

    const handleKeyDown = (event) => {
        if (!onActivate || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        onActivate();
    };

    return (
        <article
            role={onActivate ? 'button' : undefined}
            tabIndex={onActivate ? 0 : undefined}
            aria-label={onActivate ? `${title} 화면으로 이동` : undefined}
            onClick={onActivate}
            onKeyDown={handleKeyDown}
            style={{
            minWidth: 0,
            padding: '15px',
            borderRadius: '16px',
            border: `1px solid ${tone.border}`,
            background: tone.background,
            cursor: onActivate ? 'pointer' : 'default',
            transition: 'transform 0.18s ease, box-shadow 0.18s ease'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'flex', gap: '7px', alignItems: 'center', color: tone.text, fontSize: '0.9rem' }}>
                        <span aria-hidden="true">{icon}</span>{title}
                    </strong>
                    <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.7rem', lineHeight: 1.4 }}>{description}</p>
                </div>
                <span style={{
                    flex: '0 0 auto', minWidth: '34px', padding: '5px 8px', borderRadius: '999px',
                    background: count > 0 ? tone.badge : '#E2E8F0', color: count > 0 ? tone.text : '#64748B',
                    fontSize: '0.82rem', fontWeight: '900', textAlign: 'center'
                }}>{count}건</span>
            </div>

            {items.length > 0 ? (
                <div style={{ marginTop: '11px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {items.slice(0, 4).map((item, index) => (
                        <div key={item.post_id || item.student_id || index} style={{
                            minWidth: 0, padding: '8px 9px', borderRadius: '10px',
                            background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(148,163,184,0.16)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                <strong style={{ color: '#334155', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{item.student_name || '이름 없음'}</strong>
                                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748B', fontSize: '0.7rem' }}>
                                    {renderDetail(item)}
                                </span>
                            </div>
                        </div>
                    ))}
                    {count > 4 && <small style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: '700' }}>외 {count - 4}건이 더 있습니다.</small>}
                </div>
            ) : (
                <div style={{ marginTop: '11px', padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.65)', color: '#64748B', fontSize: '0.73rem', textAlign: 'center' }}>
                    지금 확인할 항목이 없습니다.
                </div>
            )}
            {onActivate && (
                <div style={{ marginTop: '10px', color: tone.text, fontSize: '0.7rem', fontWeight: '900', textAlign: 'right' }}>
                    {actionLabel || '관리 화면으로 이동'} →
                </div>
            )}
        </article>
    );
};

const ClassAnalysis = ({ classId, isMobile, onNavigate }) => {
    const [period, setPeriod] = useState('7d');
    const [data, setData] = useState(EMPTY_DATA);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const cacheKey = useMemo(
        () => classKey(classId, 'operations-dashboard', { period }),
        [classId, period]
    );

    const loadDashboard = useCallback(async ({ force = false } = {}) => {
        if (!classId) return;
        if (force) {
            dataCache.invalidate(cacheKey);
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setErrorMessage('');

        try {
            const result = await dataCache.get(cacheKey, async () => {
                const { data: dashboard, error } = await supabase.rpc('get_class_operations_dashboard', {
                    p_class_id: classId,
                    p_period: period
                });
                if (error) throw error;
                return normalizeData(dashboard);
            }, CACHE_TTL_MS);
            setData(normalizeData(result));
        } catch (error) {
            console.error('학급 운영 현황 로드 실패:', error.message);
            setData(EMPTY_DATA);
            setErrorMessage('학급 운영 현황을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [cacheKey, classId, period]);

    useEffect(() => {
        loadDashboard();
    }, [loadDashboard]);

    const totalStudents = Number(data.summary.students || 0);
    const periodLabel = PERIOD_OPTIONS.find((option) => option.id === period)?.label || '조회 기간';

    if (loading) {
        return (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ height: '32px', width: '210px', borderRadius: '9px', background: '#F1F5F9' }} />
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: '9px' }}>
                    {[1, 2, 3, 4, 5, 6].map((key) => <div key={key} style={{ height: '92px', borderRadius: '15px', background: '#F8FAFC' }} />)}
                </div>
                <span style={{ color: '#64748B', fontSize: '0.75rem' }}>학급 운영 현황을 집계하는 중...</span>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>
            <header style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: '12px', alignItems: isMobile ? 'stretch' : 'flex-start' }}>
                <div>
                    <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1.05rem', fontWeight: '900' }}>📊 학급 운영 현황</h3>
                    <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: '0.74rem', lineHeight: 1.45 }}>
                        활동량과 지금 확인해야 할 일을 한 화면에서 살펴봅니다.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div role="group" aria-label="운영 현황 조회 기간" style={{ display: 'flex', gap: '4px', padding: '3px', borderRadius: '10px', background: '#F1F5F9' }}>
                        {PERIOD_OPTIONS.map((option) => {
                            const selected = period === option.id;
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => setPeriod(option.id)}
                                    style={{
                                        border: 0, borderRadius: '8px', padding: '7px 9px', cursor: 'pointer',
                                        background: selected ? 'white' : 'transparent', color: selected ? '#1D4ED8' : '#64748B',
                                        boxShadow: selected ? '0 1px 4px rgba(15,23,42,0.1)' : 'none', fontSize: '0.7rem', fontWeight: '850'
                                    }}
                                >{option.label}</button>
                            );
                        })}
                    </div>
                    <button
                        type="button"
                        onClick={() => loadDashboard({ force: true })}
                        disabled={refreshing}
                        aria-label="학급 운영 현황 새로고침"
                        style={{
                            border: '1px solid #CBD5E1', borderRadius: '10px', padding: '7px 10px',
                            background: 'white', color: '#475569', cursor: refreshing ? 'wait' : 'pointer',
                            fontSize: '0.7rem', fontWeight: '800', opacity: refreshing ? 0.65 : 1
                        }}
                    >{refreshing ? '갱신 중...' : '↻ 새로고침'}</button>
                </div>
            </header>

            {errorMessage && (
                <div role="alert" style={{ padding: '12px', borderRadius: '12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.75rem', fontWeight: '700' }}>
                    {errorMessage}
                </div>
            )}

            <section aria-labelledby="class-summary-title">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline', marginBottom: '9px' }}>
                    <h4 id="class-summary-title" style={{ margin: 0, color: '#334155', fontSize: '0.86rem', fontWeight: '900' }}>핵심 활동 요약</h4>
                    <small style={{ color: '#94A3B8', fontSize: '0.66rem' }}>{periodLabel} 기준</small>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: '9px' }}>
                    <DashboardCardHost
                        cards={CLASS_OPERATIONS_CARDS}
                        context={data}
                        section="summary"
                        renderCard={(card) => {
                            const metric = resolveMetricCard(card, data);
                            return <MetricCard
                                icon={card.icon}
                                label={card.label}
                                value={metric.value}
                                note={metric.note}
                                background={card.background}
                                color={card.color}
                            />;
                        }}
                    />
                </div>
                <p style={{ margin: '7px 2px 0', color: '#94A3B8', fontSize: '0.64rem', lineHeight: 1.4 }}>
                    고쳐쓰기·댓글·피드백은 글쓰기 발자국 기록을 시작한 이후 활동부터 집계합니다.
                </p>
            </section>

            <section aria-labelledby="teacher-actions-title">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline', marginBottom: '9px' }}>
                    <h4 id="teacher-actions-title" style={{ margin: 0, color: '#334155', fontSize: '0.86rem', fontWeight: '900' }}>선생님이 확인할 일</h4>
                    <small style={{ color: '#94A3B8', fontSize: '0.66rem' }}>현재 상태 기준</small>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '9px' }}>
                    <DashboardCardHost
                        cards={CLASS_OPERATIONS_CARDS}
                        context={data}
                        section="actions"
                        renderCard={(card) => {
                            const action = getDashboardValue(data, card.dataPath, { count: 0, items: [] });
                            const navigationTarget = buildNavigationTarget(card, action);
                            return <ActionCard
                                icon={card.icon}
                                title={card.title}
                                description={card.description}
                                action={action}
                                tone={card.tone}
                                renderDetail={(item) => resolveActionDetail(card, item)}
                                actionLabel={card.actionLabel}
                                onActivate={navigationTarget ? () => onNavigate?.(navigationTarget) : undefined}
                            />;
                        }}
                    />
                </div>
            </section>

            <section aria-labelledby="mission-status-title">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline', marginBottom: '9px' }}>
                    <h4 id="mission-status-title" style={{ margin: 0, color: '#334155', fontSize: '0.86rem', fontWeight: '900' }}>진행 중 미션 현황</h4>
                    <small style={{ color: '#94A3B8', fontSize: '0.66rem' }}>최근 미션 6개</small>
                </div>
                {data.missions.length > 0 ? (
                    <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '14px' }}>
                        <table style={{ width: '100%', minWidth: '660px', borderCollapse: 'collapse', fontSize: '0.73rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', color: '#64748B', textAlign: 'center' }}>
                                    <th scope="col" style={{ padding: '10px 12px', textAlign: 'left' }}>미션</th>
                                    <th scope="col" style={{ padding: '10px 8px' }}>제출</th>
                                    <th scope="col" style={{ padding: '10px 8px' }}>확인</th>
                                    <th scope="col" style={{ padding: '10px 8px' }}>평가</th>
                                    <th scope="col" style={{ padding: '10px 8px' }}>현재 미제출</th>
                                    <th scope="col" style={{ padding: '10px 8px' }}>평균 글자</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.missions.map((mission) => (
                                    <tr
                                        key={mission.id}
                                        tabIndex={0}
                                        aria-label={`${mission.title || '제목 없는 미션'} 제출 현황 열기`}
                                        onClick={() => onNavigate?.({ tab: 'dashboard', kind: 'mission-review', missionId: mission.id })}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter' && event.key !== ' ') return;
                                            event.preventDefault();
                                            onNavigate?.({ tab: 'dashboard', kind: 'mission-review', missionId: mission.id });
                                        }}
                                        style={{ borderTop: '1px solid #E2E8F0', color: '#334155', textAlign: 'center', cursor: 'pointer' }}
                                    >
                                        <td style={{ padding: '11px 12px', textAlign: 'left', maxWidth: '250px' }}>
                                            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.77rem' }}>{mission.title || '제목 없는 미션'}</strong>
                                            <small style={{ color: '#94A3B8', fontSize: '0.64rem' }}>{missionTypeLabel(mission.mission_type)} · {formatDate(mission.created_at)} · 열기 ›</small>
                                        </td>
                                        <td style={{ padding: '11px 8px', fontWeight: '850', color: '#1D4ED8' }}>{mission.submitted_count || 0}/{totalStudents}</td>
                                        <td style={{ padding: '11px 8px' }}>{mission.confirmed_count || 0}</td>
                                        <td style={{ padding: '11px 8px' }}>{mission.rubric_enabled ? (mission.evaluated_count || 0) : '—'}</td>
                                        <td style={{ padding: '11px 8px', color: Number(mission.missing_count) > 0 ? '#DC2626' : '#15803D', fontWeight: '850' }}>{mission.missing_count || 0}명</td>
                                        <td style={{ padding: '11px 8px' }}>{Number(mission.avg_chars || 0).toLocaleString()}자</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div style={{ padding: '24px', borderRadius: '14px', background: '#F8FAFC', border: '1px dashed #CBD5E1', color: '#64748B', textAlign: 'center', fontSize: '0.75rem' }}>
                        현재 진행 중인 글쓰기 미션이 없습니다.
                    </div>
                )}
            </section>
        </div>
    );
};

export default ClassAnalysis;
