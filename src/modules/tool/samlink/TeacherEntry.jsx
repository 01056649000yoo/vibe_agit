import React, { useState } from 'react';

const SAMLINK_URL = 'https://샘링크.kr';
const SAMLINK_EMBED_URL = `${SAMLINK_URL}/?embed=agit`;

const SamlinkTeacherEntry = ({ isMobile }) => {
    const [frameKey, setFrameKey] = useState(0);
    const [loaded, setLoaded] = useState(false);

    const reload = () => {
        setLoaded(false);
        setFrameKey((current) => current + 1);
    };

    return (
        <section style={{ minHeight: isMobile ? '72vh' : 'calc(100vh - 120px)', position: 'relative', background: 'white' }}>
            <div style={{ position: 'absolute', zIndex: 2, top: isMobile ? '10px' : '14px', right: isMobile ? '10px' : '14px', display: 'flex', gap: '6px' }}>
                <button type="button" onClick={reload} title="새로고침" aria-label="쌤링크 새로고침" style={floatingControlStyle}>↻</button>
                <a href={SAMLINK_URL} target="_blank" rel="noreferrer" title="새 창에서 열기" aria-label="쌤링크 새 창에서 열기" style={{ ...floatingControlStyle, textDecoration: 'none' }}>↗</a>
            </div>

            <div style={{ position: 'relative', minHeight: isMobile ? '72vh' : 'calc(100vh - 120px)', background: 'white' }}>
                {!loaded && (
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '900', background: '#F8FAFC' }}>
                        쌤링크를 불러오는 중입니다...
                    </div>
                )}
                <iframe
                    key={frameKey}
                    title="쌤링크 수업 링크 관리"
                    src={SAMLINK_EMBED_URL}
                    onLoad={() => setLoaded(true)}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="clipboard-read; clipboard-write"
                    style={{ width: '100%', height: '100%', minHeight: isMobile ? '72vh' : 'calc(100vh - 120px)', border: 0, display: 'block', background: 'white' }}
                />
            </div>
        </section>
    );
};

const floatingControlStyle = {
    width: '34px', height: '34px', padding: 0, borderRadius: '10px', border: '1px solid #D7E0EA',
    background: 'rgba(255,255,255,.94)', color: '#475569', fontSize: '1rem', fontWeight: '900', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'
};

export default SamlinkTeacherEntry;
