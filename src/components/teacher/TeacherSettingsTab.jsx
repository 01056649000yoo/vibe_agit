import React, { lazy } from 'react';
import Button from '../common/Button';

const ClassManager = lazy(() => import('./ClassManager'));
const StudentManager = lazy(() => import('./StudentManager'));

const TeacherSettingsTab = ({
    session,
    classes,
    activeClass,
    setActiveClass,
    setClasses,
    fetchAllClasses,
    handleSetPrimaryClass,
    profile,
    isMobile,
    geminiKey,
    setGeminiKey,
    isKeyVisible,
    setIsKeyVisible,
    handleTestGeminiKey,
    savingKey,
    testingKey,
    originalKey,
    maskKey,
    promptTemplate,
    setPromptTemplate,
    handleSaveTeacherSettings,
    originalPrompt,
    fetchDeletedClasses,
    onRestoreClass
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
            {/* 1. 상단: 학급 추가/선택 배너 (가로 와이드) */}
            <section style={{
                background: 'white', borderRadius: '24px', padding: isMobile ? '16px' : '24px',
                border: '1px solid #E9ECEF', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                width: '100%', boxSizing: 'border-box', overflow: 'hidden'
            }}>
                <ClassManager
                    userId={session.user.id}
                    classes={classes}
                    activeClass={activeClass}
                    setActiveClass={setActiveClass}
                    setClasses={setClasses}
                    onClassDeleted={fetchAllClasses}
                    isMobile={isMobile}
                    primaryClassId={profile?.primary_class_id}
                    onSetPrimaryClass={handleSetPrimaryClass}
                    fetchDeletedClasses={fetchDeletedClasses}
                    onRestoreClass={onRestoreClass}
                />
            </section>

            {activeClass && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 5.5fr) minmax(0, 4.5fr)',
                    gap: '24px',
                    width: '100%',
                    boxSizing: 'border-box'
                }}>
                    {/* 2. 좌측: 학생 명단 및 계정 관리 */}
                    <section style={{
                        background: 'white', borderRadius: '24px', padding: isMobile ? '20px' : '28px',
                        border: '1px solid #E9ECEF', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                        width: '100%', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ flex: 1 }}>
                            <StudentManager classId={activeClass.id} isDashboardMode={false} />
                        </div>
                    </section>

                    {/* 3. 우측: AI 자동 피드백 보안 센터 */}
                    <section style={{
                        background: 'linear-gradient(135deg, #FFFFFF 0%, #F0F4F8 100%)',
                        borderRadius: '24px', padding: isMobile ? '20px' : '28px',
                        border: '1px solid #D1D9E6', boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                        width: '100%', boxSizing: 'border-box',
                        display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                            <span style={{ fontSize: '1.5rem' }}>🔐</span>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>AI 자동 피드백 보안 센터</h3>
                        </div>

                        <div style={{
                            background: 'white', padding: '20px', borderRadius: '18px', border: '1px solid #E9ECEF',
                            flex: 1, display: 'flex', flexDirection: 'column'
                        }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#7F8C8D', fontWeight: 'bold', marginBottom: '10px' }}>
                                Gemini API Key
                            </label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input
                                        type={isKeyVisible ? "text" : "password"}
                                        value={geminiKey}
                                        onChange={(e) => setGeminiKey(e.target.value)}
                                        placeholder="키를 입력해 주세요 (AI...)"
                                        style={{
                                            width: '100%', padding: '12px 16px', borderRadius: '12px',
                                            border: '1px solid #DEE2E6', outline: 'none', transition: 'all 0.2s',
                                            fontSize: '0.9rem', color: '#2C3E50'
                                        }}
                                    />
                                    <button
                                        onClick={() => setIsKeyVisible(!isKeyVisible)}
                                        style={{
                                            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                            background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem'
                                        }}
                                    >
                                        {isKeyVisible ? '🙈' : '👁️'}
                                    </button>
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={handleTestGeminiKey}
                                    disabled={savingKey || testingKey}
                                    style={{ borderRadius: '12px', minWidth: '90px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9', fontSize: '0.85rem' }}
                                >
                                    {testingKey ? '...' : '테스트'}
                                </Button>
                            </div>
                            {originalKey && (
                                <p style={{ marginTop: '10px', fontSize: '0.75rem', color: '#95A5A6' }}>
                                    사용 중인 키: <code style={{ background: '#F8F9FA', padding: '2px 4px', borderRadius: '4px' }}>{maskKey(originalKey)}</code>
                                </p>
                            )}

                            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px dashed #DEE2E6', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: '#7F8C8D', fontWeight: 'bold', marginBottom: '8px' }}>
                                    AI 피드백 프롬프트
                                </label>
                                <textarea
                                    value={promptTemplate}
                                    onChange={(e) => setPromptTemplate(e.target.value)}
                                    placeholder="선생님만의 피드백 규칙을 입력하세요."
                                    style={{
                                        width: '100%', flex: 1, minHeight: '100px', padding: '12px', borderRadius: '12px',
                                        border: '1px solid #DEE2E6', fontSize: '0.85rem', lineHeight: '1.5',
                                        color: '#2C3E50', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                                    }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                                    <Button
                                        onClick={handleSaveTeacherSettings}
                                        disabled={savingKey || (geminiKey === originalKey && promptTemplate === originalPrompt)}
                                        size="sm"
                                        style={{ borderRadius: '10px', padding: '8px 20px' }}
                                    >
                                        {savingKey ? '저장 중...' : '설정 저장'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

export default TeacherSettingsTab;
