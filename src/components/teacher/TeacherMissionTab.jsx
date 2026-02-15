import React, { lazy, Suspense } from 'react';
import RecentActivity from './RecentActivity';

// [bundle-dynamic-imports] 무거운 분석 컴포넌트를 lazy loading
const ClassAnalysis = lazy(() => import('./ClassAnalysis'));

const MissionManager = lazy(() => import('./MissionManager'));
const StudentManager = lazy(() => import('./StudentManager'));

const TeacherMissionTab = ({ activeClass, isMobile, setSelectedActivityPost }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
            {/* 학급 종합 분석 섹션 (신규) */}
            <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: '#ADB5BD' }}>📊 분석 로딩 중...</div>}>
                <ClassAnalysis classId={activeClass.id} isMobile={isMobile} />
            </Suspense>

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
                        <StudentManager activeClass={activeClass} classId={activeClass?.id} isDashboardMode={true} />
                    </section>

                    <section style={{
                        background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                        border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                        overflow: 'hidden',
                        width: '100%', boxSizing: 'border-box'
                    }}>
                        <RecentActivity
                            classId={activeClass?.id}
                            onPostClick={(post) => setSelectedActivityPost(post)}
                        />
                    </section>
                </aside>
            </div>
        </div>
    );
};

export default TeacherMissionTab;
