import React, { lazy, useEffect, useState } from 'react';
import Button from '../common/Button';
import TeacherSettingsTab from './TeacherSettingsTab';
import TeacherGuideButton from './TeacherGuideButton';
import { getAllModules } from '../../modules/registry';
import { PRESET_KIND } from '../../hooks/useAiPromptPresets';

const ClassManager = lazy(() => import('./ClassManager'));
const loadTeacherWritingEditorManager = () => import('../../modules/writing/editor-settings/TeacherWritingEditorManager');
const TeacherWritingEditorManager = lazy(loadTeacherWritingEditorManager);

// 등록 모듈 설정도 모두 이 슬롯 안에 들어온다. 메뉴마다 폭을 다시 정하지 않도록
// 데스크톱 폭·항목 여백·모바일 최소 폭을 공통 호스트에서 고정한다.
const SETTINGS_NAV_WIDTH = '300px';
const SETTINGS_MOBILE_ITEM_WIDTH = '200px';

const MODULE_SETTINGS_ITEMS = getAllModules()
    .filter((module) => module.available !== false && typeof module.settingsEntry === 'function')
    .sort((left, right) => (left.settings?.order ?? 100) - (right.settings?.order ?? 100))
    .map((module) => ({
        id: `module:${module.id}`,
        icon: module.icon || '🧩',
        label: module.settings?.label || module.name,
        description: module.settings?.description || module.description,
        Entry: lazy(module.settingsEntry),
        module
    }));

const SETTINGS_ITEMS = [
    { id: 'class', icon: '🏫', label: '학급 관리', description: '학급 생성·전환·보관' },
    { id: 'ai-prompts', icon: '🤖', label: '피드백·평어 기준', description: 'AI 피드백과 평어 작성 기준' },
    { id: 'writing-editor', icon: '✍️', label: '글쓰기 창 관리', description: '글쓰기 화면 설정' },
    ...MODULE_SETTINGS_ITEMS
];

const TeacherSettingsHub = ({
    isMobile, session, classes, activeClass, setActiveClass, setClasses,
    profile, fetchAllClasses, fetchDeletedClasses, handleRestoreClass, handleSetPrimaryClass,
    handleTestAIConnection, testingKey,
    setPromptTemplate, setReportPromptTemplate, onNavigate
}) => {
    const [section, setSection] = useState('class');
    const [promptKind, setPromptKind] = useState(PRESET_KIND.FEEDBACK);
    const selected = SETTINGS_ITEMS.find((item) => item.id === section) || SETTINGS_ITEMS[0];
    const SelectedModuleEntry = selected.Entry;

    useEffect(() => {
        const preload = () => void loadTeacherWritingEditorManager();
        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(preload, { timeout: 2500 });
            return () => window.cancelIdleCallback(idleId);
        }
        const timerId = window.setTimeout(preload, 1200);
        return () => window.clearTimeout(timerId);
    }, []);

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : `${SETTINGS_NAV_WIDTH} minmax(0, 1fr)`,
            gap: isMobile ? '12px' : '20px', alignItems: 'start', width: '100%'
        }}>
            <aside style={{
                position: isMobile ? 'static' : 'sticky', top: isMobile ? undefined : 0,
                padding: isMobile ? '9px' : '12px', borderRadius: '18px', background: '#E9EEF6', minWidth: 0
            }}>
                {!isMobile && (
                    <div style={{ padding: '7px 9px 13px' }}>
                        <strong style={{ color: '#172033', fontSize: 'var(--ui-text-lg)' }}>⚙️ 설정</strong>
                        <p style={{ margin: '5px 0 0', color: '#475569', fontSize: 'var(--ui-text-sm)', lineHeight: 1.5 }}>필요한 항목만 골라 관리하세요.</p>
                    </div>
                )}
                <nav aria-label="설정 메뉴" style={{
                    display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '6px',
                    overflowX: isMobile ? 'auto' : 'visible', scrollbarWidth: 'thin'
                }}>
                    {SETTINGS_ITEMS.map((item) => {
                        const active = item.id === section;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSection(item.id)}
                                onMouseEnter={item.id === 'writing-editor' ? loadTeacherWritingEditorManager : undefined}
                                onFocus={item.id === 'writing-editor' ? loadTeacherWritingEditorManager : undefined}
                                aria-current={active ? 'page' : undefined}
                                style={{
                                minWidth: isMobile ? SETTINGS_MOBILE_ITEM_WIDTH : 0, width: isMobile ? SETTINGS_MOBILE_ITEM_WIDTH : '100%',
                                minHeight: isMobile ? '64px' : '76px', padding: isMobile ? '11px 14px' : '13px 15px',
                                border: active ? '1px solid #C7D7FE' : '1px solid transparent', borderRadius: '12px',
                                background: active ? 'white' : 'transparent', color: active ? '#315FC4' : '#526176',
                                boxShadow: active ? '0 4px 14px rgba(37,99,235,.09)' : 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', whiteSpace: 'nowrap',
                                boxSizing: 'border-box', overflow: 'hidden'
                                }}
                            >
                                <span aria-hidden="true" style={{ flex: '0 0 25px', width: '25px', fontSize: '1.1rem', textAlign: 'center' }}>{item.icon}</span>
                                <span style={{ flex: 1, minWidth: 0, paddingRight: '2px', overflow: 'hidden' }}>
                                    <strong title={item.label} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 'var(--ui-text-md)' }}>{item.label}</strong>
                                    {!isMobile && <span title={item.description} style={{ display: 'block', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748B', fontSize: 'var(--ui-text-sm)' }}>{item.description}</span>}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <main style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#172033', fontSize: 'var(--ui-text-2xl)' }}>{selected.icon} {selected.label}</h2>
                        <p style={{ margin: '6px 0 0', color: '#475569', fontSize: 'var(--ui-text-md)', lineHeight: 1.55 }}>{selected.description}</p>
                    </div>
                    <TeacherGuideButton tabId={`settings:${selected.id}`} variant="help" />
                </div>

                {section === 'class' ? (
                    <ClassManager
                        userId={session.user.id} classes={classes} activeClass={activeClass}
                        setActiveClass={setActiveClass} setClasses={setClasses}
                        onClassDeleted={fetchAllClasses} isMobile={isMobile}
                        primaryClassId={profile?.primary_class_id} onSetPrimaryClass={handleSetPrimaryClass}
                        fetchDeletedClasses={fetchDeletedClasses} onRestoreClass={handleRestoreClass}
                        onNavigate={onNavigate}
                    />
                ) : section === 'writing-editor' ? (
                    <TeacherWritingEditorManager activeClass={activeClass} isMobile={isMobile} />
                ) : section === 'ai-prompts' ? (
                    <div>
                        {/* 종류 선택 줄 오른쪽이 넓게 비어 있었다. 카드 안에서 세로 한 줄을 먹던
                            안내와 `AI 연결 점검` 을 이 빈 자리로 올려 한 화면에 들어오게 한다. */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            flexWrap: 'wrap', gap: '12px', marginBottom: '12px'
                        }}>
                        <div role="tablist" aria-label="AI 작성 기준 종류" style={{
                            display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px',
                            flex: isMobile ? '1 1 100%' : '0 1 460px', margin: 0, padding: '6px', borderRadius: '14px',
                            background: '#E9EEF6', boxSizing: 'border-box'
                        }}>
                            {[
                                { id: PRESET_KIND.FEEDBACK, icon: '💬', label: '학생 피드백', description: '학생 글에 전하는 피드백 기준' },
                                { id: PRESET_KIND.REPORT, icon: '📋', label: '평어 작성', description: '평어 문장을 만드는 기준' }
                            ].map((tab) => {
                                const active = promptKind === tab.id;
                                return (
                                    <button
                                        key={tab.id} type="button" role="tab" aria-selected={active}
                                        onClick={() => setPromptKind(tab.id)}
                                        style={{
                                            minWidth: 0, padding: isMobile ? '11px 8px' : '12px 16px', borderRadius: '10px',
                                            border: active ? '1px solid #C7D7FE' : '1px solid transparent',
                                            background: active ? 'white' : 'transparent', color: active ? '#315FC4' : '#64748B',
                                            boxShadow: active ? '0 3px 10px rgba(37,99,235,.09)' : 'none', cursor: 'pointer',
                                            textAlign: 'left', boxSizing: 'border-box'
                                        }}
                                    >
                                        <strong style={{ display: 'block', fontSize: 'var(--ui-text-md)' }}>{tab.icon} {tab.label}</strong>
                                        {!isMobile && <span style={{ display: 'block', marginTop: '3px', color: '#64748B', fontSize: 'var(--ui-text-sm)' }}>{tab.description}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <p style={{ margin: 0, color: '#475569', fontSize: 'var(--ui-text-sm)' }}>고른 기준이 실제 AI 실행에 사용됩니다.</p>
                            <Button
                                type="button" variant="ghost" size="sm" onClick={handleTestAIConnection} disabled={testingKey}
                                title="AI 기능에 문제가 있을 때 연결 상태를 점검합니다"
                                style={{ padding: '6px 10px', color: '#64748B', background: '#F8FAFC', border: '1px solid #CBD5E1', boxShadow: 'none' }}
                            >
                                {testingKey ? '점검 중…' : '🔌 AI 연결 점검'}
                            </Button>
                        </div>
                        </div>
                        <TeacherSettingsTab
                            isMobile={isMobile} promptKind={promptKind} compact renderHeader={false}
                            handleTestAIConnection={handleTestAIConnection}
                            testingKey={testingKey}
                            setPromptTemplate={setPromptTemplate} setReportPromptTemplate={setReportPromptTemplate}
                        />
                    </div>
                ) : SelectedModuleEntry ? (
                    <React.Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>{selected.label}을 불러오는 중입니다...</div>}>
                        <SelectedModuleEntry activeClass={activeClass} isMobile={isMobile} module={selected.module} />
                    </React.Suspense>
                ) : (
                    <TeacherSettingsTab
                        isMobile={isMobile} promptKind={section} compact
                        handleTestAIConnection={handleTestAIConnection}
                        testingKey={testingKey}
                        setPromptTemplate={setPromptTemplate} setReportPromptTemplate={setReportPromptTemplate}
                    />
                )}
            </main>
        </div>
    );
};

export default TeacherSettingsHub;
