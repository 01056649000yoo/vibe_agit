import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import PromptRuleModal from './PromptRuleModal';
import { PRESET_KIND } from '../../hooks/useAiPromptPresets';

/**
 * 기준 종류별 강조색. 이 버튼 옆에 붙는 AI 실행 버튼도 같은 색을 써야
 * 두 버튼이 한 벌로 보이므로, 색을 여기서 한 번만 정하고 내보낸다.
 */
export const PROMPT_ACCENT = {
    [PRESET_KIND.FEEDBACK]: '#4F46E5',
    [PRESET_KIND.REPORT]: '#059669'
};

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
    const accent = PROMPT_ACCENT[isReport ? PRESET_KIND.REPORT : PRESET_KIND.FEEDBACK];
    const kindLabel = isReport ? '평어 기준' : '피드백 기준';

    return (
        <>
            {/* 치수는 공용 Button 의 size="sm" 과 같게 맞춘다 —
                옆에 나란히 서는 AI 실행 버튼과 높이·모서리·글자 크기가 어긋나 보이지 않게. */}
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                title={`AI가 ${isReport ? '평어를' : '피드백을'} 쓸 때 지킬 기준을 고르거나 고칩니다`}
                style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    minHeight: 'var(--ui-control-sm)', padding: '7px 14px',
                    borderRadius: 'var(--ui-radius-sm)', cursor: 'pointer',
                    border: `1px solid ${accent}40`, background: `${accent}0D`,
                    color: accent, fontWeight: 800, fontSize: '0.86rem',
                    lineHeight: 'var(--ui-line-compact)',
                    minWidth: 0, maxWidth: '100%', ...style
                }}
            >
                <span aria-hidden="true">🗂️</span>
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
