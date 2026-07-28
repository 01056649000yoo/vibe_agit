import React, { lazy, Suspense, useState } from 'react';

const ClassManager = lazy(() => import('./ClassManager'));
const StudentManager = lazy(() => import('./StudentManager'));
const RecentActivity = lazy(() => import('./RecentActivity'));
const ClassAnalysis = lazy(() => import('./ClassAnalysis'));

const insights = [
    { id: 'recent', icon: '🕘', label: '최근 활동', description: '최근 제출과 활동 기록을 살펴봐요.' },
    { id: 'analysis', icon: '📊', label: '학급 분석', description: '필요할 때 학급 통계를 열어봐요.' }
];

const PanelLoading = ({ children }) => (
    <div role="status" style={{ minHeight: '180px', display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '700' }}>{children}</div>
);

const TeacherStudentHub = ({
    session, classes, activeClass, setActiveClass, setClasses, fetchAllClasses,
    primaryClassId, handleSetPrimaryClass, fetchDeletedClasses, onRestoreClass,
    isMobile, setSelectedActivityPost
}) => {
    const [activeInsight, setActiveInsight] = useState(null);
    const selectedInsight = insights.find((item) => item.id === activeInsight);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            <div>
                <span style={{ color: '#2563EB', fontSize: '0.78rem', fontWeight: '900', letterSpacing: '0.08em' }}>학급 운영</span>
                <h2 style={{ margin: '5px 0 0', color: '#172033', fontSize: isMobile ? '1.25rem' : '1.45rem' }}>학생 관리</h2>
                <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.9rem' }}>학급 설정, 학생 등록과 코드, 활동 흐름을 한곳에서 관리하세요.</p>
            </div>

            <section style={{ background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)' }}>
                <Suspense fallback={<PanelLoading>학급 정보를 준비하는 중...</PanelLoading>}>
                    <ClassManager
                        userId={session.user.id}
                        classes={classes}
                        activeClass={activeClass}
                        setActiveClass={setActiveClass}
                        setClasses={setClasses}
                        onClassDeleted={fetchAllClasses}
                        isMobile={isMobile}
                        primaryClassId={primaryClassId}
                        onSetPrimaryClass={handleSetPrimaryClass}
                        fetchDeletedClasses={fetchDeletedClasses}
                        onRestoreClass={onRestoreClass}
                    />
                </Suspense>
            </section>

            {activeClass && (
                <>
                    <section style={{ background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px', border: '1px solid #E2E8F0', boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)' }}>
                        <Suspense fallback={<PanelLoading>학생 목록을 불러오는 중...</PanelLoading>}>
                            <StudentManager activeClass={activeClass} classId={activeClass.id} isDashboardMode={false} />
                        </Suspense>
                    </section>

                    <section>
                        <h3 style={{ margin: '0 0 10px', color: '#334155', fontSize: '1rem' }}>학생 활동과 학급 흐름</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                            {insights.map((item) => {
                                const active = activeInsight === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        aria-expanded={active}
                                        aria-controls="teacher-student-insight-panel"
                                        onClick={() => setActiveInsight(active ? null : item.id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '14px', minHeight: '74px', padding: '14px 16px', textAlign: 'left', borderRadius: '18px', cursor: 'pointer', border: active ? '2px solid #60A5FA' : '1px solid #DDE6EE', background: active ? '#EFF6FF' : 'white', color: '#263548' }}
                                    >
                                        <span aria-hidden="true" style={{ fontSize: '1.4rem' }}>{item.icon}</span>
                                        <span style={{ flex: 1 }}><strong style={{ display: 'block' }}>{item.label}</strong><small style={{ display: 'block', marginTop: '4px', color: '#718096' }}>{item.description}</small></span>
                                        <span aria-hidden="true">{active ? '−' : '+'}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {selectedInsight && (
                            <div id="teacher-student-insight-panel" style={{ marginTop: '14px', padding: isMobile ? '16px' : '22px', background: 'white', border: '1px solid #DDE6EE', borderRadius: '22px' }}>
                                <Suspense fallback={<PanelLoading>{selectedInsight.label}을 불러오는 중...</PanelLoading>}>
                                    {activeInsight === 'recent'
                                        ? <RecentActivity classId={activeClass.id} onPostClick={(post) => setSelectedActivityPost(post)} />
                                        : <ClassAnalysis classId={activeClass.id} isMobile={isMobile} />}
                                </Suspense>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default TeacherStudentHub;
