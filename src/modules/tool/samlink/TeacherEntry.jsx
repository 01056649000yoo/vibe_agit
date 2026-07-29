import React, { useState } from 'react';

const SAMLINK_URL = 'https://샘링크.kr';

const SamlinkTeacherEntry = ({ isMobile }) => {
    const [frameKey, setFrameKey] = useState(0);
    const [loaded, setLoaded] = useState(false);

    const reload = () => {
        setLoaded(false);
        setFrameKey((current) => current + 1);
    };

    return (
        <section style={{
            minHeight: isMobile ? '72vh' : 'calc(100vh - 190px)', borderRadius: isMobile ? '18px' : '24px',
            overflow: 'hidden', border: '1px solid #DCE6EE', background: '#F8FAFC',
            boxShadow: '0 12px 36px rgba(15,23,42,.08)', display: 'flex', flexDirection: 'column'
        }}>
            <header style={{
                padding: isMobile ? '12px' : '14px 18px', background: 'white', borderBottom: '1px solid #E2E8F0',
                display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'
            }}>
                <div style={{ flex: 1, minWidth: '170px' }}>
                    <strong style={{ color: '#1E293B' }}>🔗 쌤링크</strong>
                    <span style={{ marginLeft: '8px', color: '#94A3B8', fontSize: '0.75rem' }}>샘링크.kr</span>
                </div>
                <button type="button" onClick={reload} style={controlStyle}>새로고침</button>
                <a href={SAMLINK_URL} target="_blank" rel="noreferrer" style={{ ...controlStyle, textDecoration: 'none', background: '#2563EB', color: 'white', borderColor: '#2563EB' }}>
                    새 창에서 열기 ↗
                </a>
            </header>

            <div style={{ position: 'relative', flex: 1, minHeight: isMobile ? '65vh' : '680px', background: 'white' }}>
                {!loaded && (
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#64748B', fontWeight: '900', background: '#F8FAFC' }}>
                        쌤링크를 불러오는 중입니다...
                    </div>
                )}
                <iframe
                    key={frameKey}
                    title="쌤링크 수업 링크 관리"
                    src={SAMLINK_URL}
                    onLoad={() => setLoaded(true)}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="clipboard-read; clipboard-write"
                    style={{ width: '100%', height: '100%', minHeight: isMobile ? '65vh' : '680px', border: 0, display: 'block', background: 'white' }}
                />
            </div>
        </section>
    );
};

const controlStyle = {
    minHeight: '34px', padding: '7px 11px', borderRadius: '10px', border: '1px solid #CBD5E1',
    background: 'white', color: '#475569', fontSize: '0.76rem', fontWeight: '900', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box'
};

export default SamlinkTeacherEntry;
