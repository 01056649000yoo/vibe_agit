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
    // 분석은 열기 전까지 아예 불러오지 않는다. 셋 중 가장 무겁고 가장 덜 본다.
    const [analysisOpen, setAnalysisOpen] = useState(false);

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
        const timerId = window.setTimeout(loadSummary, 0);
        return () => window.clearTimeout(timerId);
    }, [loadSummary]);

    if (!classId) return null;

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

            {/* 명단은 넓게, 최근 활동은 원래 좁고 긴 모양이라 옆에 세운다. */}
            <div style={{
                display: isMobile ? 'flex' : 'grid',
                flexDirection: isMobile ? 'column' : undefined,
                gridTemplateColumns: isMobile ? undefined : 'minmax(0, 1fr) 320px',
                gap: '16px',
                alignItems: 'start'
            }}>
                <section aria-label="학생 명단" style={cardStyle(isMobile)}>
                    <Suspense fallback={<PanelLoading>학생 명단을 준비하는 중...</PanelLoading>}>
                        <StudentManager activeClass={activeClass} classId={classId} isDashboardMode={false} />
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

            <section aria-label="학급 분석" style={{
                background: 'white', borderRadius: '18px', border: '1px solid #E2E8F0',
                boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)', overflow: 'hidden'
            }}>
                <button
                    type="button"
                    onClick={() => setAnalysisOpen((open) => !open)}
                    aria-expanded={analysisOpen}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                        padding: isMobile ? '14px' : '16px 18px', border: 0, background: 'transparent',
                        color: '#334155', fontWeight: '900', fontSize: '1rem', cursor: 'pointer', textAlign: 'left'
                    }}
                >
                    <span aria-hidden="true" style={{ color: '#94A3B8' }}>{analysisOpen ? '▾' : '▸'}</span>
                    📊 학급 분석 자세히 보기
                    {!isMobile && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: '800', color: '#94A3B8' }}>
                            열정 작가 TOP 5 · 미제출자 · 미션별 평균
                        </span>
                    )}
                </button>
                {analysisOpen && (
                    <div style={{ padding: isMobile ? '0 14px 14px' : '0 18px 18px', borderTop: '1px solid #E2E8F0' }}>
                        <Suspense fallback={<PanelLoading>학급 분석을 준비하는 중...</PanelLoading>}>
                            <ClassAnalysis classId={classId} isMobile={isMobile} />
                        </Suspense>
                    </div>
                )}
            </section>
        </div>
    );
};

export default TeacherStudentHub;
