import React, { lazy, useState } from 'react';
import TeacherSettingsTab from './TeacherSettingsTab';

const ClassManager = lazy(() => import('./ClassManager'));

const SETTINGS_ITEMS = [
    { id: 'class', icon: '🏫', label: '학급 관리', description: '학급 생성·전환·보관' },
    { id: 'feedback', icon: '🤖', label: 'AI 피드백', description: '학생 피드백 규칙' },
    { id: 'report', icon: '📋', label: '평어 도우미', description: '평어 작성 규칙' },
    { id: 'writing-editor', icon: '✍️', label: '글쓰기 창 관리', description: '글쓰기 화면 설정' }
];

const TeacherSettingsHub = ({
    isMobile, session, classes, activeClass, setActiveClass, setClasses,
    profile, fetchAllClasses, fetchDeletedClasses, handleRestoreClass, handleSetPrimaryClass,
    handleTestAIConnection, testingKey, aiStatus,
    setPromptTemplate, setReportPromptTemplate, onNavigate
}) => {
    const [section, setSection] = useState('class');
    const selected = SETTINGS_ITEMS.find((item) => item.id === section) || SETTINGS_ITEMS[0];

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '210px minmax(0, 1fr)',
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
                                minWidth: isMobile ? '148px' : 0, width: isMobile ? 'auto' : '100%', padding: '12px',
                                border: active ? '1px solid #C7D7FE' : '1px solid transparent', borderRadius: '12px',
                                background: active ? 'white' : 'transparent', color: active ? '#315FC4' : '#526176',
                                boxShadow: active ? '0 4px 14px rgba(37,99,235,.09)' : 'none', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '9px', textAlign: 'left', whiteSpace: 'nowrap'
                            }}>
                                <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                <span style={{ minWidth: 0 }}>
                                    <strong style={{ display: 'block', fontSize: '0.86rem' }}>{item.label}</strong>
                                    {!isMobile && <span style={{ display: 'block', marginTop: '2px', color: '#94A3B8', fontSize: '0.66rem' }}>{item.description}</span>}
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
                    <section style={{ padding: isMobile ? '28px 20px' : '40px', border: '1px solid #DCE6EE', borderRadius: '20px', background: 'white', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.2rem' }}>✍️</div>
                        <h3 style={{ margin: '12px 0 6px', color: '#334155' }}>글쓰기 창 설정 공간</h3>
                        <p style={{ margin: '0 auto', maxWidth: '520px', color: '#64748B', fontSize: '0.86rem', lineHeight: 1.6 }}>
                            학생 글쓰기 창의 표시 방식과 글쓰기 지원 기능을 업데이트할 때 이곳에서 한 번에 관리할 수 있도록 준비했습니다.
                        </p>
                        <span style={{ display: 'inline-block', marginTop: '16px', padding: '6px 10px', borderRadius: '999px', background: '#F1F5F9', color: '#64748B', fontSize: '0.72rem', fontWeight: '900' }}>업데이트 예정</span>
                    </section>
                ) : (
                    <TeacherSettingsTab
                        isMobile={isMobile} promptKind={section} compact
                        handleTestAIConnection={handleTestAIConnection}
                        testingKey={testingKey} aiStatus={aiStatus}
                        setPromptTemplate={setPromptTemplate} setReportPromptTemplate={setReportPromptTemplate}
                    />
                )}
            </main>
        </div>
    );
};

export default TeacherSettingsHub;
