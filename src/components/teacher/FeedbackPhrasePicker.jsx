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
 * 관리하는 일만** 한다. 관리 화면을 따로 두지 않은 이유: 쓰는 자리에서 담고 고칠 수 없으면
 * 목록이 영영 빈다.
 *
 * 화면을 두 모드로 나눈 이유(2026-09-02):
 *   한 줄에 체크·화살표·연필·휴지통을 다 두었더니 **정작 문장이 들어갈 자리가 없었다.**
 *   글 상세의 사이드바는 380px 라 아이콘 넷이면 문장 폭이 4분의 3으로 준다. 그래서
 *   평소(고르기)에는 **번호와 문장만** 두어 폭을 다 쓰고, 조작은 `순서·편집`을 켤 때만 꺼낸다.
 *   조작은 아이콘이 아니라 **글자를 붙인 버튼**으로 문장 아래 줄에 둔다(작은 화살표는 누르기 어려웠다).
 *   순서는 줄을 통째로 끌어 옮기고, 끌기를 못 쓰는 곳을 위해 `위로`·`아래로`도 함께 둔다.
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
        addPhrase, updatePhrase, movePhrase, reorderPhrases, removePhrase, seedDefaultPhrases, clearPhraseError
    } = phraseStore || {};

    const [selected, setSelected] = useState([]);
    const [draft, setDraft] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editingText, setEditingText] = useState('');
    const [dragIndex, setDragIndex] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [busy, setBusy] = useState(false);

    const selectedPhrases = selected
        .filter((index) => index < phrases.length)
        .sort((a, b) => a - b)
        .map((index) => phrases.at(index));
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

    /*
     * 골라 둔 자리도 함께 옮긴다. 자리를 바꿀 때마다 선택이 풀리면 번호를 붙여 넣기가 번거로워진다.
     * 끌어 옮기면 사이의 문장들도 한 칸씩 밀리므로 그만큼 같이 민다.
     */
    const remapSelection = (from, to) => setSelected((current) => current.map((position) => {
        if (position === from) return to;
        if (from < to && position > from && position <= to) return position - 1;
        if (from > to && position >= to && position < from) return position + 1;
        return position;
    }));

    const handleMove = async (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= phrases.length) return;
        const moved = await runSave(() => movePhrase(index, direction));
        if (moved) remapSelection(index, target);
    };

    const handleDrop = async (to) => {
        const from = dragIndex;
        setDragIndex(null);
        setDragOverIndex(null);
        if (from === null || from === to) return;
        const moved = await runSave(() => reorderPhrases(from, to));
        if (moved) remapSelection(from, to);
    };

    const handleRemove = async (index) => {
        if (!confirm(`"${phrases.at(index)}"\n\n이 문장을 지울까요?`)) return;
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
    const textInputStyle = {
        width: '100%', boxSizing: 'border-box', padding: '10px 12px',
        border: '1px solid var(--ui-border-strong)', borderRadius: 'var(--ui-radius-sm)',
        fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink)', outline: 'none',
        fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical'
    };
    const rankStyle = (isSelected) => ({
        flexShrink: 0, minWidth: '22px', height: '22px', padding: '0 5px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--ui-radius-xs)', fontSize: 'var(--ui-text-xs)', fontWeight: 800,
        background: isSelected ? 'var(--ui-primary)' : 'var(--ui-border)',
        color: isSelected ? '#fff' : 'var(--ui-ink-muted)'
    });

    if (loading) {
        return (
            <div style={{ ...panelStyle, color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)' }}>
                문장을 불러오는 중이에요…
            </div>
        );
    }

    return (
        <div style={panelStyle}>
            {phrases.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--ui-space-2)' }}>
                    <span style={{ fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink-muted)' }}>
                        {editMode ? '줄을 끌어 순서를 바꾸세요.' : '넣을 문장을 고르세요.'}
                    </span>
                    <Button
                        type="button"
                        size="xs"
                        variant={editMode ? 'primary' : 'ghost'}
                        onClick={() => {
                            setEditMode((on) => !on);
                            setEditingIndex(null);
                            clearPhraseError?.();
                        }}
                    >
                        {editMode ? '✓ 편집 끝내기' : '✏️ 순서·편집'}
                    </Button>
                </div>
            )}

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ui-space-2)', maxHeight: '480px', overflowY: 'auto' }}>
                    {phrases.map((phrase, index) => {
                        const isSelected = selected.includes(index);
                        const isEditing = editingIndex === index;
                        const isDropTarget = dragOverIndex === index && dragIndex !== null && dragIndex !== index;

                        return (
                            <div
                                key={phrase}
                                draggable={editMode && !isEditing}
                                onDragStart={() => setDragIndex(index)}
                                onDragOver={(event) => { event.preventDefault(); setDragOverIndex(index); }}
                                onDragLeave={() => setDragOverIndex((current) => (current === index ? null : current))}
                                onDrop={(event) => { event.preventDefault(); void handleDrop(index); }}
                                onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                                style={{
                                    display: 'flex', flexDirection: 'column', gap: 'var(--ui-space-2)',
                                    padding: '10px 12px', borderRadius: 'var(--ui-radius-sm)',
                                    background: isSelected ? 'var(--ui-primary-soft)' : 'var(--ui-surface-muted)',
                                    border: `1px solid ${isSelected ? 'var(--ui-primary-border)' : 'transparent'}`,
                                    borderTop: isDropTarget ? '3px solid var(--ui-primary)' : undefined,
                                    opacity: dragIndex === index ? 0.5 : 1,
                                    cursor: editMode && !isEditing ? 'grab' : 'default'
                                }}
                            >
                                {isEditing ? (
                                    <>
                                        <textarea
                                            value={editingText}
                                            onChange={(event) => setEditingText(event.target.value)}
                                            maxLength={MAX_FEEDBACK_PHRASE_LENGTH}
                                            rows={3}
                                            style={textInputStyle}
                                        />
                                        <div style={{ display: 'flex', gap: 'var(--ui-space-2)', justifyContent: 'flex-end' }}>
                                            <Button type="button" size="sm" variant="ghost" disabled={busy}
                                                onClick={() => { setEditingIndex(null); clearPhraseError?.(); }}>
                                                취소
                                            </Button>
                                            <Button type="button" size="sm" disabled={busy} onClick={handleEditSave}>저장</Button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* 문장은 언제나 줄 하나를 통째로 쓴다 — 조작은 아래 줄로 내린다. */}
                                        <label style={{
                                            display: 'flex', alignItems: 'flex-start', gap: 'var(--ui-space-2)',
                                            cursor: editMode ? 'grab' : 'pointer',
                                            fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink)', lineHeight: 1.7
                                        }}>
                                            {editMode ? (
                                                <span style={rankStyle(isSelected)} title="끌어서 순서 바꾸기">⠿ {index + 1}</span>
                                            ) : (
                                                <>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggle(index)}
                                                        style={{ marginTop: '3px', width: '17px', height: '17px', flexShrink: 0 }}
                                                    />
                                                    <span style={rankStyle(isSelected)}>{index + 1}</span>
                                                </>
                                            )}
                                            <span style={{ flex: 1, minWidth: 0 }}>{phrase}</span>
                                        </label>

                                        {editMode && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-1)', paddingLeft: '2px' }}>
                                                <Button type="button" size="xs" variant="ghost" disabled={busy || index === 0}
                                                    onClick={() => handleMove(index, -1)}>
                                                    ▲ 위로
                                                </Button>
                                                <Button type="button" size="xs" variant="ghost" disabled={busy || index === phrases.length - 1}
                                                    onClick={() => handleMove(index, 1)}>
                                                    ▼ 아래로
                                                </Button>
                                                <Button type="button" size="xs" variant="ghost" disabled={busy}
                                                    onClick={() => { clearPhraseError?.(); setEditingIndex(index); setEditingText(phrase); }}>
                                                    고치기
                                                </Button>
                                                <Button type="button" size="xs" variant="ghost" disabled={busy}
                                                    onClick={() => handleRemove(index)}
                                                    style={{ color: 'var(--ui-danger)' }}>
                                                    지우기
                                                </Button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {phrases.length < MAX_FEEDBACK_PHRASES && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ui-space-2)' }}>
                    <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="새 문장을 적어 담으세요"
                        maxLength={MAX_FEEDBACK_PHRASE_LENGTH}
                        rows={2}
                        style={textInputStyle}
                    />
                    <Button type="button" size="sm" variant="outline" disabled={busy || !draft.trim()}
                        onClick={handleAdd} style={{ alignSelf: 'flex-end' }}>
                        + 담기
                    </Button>
                </div>
            )}

            {error && (
                <p style={{ margin: 0, fontSize: 'var(--ui-text-sm)', color: 'var(--ui-danger)' }}>{error}</p>
            )}

            {!editMode && (
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
            )}
        </div>
    );
};

export default FeedbackPhrasePicker;
