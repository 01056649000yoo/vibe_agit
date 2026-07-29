import React from 'react';
import Button from '../common/Button';
import PromptRuleButton from './PromptRuleButton';
import { PRESET_KIND } from '../../hooks/useAiPromptPresets';

const TeacherSettingsTab = ({
    isMobile, testingKey, aiStatus,
    setPromptTemplate, setReportPromptTemplate,
    handleTestAIConnection, runAIDiagnosis,
    promptKind = PRESET_KIND.FEEDBACK, compact = false
}) => {
    const isFeedback = promptKind === PRESET_KIND.FEEDBACK;
    const label = isFeedback ? 'AI 피드백' : '평어 도우미';
    const accent = isFeedback ? '#4F46E5' : '#059669';

    const handleApplied = (content) => {
        if (isFeedback) setPromptTemplate?.(content);
        else setReportPromptTemplate?.(content);
    };

    return (
        <section style={{
            maxWidth: '920px', margin: '0 auto', width: '100%', background: 'white', borderRadius: '22px',
            padding: isMobile ? '20px' : compact ? '24px' : '30px', border: '1px solid #DCE6EE',
            boxShadow: '0 4px 18px rgba(15,23,42,.04)', boxSizing: 'border-box'
        }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
                flexDirection: isMobile ? 'column' : 'row', gap: '12px', paddingBottom: '18px',
                marginBottom: '20px', borderBottom: '1px solid #E2E8F0'
            }}>
                <div>
                    <strong style={{ color: '#334155', fontSize: '0.95rem' }}>공용 AI 연결 상태</strong>
                    <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.76rem' }}>규칙 보관함에서 선택한 내용이 실제 AI 실행에 사용됩니다.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '7px 10px', borderRadius: '11px', background: aiStatus === 'connected' ? '#ECFDF5' : '#FEF2F2', color: aiStatus === 'connected' ? '#047857' : '#B91C1C', fontSize: '0.76rem', fontWeight: '800' }}>
                    <span>{aiStatus === 'testing' ? '● 확인 중' : aiStatus === 'connected' ? '● 연결됨' : '● 확인 필요'}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={handleTestAIConnection} disabled={testingKey} style={{ padding: '4px 8px', color: 'inherit', background: 'white', border: '1px solid currentColor', boxShadow: 'none' }}>
                        {testingKey ? '확인 중' : '연결 테스트'}
                    </Button>
                </div>
            </div>

            <div style={{ padding: isMobile ? '18px' : '22px', borderRadius: '18px', background: `${accent}0A`, border: `1px solid ${accent}24` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span aria-hidden="true" style={{ fontSize: '1.8rem' }}>{isFeedback ? '🤖' : '📋'}</span>
                    <div>
                        <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1.05rem' }}>{label} 규칙 보관함</h3>
                        <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.8rem', lineHeight: 1.55 }}>
                            규칙을 여러 개 저장하고, 이름을 바꾸거나 삭제하고, 수업에 맞는 규칙을 선택해 적용할 수 있습니다.
                        </p>
                    </div>
                </div>

                <PromptRuleButton
                    kind={isFeedback ? PRESET_KIND.FEEDBACK : PRESET_KIND.REPORT}
                    isMobile={isMobile}
                    onApplied={handleApplied}
                    style={{ marginTop: '18px', minWidth: isMobile ? '100%' : '220px', justifyContent: 'center', background: 'white' }}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '16px' }}>
                <button type="button" onClick={runAIDiagnosis} style={{ border: 'none', background: 'transparent', color: '#64748B', fontSize: '0.76rem', textDecoration: 'underline', cursor: 'pointer' }}>연결 진단 보기</button>
            </div>
        </section>
    );
};

export default TeacherSettingsTab;
