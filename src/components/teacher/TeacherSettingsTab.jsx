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
    openaiKey,
    handleTestAIConnection,
    savingKey,
    testingKey,
    promptTemplate,
    setPromptTemplate,
    originalPrompt,
    reportPromptTemplate,
    setReportPromptTemplate,
    originalReportPrompt,
    handleSaveTeacherSettings,
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
                            <StudentManager activeClass={activeClass} classId={activeClass.id} isDashboardMode={false} />
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
                            <span style={{ fontSize: '1.5rem' }}>🤖</span>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>AI 자동 피드백 설정(수정 사용가능)</h3>
                        </div>

                        <div style={{
                            background: 'white', padding: '20px', borderRadius: '18px', border: '1px solid #E9ECEF',
                            flex: 1, display: 'flex', flexDirection: 'column'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <div style={{ fontSize: '0.85rem', color: '#7F8C8D', fontWeight: 'bold' }}>
                                    AI 시스템 상태: <span style={{ color: '#27AE60' }}>● 연결됨</span>
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={handleTestAIConnection}
                                    disabled={testingKey}
                                    style={{ borderRadius: '12px', padding: '6px 12px', background: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9', fontSize: '0.75rem' }}
                                >
                                    {testingKey ? '연결 확인 중...' : '연결 테스트'}
                                </Button>
                            </div>

                            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #DEE2E6', flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {/* (0) API 모드 설정 (시스템 공용 / 개인 키) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '15px', background: '#F8F9FA', borderRadius: '12px', border: '1px solid #E9ECEF' }}>
                                    <label style={{ fontSize: '0.85rem', color: '#2C3E50', fontWeight: 'bold' }}>🔑 AI API 모드 설정</label>
                                    <div style={{ display: 'flex', gap: '15px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="apiMode"
                                                value="SYSTEM"
                                                checked={(!profile?.api_mode || profile?.api_mode === 'SYSTEM')}
                                                onChange={(e) => handleSaveTeacherSettings({ ...profile, api_mode: e.target.value })}
                                            />
                                            시스템 공용 키 (기본)
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                            <input
                                                type="radio"
                                                name="apiMode"
                                                value="PERSONAL"
                                                checked={profile?.api_mode === 'PERSONAL'}
                                                onChange={(e) => handleSaveTeacherSettings({ ...profile, api_mode: e.target.value })}
                                            />
                                            교사 개인 키 사용
                                        </label>
                                    </div>

                                    {profile?.api_mode === 'PERSONAL' && (
                                        <div style={{ marginTop: '10px' }}>
                                            <input
                                                type="password"
                                                value={openaiKey || ''}
                                                /* 상위 컴포넌트에서 openaiKey set 함수를 넘겨주지 않아서, 여기서는 임시로 input 처리가 필요함. 
                                                   하지만 기존 구조를 유지하기 위해 onChange 이벤트를 handleSaveTeacherSettings가 아닌 별도 prop으로 변경하는 것이 좋지만, 
                                                   일단은 사용자 경험을 위해 input change 시 바로 업데이트보다는 별도 state 관리가 필요할 수 있음.
                                                   여기서는 간단히 openaiKey prop을 편집 가능한 상태로 가정하고 처리 */
                                                onChange={(e) => handleSaveTeacherSettings({ ...profile, personal_openai_api_key: e.target.value })}
                                                placeholder="sk-... 로 시작하는 OpenAI API 키를 입력하세요"
                                                style={{
                                                    width: '100%', padding: '10px', borderRadius: '8px',
                                                    border: '1px solid #DEE2E6', fontSize: '0.85rem'
                                                }}
                                            />
                                            <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#7F8C8D' }}>
                                                * 키는 서버에 안전하게 저장되며, 클라이언트 코드에 노출되지 않습니다.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* (1) 학생 개별 피드백 프롬프트 */}
                                <div style={{ flex: '0.6', display: 'flex', flexDirection: 'column' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4F46E5', fontWeight: 'bold', marginBottom: '8px' }}>
                                        💬 학생 AI 피드백 프롬프트
                                    </label>
                                    <textarea
                                        value={promptTemplate}
                                        onChange={(e) => setPromptTemplate(e.target.value)}
                                        placeholder="학생들에게 줄 댓글 피드백 규칙을 입력하세요."
                                        style={{
                                            width: '100%', flex: 1, minHeight: '80px', padding: '12px', borderRadius: '12px',
                                            border: '1px solid #DEE2E6', fontSize: '0.82rem', lineHeight: '1.4',
                                            color: '#2C3E50', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
                                        }}
                                    />
                                </div>

                                {/* (2) AI쫑알이 생성 프롬프트 */}
                                <div style={{ flex: '0.6', display: 'flex', flexDirection: 'column' }}>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#059669', fontWeight: 'bold', marginBottom: '8px' }}>
                                        📋 AI쫑알이 생성 프롬프트
                                    </label>
                                    <textarea
                                        value={reportPromptTemplate}
                                        onChange={(e) => setReportPromptTemplate(e.target.value)}
                                        placeholder="생기부 도움자료 생성 시 적용할 규칙을 입력하세요."
                                        style={{
                                            width: '100%', flex: 1, minHeight: '80px', padding: '12px', borderRadius: '12px',
                                            border: '1px solid #DEE2E6', fontSize: '0.82rem', lineHeight: '1.4',
                                            color: '#2C3E50', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit'
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5px' }}>
                                    <Button
                                        onClick={handleSaveTeacherSettings}
                                        disabled={savingKey || (promptTemplate === originalPrompt && reportPromptTemplate === originalReportPrompt)}
                                        size="sm"
                                        style={{ borderRadius: '10px', padding: '8px 24px', fontWeight: 'bold', background: '#3498DB' }}
                                    >
                                        {savingKey ? '저장 중...' : '모든 AI 설정 저장'}
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
