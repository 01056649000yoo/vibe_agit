import React, { lazy, Suspense, useEffect, useState } from 'react';
import RecentActivity from './RecentActivity';

// [bundle-dynamic-imports] 무거운 분석 컴포넌트를 lazy loading
const ClassAnalysis = lazy(() => import('./ClassAnalysis'));

const MissionManager = lazy(() => import('./MissionManager'));
const StudentManager = lazy(() => import('./StudentManager'));

const TeacherMissionTab = ({ activeClass, isMobile, setSelectedActivityPost }) => {
    const [showAnalysis, setShowAnalysis] = useState(false);
    const [showStudentManager, setShowStudentManager] = useState(false);
    const [showRecentActivity, setShowRecentActivity] = useState(false);

    useEffect(() => {
        setShowAnalysis(false);
        setShowStudentManager(false);
        setShowRecentActivity(false);

        if (!activeClass?.id) return;

        let cancelled = false;
        let idleId = null;
        let analysisTimerId = null;
        let studentTimerId = null;
        let recentTimerId = null;

        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            idleId = window.requestIdleCallback(() => {
                if (!cancelled) setShowAnalysis(true);
            }, { timeout: 300 });
        } else {
            analysisTimerId = window.setTimeout(() => {
                if (!cancelled) setShowAnalysis(true);
            }, 120);
        }

        studentTimerId = window.setTimeout(() => {
            if (!cancelled) setShowStudentManager(true);
        }, 180);

        recentTimerId = window.setTimeout(() => {
            if (!cancelled) setShowRecentActivity(true);
        }, 260);

        return () => {
            cancelled = true;
            if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
                window.cancelIdleCallback(idleId);
            }
            if (analysisTimerId !== null) window.clearTimeout(analysisTimerId);
            if (studentTimerId !== null) window.clearTimeout(studentTimerId);
            if (recentTimerId !== null) window.clearTimeout(recentTimerId);
        };
    }, [activeClass?.id]);

    const renderPlaceholder = (minHeight) => (
        <div style={{
            minHeight,
            borderRadius: '20px',
            background: 'linear-gradient(180deg, #F8F9FA 0%, #F1F3F5 100%)',
            border: '1px solid #E9ECEF'
        }} />
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
            {/* 학급 종합 분석 섹션 (신규) */}
            {showAnalysis ? (
                <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: '#ADB5BD' }}>📊 분석 로딩 중...</div>}>
                    <ClassAnalysis classId={activeClass.id} isMobile={isMobile} />
                </Suspense>
            ) : renderPlaceholder(isMobile ? '140px' : '170px')}

            <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 6.5fr) minmax(0, 3.5fr)',
                gap: '20px',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                <section style={{
                    background: 'white', borderRadius: '24px',
                    border: '1px solid #E9ECEF', display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                    width: '100%',
                    boxSizing: 'border-box',
                    minHeight: isMobile ? '400px' : 'auto'
                }}>
                    <div style={{
                        flex: 1,
                        padding: isMobile ? '16px' : '24px',
                        boxSizing: 'border-box'
                    }}>
                        <MissionManager activeClass={activeClass} isDashboardMode={true} />
                    </div>
                </section>

                <aside style={{
                    display: 'flex', flexDirection: 'column', gap: '20px',
                    width: '100%', boxSizing: 'border-box', overflow: 'hidden'
                }}>
                    <section style={{
                        background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                        border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                        overflow: 'hidden',
                        width: '100%', boxSizing: 'border-box'
                    }}>
                        {showStudentManager ? (
                            <StudentManager activeClass={activeClass} classId={activeClass?.id} isDashboardMode={true} />
                        ) : renderPlaceholder('260px')}
                    </section>

                    <section style={{
                        background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                        border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                        overflow: 'hidden',
                        width: '100%', boxSizing: 'border-box'
                    }}>
                        {showRecentActivity ? (
                            <RecentActivity
                                classId={activeClass?.id}
                                onPostClick={(post) => setSelectedActivityPost(post)}
                            />
                        ) : renderPlaceholder('220px')}
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default TeacherMissionTab;
