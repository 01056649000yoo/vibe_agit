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
    setOpenaiKey, // [추가]
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
    const [activePromptTab, setActivePromptTab] = React.useState('feedback');

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
                        background: 'white', borderRadius: '24px',
                        border: '1px solid #E9ECEF', boxSizing: 'border-box', boxShadow: '0 2px 12px rgba(0,0,0,0.03)',
                        width: '100%', display: 'flex', flexDirection: 'column', position: 'relative'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: isMobile ? '20px' : '28px' }}>
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
                                {/* (0) API 모드 설정 (관리자 전용 기능으로 변경 - 여기서는 확인 및 키 등록만 가능) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '15px', background: '#F8F9FA', borderRadius: '12px', border: '1px solid #E9ECEF' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.85rem', color: '#2C3E50', fontWeight: 'bold' }}>🔑 AI 사용 모드</label>
                                        <div style={{
                                            padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold',
                                            background: profile?.api_mode === 'PERSONAL' ? '#E8F5E9' : '#E3F2FD',
                                            color: profile?.api_mode === 'PERSONAL' ? '#2E7D32' : '#1976D2',
                                            border: profile?.api_mode === 'PERSONAL' ? '1px solid #C8E6C9' : '1px solid #BBDEFB'
                                        }}>
                                            {profile?.api_mode === 'PERSONAL' ? '교사 개인 키 모드 적용 중' : '시스템 공용 키 모드 적용 중'}
                                        </div>
                                    </div>

                                    <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#7F8C8D', lineHeight: '1.4' }}>
                                        모드 변경은 관리자에게 문의해주세요. 개인 키 모드일 경우 아래에 키를 등록해야 작동합니다.
                                    </p>

                                    <div style={{ marginTop: '5px' }}>
                                        <label style={{ display: 'block', fontSize: '0.8rem', color: '#546E7A', marginBottom: '5px' }}>
                                            등록된 개인 API 키 (필요 시 입력)
                                        </label>
                                        <input
                                            type="password"
                                            value={openaiKey || ''}
                                            onChange={(e) => setOpenaiKey && setOpenaiKey(e.target.value)}
                                            placeholder="sk-... 로 시작하는 OpenAI API 키 입력 (저장 시 암호화됨)"
                                            style={{
                                                width: '100%', padding: '10px', borderRadius: '8px',
                                                border: '1px solid #DEE2E6', fontSize: '0.85rem',
                                                background: profile?.api_mode === 'PERSONAL' ? 'white' : '#F1F3F5'
                                            }}
                                        />
                                        <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#95A5A6' }}>
                                            * 입력한 키는 서버에 안전하게 저장되며, 클라이언트 코드에 노출되지 않습니다.
                                        </p>
                                    </div>
                                </div>

                                {/* 탭 UI 헤더 */}
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '0' }}>
                                    <button
                                        onClick={() => setActivePromptTab('feedback')}
                                        style={{
                                            flex: 1, padding: '12px', borderRadius: '12px 12px 0 0', border: 'none', cursor: 'pointer',
                                            background: activePromptTab === 'feedback' ? '#4F46E5' : '#E0E7FF',
                                            color: activePromptTab === 'feedback' ? 'white' : '#4F46E5',
                                            fontWeight: 'bold', fontSize: '0.9rem', transition: 'all 0.2s',
                                            boxShadow: activePromptTab === 'feedback' ? '0 -2px 10px rgba(0,0,0,0.05)' : 'none'
                                        }}
                                    >
                                        💬 학생 AI 피드백
                                    </button>
                                    <button
                                        onClick={() => setActivePromptTab('report')}
                                        style={{
                                            flex: 1, padding: '12px', borderRadius: '12px 12px 0 0', border: 'none', cursor: 'pointer',
                                            background: activePromptTab === 'report' ? '#059669' : '#D1FAE5',
                                            color: activePromptTab === 'report' ? 'white' : '#059669',
                                            fontWeight: 'bold', fontSize: '0.9rem', transition: 'all 0.2s',
                                            boxShadow: activePromptTab === 'report' ? '0 -2px 10px rgba(0,0,0,0.05)' : 'none'
                                        }}
                                    >
                                        📋 AI쫑알이 생성
                                    </button>
                                </div>

                                {/* 통합 프롬프트 입력창 */}
                                <div style={{
                                    flex: 1, display: 'flex', flexDirection: 'column',
                                    border: `2px solid ${activePromptTab === 'feedback' ? '#4F46E5' : '#059669'}`,
                                    borderRadius: '0 0 12px 12px', background: 'white', padding: '16px',
                                    marginTop: 0, minHeight: '400px',
                                    boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
                                }}>
                                    <div style={{ marginBottom: '12px', fontSize: '0.9rem', color: '#4B5563', lineHeight: '1.5', background: '#F3F4F6', padding: '12px', borderRadius: '8px' }}>
                                        {activePromptTab === 'feedback'
                                            ? 'ℹ️ 학생들이 글을 제출했을 때 AI가 자동으로 작성해줄 피드백의 규칙을 설정합니다.'
                                            : 'ℹ️ 학생 생활기록부 도움자료(AI쫑알이)를 생성할 때 AI가 참고할 규칙을 설정합니다.'}
                                    </div>

                                    <textarea
                                        value={activePromptTab === 'feedback' ? promptTemplate : reportPromptTemplate}
                                        onChange={(e) => activePromptTab === 'feedback' ? setPromptTemplate(e.target.value) : setReportPromptTemplate(e.target.value)}
                                        placeholder={activePromptTab === 'feedback'
                                            ? "예시: 초등학생 수준에 맞춰 다정하게 존댓말을 써주고, 글의 장점을 먼저 칭찬한 뒤 고칠 점을 하나만 제안해줘..."
                                            : "예시: 창의적 체험활동 영역에 들어갈 내용을 요약해주고, 학생의 성실함을 강조하는 문구로 작성해줘..."}
                                        style={{
                                            flex: 1, width: '100%', padding: '16px', borderRadius: '8px',
                                            border: '1px solid #E5E7EB', fontSize: '0.95rem', lineHeight: '1.6',
                                            color: '#1F2937', resize: 'none', boxSizing: 'border-box', fontFamily: "'Pretendard', sans-serif",
                                            background: '#FAFAFA', outline: 'none'
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '5px' }}>
                                    <Button
                                        onClick={handleSaveTeacherSettings}
                                        disabled={savingKey}
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
