import React from 'react';

const parseLegacyStanzas = (content) => (
    content?.trim() ? content.split(/\n\s*\n/).map((stanza) => stanza.trim()) : []
);

const PoemEditor = ({
    title, setTitle, content, setContent, structuredContent, setStructuredContent,
    studentName, config = {}, disabled, isMobile
}) => {
    const minStanzas = Math.max(1, Number(config.min_stanzas) || 3);
    const savedStanzas = Array.isArray(structuredContent?.stanzas)
        ? structuredContent.stanzas
        : parseLegacyStanzas(content);
    const stanzas = [...savedStanzas];
    while (stanzas.length < minStanzas) stanzas.push('');

    const updateStanzas = (next) => {
        setStructuredContent({ template: 'poem', version: 1, stanzas: next });
        setContent(next.join('\n\n'));
    };

    return (
        <div>
            <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="시의 제목을 적어주세요"
                disabled={disabled}
                style={{ width: '100%', boxSizing: 'border-box', padding: '16px 0', fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: '900', border: 'none', borderBottom: '2px solid #DCFCE7', outline: 'none', color: '#14532D', background: 'transparent' }}
            />
            <div style={{ textAlign: 'right', color: '#64748B', fontSize: '0.9rem', margin: '10px 4px 24px' }}>쓴이: <strong>{studentName || '학생'}</strong></div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {stanzas.map((stanza, index) => (
                    <div key={index} style={{ padding: '16px', borderRadius: '18px', background: '#F7FEE7', border: '1px solid #D9F99D' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <strong style={{ color: '#3F6212', fontSize: '0.85rem' }}>{index + 1}연</strong>
                            {stanzas.length > minStanzas && !disabled && (
                                <button type="button" onClick={() => updateStanzas(stanzas.filter((_, stanzaIndex) => stanzaIndex !== index))} style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer' }}>연 삭제</button>
                            )}
                        </div>
                        <textarea
                            value={stanza}
                            onChange={(event) => {
                                const next = [...stanzas];
                                next[index] = event.target.value;
                                updateStanzas(next);
                            }}
                            placeholder={`${index + 1}연의 시구를 행으로 나누어 적어보세요`}
                            disabled={disabled}
                            spellCheck
                            lang="ko"
                            style={{ width: '100%', minHeight: '120px', boxSizing: 'border-box', padding: '12px', border: 'none', borderRadius: '12px', resize: 'vertical', outline: 'none', background: 'white', fontSize: isMobile ? '1.05rem' : '1.15rem', lineHeight: 1.9, fontFamily: 'inherit' }}
                        />
                    </div>
                ))}
            </div>

            {!disabled && (
                <button type="button" onClick={() => updateStanzas([...stanzas, ''])} style={{ width: '100%', marginTop: '14px', padding: '14px', borderRadius: '14px', border: '2px dashed #86EFAC', background: '#F0FDF4', color: '#15803D', fontWeight: '900', cursor: 'pointer' }}>
                    ＋ 연 추가
                </button>
            )}
        </div>
    );
};

export default PoemEditor;
