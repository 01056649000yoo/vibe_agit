import React, { lazy, Suspense } from 'react';

const StudentManager = lazy(() => import('./StudentManager'));

const PanelLoading = ({ children }) => (
    <div role="status" style={{ minHeight: '180px', display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '700' }}>{children}</div>
);

const cardStyle = (isMobile) => ({
    minWidth: 0, background: 'white', borderRadius: '18px',
    padding: isMobile ? '14px' : '16px 18px 18px',
    border: '1px solid #E2E8F0', boxShadow: '0 3px 12px rgba(15, 23, 42, 0.04)'
});

const TeacherStudentHub = ({ activeClass, isMobile, onNavigate }) => {
    const classId = activeClass?.id;
    if (!classId) return null;

    return (
        <section role="tabpanel" aria-label="학생 명단 관리" style={cardStyle(isMobile)}>
            <Suspense fallback={<PanelLoading>학생 명단을 준비하는 중...</PanelLoading>}>
                <StudentManager
                    activeClass={activeClass}
                    classId={classId}
                    isDashboardMode={false}
                    onOpenStudentAgit={(student) => onNavigate?.({
                        tab: 'student-agits',
                        kind: 'student-agit',
                        studentId: student.id
                    })}
                />
            </Suspense>
        </section>
    );
};

export default TeacherStudentHub;
