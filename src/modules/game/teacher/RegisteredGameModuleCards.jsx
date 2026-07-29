import React, { lazy, Suspense, useState } from 'react';
import Card from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import { getAllModules } from '../../registry';

const REGISTERED_TEACHER_MODULES = getAllModules()
    .filter((module) => (
        module.part === 'game'
        && module.available !== false
        && typeof module.teacherEntry === 'function'
        && module.management?.legacy !== true
    ))
    .sort((a, b) => (a.management?.order ?? 100) - (b.management?.order ?? 100))
    .map((module) => ({ module, TeacherEntry: lazy(module.teacherEntry) }));

class ModuleErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error(`[포인트·놀이 모듈] ${this.props.moduleName} 관리 화면 오류:`, error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '24px', color: '#B91C1C', background: '#FEF2F2', fontSize: '0.85rem' }}>
                    관리 화면을 불러오지 못했습니다. 다른 모듈은 계속 사용할 수 있습니다.
                </div>
            );
        }
        return this.props.children;
    }
}

const ModulePowerButton = ({ module, enabledModuleIds, savingModuleId, moduleLoadError, onToggle, isMobile }) => {
    if (typeof onToggle !== 'function') return null;
    const theme = module.management || {};
    const activeColor = theme.activeColor || '#4F46E5';
    const isOn = enabledModuleIds?.includes(module.id) ?? false;
    const isLoading = enabledModuleIds === null && !moduleLoadError;
    const isSaving = savingModuleId === module.id;
    const disabled = isLoading || moduleLoadError || !!savingModuleId;
    const statusText = moduleLoadError ? '불러오기 실패' : isLoading ? '확인 중' : isSaving ? '저장 중' : isOn ? 'ON' : 'OFF';

    return (
        <button
            type="button"
            onClick={() => onToggle(module.id, module.name)}
            disabled={disabled}
            aria-pressed={isOn}
            title={moduleLoadError ? '기능 설정을 불러오지 못했습니다. 화면을 새로고침해주세요.' : `${module.name} 학생 화면 노출 ${isOn ? '끄기' : '켜기'}`}
            style={{
                minWidth: isMobile ? '112px' : '130px', padding: '9px 12px', borderRadius: '12px',
                border: `2px solid ${isOn ? activeColor : '#D5D9DD'}`,
                background: isOn ? 'rgba(255,255,255,0.92)' : '#F8F9FA',
                color: isOn ? activeColor : '#7F8C8D', cursor: disabled ? 'wait' : 'pointer',
                opacity: disabled && !isSaving ? 0.65 : 1, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: '8px', fontWeight: '900'
            }}
        >
            <span style={{ fontSize: '0.72rem' }}>학생 화면</span>
            <span style={{ fontSize: '0.82rem' }}>{statusText}</span>
        </button>
    );
};

const RegisteredGameModuleCard = ({ module, TeacherEntry, activeClass, isMobile, controls }) => {
    const [isOpen, setIsOpen] = useState(false);
    const theme = module.management || {};

    if (theme.ownsCard) {
        return (
            <ModuleErrorBoundary moduleName={module.name}>
                <Suspense fallback={<div style={{ padding: '28px', textAlign: 'center', color: '#94A3B8' }}>{module.icon} 관리 화면을 불러오는 중입니다...</div>}>
                    <TeacherEntry activeClass={activeClass} isMobile={isMobile} module={module} />
                </Suspense>
            </ModuleErrorBoundary>
        );
    }

    return (
        <Card style={{
            padding: 0, border: '1px solid #E9ECEF', overflow: 'hidden', display: 'flex',
            flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.03)'
        }}>
            <div style={{
                padding: '24px', background: theme.headerBackground || 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                borderBottom: `1px solid ${theme.borderColor || '#C7D2FE'}`, display: 'flex',
                alignItems: 'center', gap: '16px', flexWrap: 'wrap'
            }}>
                <div style={{
                    width: '60px', height: '60px', background: 'white', borderRadius: '18px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.2rem',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.15)'
                }}>
                    {module.icon || '🎮'}
                </div>
                <div style={{ flex: 1, minWidth: '140px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', color: theme.titleColor || '#312E81', fontWeight: '900' }}>
                        {theme.title || `${module.name} 관리`}
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: theme.subtitleColor || '#6366F1', fontWeight: 'bold' }}>
                        {theme.subtitle || module.description}
                    </span>
                </div>
                <ModulePowerButton module={module} isMobile={isMobile} {...controls} />
            </div>

            <div style={{ padding: '20px 24px' }}>
                {!isOpen ? (
                    <Button
                        type="button"
                        onClick={() => setIsOpen(true)}
                        style={{ width: '100%', borderRadius: '12px', background: theme.activeColor || '#4F46E5', color: 'white', fontWeight: '900' }}
                    >
                        ⚙️ 관리 열기
                    </Button>
                ) : (
                    <ModuleErrorBoundary moduleName={module.name}>
                        <Suspense fallback={<div style={{ padding: '28px', textAlign: 'center', color: '#94A3B8' }}>관리 화면을 불러오는 중입니다...</div>}>
                            <TeacherEntry
                                activeClass={activeClass}
                                isMobile={isMobile}
                                module={module}
                                onCollapse={() => setIsOpen(false)}
                            />
                        </Suspense>
                    </ModuleErrorBoundary>
                )}
            </div>
        </Card>
    );
};

const RegisteredGameModuleCards = ({ activeClass, isMobile, ...controls }) => {
    return REGISTERED_TEACHER_MODULES.map(({ module, TeacherEntry }) => (
        <RegisteredGameModuleCard
            key={module.id}
            module={module}
            TeacherEntry={TeacherEntry}
            activeClass={activeClass}
            isMobile={isMobile}
            controls={controls}
        />
    ));
};

export default RegisteredGameModuleCards;
