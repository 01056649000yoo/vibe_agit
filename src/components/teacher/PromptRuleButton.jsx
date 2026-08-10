import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import PromptRuleModal from './PromptRuleModal';
import { PRESET_KIND } from '../../hooks/useAiPromptPresets';

/**
 * AI 실행 버튼 옆에 붙는 "작성 기준" 버튼.
 *
 * 지금 어떤 기준으로 쓰이는지 이름으로 보여주고, 누르면 기준을 고르는 창을 연다.
 * 누르지 않으면 아무 일도 일어나지 않는다 — 지금 기준 그대로 실행된다.
 *
 * 활성 기준의 이름만 가볍게 조회한다(전체 목록은 창을 열 때 불러온다).
 */
const PromptRuleButton = ({ kind = PRESET_KIND.FEEDBACK, isMobile = false, style, onApplied }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeName, setActiveName] = useState(null);
    const [refreshToken, setRefreshToken] = useState(0);

    useEffect(() => {
        let cancelled = false;

        const loadActiveName = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user || cancelled) return;

                const { data } = await supabase
                    .from('ai_prompt_presets')
                    .select('name')
                    .eq('teacher_id', user.id)
                    .eq('kind', kind)
                    .eq('is_active', true)
                    .maybeSingle();

                if (!cancelled) setActiveName(data?.name || null);
            } catch {
                // 이름 표시는 부가 정보이므로 실패해도 조용히 넘어간다
            }
        };

        loadActiveName();
        return () => { cancelled = true; };
    }, [kind, refreshToken]);

    const isReport = kind === PRESET_KIND.REPORT;
    const accent = isReport ? '#059669' : '#4F46E5';
    const kindLabel = isReport ? '평어 기준' : '피드백 기준';

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                title={`AI가 ${isReport ? '평어를' : '피드백을'} 쓸 때 지킬 기준을 고르거나 고칩니다`}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: isMobile ? '8px 10px' : '10px 14px',
                    borderRadius: '10px', cursor: 'pointer',
                    border: `1px solid ${accent}40`, background: `${accent}0D`,
                    color: accent, fontWeight: 800, fontSize: '0.82rem',
                    maxWidth: '100%', ...style
                }}
            >
                <span>🗂️</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kindLabel}{activeName ? `: ${activeName}` : ''}
                </span>
            </button>

            <PromptRuleModal
                isOpen={isOpen}
                onClose={() => {
                    setIsOpen(false);
                    setRefreshToken(token => token + 1); // 닫을 때 이름 갱신
                }}
                kind={kind}
                isMobile={isMobile}
                onApplied={onApplied}
            />
        </>
    );
};

export default PromptRuleButton;
