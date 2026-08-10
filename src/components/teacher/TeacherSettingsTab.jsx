import React from 'react';
import Button from '../common/Button';
import { PromptRuleManager } from './PromptRuleModal';
import { PRESET_KIND } from '../../hooks/useAiPromptPresets';

const TeacherSettingsTab = ({
    isMobile, testingKey,
    setPromptTemplate, setReportPromptTemplate,
    handleTestAIConnection,
    promptKind = PRESET_KIND.FEEDBACK, compact = false
}) => {
    const isFeedback = promptKind === PRESET_KIND.FEEDBACK;
    const label = isFeedback ? '피드백 기준' : '평어 기준';

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
                <p style={{ margin: 0, color: '#64748B', fontSize: '0.76rem' }}>아래에서 고른 기준이 실제 AI 실행에 사용됩니다.</p>
                <Button
                    type="button" variant="ghost" size="sm" onClick={handleTestAIConnection} disabled={testingKey}
                    title="AI 기능에 문제가 있을 때 연결 상태를 점검합니다"
                    style={{ padding: '6px 10px', color: '#64748B', background: '#F8FAFC', border: '1px solid #CBD5E1', boxShadow: 'none' }}
                >
                    {testingKey ? '점검 중…' : '🔌 AI 연결 점검'}
                </Button>
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
