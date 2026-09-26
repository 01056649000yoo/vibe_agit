import React, { lazy, useEffect, useState } from 'react';
import TeacherSideMenu from './TeacherSideMenu';
import { useRememberedChoice } from '../../hooks/useRememberedChoice';
import Button from '../common/Button';
import TeacherSettingsTab from './TeacherSettingsTab';
import TeacherPageTitle from './TeacherPageTitle';
import { getAllModules } from '../../modules/registry';
import { PRESET_KIND } from '../../hooks/useAiPromptPresets';
import { sectionAnchorId, tourAnchor } from '../../guides/teacherTour.js';

const ClassManager = lazy(() => import('./ClassManager'));
const DahandinIntegrationManager = lazy(() => import('./DahandinIntegrationManager'));

// 등록 모듈 설정도 모두 이 슬롯 안에 들어온다. 왼쪽 메뉴의 폭·여백은 공통 부품(TeacherSideMenu)이 정한다.

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
    // 글쓰기 창 관리는 학급 운영 → 학생 대시보드 미리보기로 옮겼다(2026-09-20, 같은 성격이라 통합).
    ...MODULE_SETTINGS_ITEMS,
    // 다했니 연동은 설정 목록 맨 아래에 둔다(사용자 요청 2026-09-16).
    { id: 'dahandin', icon: '🍪', label: '다했니 연동', description: '다했니 쿠키를 포인트로 정산' }
];
const SETTINGS_IDS = SETTINGS_ITEMS.map((item) => item.id);

const TeacherSettingsHub = ({
    isMobile, session, classes, activeClass, setActiveClass, setClasses,
    profile, fetchAllClasses, fetchDeletedClasses, handleRestoreClass, handleSetPrimaryClass,
    handleTestAIConnection, testingKey,
    setPromptTemplate, setReportPromptTemplate, onNavigate,
    navigationTarget, onNavigationHandled
}) => {
    const [section, setSection] = useRememberedChoice('teacher-settings-section-v1', SETTINGS_IDS);
    const [promptKind, setPromptKind] = useState(PRESET_KIND.FEEDBACK);
    const selected = SETTINGS_ITEMS.find((item) => item.id === section) || SETTINGS_ITEMS[0];
    const SelectedModuleEntry = selected.Entry;

    useEffect(() => {
        if (navigationTarget?.tab !== 'settings' || !navigationTarget.requestId) return;
        if (SETTINGS_ITEMS.some((item) => item.id === navigationTarget.section)) {
            // 활용 안내서의 화면 바로가기를 현재 설정 항목과 동기화한다.
            setSection(navigationTarget.section);
        }
        onNavigationHandled?.(navigationTarget.requestId);
    }, [navigationTarget, onNavigationHandled, setSection]);

    return (
        <div className={`teacher-side-layout${isMobile ? ' is-stacked' : ''}`}>
            <TeacherSideMenu
                horizontal={isMobile}
                heading="⚙️ 설정"
                note="필요한 항목만 골라 관리하세요."
                ariaLabel="설정 메뉴"
                activeId={section}
                onSelect={setSection}
                items={SETTINGS_ITEMS.map((item) => ({
                    id: item.id,
                    label: item.label,
                    icon: item.icon,
                    description: item.description,
                    anchor: tourAnchor(sectionAnchorId(item.id))
                }))}
            />

            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '14px' }}>
                    <div>
                        <TeacherPageTitle title={selected.label} guideTabId={`settings:${selected.id}`} />
                        <p style={{ margin: '6px 0 0', color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-md)', lineHeight: 1.55 }}>{selected.description}</p>
                    </div>
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
                ) : section === 'dahandin' ? (
                    <React.Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: '#94A3B8' }}>다했니 연동을 불러오는 중입니다...</div>}>
                        <DahandinIntegrationManager activeClass={activeClass} isMobile={isMobile} />
                    </React.Suspense>
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
            </div>
        </div>
    );
};

export default TeacherSettingsHub;
