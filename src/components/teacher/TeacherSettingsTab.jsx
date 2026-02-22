import React, { lazy, useState } from 'react';
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
    setOpenaiKey,
    hasApiKey,
    handleTestAIConnection,
    savingKey,
    testingKey,
    aiStatus,
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
    const [activePromptTab, setActivePromptTab] = useState('feedback'); // 'feedback' | 'report'

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
                                    AI 시스템 상태: {aiStatus === 'testing' ? (
                                        <span style={{ color: '#F39C12' }}>● 연결 확인 중...</span>
                                    ) : aiStatus === 'connected' ? (
                                        <span style={{ color: '#27AE60' }}>● 연결됨</span>
                                    ) : (
                                        <span style={{ color: '#E74C3C' }}>● 연결되지 않음</span>
                                    )}
                                </div>
                                <Button
                                    variant="secondary"
                                    onClick={handleTestAIConnection}
                                    disabled={testingKey}
                                    style={{
                                        borderRadius: '12px',
                                        padding: '6px 12px',
                                        background: aiStatus === 'disconnected' ? '#FDEDEC' : '#E8F5E9',
                                        color: aiStatus === 'disconnected' ? '#E74C3C' : '#2E7D32',
                                        border: aiStatus === 'disconnected' ? '1px solid #FADBD8' : '1px solid #C8E6C9',
                                        fontSize: '0.75rem'
                                    }}
                                >
                                    {testingKey ? '연결 확인 중...' : '연결 테스트'}
                                </Button>
                            </div>

                            <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px dashed #DEE2E6', flex: 1, display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {/* (0) API 모드 설정 (관리자 전용 기능 -> 선생님 키 입력 가능) */}
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
                                            placeholder={hasApiKey ? '●●●●●●●●  (기존 키 저장됨 — 변경 시에만 새 키 입력)' : 'sk-... 로 시작하는 OpenAI API 키 입력'}
                                            style={{
                                                width: '100%', padding: '10px', borderRadius: '8px',
                                                border: '1px solid #DEE2E6', fontSize: '0.85rem',
                                                background: profile?.api_mode === 'PERSONAL' ? 'white' : '#F1F3F5'
                                            }}
                                        />
                                        <p style={{ margin: '5px 0 0', fontSize: '0.75rem', color: '#95A5A6' }}>
                                            * 입력한 키는 서버에 안전하게 저장되며, 클라이언트 코드에 노출되지 않습니다.
                                        </p>

                                        {/* API 사용 안내 가이드 */}
                                        <div style={{ marginTop: '12px', background: '#E3F2FD', borderRadius: '8px', padding: '12px', border: '1px solid #BBDEFB' }}>
                                            <details>
                                                <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#1565C0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    💡 GPT API 키 발급 및 결제 안전 가이드 (필독)
                                                </summary>
                                                <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#455A64', lineHeight: '1.6' }}>
                                                    <p style={{ margin: '0 0 8px 0' }}>
                                                        끄적끄적아지트는 선생님들의 부담을 최소화하기 위해 <strong>사용한 만큼만 내는 합리적인 API 방식</strong>을 채택했습니다.
                                                    </p>
                                                    <ul style={{ paddingLeft: '20px', margin: '0 0 8px 0' }}>
                                                        <li style={{ marginBottom: '4px' }}>
                                                            <strong>💰 매우 저렴한 비용:</strong> 텍스트 기반 서비스라 <strong>$5(약 7,000원)만 충전</strong>해도 한 학기 동안 충분히 사용할 수 있습니다.
                                                        </li>
                                                        <li style={{ marginBottom: '4px' }}>
                                                            <strong>🛡️ 안전한 선불 결제:</strong> OpenAI API는 <strong>'선불 충전(Credit)'</strong> 방식입니다. 미리 충전한 금액($5)이 소진되면 자동으로 멈춥니다.
                                                        </li>
                                                        <li>
                                                            <strong>🔒 완벽한 과금 보호:</strong> 만약 키가 노출되더라도, <strong>충전된 금액 이상으로 자동 결제될 위험이 전혀 없습니다.</strong> (따라서 정기 구독보다 훨씬 안전합니다!)
                                                        </li>
                                                        <li>
                                                            <strong>⚙️ 월 한도 설정:</strong> Usage Limits 메뉴에서 월 사용 한도를 직접 설정하여 이중으로 보호받을 수 있습니다.
                                                        </li>
                                                    </ul>
                                                    <p style={{ margin: '8px 0 0 0', padding: '8px', background: 'white', borderRadius: '6px', border: '1px dashed #90CAF9' }}>
                                                        👉 <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noopener noreferrer" style={{ color: '#0288D1', textDecoration: 'underline', fontWeight: 'bold' }}>
                                                            OpenAI Billing에서 $5 충전하기
                                                        </a>
                                                        <br />
                                                        👉 <a href="https://platform.openai.com/settings/organization/limits" target="_blank" rel="noopener noreferrer" style={{ color: '#0288D1', textDecoration: 'underline', fontWeight: 'bold' }}>
                                                            Usage Limits에서 월 한도 설정하기
                                                        </a>
                                                        <br />
                                                        👉 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: '#0288D1', textDecoration: 'underline', fontWeight: 'bold' }}>
                                                            API 키 생성하러 가기
                                                        </a>
                                                    </p>
                                                </div>
                                            </details>
                                        </div>
                                    </div>
                                </div>

                                {/* 프롬프트 설정 (탭 통합) */}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '15px' }}>
                                    {/* 탭 헤더 */}
                                    <div style={{ display: 'flex', gap: '6px', marginLeft: '4px' }}>
                                        <button
                                            onClick={() => setActivePromptTab('feedback')}
                                            style={{
                                                padding: '10px 16px',
                                                borderRadius: '12px 12px 0 0',
                                                background: activePromptTab === 'feedback' ? 'white' : '#F8F9FA',
                                                color: activePromptTab === 'feedback' ? '#4F46E5' : '#ADB5BD',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                border: '1px solid #DEE2E6',
                                                borderBottom: 'none',
                                                marginBottom: '-1px',
                                                zIndex: activePromptTab === 'feedback' ? 2 : 1,
                                                fontSize: '0.9rem',
                                                transition: 'all 0.2s',
                                                display: 'flex', alignItems: 'center', gap: '6px'
                                            }}
                                        >
                                            <span>💬</span> 학생 AI 피드백
                                        </button>
                                        <button
                                            onClick={() => setActivePromptTab('report')}
                                            style={{
                                                padding: '10px 16px',
                                                borderRadius: '12px 12px 0 0',
                                                background: activePromptTab === 'report' ? 'white' : '#F8F9FA',
                                                color: activePromptTab === 'report' ? '#059669' : '#ADB5BD',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                border: '1px solid #DEE2E6',
                                                borderBottom: 'none',
                                                marginBottom: '-1px',
                                                zIndex: activePromptTab === 'report' ? 2 : 1,
                                                fontSize: '0.9rem',
                                                transition: 'all 0.2s',
                                                display: 'flex', alignItems: 'center', gap: '6px'
                                            }}
                                        >
                                            <span>📋</span> AI쫑알이 생성
                                        </button>
                                    </div>

                                    {/* 탭 내용 (통합 컨테이너) */}
                                    <div style={{
                                        background: 'white',
                                        border: '1px solid #DEE2E6',
                                        borderRadius: '0 12px 12px 12px',
                                        padding: '16px', // 내부 여백
                                        flex: 1, // 남은 공간 채우기
                                        display: 'flex',
                                        flexDirection: 'column',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.02)',
                                        zIndex: 1,
                                        minHeight: '280px' // 충분한 높이 확보
                                    }}>
                                        <label style={{
                                            display: 'block',
                                            fontSize: '0.9rem',
                                            color: activePromptTab === 'feedback' ? '#4F46E5' : '#059669',
                                            fontWeight: 'bold',
                                            marginBottom: '12px'
                                        }}>
                                            {activePromptTab === 'feedback'
                                                ? '학생들에게 줄 댓글 피드백 프롬프트 설정'
                                                : '생기부 도움자료 생성 프롬프트 설정'}
                                        </label>
                                        <textarea
                                            value={activePromptTab === 'feedback' ? promptTemplate : reportPromptTemplate}
                                            onChange={(e) => activePromptTab === 'feedback' ? setPromptTemplate(e.target.value) : setReportPromptTemplate(e.target.value)}
                                            placeholder={activePromptTab === 'feedback'
                                                ? "학생들에게 줄 댓글 피드백 규칙을 입력하세요."
                                                : "생기부 도움자료 생성 시 적용할 규칙을 입력하세요."}
                                            style={{
                                                width: '100%',
                                                flex: 1, // 컨테이너 높이 꽉 채우기
                                                padding: '16px',
                                                borderRadius: '12px',
                                                border: '1px solid #E9ECEF',
                                                background: '#F8F9FA',
                                                fontSize: '0.9rem',
                                                lineHeight: '1.6',
                                                color: '#2C3E50',
                                                resize: 'none',
                                                boxSizing: 'border-box',
                                                fontFamily: 'inherit',
                                                outline: 'none'
                                            }}
                                        />
                                        <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '0.8rem', color: '#95A5A6' }}>
                                            {activePromptTab === 'feedback'
                                                ? '* [시스템 역할 설정] 등으로 시작하는 구체적인 지시문을 입력하세요.'
                                                : '* 학생의 활동 데이터를 바탕으로 어떤 어조로 요약할지 정의하세요.'}
                                        </div>
                                    </div>
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
