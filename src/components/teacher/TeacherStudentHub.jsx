import React, { lazy, Suspense, useState } from 'react';

const StudentManager = lazy(() => import('./StudentManager'));
const RecentActivity = lazy(() => import('./RecentActivity'));
const ClassAnalysis = lazy(() => import('./ClassAnalysis'));

// 셋 다 "지금 이 학급 안"을 본다. 학급 자체를 만들고 지우고 되살리는 일은
// 성격이 달라 설정 > 학급 관리로 옮겼다 (학급 전환은 상단 드롭다운).
const sections = [
    { id: 'roster', icon: '👥', label: '학생 명단' },
    { id: 'recent', icon: '🕘', label: '최근 활동' },
    { id: 'analysis', icon: '📊', label: '학급 분석' }
];

const PanelLoading = ({ children }) => (
    <div role="status" style={{ minHeight: '180px', display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '700' }}>{children}</div>
);

const TeacherStudentHub = ({ activeClass, isMobile, setSelectedActivityPost }) => {
    const [activeSection, setActiveSection] = useState('roster');
    const activeSectionLabel = sections.find((item) => item.id === activeSection)?.label;

    return (
        <div style={{ display: isMobile ? 'block' : 'grid', gridTemplateColumns: isMobile ? undefined : '180px minmax(0, 1fr)', gap: isMobile ? 0 : '20px', width: '100%', alignItems: 'start' }}>
            <nav role="tablist" aria-label="학생 관리 메뉴" style={{
                display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '6px', padding: '6px',
                marginBottom: isMobile ? '16px' : 0, overflowX: 'auto', borderRadius: '16px', background: '#E2E8F0',
                position: isMobile ? undefined : 'sticky', top: isMobile ? undefined : 0
            }}>
                {sections.map((item) => {
                    const active = activeSection === item.id;
                    return (
                        <button key={item.id} type="button" role="tab" aria-selected={active} onClick={() => setActiveSection(item.id)} style={{
                            flex: isMobile ? '1 0 auto' : 'none', padding: isMobile ? '9px 14px' : '13px 14px', border: 'none', borderRadius: '11px',
                            background: active ? 'white' : 'transparent', color: active ? '#1D4ED8' : '#64748B',
                            boxShadow: active ? '0 1px 4px rgba(15, 23, 42, 0.12)' : 'none', fontWeight: '800', cursor: 'pointer',
                            textAlign: isMobile ? 'center' : 'left', whiteSpace: 'nowrap'
                        }}>
                            <span aria-hidden="true">{item.icon}</span> {item.label}
                        </button>
                    );
                })}
            </nav>

            <section aria-label={activeSectionLabel} style={{ minWidth: 0, background: 'white', borderRadius: '18px', padding: isMobile ? '14px' : '16px 18px 18px', border: '1px solid #E2E8F0', boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)' }}>
                <Suspense fallback={<PanelLoading>{activeSectionLabel}을 준비하는 중...</PanelLoading>}>
                    {activeSection === 'roster' ? (
                        <StudentManager activeClass={activeClass} classId={activeClass.id} isDashboardMode={false} />
                    ) : activeSection === 'recent' ? (
                        <RecentActivity classId={activeClass.id} onPostClick={(post) => setSelectedActivityPost(post)} />
                    ) : (
                        <ClassAnalysis classId={activeClass.id} isMobile={isMobile} />
                    )}
                </Suspense>
            </section>
        </div>
    );
};

export default TeacherStudentHub;
