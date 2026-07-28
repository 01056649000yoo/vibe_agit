import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';

const StudentManager = lazy(() => import('./StudentManager'));
const RecentActivity = lazy(() => import('./RecentActivity'));
const ClassAnalysis = lazy(() => import('./ClassAnalysis'));

const EMPTY_SUMMARY = { students: 0, today_posts: 0, week_posts: 0, avg_chars: 0 };

// 요약 띠는 학생을 더하거나 지우면 바로 틀어진다. 짧게 잡는다.
const SUMMARY_TTL_MS = 30000;

const PanelLoading = ({ children }) => (
    <div role="status" style={{ minHeight: '180px', display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '700' }}>{children}</div>
);

const cardStyle = (isMobile) => ({
    minWidth: 0, background: 'white', borderRadius: '18px',
    padding: isMobile ? '14px' : '16px 18px 18px',
    border: '1px solid #E2E8F0', boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)'
});

const SummaryStat = ({ icon, label, value, tone }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px',
        borderRadius: '14px', background: tone || '#F8FAFC', border: '1px solid #E2E8F0', minWidth: 0
    }}>
        <span aria-hidden="true" style={{ fontSize: '1.15rem' }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '1.15rem', fontWeight: '900', color: '#1E293B', lineHeight: 1.2 }}>{value}</div>
            <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', whiteSpace: 'nowrap' }}>{label}</div>
        </div>
    </div>
);

const TeacherStudentHub = ({ activeClass, isMobile, setSelectedActivityPost }) => {
    const classId = activeClass?.id;
    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [section, setSection] = useState('overview');

    const summaryKey = classKey(classId, 'student-hub-summary');

    const loadSummary = useCallback(async () => {
        if (!classId) return;
        try {
            const data = await dataCache.get(summaryKey, async () => {
                const { data: row, error } = await supabase.rpc('get_class_student_summary', { p_class_id: classId });
                if (error) throw error;
                return { ...EMPTY_SUMMARY, ...(row || {}) };
            }, SUMMARY_TTL_MS);
            setSummary(data);
        } catch (error) {
            console.error('학급 요약 로드 실패:', error.message);
            setSummary(EMPTY_SUMMARY);
        }
    }, [classId, summaryKey]);

    useEffect(() => {
        if (section !== 'overview') return undefined;
        const timerId = window.setTimeout(loadSummary, 0);
        return () => window.clearTimeout(timerId);
    }, [loadSummary, section]);

    if (!classId) return null;

    const sections = [
        {
            id: 'overview',
            icon: '📊',
            label: '학급 운영 현황',
            description: '활동과 학급 분석'
        },
        {
            id: 'students',
            icon: '👥',
            label: '학생 명단 관리',
            description: '학생·코드·포인트'
        }
    ];

    return (
        <div style={{
            width: '100%', display: isMobile ? 'flex' : 'grid',
            flexDirection: isMobile ? 'column' : undefined,
            gridTemplateColumns: isMobile ? undefined : '190px minmax(0, 1fr)',
            gap: '18px', alignItems: 'start'
        }}>
            <nav
                role="tablist"
                aria-label="학생 관리 메뉴"
                style={{
                    display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '7px',
                    position: isMobile ? undefined : 'sticky', top: isMobile ? undefined : '8px',
                    padding: '7px', border: '1px solid #E2E8F0', borderRadius: '16px',
                    background: '#F8FAFC', overflowX: isMobile ? 'auto' : undefined
                }}
            >
                {sections.map((item) => {
                    const active = section === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => setSection(item.id)}
                            style={{
                                minWidth: isMobile ? '170px' : 0, padding: isMobile ? '11px 14px' : '13px 12px',
                                border: active ? '1px solid #BFDBFE' : '1px solid transparent',
                                borderRadius: '12px', background: active ? 'white' : 'transparent',
                                boxShadow: active ? '0 4px 12px rgba(37, 99, 235, 0.09)' : 'none',
                                color: active ? '#1D4ED8' : '#64748B', cursor: 'pointer', textAlign: 'left'
                            }}
                        >
                            <strong style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.9rem' }}>
                                <span aria-hidden="true">{item.icon}</span>{item.label}
                            </strong>
                            <small style={{ display: 'block', margin: '4px 0 0 25px', color: active ? '#60A5FA' : '#94A3B8', fontSize: '0.7rem' }}>
                                {item.description}
                            </small>
                        </button>
                    );
                })}
            </nav>

            <div style={{ minWidth: 0 }}>
                {section === 'overview' ? (
                    <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
                            gap: '10px'
                        }}>
                            <SummaryStat icon="👥" label="학생" value={`${summary.students}명`} />
                            <SummaryStat icon="✍️" label="오늘 쓴 글" value={`${summary.today_posts}편`} tone="#EFF6FF" />
                            <SummaryStat icon="🗓️" label="최근 7일" value={`${summary.week_posts}편`} />
                            <SummaryStat icon="📊" label="평균 글자 수" value={`${summary.avg_chars}자`} />
                        </div>

                        <div style={{
                            display: isMobile ? 'flex' : 'grid',
                            flexDirection: isMobile ? 'column' : undefined,
                            gridTemplateColumns: isMobile ? undefined : 'minmax(0, 1fr) 320px',
                            gap: '16px', alignItems: 'start'
                        }}>
                            <section aria-label="학급 분석" style={cardStyle(isMobile)}>
                                <Suspense fallback={<PanelLoading>학급 분석을 준비하는 중...</PanelLoading>}>
                                    <ClassAnalysis classId={classId} isMobile={isMobile} />
                                </Suspense>
                            </section>

                            <section aria-label="최근 활동" style={{
                                ...cardStyle(isMobile),
                                position: isMobile ? undefined : 'sticky',
                                top: isMobile ? undefined : '8px'
                            }}>
                                <Suspense fallback={<PanelLoading>최근 활동을 준비하는 중...</PanelLoading>}>
                                    <RecentActivity classId={classId} onPostClick={(post) => setSelectedActivityPost(post)} />
                                </Suspense>
                            </section>
                        </div>
                    </div>
                ) : (
                    <section role="tabpanel" aria-label="학생 명단 관리" style={cardStyle(isMobile)}>
                        <Suspense fallback={<PanelLoading>학생 명단을 준비하는 중...</PanelLoading>}>
                            <StudentManager activeClass={activeClass} classId={classId} isDashboardMode={false} />
                        </Suspense>
                    </section>
                )}
            </div>
        </div>
    );
};

export default TeacherStudentHub;
