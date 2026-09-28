import React, { lazy, Suspense, useEffect, useMemo } from 'react';
import TeacherSideMenu from './TeacherSideMenu';
import { useRememberedChoice } from '../../hooks/useRememberedChoice';
import { TEACHER_TOOL_SECTION_LABEL } from '../../constants/teacherNav.js';
import { TEACHER_TOOL_IDS, TEACHER_TOOL_MODULES } from './teacherTools.js';
import { toolAnchorId, tourAnchor } from '../../guides/teacherTour.js';

const TOOL_MODULES = TEACHER_TOOL_MODULES.map((module) => ({ module, Entry: lazy(module.teacherEntry) }));
const TOOL_IDS = TEACHER_TOOL_IDS;

const TeachingToolsHub = ({
    activeClass,
    teacherInfo,
    isMobile,
    onTeacherSchoolChange,
    navigationTarget,
    onNavigationHandled,
    // 머리말 단축 단추가 넘긴 동작(예: 급식판 전체화면). 그 도구에만 건네고, 도구가 처리하면 대시보드가 지운다.
    launchRequest,
    onLaunchHandled
}) => {
    const [selectedId, setSelectedId] = useRememberedChoice(
        'teacher-tools-selected-v1',
        TOOL_IDS,
        new URL(window.location.href).searchParams.get('tool')
    );
    const selected = useMemo(
        () => TOOL_MODULES.find(({ module }) => module.id === selectedId) || TOOL_MODULES[0] || null,
        [selectedId]
    );

    useEffect(() => {
        if (navigationTarget?.tab !== 'tools' || !navigationTarget.requestId) return;
        if (TOOL_MODULES.some(({ module }) => module.id === navigationTarget.tool)) {
            setSelectedId(navigationTarget.tool);
        }
        onNavigationHandled?.(navigationTarget.requestId);
    }, [navigationTarget, onNavigationHandled, setSelectedId]);

    if (!selected) {
        return (
            <section style={{ padding: isMobile ? '36px 20px' : '58px', borderRadius: '24px', border: '1px dashed #C4B5FD', background: 'linear-gradient(135deg,#FAF5FF,#F5F3FF)', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🔗</div>
                <h2 style={{ margin: 0, color: '#5B21B6', fontSize: 'var(--ui-text-xl)' }}>{TEACHER_TOOL_SECTION_LABEL}를 준비하고 있습니다.</h2>
                <p style={{ margin: '10px auto 0', color: '#7C3AED', lineHeight: 1.65, fontSize: 'var(--ui-text-md)' }}>새 도구가 등록되면 이곳에서 바로 실행할 수 있습니다.</p>
            </section>
        );
    }

    return (
        <section style={{ width: '100%' }}>
            <div className={`teacher-side-layout${isMobile ? ' is-stacked' : ''}`}>
                <TeacherSideMenu
                    horizontal={isMobile}
                    heading={`🧰 ${TEACHER_TOOL_SECTION_LABEL}`}
                    note="도구를 선택하면 바로 실행됩니다."
                    ariaLabel={`${TEACHER_TOOL_SECTION_LABEL} 목록`}
                    activeId={selected.module.id}
                    onSelect={setSelectedId}
                    items={TOOL_MODULES.map(({ module }) => ({
                        id: module.id,
                        label: module.name,
                        icon: module.icon || '🧩',
                        tag: module.tool?.beta ? 'Beta' : null,
                        anchor: tourAnchor(toolAnchorId(module.id))
                    }))}
                />
                <div style={{ minWidth: 0 }}>
                    <Suspense fallback={<div style={{ padding: '70px', textAlign: 'center', color: '#94A3B8' }}>{selected.module.name}을 불러오는 중입니다...</div>}>
                        <selected.Entry
                            activeClass={activeClass}
                            teacherInfo={teacherInfo}
                            isMobile={isMobile}
                            module={selected.module}
                            onTeacherSchoolChange={onTeacherSchoolChange}
                            launchRequest={launchRequest?.toolId === selected.module.id ? launchRequest : null}
                            onLaunchHandled={onLaunchHandled}
                        />
                    </Suspense>
                </div>
            </div>
        </section>
    );
};

export default TeachingToolsHub;
