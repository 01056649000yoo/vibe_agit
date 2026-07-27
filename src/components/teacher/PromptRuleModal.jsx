import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { refinePromptWithAI } from '../../utils/refinePrompt';
import Button from '../common/Button';
import useAiPromptPresets, { PRESET_KIND } from '../../hooks/useAiPromptPresets';
import { DEFAULT_FEEDBACK_PROMPT, DEFAULT_REPORT_PROMPT } from '../../constants/aiPrompts';

/**
 * AI 규칙 보관함 모달.
 *
 * 규칙을 이름 붙여 여러 개 저장해두고 필요할 때 불러 쓴다.
 * **아무것도 건드리지 않고 닫으면 저장된 규칙이 그대로 쓰인다** — 기존 동작과 동일하다.
 *
 * 피드백 실행 버튼(제출 현황·글 상세)이 이미 모달 안에 있어서 이 창은 그 위에 겹쳐 뜬다.
 *
 * 구현 노트: 본문을 별도 컴포넌트로 분리해 열 때마다 새로 마운트시킨다.
 * 그래야 effect 로 상태를 되돌리지 않고도 항상 "지금 적용 중인 내용"에서 시작한다.
 */

const PromptRuleModalBody = ({ onClose, kind, isMobile, onApplied }) => {
    const {
        presets, activePreset, appliedContent, loading, saving, error,
        applyContent, applyPreset, savePreset, renamePreset, deletePreset
    } = useAiPromptPresets(kind);

    // 사용자가 손대기 전에는 null. 화면에는 "지금 적용 중인 내용"이 보인다.
    const [draftOverride, setDraftOverride] = useState(null);
    const [selectedOverride, setSelectedOverride] = useState(null);
    const [newName, setNewName] = useState('');
    // AI 다듬기: 원문을 건드리지 않고 제안을 따로 받아 교사가 채택 여부를 고른다
    const [refining, setRefining] = useState(false);
    const [refined, setRefined] = useState(null);
    const [refineError, setRefineError] = useState('');
    const [notice, setNotice] = useState('');

    const isReport = kind === PRESET_KIND.REPORT;
    const label = isReport ? '평어 규칙' : '피드백 규칙';
    const accent = isReport ? '#059669' : '#4F46E5';
    const defaultPrompt = isReport ? DEFAULT_REPORT_PROMPT : DEFAULT_FEEDBACK_PROMPT;

    const draft = draftOverride ?? (appliedContent || defaultPrompt);
    const selectedId = selectedOverride ?? activePreset?.id ?? null;
    const isDirty = draft.trim() !== (appliedContent || '').trim();

    const flash = (message) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 2500);
    };

    const handleSelectPreset = (preset) => {
        setSelectedOverride(preset.id);
        setDraftOverride(preset.content);
    };

    const handleApplyEdited = async () => {
        if (!draft.trim()) return;
        const ok = await applyContent(draft);
        if (ok) {
            // 프롬프트를 props 로 받아 쓰는 화면(평어 탭)이 즉시 반영되도록 알린다
            if (onApplied) onApplied(draft);
            setDraftOverride(null);
            flash('이 내용으로 적용했습니다. 이제 실행하면 이 규칙이 쓰입니다.');
        }
    };

    const handleApplySelected = async () => {
        if (!selectedId) return;
        const target = presets.find(p => p.id === selectedId);
        const ok = await applyPreset(selectedId);
        if (ok) {
            if (onApplied && target) onApplied(target.content);
            setDraftOverride(null);
            flash('선택한 규칙을 적용했습니다.');
        }
    };

    const handleSaveAsNew = async () => {
        const name = newName.trim();
        if (!name) {
            flash('규칙 이름을 입력해주세요.');
            return;
        }
        const ok = await savePreset(name, draft);
        if (ok) {
            setNewName('');
            flash(`'${name}' 규칙을 저장했습니다.`);
        }
    };

    const handleRename = async (preset) => {
        const next = prompt('새 이름을 입력하세요.', preset.name);
        if (!next || !next.trim() || next.trim() === preset.name) return;
        const ok = await renamePreset(preset.id, next);
        if (ok) flash('이름을 바꿨습니다.');
    };

    const handleDelete = async (preset) => {
        if (!confirm(`'${preset.name}' 규칙을 삭제할까요?\n지금 적용 중인 내용은 그대로 남습니다.`)) return;
        const ok = await deletePreset(preset.id);
        if (ok) {
            if (selectedId === preset.id) setSelectedOverride(null);
            flash('규칙을 삭제했습니다.');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
                backdropFilter: 'blur(4px)', zIndex: 10050,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
            }}
        >
            <motion.div
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: '980px', maxHeight: '88vh',
                    background: 'white', borderRadius: '20px', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '0 24px 60px rgba(15,23,42,0.25)'
                }}
            >
                {/* 헤더 */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '20px 24px', borderBottom: '1px solid #F1F3F5', background: '#FAFBFC'
                }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#1F2937' }}>
                            🗂️ {label} 보관함
                        </h3>
                        <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#6B7280' }}>
                            규칙을 이름 붙여 저장해두고 필요할 때 불러 쓰세요.
                            <strong style={{ color: accent }}> 그냥 닫으면 지금 규칙이 그대로 쓰입니다.</strong>
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#F1F3F5', border: 'none', width: '36px', height: '36px',
                            borderRadius: '50%', cursor: 'pointer', color: '#868E96', fontSize: '1.1rem'
                        }}
                    >
                        ✕
                    </button>
                </div>

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

                {/* 본문 */}
                <div style={{
                    flex: 1, minHeight: 0, display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : '260px 1fr'
                }}>
                    {/* 저장된 규칙 목록 */}
                    <div style={{
                        borderRight: isMobile ? 'none' : '1px solid #F1F3F5',
                        borderBottom: isMobile ? '1px solid #F1F3F5' : 'none',
                        padding: '16px', overflowY: 'auto',
                        maxHeight: isMobile ? '180px' : 'none', background: '#FCFCFD'
                    }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#9CA3AF', marginBottom: '10px' }}>
                            저장된 규칙 {presets.length}개
                        </div>

                        {loading ? (
                            <div style={{ color: '#ADB5BD', fontSize: '0.85rem' }}>불러오는 중…</div>
                        ) : presets.length === 0 ? (
                            <div style={{ color: '#ADB5BD', fontSize: '0.82rem', lineHeight: 1.6 }}>
                                아직 저장된 규칙이 없습니다.<br />
                                오른쪽에서 내용을 다듬고 이름을 붙여 저장해보세요.
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

                    {/* 편집기 */}
                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: '8px', flexWrap: 'wrap', gap: '8px'
                        }}>
                            <span style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                                현재 적용 중:{' '}
                                <strong style={{ color: accent }}>
                                    {activePreset ? activePreset.name : '이름 없는 규칙'}
                                </strong>
                                {isDirty && (
                                    <span style={{ marginLeft: '8px', color: '#D97706', fontWeight: 700 }}>
                                        · 수정됨 (아직 적용 안 됨)
                                    </span>
                                )}
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    onClick={async () => {
                                        setRefineError(''); setRefined(null); setRefining(true);
                                        try {
                                            setRefined(await refinePromptWithAI(draft));
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

                        <textarea
                            value={draft}
                            onChange={(e) => setDraftOverride(e.target.value)}
                            spellCheck={false}
                            style={{
                                flex: 1, minHeight: isMobile ? '180px' : '260px', width: '100%',
                                padding: '14px', borderRadius: '12px', border: '1px solid #E9ECEF',
                                background: '#F8F9FA', fontSize: '0.88rem', lineHeight: 1.6,
                                color: '#2C3E50', resize: 'none', boxSizing: 'border-box',
                                fontFamily: 'inherit', outline: 'none'
                            }}
                        />

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
                                    ✨ AI가 다듬은 규칙 (아직 적용 전)
                                </div>
                                <div style={{
                                    maxHeight: '160px', overflowY: 'auto', whiteSpace: 'pre-wrap',
                                    fontSize: '0.83rem', lineHeight: 1.6, color: '#2C3E50',
                                    background: 'white', padding: '10px', borderRadius: '8px', border: '1px solid #DCFCE7'
                                }}>
                                    {refined}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                    <button
                                        onClick={() => { setDraftOverride(refined); setRefined(null); }}
                                        style={{
                                            border: 'none', background: '#16A34A', color: 'white', borderRadius: '8px',
                                            padding: '7px 14px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer'
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

                        {/* 이름 붙여 저장 */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="예: 3학년 다정한 말투"
                                maxLength={40}
                                style={{
                                    flex: '1 1 200px', padding: '10px 12px', borderRadius: '10px',
                                    border: '1px solid #E9ECEF', fontSize: '0.85rem', outline: 'none'
                                }}
                            />
                            <Button
                                onClick={handleSaveAsNew}
                                disabled={saving || !newName.trim()}
                                size="sm"
                                style={{
                                    background: 'white', color: accent, border: `1px solid ${accent}`,
                                    boxShadow: 'none', padding: '10px 16px', fontSize: '0.85rem'
                                }}
                            >
                                이름 붙여 저장
                            </Button>
                        </div>
                    </div>
                </div>

                {/* 하단 액션 */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
                    padding: '16px 24px', borderTop: '1px solid #F1F3F5', background: '#FAFBFC', flexWrap: 'wrap'
                }}>
                    <Button
                        onClick={onClose}
                        variant="ghost"
                        size="sm"
                        style={{ boxShadow: 'none', padding: '10px 16px', fontSize: '0.85rem' }}
                    >
                        그냥 닫기 (지금 규칙 유지)
                    </Button>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {selectedId && (
                            <Button
                                onClick={handleApplySelected}
                                disabled={saving}
                                size="sm"
                                style={{
                                    background: 'white', color: '#374151', border: '1px solid #D1D5DB',
                                    boxShadow: 'none', padding: '10px 16px', fontSize: '0.85rem'
                                }}
                            >
                                선택한 규칙 적용
                            </Button>
                        )}
                        <Button
                            onClick={handleApplyEdited}
                            disabled={saving || !isDirty || !draft.trim()}
                            size="sm"
                            style={{
                                background: accent, color: 'white', border: 'none',
                                boxShadow: 'none', padding: '10px 18px', fontSize: '0.85rem'
                            }}
                        >
                            {saving ? '저장 중…' : '이 내용으로 적용'}
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

export default PromptRuleModal;
