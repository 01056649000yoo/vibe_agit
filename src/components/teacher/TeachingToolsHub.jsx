import React, { lazy, Suspense, useMemo, useState } from 'react';
import { getAllModules } from '../../modules/registry';

const TOOL_MODULES = getAllModules()
    .filter((module) => module.part === 'tool' && module.available !== false && typeof module.teacherEntry === 'function')
    .sort((a, b) => (a.tool?.order ?? 100) - (b.tool?.order ?? 100))
    .map((module) => ({ module, Entry: lazy(module.teacherEntry) }));

const TeachingToolsHub = ({ activeClass, isMobile }) => {
    const [selectedId, setSelectedId] = useState(null);
    const selected = useMemo(() => TOOL_MODULES.find(({ module }) => module.id === selectedId) || null, [selectedId]);

    if (selected) {
        return (
            <section style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <button type="button" onClick={() => setSelectedId(null)} style={{ border: 'none', background: 'transparent', color: '#2563EB', fontWeight: '900', cursor: 'pointer', marginBottom: '16px' }}>
                    ← 수업 도구 전체
                </button>
                <Suspense fallback={<div style={{ padding: '70px', textAlign: 'center', color: '#94A3B8' }}>{selected.module.name}을 불러오는 중입니다...</div>}>
                    <selected.Entry activeClass={activeClass} isMobile={isMobile} module={selected.module} />
                </Suspense>
            </section>
        );
    }

    return (
        <section style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '24px' }}>
                <span style={{ color: '#7C3AED', fontSize: '0.78rem', fontWeight: '950', letterSpacing: '0.08em' }}>TEACHING TOOLS</span>
                <h1 style={{ margin: '6px 0 7px', color: '#172033', fontSize: isMobile ? '1.5rem' : '1.9rem' }}>🧰 수업 도구</h1>
                <p style={{ margin: 0, color: '#64748B', lineHeight: 1.6 }}>쌤링크를 비롯한 교사용 앱을 한곳에서 실행하고 관리합니다.</p>
            </div>

            {TOOL_MODULES.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
                    {TOOL_MODULES.map(({ module }) => (
                        <button key={module.id} type="button" onClick={() => setSelectedId(module.id)} style={{
                            padding: '22px', borderRadius: '22px', border: '1px solid #E2E8F0', background: 'white',
                            textAlign: 'left', cursor: 'pointer', boxShadow: '0 8px 24px rgba(15,23,42,.05)'
                        }}>
                            <div style={{ fontSize: '2.2rem' }}>{module.icon || '🧩'}</div>
                            <div style={{ marginTop: '14px', color: '#1E293B', fontWeight: '950', fontSize: '1.05rem' }}>{module.name}</div>
                            <div style={{ marginTop: '6px', color: '#64748B', fontSize: '0.82rem', lineHeight: 1.5 }}>{module.description}</div>
                            <div style={{ marginTop: '16px', color: '#7C3AED', fontWeight: '900', fontSize: '0.78rem' }}>도구 열기 →</div>
                        </button>
                    ))}
                </div>
            ) : (
                <div style={{ padding: isMobile ? '36px 20px' : '58px', borderRadius: '24px', border: '1px dashed #C4B5FD', background: 'linear-gradient(135deg,#FAF5FF,#F5F3FF)', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔗</div>
                    <h2 style={{ margin: 0, color: '#5B21B6', fontSize: '1.25rem' }}>수업 앱 통합 공간을 준비했습니다.</h2>
                    <p style={{ margin: '10px auto 0', maxWidth: '560px', color: '#7C3AED', lineHeight: 1.65, fontSize: '0.9rem' }}>
                        쌤링크 같은 앱을 모듈로 등록하면 이 화면에 자동으로 추가됩니다. 앱 코드를 섞지 않고 진입점과 데이터 연동을 분리해 지속적으로 확장할 수 있습니다.
                    </p>
                </div>
            )}
        </section>
    );
};

export default TeachingToolsHub;
