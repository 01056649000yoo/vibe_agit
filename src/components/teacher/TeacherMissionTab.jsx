import React, { lazy, Suspense } from 'react';

const MissionManager = lazy(() => import('./MissionManager'));

const TeacherMissionTab = ({ activeClass, isMobile }) => (
    <section
        aria-labelledby="teacher-missions-heading"
        style={{
            background: 'white', borderRadius: '24px', border: '1px solid #E2E8F0',
            overflow: 'hidden', boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)', width: '100%', boxSizing: 'border-box'
        }}
    >
        <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row', gap: '8px', padding: isMobile ? '18px 18px 0' : '24px 24px 0'
        }}>
            <div>
                <span style={{ color: '#2563EB', fontSize: '0.78rem', fontWeight: '900', letterSpacing: '0.08em' }}>가장 먼저 할 일</span>
                <h2 id="teacher-missions-heading" style={{ margin: '5px 0 0', color: '#172033', fontSize: isMobile ? '1.25rem' : '1.45rem' }}>선생님 과제</h2>
            </div>
            <p style={{ margin: 0, color: '#64748B', fontSize: '0.9rem' }}>과제를 만들고 학생 제출 현황을 확인하세요.</p>
        </div>
        <div style={{ padding: isMobile ? '16px 18px 18px' : '18px 24px 24px' }}>
            <Suspense fallback={<div role="status" style={{ minHeight: '220px', display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '700' }}>과제 목록을 준비하는 중...</div>}>
                <MissionManager activeClass={activeClass} isDashboardMode={true} />
            </Suspense>
        </div>
    </section>
);

export default TeacherMissionTab;
