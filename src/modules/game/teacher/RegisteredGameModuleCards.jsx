import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { supabase } from '../../../lib/supabaseClient';
import {
    CONFIGURED_MARK,
    getAllModules,
    getLegacyModuleFields,
    resolveEnabledModuleIds
} from '../../registry';
import { saveEnabledModules } from '../../useEnabledModules';

const TEACHER_GAME_MODULES = getAllModules()
    .filter((module) => (
        module.part === 'game'
        && module.available !== false
        && typeof module.teacherEntry === 'function'
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
                <div style={{ padding: '28px', color: '#B91C1C', background: '#FEF2F2', borderRadius: '16px' }}>
                    관리 화면을 불러오지 못했습니다. 다른 콘텐츠는 계속 사용할 수 있습니다.
                </div>
            );
        }
        return this.props.children;
    }
}

const StatusSwitch = ({ isOn, disabled, onClick, compact = false }) => (
    <button
        type="button"
        role="switch"
        aria-checked={isOn}
        disabled={disabled}
        onClick={(event) => {
            event.stopPropagation();
            onClick();
        }}
        style={{
            border: 'none', borderRadius: '999px', padding: compact ? '5px 8px' : '7px 10px',
            background: isOn ? '#DCFCE7' : '#F1F5F9', color: isOn ? '#15803D' : '#64748B',
            display: 'inline-flex', alignItems: 'center', gap: '7px', cursor: disabled ? 'wait' : 'pointer',
            fontWeight: '900', fontSize: compact ? '0.72rem' : '0.8rem', opacity: disabled ? 0.65 : 1
        }}
    >
        <span style={{
            width: compact ? '9px' : '11px', height: compact ? '9px' : '11px', borderRadius: '50%',
            background: isOn ? '#22C55E' : '#94A3B8', boxShadow: isOn ? '0 0 0 3px rgba(34,197,94,.14)' : 'none'
        }} />
        {isOn ? 'ON' : 'OFF'}
    </button>
);

const StudentDashboardPreview = ({ enabledModules, selectedId, disabledPreviewModule = null }) => {
    const previewModules = enabledModules.length > 0 ? enabledModules : (disabledPreviewModule ? [disabledPreviewModule] : []);

    return (
    <div style={{
        border: '1px solid #FDE68A', borderRadius: '24px', padding: '20px',
        background: 'linear-gradient(180deg, #FFFDF5 0%, #FFF8E1 100%)'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '16px' }}>
            <div>
                <div style={{ color: '#92400E', fontWeight: '950' }}>학생 대시보드 미리보기</div>
                <div style={{ color: '#A16207', fontSize: '0.78rem', marginTop: '3px' }}>학생의 ‘아지트 놀이터’에 보이는 콘텐츠입니다.</div>
            </div>
            <span style={{ background: 'white', color: '#B45309', padding: '5px 9px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: '900' }}>
                {enabledModules.length}개 노출
            </span>
        </div>

        {previewModules.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                {previewModules.map((module) => {
                    const isDisabledPreview = enabledModules.length === 0 && disabledPreviewModule?.id === module.id;
                    return (
                    <div key={module.id} style={{
                        minHeight: '112px', padding: '14px', borderRadius: '18px',
                        background: module.playground?.background || 'white',
                        border: `2px solid ${module.id === selectedId ? '#6366F1' : (module.playground?.borderColor || '#E2E8F0')}`,
                        boxShadow: module.id === selectedId ? '0 0 0 3px rgba(99,102,241,.10)' : 'none',
                        opacity: isDisabledPreview ? 0.58 : 1, position: 'relative'
                    }}>
                        {isDisabledPreview && <span style={{ position: 'absolute', top: '10px', right: '10px', padding: '4px 7px', borderRadius: '999px', background: '#475569', color: 'white', fontSize: '0.62rem', fontWeight: '900' }}>현재 OFF</span>}
                        <div style={{ fontSize: '1.8rem' }}>{module.icon || '🎮'}</div>
                        <div style={{ marginTop: '8px', color: '#334155', fontWeight: '950', fontSize: '0.9rem' }}>
                            {module.playground?.name || module.name}
                        </div>
                        <div style={{ marginTop: '3px', color: '#64748B', fontSize: '0.7rem', lineHeight: 1.4 }}>
                            {module.playground?.description || module.description}
                        </div>
                    </div>
                    );
                })}
            </div>
        ) : (
            <div style={{ padding: '28px 16px', borderRadius: '16px', background: 'rgba(255,255,255,.75)', textAlign: 'center', color: '#A16207' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🎡</div>
                현재 학생에게 보이는 포인트 게임이 없습니다.
            </div>
        )}
    </div>
    );
};

const Overview = ({ modules, enabledIds, savingModuleId, onToggle, onSelect }) => {
    const enabledModules = modules.filter(({ module }) => enabledIds.includes(module.id)).map(({ module }) => module);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '18px', borderRadius: '18px', background: '#EEF2FF', border: '1px solid #C7D2FE' }}>
                    <div style={{ color: '#6366F1', fontSize: '0.78rem', fontWeight: '900' }}>전체 콘텐츠</div>
                    <div style={{ marginTop: '5px', color: '#312E81', fontSize: '1.7rem', fontWeight: '1000' }}>{modules.length}개</div>
                </div>
                <div style={{ padding: '18px', borderRadius: '18px', background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <div style={{ color: '#16A34A', fontSize: '0.78rem', fontWeight: '900' }}>학생에게 노출 중</div>
                    <div style={{ marginTop: '5px', color: '#166534', fontSize: '1.7rem', fontWeight: '1000' }}>{enabledModules.length}개</div>
                </div>
                <div style={{ padding: '18px', borderRadius: '18px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <div style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: '900' }}>비활성 콘텐츠</div>
                    <div style={{ marginTop: '5px', color: '#334155', fontSize: '1.7rem', fontWeight: '1000' }}>{modules.length - enabledModules.length}개</div>
                </div>
            </div>

            <StudentDashboardPreview enabledModules={enabledModules} />

            <div>
                <h3 style={{ margin: '0 0 12px', color: '#1E293B', fontSize: '1rem' }}>전체 콘텐츠 빠른 설정</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {modules.map(({ module }) => {
                        const isOn = enabledIds.includes(module.id);
                        return (
                            <button key={module.id} type="button" onClick={() => onSelect(module.id)} style={{
                                padding: '14px', border: '1px solid #E2E8F0', borderRadius: '16px', background: 'white',
                                display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', cursor: 'pointer'
                            }}>
                                <span style={{ fontSize: '1.8rem' }}>{module.icon || '🎮'}</span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', color: '#334155', fontWeight: '950' }}>{module.name}</span>
                                    <span style={{ display: 'block', marginTop: '2px', color: '#94A3B8', fontSize: '0.7rem' }}>세부 설정 열기</span>
                                </span>
                                <StatusSwitch isOn={isOn} disabled={!!savingModuleId} compact onClick={() => onToggle(module.id)} />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const RegisteredGameModuleCards = ({ activeClass, isMobile }) => {
    const classId = activeClass?.id;
    const [selectedId, setSelectedId] = useState('overview');
    const [enabledIds, setEnabledIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [savingModuleId, setSavingModuleId] = useState(null);

    const loadSettings = useCallback(async () => {
        if (!classId) return;
        const fields = ['enabled_modules', ...getLegacyModuleFields()].join(', ');
        const { data, error } = await supabase.from('classes').select(fields).eq('id', classId).maybeSingle();
        if (error) {
            setLoadError(error);
        } else {
            setLoadError(null);
            setEnabledIds(resolveEnabledModuleIds(data?.enabled_modules, data).filter((id) => id !== CONFIGURED_MARK));
        }
        setLoading(false);
    }, [classId]);

    useEffect(() => {
        // 외부 Supabase 설정과 컴포넌트 상태를 동기화한다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadSettings();
    }, [loadSettings]);

    const selected = useMemo(
        () => TEACHER_GAME_MODULES.find(({ module }) => module.id === selectedId) || null,
        [selectedId]
    );
    const enabledModules = TEACHER_GAME_MODULES.filter(({ module }) => enabledIds.includes(module.id)).map(({ module }) => module);

    const handleToggle = async (moduleId) => {
        if (loading || loadError || savingModuleId) return;
        const previousIds = enabledIds;
        const nextIds = previousIds.includes(moduleId)
            ? previousIds.filter((id) => id !== moduleId)
            : [...previousIds, moduleId];
        setEnabledIds(nextIds);
        setSavingModuleId(moduleId);
        const { data, error } = await saveEnabledModules(classId, nextIds);
        setSavingModuleId(null);
        if (error || !data) {
            setEnabledIds(previousIds);
            window.alert('학생 화면 노출 설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '250px minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>
            <aside style={{
                position: isMobile ? 'static' : 'sticky', top: '18px', padding: '12px', borderRadius: '22px',
                background: '#F1F5F9', border: '1px solid #E2E8F0', display: 'flex',
                flexDirection: isMobile ? 'row' : 'column', gap: '7px', overflowX: isMobile ? 'auto' : 'visible'
            }}>
                <button type="button" onClick={() => setSelectedId('overview')} style={navStyle(selectedId === 'overview', isMobile)}>
                    <span style={{ fontSize: '1.25rem' }}>🧭</span>
                    <span style={{ flex: 1, whiteSpace: 'nowrap', textAlign: 'left', fontWeight: '950' }}>전체 현황</span>
                    <span style={{ color: '#64748B', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{enabledModules.length}/{TEACHER_GAME_MODULES.length}</span>
                </button>
                {TEACHER_GAME_MODULES.map(({ module }) => {
                    const isOn = enabledIds.includes(module.id);
                    return (
                        <button key={module.id} type="button" onClick={() => setSelectedId(module.id)} style={navStyle(selectedId === module.id, isMobile)}>
                            <span style={{ fontSize: '1.3rem' }}>{module.icon || '🎮'}</span>
                            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left', fontWeight: '900' }}>{module.name}</span>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: isOn ? '#22C55E' : '#94A3B8', flex: '0 0 auto' }} />
                        </button>
                    );
                })}
            </aside>

            <section style={{ minWidth: 0, padding: isMobile ? '18px' : '26px', border: '1px solid #E2E8F0', borderRadius: '24px', background: 'white', boxShadow: '0 12px 36px rgba(15,23,42,.04)' }}>
                {loading ? (
                    <div style={{ padding: '70px 20px', textAlign: 'center', color: '#94A3B8', fontWeight: '900' }}>콘텐츠 설정을 불러오는 중입니다...</div>
                ) : loadError ? (
                    <div style={{ padding: '50px 20px', textAlign: 'center', color: '#B91C1C' }}>
                        설정을 불러오지 못했습니다.
                        <div><Button onClick={loadSettings} style={{ marginTop: '14px' }}>다시 시도</Button></div>
                    </div>
                ) : selected ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingBottom: '20px', marginBottom: '20px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '2.3rem' }}>{selected.module.icon || '🎮'}</span>
                            <div style={{ flex: 1, minWidth: '160px' }}>
                                <h2 style={{ margin: 0, color: '#1E293B', fontSize: '1.35rem' }}>{selected.module.name}</h2>
                                <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.82rem' }}>{selected.module.description}</p>
                            </div>
                            <StatusSwitch
                                isOn={enabledIds.includes(selected.module.id)}
                                disabled={!!savingModuleId}
                                onClick={() => handleToggle(selected.module.id)}
                            />
                        </div>
                        <StudentDashboardPreview
                            enabledModules={enabledIds.includes(selected.module.id) ? [selected.module] : []}
                            selectedId={selected.module.id}
                            disabledPreviewModule={enabledIds.includes(selected.module.id) ? null : selected.module}
                        />
                        <div style={{ marginTop: '22px' }}>
                            <ModuleErrorBoundary key={selected.module.id} moduleName={selected.module.name}>
                                <Suspense fallback={<div style={{ padding: '50px', textAlign: 'center', color: '#94A3B8' }}>{selected.module.icon} 세부 설정을 불러오는 중입니다...</div>}>
                                    <selected.TeacherEntry activeClass={activeClass} isMobile={isMobile} module={selected.module} />
                                </Suspense>
                            </ModuleErrorBoundary>
                        </div>
                    </>
                ) : (
                    <Overview
                        modules={TEACHER_GAME_MODULES}
                        enabledIds={enabledIds}
                        savingModuleId={savingModuleId}
                        onToggle={handleToggle}
                        onSelect={setSelectedId}
                    />
                )}
            </section>
        </div>
    );
};

const navStyle = (active, isMobile) => ({
    width: isMobile ? 'auto' : '100%', minWidth: isMobile ? '170px' : 0, padding: '12px 13px',
    border: active ? '1px solid #C7D2FE' : '1px solid transparent', borderRadius: '14px',
    background: active ? 'white' : 'transparent', color: active ? '#4338CA' : '#475569',
    display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer',
    boxShadow: active ? '0 6px 18px rgba(15,23,42,.06)' : 'none'
});

export default RegisteredGameModuleCards;
