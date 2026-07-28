import React, { lazy, Suspense, useState } from 'react';

const StudentManager = lazy(() => import('./StudentManager'));
const RecentActivity = lazy(() => import('./RecentActivity'));
const ClassAnalysis = lazy(() => import('./ClassAnalysis'));

const PanelLoading = ({ children }) => (
    <div role="status" style={{ minHeight: '180px', display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '700' }}>{children}</div>
);

const cardStyle = (isMobile) => ({
    minWidth: 0, background: 'white', borderRadius: '18px',
    padding: isMobile ? '14px' : '16px 18px 18px',
    border: '1px solid #E2E8F0', boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)'
});

const TeacherStudentHub = ({ activeClass, isMobile, setSelectedActivityPost, onNavigate }) => {
    const classId = activeClass?.id;
    const [section, setSection] = useState('overview');

    const handleAnalysisNavigate = (target) => {
        if (target?.tab === 'students') {
            setSection('students');
            return;
        }
        onNavigate?.(target);
    };

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
        },
        {
            id: 'activity',
            icon: '🔔',
            label: '최근 활동',
            description: '과제·독서록·댓글'
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
                    <section role="tabpanel" aria-label="학급 운영 현황" style={cardStyle(isMobile)}>
                        <Suspense fallback={<PanelLoading>학급 운영 현황을 준비하는 중...</PanelLoading>}>
                            <ClassAnalysis classId={classId} isMobile={isMobile} onNavigate={handleAnalysisNavigate} />
                        </Suspense>
                    </section>
                ) : section === 'students' ? (
                    <section role="tabpanel" aria-label="학생 명단 관리" style={cardStyle(isMobile)}>
                        <Suspense fallback={<PanelLoading>학생 명단을 준비하는 중...</PanelLoading>}>
                            <StudentManager activeClass={activeClass} classId={classId} isDashboardMode={false} />
                        </Suspense>
                    </section>
                ) : (
                    <section role="tabpanel" aria-label="최근 활동" style={cardStyle(isMobile)}>
                        <Suspense fallback={<PanelLoading>최근 활동을 준비하는 중...</PanelLoading>}>
                            <RecentActivity
                                classId={classId}
                                isMobile={isMobile}
                                onPostClick={(post) => setSelectedActivityPost(post)}
                            />
                        </Suspense>
                    </section>
                )}
            </div>
        </div>
    );
};

export default TeacherStudentHub;
