import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import FeatureAvailabilitySwitch from '../../../components/common/FeatureAvailabilitySwitch';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import { supabase } from '../../../lib/supabaseClient';
import {
    CONFIGURED_MARK,
    getAllModules,
    getLegacyModuleFields,
    resolveEnabledModuleIds
} from '../../registry';
import { saveEnabledModules } from '../../enabledModuleSettings';

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
        console.error(`[아지트 놀이터 모듈] ${this.props.moduleName} 관리 화면 오류:`, error);
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

const StudentDashboardPreview = ({ enabledModules, selectedId, disabledPreviewModule = null, compact = false }) => {
    const previewModules = enabledModules.length > 0 ? enabledModules : (disabledPreviewModule ? [disabledPreviewModule] : []);

    return (
    <div style={{
        border: '1px solid #FDE68A', borderRadius: compact ? '16px' : '24px', padding: compact ? '11px' : '20px',
        background: 'linear-gradient(180deg, #FFFDF5 0%, #FFF8E1 100%)'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: compact ? '8px' : '16px' }}>
            <div>
                <div style={{ color: '#92400E', fontWeight: '950', fontSize: compact ? '0.8rem' : '1rem' }}>학생 대시보드 미리보기</div>
                {compact ? null : <div style={{ color: '#A16207', fontSize: '0.78rem', marginTop: '3px' }}>학생의 ‘아지트 놀이터’에 보이는 콘텐츠입니다.</div>}
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
                        minHeight: compact ? '72px' : '112px', padding: compact ? '10px' : '14px', borderRadius: compact ? '13px' : '18px',
                        background: module.playground?.background || 'white',
                        border: `2px solid ${module.id === selectedId ? '#6366F1' : (module.playground?.borderColor || '#E2E8F0')}`,
                        boxShadow: module.id === selectedId ? '0 0 0 3px rgba(99,102,241,.10)' : 'none',
                        opacity: isDisabledPreview ? 0.58 : 1, position: 'relative'
                    }}>
                        {isDisabledPreview && <span style={{ position: 'absolute', top: '10px', right: '10px', padding: '4px 7px', borderRadius: '999px', background: '#475569', color: 'white', fontSize: '0.62rem', fontWeight: '900' }}>현재 OFF</span>}
                        <div style={{ fontSize: compact ? '1.3rem' : '1.8rem' }}>{module.icon || '🎮'}</div>
                        <div style={{ marginTop: compact ? '4px' : '8px', color: '#334155', fontWeight: '950', fontSize: compact ? '0.78rem' : '0.9rem' }}>
                            {module.playground?.name || module.name}
                        </div>
                        <div style={{ marginTop: '3px', color: '#64748B', fontSize: compact ? '0.62rem' : '0.7rem', lineHeight: 1.35 }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '10px' }}>
                    {modules.map(({ module }) => {
                        const isOn = enabledIds.includes(module.id);
                        return (
                            <div key={module.id} style={{
                                padding: '14px', border: '1px solid #E2E8F0', borderRadius: '16px', background: 'white',
                                display: 'flex', flexDirection: 'column', gap: '12px'
                            }}>
                                <button type="button" onClick={() => onSelect(module.id)} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', padding: 0, border: 0,
                                    background: 'transparent', textAlign: 'left', cursor: 'pointer'
                                }}>
                                    <span style={{ fontSize: '1.8rem' }}>{module.icon || '🎮'}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', color: '#334155', fontWeight: '950' }}>{module.name}</span>
                                        <span style={{ display: 'block', marginTop: '2px', color: '#94A3B8', fontSize: '0.7rem' }}>세부 설정 열기</span>
                                    </span>
                                </button>
                                <FeatureAvailabilitySwitch
                                    checked={isOn}
                                    loading={savingModuleId === module.id}
                                    disabled={Boolean(savingModuleId)}
                                    fullWidth
                                    onChange={() => onToggle(module.id)}
                                    enabledLabel={`${module.name} 사용 중`}
                                    disabledLabel={`${module.name} 사용 안 함`}
                                    enabledDescription="학생 놀이터에 이 콘텐츠가 보입니다."
                                    disabledDescription="기존 기록은 보관하고 학생 화면에서 숨깁니다."
                                    ariaLabel={`학생 ${module.name} 사용`}
                                />
                            </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '220px minmax(0, 1fr)', gap: '14px', alignItems: 'start' }}>
            <aside style={{
                position: isMobile ? 'static' : 'sticky', top: '12px', padding: '9px', borderRadius: '18px',
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

            <section style={{ minWidth: 0, padding: isMobile ? '14px' : '18px', border: '1px solid #E2E8F0', borderRadius: '20px', background: 'white', boxShadow: '0 10px 28px rgba(15,23,42,.04)' }}>
                {loading ? (
                    <div style={{ padding: '70px 20px', textAlign: 'center', color: '#94A3B8', fontWeight: '900' }}>콘텐츠 설정을 불러오는 중입니다...</div>
                ) : loadError ? (
                    <div style={{ padding: '50px 20px', textAlign: 'center', color: '#B91C1C' }}>
                        설정을 불러오지 못했습니다.
                        <div><Button onClick={loadSettings} style={{ marginTop: '14px' }}>다시 시도</Button></div>
                    </div>
                ) : selected ? (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '11px', paddingBottom: '12px', marginBottom: '10px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.8rem' }}>{selected.module.icon || '🎮'}</span>
                            <div style={{ flex: 1, minWidth: '160px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                    <h2 style={{ margin: 0, color: '#1E293B', fontSize: '1.15rem' }}>{selected.module.name}</h2>
                                    <TeacherGuideButton tabId={selected.module.id} />
                                </div>
                                <p style={{ margin: '3px 0 0', color: '#64748B', fontSize: '0.74rem' }}>{selected.module.description}</p>
                            </div>
                            <FeatureAvailabilitySwitch
                                checked={enabledIds.includes(selected.module.id)}
                                loading={savingModuleId === selected.module.id}
                                disabled={Boolean(savingModuleId)}
                                onChange={() => handleToggle(selected.module.id)}
                                enabledLabel={`${selected.module.name} 사용 중`}
                                disabledLabel={`${selected.module.name} 사용 안 함`}
                                enabledDescription="학생 놀이터에 이 콘텐츠가 보입니다."
                                disabledDescription="기존 기록은 보관하고 학생 화면에서 숨깁니다."
                                ariaLabel={`학생 ${selected.module.name} 사용`}
                            />
                        </div>
                        <details style={{ marginBottom: '11px', border: '1px solid #FDE68A', borderRadius: '13px', background: '#FFFDF5' }}>
                            <summary style={{ padding: '9px 11px', color: '#92400E', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '900' }}>
                                학생 화면 미리보기 · 필요할 때 펼치기
                            </summary>
                            <div style={{ padding: '0 9px 9px' }}>
                                <StudentDashboardPreview
                                    compact
                                    enabledModules={enabledIds.includes(selected.module.id) ? [selected.module] : []}
                                    selectedId={selected.module.id}
                                    disabledPreviewModule={enabledIds.includes(selected.module.id) ? null : selected.module}
                                />
                            </div>
                        </details>
                        <div>
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
    width: isMobile ? 'auto' : '100%', minWidth: isMobile ? '155px' : 0, padding: '9px 10px',
    border: active ? '1px solid #C7D2FE' : '1px solid transparent', borderRadius: '12px',
    background: active ? 'white' : 'transparent', color: active ? '#4338CA' : '#475569',
    display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer',
    boxShadow: active ? '0 6px 18px rgba(15,23,42,.06)' : 'none'
});

export default RegisteredGameModuleCards;
