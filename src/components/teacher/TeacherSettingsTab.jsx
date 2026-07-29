import React from 'react';
import Button from '../common/Button';
import { PromptRuleManager } from './PromptRuleModal';
import { PRESET_KIND } from '../../hooks/useAiPromptPresets';

const TeacherSettingsTab = ({
    isMobile, testingKey, aiStatus,
    setPromptTemplate, setReportPromptTemplate,
    handleTestAIConnection,
    promptKind = PRESET_KIND.FEEDBACK, compact = false
}) => {
    const isFeedback = promptKind === PRESET_KIND.FEEDBACK;
    const label = isFeedback ? 'AI 피드백' : '평어 도우미';

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

            <PromptRuleManager
                key={label}
                kind={isFeedback ? PRESET_KIND.FEEDBACK : PRESET_KIND.REPORT}
                isMobile={isMobile}
                onApplied={handleApplied}
            />

        </section>
    );
};

export default TeacherSettingsTab;
