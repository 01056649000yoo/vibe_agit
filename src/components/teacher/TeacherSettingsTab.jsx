import React, { useState } from 'react';
import Button from '../common/Button';

const TeacherSettingsTab = ({
    isMobile, savingKey, testingKey, aiStatus,
    promptTemplate, setPromptTemplate, reportPromptTemplate, setReportPromptTemplate,
    handleSaveTeacherSettings, handleTestAIConnection, runAIDiagnosis, promptKind = null, compact = false
}) => {
    const [activePromptTab, setActivePromptTab] = useState('feedback');
    const isFeedback = (promptKind || activePromptTab) === 'feedback';

    return (
        <section style={{ maxWidth: '920px', margin: '0 auto', width: '100%', background: 'white', borderRadius: '24px', padding: isMobile ? '20px' : compact ? '24px' : '32px', border: '1px solid #DCE6EE', boxShadow: '0 4px 18px rgba(15, 23, 42, 0.04)', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: compact ? 'flex-end' : 'space-between', gap: '20px', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', marginBottom: compact ? '14px' : '24px' }}>
                {!compact && <div>
                    <span style={{ color: '#2563EB', fontSize: '0.78rem', fontWeight: '900', letterSpacing: '0.08em' }}>공용 AI 서비스</span>
                    <h2 style={{ margin: '5px 0 0', color: '#172033', fontSize: isMobile ? '1.3rem' : '1.55rem' }}>AI 피드백 설정</h2>
                    <p style={{ margin: '7px 0 0', color: '#64748B', fontSize: '0.92rem', lineHeight: 1.6 }}>모든 AI 기능은 아지트의 공용 AI 서비스로 제공됩니다. 선생님은 수업에 맞는 규칙만 설정하세요.</p>
                </div>}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 12px', borderRadius: '12px', background: aiStatus === 'connected' ? '#ECFDF5' : '#FEF2F2', color: aiStatus === 'connected' ? '#047857' : '#B91C1C', fontSize: '0.82rem', fontWeight: '800' }}>
                    <span>{aiStatus === 'testing' ? '● 연결 확인 중' : aiStatus === 'connected' ? '● 공용 AI 연결됨' : '● 연결 확인 필요'}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={handleTestAIConnection} disabled={testingKey} style={{ padding: '5px 9px', color: 'inherit', background: 'white', border: '1px solid currentColor', boxShadow: 'none' }}>
                        {testingKey ? '확인 중' : '연결 테스트'}
                    </Button>
                </div>
            </div>

            {!promptKind && <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid #DCE6EE', marginBottom: '18px' }}>
                <button type="button" onClick={() => setActivePromptTab('feedback')} style={{ padding: '11px 15px', border: 'none', borderBottom: isFeedback ? '3px solid #2563EB' : '3px solid transparent', background: 'transparent', color: isFeedback ? '#1D4ED8' : '#64748B', fontWeight: '800', cursor: 'pointer' }}>💬 학생 AI 피드백</button>
                <button type="button" onClick={() => setActivePromptTab('report')} style={{ padding: '11px 15px', border: 'none', borderBottom: !isFeedback ? '3px solid #059669' : '3px solid transparent', background: 'transparent', color: !isFeedback ? '#047857' : '#64748B', fontWeight: '800', cursor: 'pointer' }}>📋 평어 도우미</button>
            </div>}

            <label style={{ display: 'block', color: '#334155', fontWeight: '800', marginBottom: '10px' }}>
                {isFeedback ? '학생에게 줄 피드백 규칙' : '평어 도우미 규칙'}
            </label>
            <textarea
                value={isFeedback ? promptTemplate : reportPromptTemplate}
                onChange={(event) => isFeedback ? setPromptTemplate(event.target.value) : setReportPromptTemplate(event.target.value)}
                placeholder={isFeedback ? '학생에게 줄 댓글 피드백의 말투와 기준을 입력하세요.' : '활동을 어떤 기준과 어조로 요약할지 입력하세요.'}
                style={{ width: '100%', minHeight: compact ? '240px' : '340px', padding: '16px', borderRadius: '14px', border: '1px solid #CBD5E1', background: '#F8FAFC', fontSize: '0.94rem', lineHeight: 1.7, color: '#1E293B', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <p style={{ margin: '9px 0 20px', color: '#64748B', fontSize: '0.82rem', lineHeight: 1.55 }}>학생 개인정보나 비밀 값은 규칙에 넣지 마세요. 규칙은 현재 선택한 선생님 계정에만 저장됩니다.</p>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexDirection: isMobile ? 'column-reverse' : 'row' }}>
                <button type="button" onClick={runAIDiagnosis} style={{ border: 'none', background: 'transparent', color: '#64748B', fontSize: '0.8rem', textDecoration: 'underline', cursor: 'pointer' }}>연결 진단 보기</button>
                <Button type="button" onClick={handleSaveTeacherSettings} disabled={savingKey} style={{ minWidth: '150px', background: '#2563EB', fontWeight: '800' }}>{savingKey ? '저장 중...' : 'AI 규칙 저장'}</Button>
            </div>
        </section>
    );
};

export default TeacherSettingsTab;
