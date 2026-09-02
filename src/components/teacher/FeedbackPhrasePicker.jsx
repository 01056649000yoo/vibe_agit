import React, { useState } from 'react';
import Button from '../common/Button';
import {
    DEFAULT_FEEDBACK_PHRASES,
    MAX_FEEDBACK_PHRASE_LENGTH,
    MAX_FEEDBACK_PHRASES,
    buildFeedbackPhraseMessage
} from '../../constants/feedbackPhrases';

/*
 * 자주 쓰는 피드백 문장 고르기.
 *
 * 낱개 피드백(글 상세)과 일괄 다시쓰기(제출 현황) 두 곳이 같은 부품을 쓴다.
 * 고른 문장을 어떻게 쓸지는 부르는 쪽이 정하고(`onApply`), 이 부품은 **문장을 고르고
 * 관리하는 일만** 한다.
 *
 * 관리 화면을 따로 두지 않은 이유: 쓰는 자리에서 담고 고칠 수 없으면 목록이 영영 빈다.
 */
const FeedbackPhrasePicker = ({
    phraseStore,
    onApply,
    applyLabel = '문장 넣기',
    applyHint = '',
    disabled = false
}) => {
    const {
        phrases = [], loading, error,
        addPhrase, updatePhrase, removePhrase, seedDefaultPhrases, clearPhraseError
    } = phraseStore || {};

    const [selected, setSelected] = useState([]);
    const [draft, setDraft] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);
    const [editingText, setEditingText] = useState('');
    const [busy, setBusy] = useState(false);

    const selectedPhrases = selected
        .filter((index) => index < phrases.length)
        .sort((a, b) => a - b)
        .map((index) => phrases[index]);
    const message = buildFeedbackPhraseMessage(selectedPhrases);

    const toggle = (index) => {
        clearPhraseError?.();
        setSelected((current) => (current.includes(index)
            ? current.filter((item) => item !== index)
            : [...current, index]));
    };

    const runSave = async (task) => {
        setBusy(true);
        try { return await task(); } finally { setBusy(false); }
    };

    const handleAdd = async () => {
        const saved = await runSave(() => addPhrase(draft));
        if (saved) setDraft('');
    };

    const handleEditSave = async () => {
        const saved = await runSave(() => updatePhrase(editingIndex, editingText));
        if (saved) { setEditingIndex(null); setEditingText(''); }
    };

    const handleRemove = async (index) => {
        if (!confirm(`"${phrases[index]}"\n\n이 문장을 지울까요?`)) return;
        const removed = await runSave(() => removePhrase(index));
        // 지운 뒤에는 자리가 밀리므로 골라 둔 것을 비운다.
        if (removed) setSelected([]);
    };

    const panelStyle = {
        display: 'flex', flexDirection: 'column', gap: 'var(--ui-space-3)',
        padding: 'var(--ui-space-4)',
        border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-lg)',
        background: 'var(--ui-surface)'
    };
    const inputStyle = {
        flex: 1, minWidth: 0, padding: '9px 12px',
        border: '1px solid var(--ui-border-strong)', borderRadius: 'var(--ui-radius-sm)',
        fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink)', outline: 'none',
        fontFamily: 'inherit'
    };

    if (loading) {
        return (
            <div style={{ ...panelStyle, color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                문장을 불러오는 중이에요…
            </div>
        );
    }

    return (
        <div style={panelStyle}>
            {phrases.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ui-space-2)' }}>
                    <p style={{ margin: 0, fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink-muted)', lineHeight: 1.6 }}>
                        저장한 문장이 아직 없어요. 아래 기본 문장을 담아 두고 고쳐 쓰거나,
                        직접 새 문장을 적어 담으세요.
                    </p>
                    <ul style={{
                        margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column',
                        gap: 'var(--ui-space-1)', fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink-strong)'
                    }}>
                        {DEFAULT_FEEDBACK_PHRASES.map((phrase) => <li key={phrase}>{phrase}</li>)}
                    </ul>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => runSave(seedDefaultPhrases)}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        📥 기본 문장 {DEFAULT_FEEDBACK_PHRASES.length}개 담기
                    </Button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ui-space-2)', maxHeight: '260px', overflowY: 'auto' }}>
                    {phrases.map((phrase, index) => (
                        <div
                            key={phrase}
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 'var(--ui-space-2)',
                                padding: '8px 10px', borderRadius: 'var(--ui-radius-sm)',
                                background: selected.includes(index) ? 'var(--ui-primary-soft)' : 'var(--ui-surface-muted)',
                                border: `1px solid ${selected.includes(index) ? 'var(--ui-primary-border)' : 'transparent'}`
                            }}
                        >
                            {editingIndex === index ? (
                                <>
                                    <input
                                        value={editingText}
                                        onChange={(event) => setEditingText(event.target.value)}
                                        maxLength={MAX_FEEDBACK_PHRASE_LENGTH}
                                        style={inputStyle}
                                    />
                                    <Button type="button" size="xs" disabled={busy} onClick={handleEditSave}>저장</Button>
                                    <Button
                                        type="button" size="xs" variant="ghost" disabled={busy}
                                        onClick={() => { setEditingIndex(null); clearPhraseError?.(); }}
                                    >
                                        취소
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <label style={{
                                        flex: 1, display: 'flex', alignItems: 'flex-start', gap: 'var(--ui-space-2)',
                                        cursor: 'pointer', fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink)', lineHeight: 1.6
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(index)}
                                            onChange={() => toggle(index)}
                                            style={{ marginTop: '3px', width: '16px', height: '16px', flexShrink: 0 }}
                                        />
                                        <span>{phrase}</span>
                                    </label>
                                    <button
                                        type="button"
                                        title="문장 고치기"
                                        onClick={() => {
                                            clearPhraseError?.();
                                            setEditingIndex(index);
                                            setEditingText(phrase);
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--ui-text-sm)' }}
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        type="button"
                                        title="문장 지우기"
                                        disabled={busy}
                                        onClick={() => handleRemove(index)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--ui-text-sm)' }}
                                    >
                                        🗑️
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {phrases.length < MAX_FEEDBACK_PHRASES && (
                <div style={{ display: 'flex', gap: 'var(--ui-space-2)' }}>
                    <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleAdd(); } }}
                        placeholder="새 문장을 적어 담으세요"
                        maxLength={MAX_FEEDBACK_PHRASE_LENGTH}
                        style={inputStyle}
                    />
                    <Button type="button" size="sm" variant="outline" disabled={busy || !draft.trim()} onClick={handleAdd}>
                        + 담기
                    </Button>
                </div>
            )}

            {error && (
                <p style={{ margin: 0, fontSize: 'var(--ui-text-sm)', color: 'var(--ui-danger)' }}>{error}</p>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--ui-space-2)', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink-muted)' }}>
                    {selectedPhrases.length === 0
                        ? (applyHint || '넣을 문장을 고르세요.')
                        : `${selectedPhrases.length}개 선택${selectedPhrases.length > 1 ? ' — 번호를 붙여 넣습니다' : ''}`}
                </span>
                <Button
                    type="button"
                    size="sm"
                    disabled={disabled || busy || selectedPhrases.length === 0}
                    onClick={() => { onApply(message); setSelected([]); }}
                >
                    {applyLabel}
                </Button>
            </div>
        </div>
    );
};

export default FeedbackPhrasePicker;
