import React, { lazy, Suspense, useState } from 'react';

const ClassAnalysis = lazy(() => import('./ClassAnalysis'));
const MissionManager = lazy(() => import('./MissionManager'));
const StudentManager = lazy(() => import('./StudentManager'));
const RecentActivity = lazy(() => import('./RecentActivity'));

const secondaryTools = [
    {
        id: 'students',
        icon: '👥',
        label: '학생 관리',
        description: '학생 코드와 포인트를 확인해요.',
        loadingLabel: '학생 목록을 불러오는 중...'
    },
    {
        id: 'recent',
        icon: '🕘',
        label: '최근 활동',
        description: '최근 제출과 활동 기록을 살펴봐요.',
        loadingLabel: '최근 활동을 불러오는 중...'
    },
    {
        id: 'analysis',
        icon: '📊',
        label: '학급 분석',
        description: '필요할 때 학급 통계를 열어봐요.',
        loadingLabel: '학급 분석을 불러오는 중...'
    }
];

const LoadingPanel = ({ label }) => (
    <div
        role="status"
        style={{
            minHeight: '220px', display: 'grid', placeItems: 'center', padding: '32px',
            borderRadius: '20px', background: '#F8FAFC', color: '#64748B', fontWeight: '700'
        }}
    >
        {label}
    </div>
);

const TeacherMissionTab = ({ activeClass, isMobile, setSelectedActivityPost }) => {
    const [activeTool, setActiveTool] = useState(null);
    const selectedTool = secondaryTools.find((tool) => tool.id === activeTool);

    const renderSelectedTool = () => {
        if (activeTool === 'students') {
            return <StudentManager activeClass={activeClass} classId={activeClass?.id} isDashboardMode={true} />;
        }

        if (activeTool === 'recent') {
            return (
                <RecentActivity
                    classId={activeClass?.id}
                    onPostClick={(post) => setSelectedActivityPost(post)}
                />
            );
        }

        if (activeTool === 'analysis') {
            return <ClassAnalysis classId={activeClass.id} isMobile={isMobile} />;
        }

        return null;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
            <section
                aria-labelledby="teacher-missions-heading"
                style={{
                    background: 'white', borderRadius: '24px', border: '1px solid #E2E8F0',
                    overflow: 'hidden', boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)',
                    width: '100%', boxSizing: 'border-box'
                }}
            >
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
                    flexDirection: isMobile ? 'column' : 'row', gap: '8px', padding: isMobile ? '18px 18px 0' : '24px 24px 0'
                }}>
                    <div>
                        <span style={{ color: '#2563EB', fontSize: '0.78rem', fontWeight: '900', letterSpacing: '0.08em' }}>
                            가장 먼저 할 일
                        </span>
                        <h2 id="teacher-missions-heading" style={{ margin: '5px 0 0', color: '#172033', fontSize: isMobile ? '1.25rem' : '1.45rem' }}>
                            선생님 과제
                        </h2>
                    </div>
                    <p style={{ margin: 0, color: '#64748B', fontSize: '0.9rem' }}>
                        과제를 만들고 학생 제출 현황을 확인하세요.
                    </p>
                </div>

                <div style={{ padding: isMobile ? '16px 18px 18px' : '18px 24px 24px' }}>
                    <Suspense fallback={<LoadingPanel label="과제 목록을 준비하는 중..." />}>
                        <MissionManager activeClass={activeClass} isDashboardMode={true} />
                    </Suspense>
                </div>
            </section>

            <section aria-labelledby="teacher-support-tools-heading">
                <div style={{ marginBottom: '14px' }}>
                    <h2 id="teacher-support-tools-heading" style={{ margin: 0, color: '#263548', fontSize: '1.15rem' }}>
                        필요할 때 열어보는 도구
                    </h2>
                    <p style={{ margin: '6px 0 0', color: '#718096', fontSize: '0.88rem', lineHeight: 1.6 }}>
                        첫 화면을 빠르게 열기 위해 선택한 도구만 불러옵니다.
                    </p>
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
                    gap: '12px'
                }}>
                    {secondaryTools.map((tool) => {
                        const isActive = activeTool === tool.id;
                        return (
                            <button
                                key={tool.id}
                                type="button"
                                aria-expanded={isActive}
                                aria-controls="teacher-support-tool-panel"
                                onClick={() => setActiveTool(isActive ? null : tool.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '14px', width: '100%', minHeight: '82px',
                                    padding: '15px 17px', textAlign: 'left', borderRadius: '18px', cursor: 'pointer',
                                    border: isActive ? '2px solid #60A5FA' : '1px solid #DDE6EE',
                                    background: isActive ? '#EFF6FF' : 'white',
                                    color: '#263548', boxShadow: isActive ? '0 7px 20px rgba(37, 99, 235, 0.10)' : 'none'
                                }}
                            >
                                <span aria-hidden="true" style={{ fontSize: '1.5rem' }}>{tool.icon}</span>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                    <strong style={{ display: 'block', fontSize: '0.96rem' }}>{tool.label}</strong>
                                    <small style={{ display: 'block', marginTop: '4px', color: '#718096', lineHeight: 1.45 }}>
                                        {tool.description}
                                    </small>
                                </span>
                                <span aria-hidden="true" style={{ color: '#64748B', fontWeight: '900' }}>{isActive ? '−' : '+'}</span>
                            </button>
                        );
                    })}
                </div>

                {selectedTool && (
                    <div
                        id="teacher-support-tool-panel"
                        style={{
                            marginTop: '14px', padding: isMobile ? '16px' : '22px', background: 'white',
                            border: '1px solid #DDE6EE', borderRadius: '22px', boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)'
                        }}
                    >
                        <Suspense fallback={<LoadingPanel label={selectedTool.loadingLabel} />}>
                            {renderSelectedTool()}
                        </Suspense>
                    </div>
                )}
            </section>
        </div>
    );
};

export default TeacherMissionTab;
