import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { refinePromptWithAI } from '../../utils/refinePrompt';
import Button from '../common/Button';
import ModalCloseButton from '../common/ModalCloseButton';
import useAiPromptPresets, { PRESET_KIND, MAX_PROMPT_LENGTH } from '../../hooks/useAiPromptPresets';
import { DEFAULT_FEEDBACK_PROMPT, DEFAULT_REPORT_PROMPT } from '../../constants/aiPrompts';

/**
 * AI 작성 기준을 고르고 고치는 창.
 *
 * 기준을 이름 붙여 여러 개 저장해두고 필요할 때 불러 쓴다.
 * **아무것도 건드리지 않고 닫으면 지금 기준이 그대로 쓰인다** — 기존 동작과 동일하다.
 *
 * 화면 용어는 `작성 기준`으로 통일한다(2026-08-10). "규칙·프리셋·프롬프트"가 뒤섞여
 * 무엇을 하는 창인지 알기 어렵다는 지적을 받았다. 코드의 식별자(preset 등)는 그대로 둔다 —
 * DB 테이블(`ai_prompt_presets`) 이름과 맞춰야 읽기 쉽다.
 *
 * 피드백 실행 버튼(제출 현황·글 상세)이 이미 모달 안에 있어서 이 창은 그 위에 겹쳐 뜬다.
 *
 * 구현 노트: 본문을 별도 컴포넌트로 분리해 열 때마다 새로 마운트시킨다.
 * 그래야 effect 로 상태를 되돌리지 않고도 항상 "지금 적용 중인 내용"에서 시작한다.
 */

const PromptRuleModalBody = ({ onClose, kind, isMobile, onApplied, embedded = false }) => {
    const {
        presets, activePreset, appliedContent, loading, saving, error,
        applyContent, applyPreset, savePreset, renamePreset, deletePreset
    } = useAiPromptPresets(kind);

    // 사용자가 손대기 전에는 null. 화면에는 "지금 적용 중인 내용"이 보인다.
    const [draftOverride, setDraftOverride] = useState(null);
    const [selectedOverride, setSelectedOverride] = useState(undefined);
    const [newName, setNewName] = useState(null);
    // AI 다듬기: 원문을 건드리지 않고 제안을 따로 받아 교사가 채택 여부를 고른다
    const [refining, setRefining] = useState(false);
    const [refined, setRefined] = useState(null);
    const [refineError, setRefineError] = useState('');
    const [notice, setNotice] = useState('');

    const isReport = kind === PRESET_KIND.REPORT;
    const label = isReport ? '평어 작성 기준' : '피드백 작성 기준';
    const accent = isReport ? '#059669' : '#4F46E5';
    const defaultPrompt = isReport ? DEFAULT_REPORT_PROMPT : DEFAULT_FEEDBACK_PROMPT;

    const draft = draftOverride ?? (appliedContent || defaultPrompt);
    const selectedId = selectedOverride === undefined ? (activePreset?.id ?? null) : selectedOverride;
    const presetTitle = newName ?? activePreset?.name ?? '';
    const isDirty = draft.trim() !== (appliedContent || '').trim();
    const isTooLong = draft.length > MAX_PROMPT_LENGTH;

    const flash = (message) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 2500);
    };

    const handleSelectPreset = (preset) => {
        setSelectedOverride(preset.id);
        setDraftOverride(preset.content);
        setNewName(preset.name);
        setRefined(null);
    };

    const handleCreateNew = () => {
        setSelectedOverride(null);
        setNewName('');
        setDraftOverride(defaultPrompt);
        setRefined(null);
    };

    const handleApplyEdited = async () => {
        if (!draft.trim() || isTooLong) return;
        const ok = await applyContent(draft);
        if (ok) {
            // 프롬프트를 props 로 받아 쓰는 화면(평어 탭)이 즉시 반영되도록 알린다
            if (onApplied) onApplied(draft);
            setDraftOverride(null);
            flash('이 기준으로 바꿨습니다. 이제 실행하면 이 기준이 쓰입니다.');
        }
    };

    const handleApplySelected = async () => {
        if (!selectedId || isTooLong) return;
        const target = presets.find(p => p.id === selectedId);
        const ok = await applyPreset(selectedId);
        if (ok) {
            if (onApplied && target) onApplied(target.content);
            setDraftOverride(null);
            flash('이제 이 기준으로 씁니다.');
        }
    };

    const handleSaveAsNew = async () => {
        const name = presetTitle.trim();
        if (!name) {
            flash('기준 이름을 입력해주세요.');
            return;
        }
        if (!draft.trim() || isTooLong) {
            flash(`기준은 ${MAX_PROMPT_LENGTH.toLocaleString()}자 이내로 작성해주세요.`);
            return;
        }
        const ok = await savePreset(name, draft);
        if (ok) {
            setNewName(name);
            flash(`'${name}' 기준을 저장했습니다.`);
        }
    };

    const handleRename = async (preset) => {
        const next = prompt('새 이름을 입력하세요.', preset.name);
        if (!next || !next.trim() || next.trim() === preset.name) return;
        const ok = await renamePreset(preset.id, next);
        if (ok) {
            if (selectedId === preset.id) setNewName(next.trim());
            flash('이름을 바꿨습니다.');
        }
    };

    const handleDelete = async (preset) => {
        if (!confirm(`'${preset.name}' 기준을 삭제할까요?\n지금 쓰고 있는 내용은 그대로 남습니다.`)) return;
        const ok = await deletePreset(preset.id);
        if (ok) {
            if (selectedId === preset.id) setSelectedOverride(null);
            flash('기준을 삭제했습니다.');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={embedded ? undefined : onClose}
            style={{
                position: embedded ? 'relative' : 'fixed', inset: embedded ? undefined : 0,
                background: embedded ? 'transparent' : 'rgba(15,23,42,0.55)',
                backdropFilter: embedded ? 'none' : 'blur(4px)', zIndex: embedded ? 'auto' : 10050,
                display: embedded ? 'block' : 'flex', alignItems: 'center', justifyContent: 'center', padding: embedded ? 0 : '16px'
            }}
        >
            <motion.div
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: embedded ? 'none' : '980px', maxHeight: embedded ? 'none' : '88vh',
                    background: 'white', borderRadius: '20px', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    border: embedded ? '1px solid #DCE6EE' : 'none',
                    boxShadow: embedded ? '0 4px 18px rgba(15,23,42,.04)' : '0 24px 60px rgba(15,23,42,0.25)'
                }}
            >
                {/* 독립 모달일 때만 제목을 표시한다. 설정 허브 안에서는 바깥 탭 제목을 사용한다. */}
                {!embedded && <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', borderBottom: '1px solid #F1F3F5', background: '#FAFBFC'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#1F2937' }}>
                            {isReport ? '📋' : '🤖'} {label} 정하기
                        </h3>
                        <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#6B7280' }}>
                            AI가 {isReport ? '평어를' : '피드백을'} 쓸 때 지킬 내용을 적어 두고, 필요할 때 골라 씁니다.
                            <strong style={{ color: accent }}> {embedded ? '고른 기준이 실제 AI 실행에 사용됩니다.' : '그냥 닫으면 지금 기준이 그대로 쓰입니다.'}</strong>
                        </p>
                    </div>
                    <ModalCloseButton onClick={onClose} label={`${label} 정하기 닫기`} />
                </div>}

                {notice && (
                    <div style={{ padding: '10px 24px', background: '#F0FDF4', color: '#166534', fontSize: '0.86rem', fontWeight: 600 }}>
                        ✅ {notice}
                    </div>
                )}
                {error && (
                    <div style={{ padding: '10px 24px', background: '#FEF2F2', color: '#B91C1C', fontSize: '0.86rem' }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* 본문
                    바깥 창이 `maxHeight:88vh` + `overflow:hidden` 이라, 안쪽에서 넘치는 쪽이
                    스스로 스크롤하지 않으면 내용이 그냥 잘려 나가고 스크롤바도 안 생긴다.
                    PC 는 좌우 칸이 각자 스크롤하고, 모바일(위아래 배치)은 본문 전체가 스크롤한다.
                    `minHeight:0` 이 없으면 그리드 칸이 내용 높이만큼 부풀어 스크롤이 안 걸린다. */}
                <div style={{
                    flex: 1, minHeight: 0, display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '260px 1fr',
                    overflowY: embedded ? 'visible' : (isMobile ? 'auto' : 'hidden')
                }}>
                    {/* 저장된 규칙 목록 */}
                    <div style={{
                        borderRight: isMobile ? 'none' : '1px solid #F1F3F5',
                        borderBottom: isMobile ? '1px solid #F1F3F5' : 'none',
                        padding: '16px', minHeight: 0, overflowY: 'auto',
                        maxHeight: isMobile ? '180px' : 'none', background: '#FCFCFD'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#9CA3AF' }}>
                                저장해 둔 기준 {presets.length}개
                            </span>
                            <button
                                type="button"
                                onClick={handleCreateNew}
                                style={{ border: `1px solid ${accent}`, background: 'white', color: accent, borderRadius: '8px', padding: '5px 9px', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                                + 새 기준
                            </button>
                        </div>

                        {loading ? (
                            <div style={{ color: '#ADB5BD', fontSize: '0.85rem' }}>불러오는 중…</div>
                        ) : presets.length === 0 ? (
                            <div style={{ color: '#ADB5BD', fontSize: '0.82rem', lineHeight: 1.6 }}>
                                아직 저장해 둔 기준이 없습니다.<br />
                                이름을 붙이고 내용을 적어 저장해보세요.
                            </div>
                        ) : presets.map(preset => {
                            const isSelected = selectedId === preset.id;
                            return (
                                <div
                                    key={preset.id}
                                    onClick={() => handleSelectPreset(preset)}
                                    style={{
                                        padding: '10px 12px', borderRadius: '10px', marginBottom: '8px',
                                        cursor: 'pointer',
                                        border: `1px solid ${isSelected ? accent : '#E9ECEF'}`,
                                        background: isSelected ? `${accent}0D` : 'white'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 800, color: '#374151', fontSize: '0.88rem' }}>
                                            {preset.name}
                                        </span>
                                        {preset.is_active && (
                                            <span style={{
                                                fontSize: '0.68rem', fontWeight: 800, color: accent,
                                                background: `${accent}1A`, padding: '2px 6px', borderRadius: '6px'
                                            }}>
                                                적용 중
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRename(preset); }}
                                            style={{ border: 'none', background: 'none', color: '#6B7280', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                                        >
                                            이름 변경
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(preset); }}
                                            style={{ border: 'none', background: 'none', color: '#DC2626', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                                        >
                                            삭제
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 편집기 — AI 다듬기 결과·오류 안내가 붙으면 여기가 제일 먼저 넘친다 */}
                    <div style={{
                        padding: '16px 20px', display: 'flex', flexDirection: 'column', minHeight: 0,
                        overflowY: embedded || isMobile ? 'visible' : 'auto'
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: '8px', flexWrap: 'wrap', gap: '8px'
                        }}>
                            <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                                지금 쓰는 기준:{' '}
                                <strong style={{ color: accent }}>
                                    {activePreset ? activePreset.name : '이름 없는 기준'}
                                </strong>
                                {isDirty && (
                                    <span style={{ marginLeft: '8px', color: '#D97706', fontWeight: 700 }}>
                                        · 고쳤지만 아직 반영 안 됨
                                    </span>
                                )}
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    onClick={async () => {
                                        setRefineError(''); setRefined(null); setRefining(true);
                                        try {
                                            // 평어와 피드백은 다듬는 기준이 달라 종류를 함께 넘긴다
                                            setRefined(await refinePromptWithAI(draft, kind));
                                        } catch (err) {
                                            setRefineError(err?.message || 'AI 다듬기에 실패했습니다.');
                                        } finally {
                                            setRefining(false);
                                        }
                                    }}
                                    disabled={refining || !draft.trim()}
                                    style={{
                                        border: `1px solid ${accent}`, background: 'white', borderRadius: '8px',
                                        padding: '5px 10px', fontSize: '0.78rem', color: accent,
                                        cursor: refining ? 'wait' : 'pointer', fontWeight: 700
                                    }}
                                >
                                    {refining ? '다듬는 중…' : '✨ AI로 다듬기'}
                                </button>
                                <button
                                    onClick={() => setDraftOverride(defaultPrompt)}
                                    style={{
                                        border: '1px solid #E9ECEF', background: 'white', borderRadius: '8px',
                                        padding: '5px 10px', fontSize: '0.78rem', color: '#6B7280', cursor: 'pointer'
                                    }}
                                >
                                    기본값 불러오기
                                </button>
                            </div>
                        </div>

                        <label style={{ display: 'block', marginBottom: '12px' }}>
                            <span style={{ display: 'block', marginBottom: '6px', color: '#374151', fontSize: '0.8rem', fontWeight: 800 }}>
                                1. 기준 이름
                            </span>
                            <input
                                type="text"
                                value={presetTitle}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder={isReport ? '예: 3학년 성장 중심 평어' : '예: 3학년 다정한 피드백'}
                                maxLength={40}
                                style={{ width: '100%', padding: '11px 12px', borderRadius: '10px', border: '1px solid #D1D5DB', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
                            />
                        </label>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ color: '#374151', fontSize: '0.8rem', fontWeight: 800 }}>2. AI에게 줄 지시</span>
                            {/* 한도의 90%부터 주황색으로 미리 알린다 */}
                            <span style={{ color: isTooLong ? '#DC2626' : draft.length >= MAX_PROMPT_LENGTH * 0.9 ? '#D97706' : '#6B7280', fontSize: '0.76rem', fontWeight: 800 }}>
                                {draft.length.toLocaleString()}/{MAX_PROMPT_LENGTH.toLocaleString()}자
                            </span>
                        </div>

                        <textarea
                            value={draft}
                            onChange={(e) => setDraftOverride(e.target.value)}
                            spellCheck={false}
                            maxLength={draft.length > MAX_PROMPT_LENGTH ? undefined : MAX_PROMPT_LENGTH}
                            placeholder={'- 역할: AI가 맡을 역할\n- 내용: 확인하고 작성할 내용\n- 말투: 학생에게 보여줄 말투\n- 제한: 분량과 금지할 내용'}
                            style={{
                                flex: 1, minHeight: isMobile ? '180px' : '220px', width: '100%',
                                padding: '14px', borderRadius: '12px', border: `1px solid ${isTooLong ? '#EF4444' : '#D1D5DB'}`,
                                background: '#F8F9FA', fontSize: '0.88rem', lineHeight: 1.6,
                                color: '#2C3E50', resize: 'none', boxSizing: 'border-box',
                                fontFamily: 'inherit', outline: 'none'
                            }}
                        />
                        <div style={{ marginTop: '6px', color: isTooLong ? '#DC2626' : '#6B7280', fontSize: '0.75rem', lineHeight: 1.5 }}>
                            {isTooLong
                                ? `${MAX_PROMPT_LENGTH.toLocaleString()}자를 넘습니다. 줄여야 저장하거나 쓸 수 있습니다. ✨ AI로 다듬기로 정리할 수 있습니다.`
                                : '역할·내용·말투·제한을 한 줄씩 나눠 적으면 고치기 쉽습니다.'}
                        </div>

                        {/* AI 다듬기 결과 — 원문은 그대로 두고, 교사가 확인 후 채택 */}
                        {refineError && (
                            <div style={{
                                marginTop: '10px', padding: '10px 12px', borderRadius: '10px',
                                background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: '0.82rem'
                            }}>
                                {refineError}
                            </div>
                        )}
                        {refined && (
                            <div style={{
                                marginTop: '10px', padding: '12px', borderRadius: '12px',
                                background: '#F0FDF4', border: `1px solid #BBF7D0`
                            }}>
                                <div style={{ fontSize: '0.8rem', color: '#15803D', fontWeight: 700, marginBottom: '6px' }}>
                                    ✨ AI가 다듬은 기준 (아직 반영 전)
                                </div>
                                <div style={{
                                    maxHeight: '240px', overflowY: 'auto', whiteSpace: 'pre-wrap',
                                    fontSize: '0.83rem', lineHeight: 1.6, color: '#2C3E50',
                                    background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #DCFCE7'
                                }}>
                                    {refined}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                    <button
                                        onClick={() => { setDraftOverride(refined); setRefined(null); }}
                                        disabled={refined.length > MAX_PROMPT_LENGTH}
                                        style={{
                                            border: 'none', background: '#16A34A', color: 'white', borderRadius: '8px',
                                            padding: '7px 14px', fontSize: '0.82rem', fontWeight: 700,
                                            cursor: refined.length > MAX_PROMPT_LENGTH ? 'not-allowed' : 'pointer', opacity: refined.length > MAX_PROMPT_LENGTH ? 0.5 : 1
                                        }}
                                    >
                                        이걸로 교체
                                    </button>
                                    <button
                                        onClick={() => setRefined(null)}
                                        style={{
                                            border: '1px solid #E9ECEF', background: 'white', color: '#6B7280',
                                            borderRadius: '8px', padding: '7px 14px', fontSize: '0.82rem', cursor: 'pointer'
                                        }}
                                    >
                                        취소
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <Button
                                onClick={handleSaveAsNew}
                                disabled={saving || !presetTitle.trim() || !draft.trim() || isTooLong}
                                size="sm"
                                style={{
                                    background: 'white', color: accent, border: `1px solid ${accent}`,
                                    boxShadow: 'none', padding: '10px 16px', fontSize: '0.85rem'
                                }}
                            >
                                {selectedId ? '기준 저장' : '새 기준 저장'}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 하단 액션 */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                    padding: '16px 24px', borderTop: '1px solid #F1F3F5', background: '#FAFBFC', flexWrap: 'wrap'
                }}>
                    {!embedded && <Button
                        onClick={onClose}
                        variant="ghost"
                        size="sm"
                        style={{ boxShadow: 'none', padding: '10px 16px', fontSize: '0.85rem' }}
                    >
                        그대로 두고 닫기
                    </Button>}

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {selectedId && (
                            <Button
                                onClick={handleApplySelected}
                                disabled={saving || isTooLong}
                                size="sm"
                                style={{
                                    background: 'white', color: '#374151', border: '1px solid #D1D5DB',
                                    boxShadow: 'none', padding: '10px 16px', fontSize: '0.85rem'
                                }}
                            >
                                고른 기준으로 바꾸기
                            </Button>
                        )}
                        <Button
                            onClick={handleApplyEdited}
                            disabled={saving || !isDirty || !draft.trim() || isTooLong}
                            size="sm"
                            style={{
                                background: accent, color: 'white', border: 'none',
                                boxShadow: 'none', padding: '10px 18px', fontSize: '0.85rem'
                            }}
                        >
                            {saving ? '저장 중…' : '이 내용으로 쓰기'}
                        </Button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

const PromptRuleModal = ({ isOpen, onClose, kind = PRESET_KIND.FEEDBACK, isMobile = false, onApplied }) => (
    <AnimatePresence>
        {isOpen && (
            <PromptRuleModalBody
                onClose={onClose}
                kind={kind}
                isMobile={isMobile}
                onApplied={onApplied}
            />
        )}
    </AnimatePresence>
);

export const PromptRuleManager = ({ kind = PRESET_KIND.FEEDBACK, isMobile = false, onApplied }) => (
    <PromptRuleModalBody
        onClose={() => {}}
        kind={kind}
        isMobile={isMobile}
        onApplied={onApplied}
        embedded
    />
);

export default PromptRuleModal;
