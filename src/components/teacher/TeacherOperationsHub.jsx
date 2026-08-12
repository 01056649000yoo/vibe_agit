import React, { lazy, Suspense } from 'react';

const RecentActivity = lazy(() => import('./RecentActivity'));
const ClassAnalysis = lazy(() => import('./ClassAnalysis'));
const TeacherCommentManager = lazy(() => import('./TeacherCommentManager'));
const TeacherStudentAgitViewer = lazy(() => import('./TeacherStudentAgitViewer'));

const PanelLoading = ({ children }) => (
    <div role="status" style={{ minHeight: '180px', display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '700' }}>{children}</div>
);

const cardStyle = (isMobile) => ({
    minWidth: 0,
    background: 'white',
    borderRadius: '18px',
    padding: isMobile ? '14px' : '16px 18px 18px',
    border: '1px solid #E2E8F0',
    boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)'
});

/** 학급 운영 흐름과 학생 아지트 읽기 전용 보기를 담당한다. 개인 정보·코드·포인트 변경은 학생 탭에 둔다. */
const TeacherOperationsHub = ({
    activeClass,
    isMobile,
    section,
    setSelectedActivityPost,
    onNavigate,
    navigationTarget,
    onNavigationHandled
}) => {
    const classId = activeClass?.id;
    if (!classId) return null;

    if (section === 'comments') {
        return (
            <section role="tabpanel" aria-label="학생 댓글 관리" style={cardStyle(isMobile)}>
                <Suspense fallback={<PanelLoading>학생 댓글을 모으는 중... 🗨️</PanelLoading>}>
                    <TeacherCommentManager activeClass={activeClass} />
                </Suspense>
            </section>
        );
    }

    if (section === 'student-agits') {
        return (
            <section role="tabpanel" aria-label="학생 아지트 보기" style={cardStyle(isMobile)}>
                <Suspense fallback={<PanelLoading>학생 아지트를 준비하는 중... 🏡</PanelLoading>}>
                    <TeacherStudentAgitViewer
                        activeClass={activeClass}
                        isMobile={isMobile}
                        navigationTarget={navigationTarget}
                        onNavigationHandled={onNavigationHandled}
                    />
                </Suspense>
            </section>
        );
    }

    return section === 'recent-activity' ? (
        <section role="tabpanel" aria-label="최근 활동" style={cardStyle(isMobile)}>
            <Suspense fallback={<PanelLoading>최근 활동을 준비하는 중...</PanelLoading>}>
                <RecentActivity
                    classId={classId}
                    isMobile={isMobile}
                    onPostClick={(post) => setSelectedActivityPost(post)}
                />
            </Suspense>
        </section>
    ) : (
        <section role="tabpanel" aria-label="학급 운영 현황" style={cardStyle(isMobile)}>
            <Suspense fallback={<PanelLoading>학급 운영 현황을 준비하는 중...</PanelLoading>}>
                <ClassAnalysis classId={classId} isMobile={isMobile} onNavigate={onNavigate} />
            </Suspense>
        </section>
    );
};

export default TeacherOperationsHub;
