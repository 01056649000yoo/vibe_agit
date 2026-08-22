import React from 'react';
import SpellingUnderlineInput from '../../tools/spelling-lookup/SpellingUnderlineInput';
import SpellingUnderlineTextarea from '../../tools/spelling-lookup/SpellingUnderlineTextarea';
import {
    LETTER_PARTS,
    buildLetterContent,
    createLetterStructuredContent,
    normalizeLetterParts
} from './letterContent';

const LetterEditor = ({
    title, setTitle, content, setContent, structuredContent, setStructuredContent,
    studentName, config = {}, disabled, isMobile
}) => {
    const parts = normalizeLetterParts(structuredContent, content);
    const minBodyChars = Math.max(0, Number(config.min_body_chars) || 0);

    const updatePart = (key, value) => {
        const next = { ...parts, [key]: value };
        setStructuredContent(createLetterStructuredContent(next));
        setContent(buildLetterContent(next));
    };

    const inputStyle = {
        width: '100%',
        boxSizing: 'border-box',
        padding: '12px',
        border: 'none',
        borderRadius: '12px',
        outline: 'none',
        background: 'white',
        fontSize: isMobile ? '1.05rem' : '1.12rem',
        lineHeight: 1.9,
        fontFamily: 'inherit',
        resize: 'vertical'
    };

    return (
        <div>
            <SpellingUnderlineInput
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="편지의 제목을 적어주세요"
                disabled={disabled}
                autoCapitalize="sentences"
                lang="ko"
                style={{ width: '100%', boxSizing: 'border-box', padding: '16px 0', fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: '900', border: 'none', borderBottom: '2px solid #FCE7F3', outline: 'none', color: '#831843', background: 'transparent' }}
            />
            <div style={{ textAlign: 'right', color: '#64748B', fontSize: '0.9rem', margin: '10px 4px 24px' }}>
                쓴 사람: <strong>{studentName || '학생'}</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {LETTER_PARTS.map((part) => (
                    <div key={part.key} style={{ padding: '16px', borderRadius: '18px', background: '#FFF7FB', border: '1px solid #FBCFE8' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px', gap: '10px' }}>
                            <strong style={{ color: '#9D174D', fontSize: '0.85rem' }}>{part.label}</strong>
                            {part.key === 'body' && minBodyChars > 0 && (
                                <span style={{ color: parts.body.length >= minBodyChars ? '#15803D' : '#94A3B8', fontSize: '0.78rem', fontWeight: 'bold' }}>
                                    {parts.body.length} / {minBodyChars}자
                                </span>
                            )}
                        </div>
                        {part.rows === 1 ? (
                            <SpellingUnderlineInput
                                type="text"
                                value={parts[part.key]}
                                onChange={(event) => updatePart(part.key, event.target.value)}
                                placeholder={part.placeholder}
                                disabled={disabled}
                                autoCapitalize="sentences"
                                lang="ko"
                                style={inputStyle}
                            />
                        ) : (
                            <SpellingUnderlineTextarea
                                value={parts[part.key]}
                                onChange={(event) => updatePart(part.key, event.target.value)}
                                placeholder={part.placeholder}
                                disabled={disabled}
                                autoCapitalize="sentences"
                                lang="ko"
                                style={{ ...inputStyle, minHeight: `${part.rows * 34}px` }}
                            />
                        )}
                    </div>
                ))}
            </div>

            <p style={{ margin: '14px 4px 0', color: '#94A3B8', fontSize: '0.8rem' }}>
                받는 사람을 적어 두면 나중에 편지를 전할 때 그대로 쓸 수 있어요.
            </p>
        </div>
    );
};

export default LetterEditor;
