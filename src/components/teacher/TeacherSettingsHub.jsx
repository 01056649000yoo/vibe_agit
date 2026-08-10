import React, { lazy, useState } from 'react';
import TeacherSettingsTab from './TeacherSettingsTab';
import { getAllModules } from '../../modules/registry';
import { PRESET_KIND } from '../../hooks/useAiPromptPresets';

const ClassManager = lazy(() => import('./ClassManager'));
const TeacherWritingEditorManager = lazy(() => import('../../modules/writing/editor-settings/TeacherWritingEditorManager'));

// 등록 모듈 설정도 모두 이 슬롯 안에 들어온다. 메뉴마다 폭을 다시 정하지 않도록
// 데스크톱 폭·항목 여백·모바일 최소 폭을 공통 호스트에서 고정한다.
const SETTINGS_NAV_WIDTH = '270px';
const SETTINGS_MOBILE_ITEM_WIDTH = '184px';

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
                        <strong style={{ color: '#172033', fontSize: '1rem' }}>⚙️ 설정</strong>
                        <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: '0.72rem', lineHeight: 1.45 }}>필요한 항목만 골라 관리하세요.</p>
                    </div>
                )}
                <nav aria-label="설정 메뉴" style={{
                    display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '6px',
                    overflowX: isMobile ? 'auto' : 'visible', scrollbarWidth: 'thin'
                }}>
                    {SETTINGS_ITEMS.map((item) => {
                        const active = item.id === section;
                        return (
                            <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={active ? 'page' : undefined} style={{
                                minWidth: isMobile ? SETTINGS_MOBILE_ITEM_WIDTH : 0, width: isMobile ? SETTINGS_MOBILE_ITEM_WIDTH : '100%',
                                minHeight: isMobile ? '58px' : '68px', padding: isMobile ? '11px 14px' : '13px 15px',
                                border: active ? '1px solid #C7D7FE' : '1px solid transparent', borderRadius: '12px',
                                background: active ? 'white' : 'transparent', color: active ? '#315FC4' : '#526176',
                                boxShadow: active ? '0 4px 14px rgba(37,99,235,.09)' : 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', whiteSpace: 'nowrap',
                                boxSizing: 'border-box', overflow: 'hidden'
                            }}>
                                <span aria-hidden="true" style={{ flex: '0 0 25px', width: '25px', fontSize: '1.1rem', textAlign: 'center' }}>{item.icon}</span>
                                <span style={{ flex: 1, minWidth: 0, paddingRight: '2px', overflow: 'hidden' }}>
                                    <strong title={item.label} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.86rem' }}>{item.label}</strong>
                                    {!isMobile && <span title={item.description} style={{ display: 'block', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', color: '#94A3B8', fontSize: '0.68rem' }}>{item.description}</span>}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <main style={{ minWidth: 0 }}>
                <div style={{ marginBottom: '14px' }}>
                    <h2 style={{ margin: 0, color: '#172033', fontSize: isMobile ? '1.25rem' : '1.4rem' }}>{selected.icon} {selected.label}</h2>
                    <p style={{ margin: '5px 0 0', color: '#64748B', fontSize: '0.82rem' }}>{selected.description}</p>
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
                        <div role="tablist" aria-label="AI 작성 기준 종류" style={{
                            display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px',
                            maxWidth: '920px', margin: '0 auto 10px', padding: '6px', borderRadius: '14px',
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
                                        <strong style={{ display: 'block', fontSize: isMobile ? '0.82rem' : '0.9rem' }}>{tab.icon} {tab.label}</strong>
                                        {!isMobile && <span style={{ display: 'block', marginTop: '3px', color: '#94A3B8', fontSize: '0.7rem' }}>{tab.description}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <TeacherSettingsTab
                            isMobile={isMobile} promptKind={promptKind} compact
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
