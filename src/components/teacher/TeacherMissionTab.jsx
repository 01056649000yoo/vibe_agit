import React, { lazy } from 'react';
import RecentActivity from './RecentActivity';
import ClassAnalysis from './ClassAnalysis';

const MissionManager = lazy(() => import('./MissionManager'));
const StudentManager = lazy(() => import('./StudentManager'));

const TeacherMissionTab = ({ activeClass, isMobile, setSelectedActivityPost }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
            {/* 학급 종합 분석 섹션 (신규) */}
            <ClassAnalysis classId={activeClass.id} isMobile={isMobile} />

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
                        <StudentManager classId={activeClass?.id} isDashboardMode={true} />
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
