import React, { lazy, Suspense, useMemo, useState } from 'react';
import { getAllModules } from '../../modules/registry';

const TOOL_MODULES = getAllModules()
    .filter((module) => module.part === 'tool' && module.available !== false && typeof module.teacherEntry === 'function')
    .sort((a, b) => (a.tool?.order ?? 100) - (b.tool?.order ?? 100))
    .map((module) => ({ module, Entry: lazy(module.teacherEntry) }));

const TeachingToolsHub = ({ activeClass, teacherInfo, isMobile, onTeacherSchoolChange }) => {
    const [selectedId, setSelectedId] = useState(() => {
        const requested = new URL(window.location.href).searchParams.get('tool');
        return TOOL_MODULES.some(({ module }) => module.id === requested)
            ? requested
            : TOOL_MODULES[0]?.module.id ?? null;
    });
    const selected = useMemo(
        () => TOOL_MODULES.find(({ module }) => module.id === selectedId) || TOOL_MODULES[0] || null,
        [selectedId]
    );

    if (!selected) {
        return (
            <section style={{ padding: isMobile ? '36px 20px' : '58px', borderRadius: '24px', border: '1px dashed #C4B5FD', background: 'linear-gradient(135deg,#FAF5FF,#F5F3FF)', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔗</div>
                <h2 style={{ margin: 0, color: '#5B21B6', fontSize: 'var(--ui-text-xl)' }}>수업 도구를 준비하고 있습니다.</h2>
                <p style={{ margin: '10px auto 0', color: '#7C3AED', lineHeight: 1.65, fontSize: 'var(--ui-text-md)' }}>새 도구가 등록되면 이곳에서 바로 실행할 수 있습니다.</p>
            </section>
        );
    }

    return (
        <section style={{ width: '100%' }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '220px minmax(0, 1fr)',
                gap: isMobile ? '12px' : '18px',
                alignItems: 'start'
            }}>
                <aside style={{
                    position: isMobile ? 'static' : 'sticky', top: isMobile ? undefined : '14px',
                    padding: isMobile ? '10px' : '14px', borderRadius: isMobile ? '16px' : '20px',
                    background: '#E9EEF6', minWidth: 0
                }}>
                    {!isMobile && (
                        <div style={{ padding: '8px 10px 14px' }}>
                            <div style={{ color: '#172033', fontWeight: '950', fontSize: 'var(--ui-text-lg)' }}>🧰 수업 도구</div>
                            <div style={{ marginTop: '6px', color: '#475569', fontSize: 'var(--ui-text-sm)', lineHeight: 1.5 }}>도구를 선택하면 바로 실행됩니다.</div>
                        </div>
                    )}
                    <nav aria-label="수업 도구 목록" style={{
                        display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '7px',
                        overflowX: isMobile ? 'auto' : 'visible', scrollbarWidth: 'thin'
                    }}>
                        {TOOL_MODULES.map(({ module }) => {
                            const active = module.id === selected.module.id;
                            return (
                                <button key={module.id} type="button" onClick={() => setSelectedId(module.id)} aria-current={active ? 'page' : undefined} style={{
                                    minWidth: isMobile ? '140px' : 0, width: isMobile ? 'auto' : '100%', padding: isMobile ? '11px 14px' : '13px 12px',
                                    borderRadius: '13px', border: active ? '1px solid #C7D7FE' : '1px solid transparent',
                                    background: active ? 'white' : 'transparent', color: active ? '#315FC4' : '#526176',
                                    boxShadow: active ? '0 5px 16px rgba(37,99,235,.10)' : 'none', cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '9px', textAlign: 'left', fontWeight: '900', whiteSpace: 'nowrap', fontSize: 'var(--ui-text-md)'
                                }}>
                                    <span aria-hidden="true" style={{ fontSize: '1.15rem' }}>{module.icon || '🧩'}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{module.name}</span>
                                </button>
                            );
                        })}
                    </nav>
                </aside>

                <main style={{ minWidth: 0 }}>
                    <Suspense fallback={<div style={{ padding: '70px', textAlign: 'center', color: '#94A3B8' }}>{selected.module.name}을 불러오는 중입니다...</div>}>
                        <selected.Entry activeClass={activeClass} teacherInfo={teacherInfo} isMobile={isMobile} module={selected.module} onTeacherSchoolChange={onTeacherSchoolChange} />
                    </Suspense>
                </main>
            </div>
        </section>
    );
};

export default TeachingToolsHub;
