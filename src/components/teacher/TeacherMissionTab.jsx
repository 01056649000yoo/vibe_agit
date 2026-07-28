import React, { lazy, Suspense } from 'react';

const MissionManager = lazy(() => import('./MissionManager'));

const TeacherMissionTab = ({ activeClass, isMobile, cardLayout, navigationTarget, onNavigationHandled }) => (
    <section
        aria-labelledby="teacher-missions-heading"
        style={{
            background: 'white', borderRadius: '18px', border: '1px solid #E2E8F0',
            overflow: 'hidden', boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)', width: '100%', boxSizing: 'border-box'
        }}
    >
        <h2 id="teacher-missions-heading" style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>선생님 과제</h2>
        <div style={{ padding: isMobile ? '14px' : '16px 18px 18px' }}>
            <Suspense fallback={<div role="status" style={{ minHeight: '220px', display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '700' }}>과제 목록을 준비하는 중...</div>}>
                <MissionManager
                    activeClass={activeClass}
                    isDashboardMode={true}
                    cardLayout={cardLayout}
                    navigationTarget={navigationTarget}
                    onNavigationHandled={onNavigationHandled}
                />
            </Suspense>
        </div>
    </section>
);

export default TeacherMissionTab;
