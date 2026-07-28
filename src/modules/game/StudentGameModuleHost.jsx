import React, { lazy, Suspense } from 'react';
import { getAllModules } from '../registry';

const STUDENT_ENTRIES = new Map(
    getAllModules()
        .filter((module) => module.part === 'game' && typeof module.studentEntry === 'function')
        .map((module) => [module.id, lazy(module.studentEntry)])
);

class StudentModuleErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error(`[아지트 놀이터] ${this.props.moduleName} 실행 오류:`, error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#FFFDF7' }}>
                    <div style={{ maxWidth: '420px', textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🛠️</div>
                        <h2 style={{ color: '#7F1D1D' }}>게임을 여는 중 문제가 생겼어요.</h2>
                        <p style={{ color: '#64748B' }}>다른 놀이는 계속 사용할 수 있어요. 잠시 뒤 다시 시도해주세요.</p>
                        <button
                            type="button"
                            onClick={this.props.onBack}
                            style={{ padding: '11px 18px', border: 'none', borderRadius: '12px', background: '#4F46E5', color: 'white', fontWeight: '900', cursor: 'pointer' }}
                        >
                            놀이터로 돌아가기
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

/**
 * 신규 게임 모듈의 학생 공통 진입 계약.
 * studentEntry는 아래 props만 사용하면 StudentDashboard 수정 없이 놀이터에서 열린다.
 */
const StudentGameModuleHost = ({ module, studentSession, isMobile, points, onPointsChange, onBack }) => {
    if (!module?.studentEntry || module.playground?.entryMode === 'legacy') return null;
    const StudentEntry = STUDENT_ENTRIES.get(module.id);
    if (!StudentEntry) return null;

    return (
        <StudentModuleErrorBoundary key={module.id} moduleName={module.name} onBack={onBack}>
            <Suspense fallback={(
                <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#FFFDF7', color: '#8D6E63', fontWeight: '900' }}>
                    {module.icon || '🎮'} {module.name} 입장 중...
                </div>
            )}>
                {React.createElement(StudentEntry, {
                    studentSession,
                    isMobile,
                    points,
                    onPointsChange,
                    onBack,
                    module
                })}
            </Suspense>
        </StudentModuleErrorBoundary>
    );
};

export default StudentGameModuleHost;
