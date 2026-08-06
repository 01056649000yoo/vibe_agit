import React, { lazy, Suspense } from 'react';

const RecentActivity = lazy(() => import('./RecentActivity'));
const ClassAnalysis = lazy(() => import('./ClassAnalysis'));
const TeacherCommentManager = lazy(() => import('./TeacherCommentManager'));

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

/** 학급 전체 흐름만 담당한다. 학생 개인 정보·코드·포인트 관리는 학생 탭에 둔다. */
const TeacherOperationsHub = ({ activeClass, isMobile, section, setSelectedActivityPost, onNavigate }) => {
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
