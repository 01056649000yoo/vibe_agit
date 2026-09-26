import React, { useState } from 'react';
import TeacherSideMenu from '../components/teacher/TeacherSideMenu';
import TeacherPageTitle from '../components/teacher/TeacherPageTitle';
import TeacherCountBadge from '../components/teacher/TeacherCountBadge';
import { buildTeacherNavBadges } from '../components/teacher/teacherNavBadges.js';
import { TEACHER_NAV_GROUPS, getTeacherTabLabel } from '../constants/teacherNav';

/*
 * 교사 화면 틀 미리보기 (2026-09-26 UI 점검).
 *
 * 실제 부품(왼쪽 메뉴·공통 제목·처리할 일 배지)을 DB 없이 띄운다. 세부 메뉴·학급운영도구·설정이
 * 같은 폭과 모양으로 보이는지, 배지 숫자가 상단 메뉴에 합쳐지는지, 좁은 화면에서 메뉴가 가로로
 * 눕는지를 한 화면에서 본다. 대시보드 자체는 로그인이 필요해 여기서 그리지 않는다.
 */
const SAMPLE_COUNTS = { dashboard: 3, 'reading-logs': 12, diaries: 0, comments: 2, 'neighbor-agit': 140 };

const SETTINGS_SAMPLE = [
    { id: 'class', icon: '🏫', label: '학급 관리', description: '학급 생성·전환·보관' },
    { id: 'ai-prompts', icon: '🤖', label: '피드백·평어 기준', description: 'AI 피드백과 평어 작성 기준' },
    { id: 'dahandin', icon: '🍪', label: '다했니 연동', description: '다했니 쿠키를 포인트로 정산' }
];
const TOOLS_SAMPLE = [
    { id: 'class-board', icon: '🖥️', label: '우리 반 스크린', tag: 'Beta' },
    { id: 'meal-board', icon: '🍱', label: '얘들아, 밥 먹자!' },
    { id: 'classroom-arrangement', icon: '🎱', label: '자리·역할 배치' }
];

export default function TeacherLayoutPreview() {
    const [groupId, setGroupId] = useState('writing');
    const [tabByGroup, setTabByGroup] = useState({});
    const [narrow, setNarrow] = useState(false);
    const [withBadges, setWithBadges] = useState(true);
    const badges = buildTeacherNavBadges(withBadges ? SAMPLE_COUNTS : {});

    const group = TEACHER_NAV_GROUPS.find((item) => item.id === groupId);
    const isSettings = groupId === 'settings';
    const isTools = groupId === 'tools';
    const menuItems = isSettings ? SETTINGS_SAMPLE : isTools ? TOOLS_SAMPLE : group.tabs.map((tab) => ({
        id: tab.id,
        label: tab.label,
        badge: badges.tabs[tab.id] ? { count: badges.tabs[tab.id], label: `${tab.label} 처리할 일` } : null
    }));
    const activeId = Reflect.get(tabByGroup, groupId) || menuItems[0]?.id;
    const hasMenu = isSettings || isTools || group.tabs.length > 1;
    const activeLabel = isSettings || isTools
        ? menuItems.find((item) => item.id === activeId)?.label
        : null;

    return (
        <div style={{ padding: 16, background: 'var(--ui-page)', minHeight: '100%' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <label><input type="checkbox" checked={narrow} onChange={(event) => setNarrow(event.target.checked)} /> 좁은 화면(메뉴 가로)</label>
                <label><input type="checkbox" checked={withBadges} onChange={(event) => setWithBadges(event.target.checked)} /> 처리할 일 있음</label>
            </div>
            <nav aria-label="교사 업무 메뉴(미리보기)" style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--ui-border)', marginBottom: 16 }}>
                {TEACHER_NAV_GROUPS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        aria-pressed={item.id === groupId}
                        onClick={() => setGroupId(item.id)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '10px 12px', border: 0,
                            borderBottom: item.id === groupId ? '3px solid var(--ui-primary)' : '3px solid transparent',
                            background: 'transparent', color: item.id === groupId ? 'var(--ui-primary)' : 'var(--ui-ink-muted)',
                            fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer'
                        }}
                    >
                        <span aria-hidden="true">{item.icon}</span>{item.label}
                        <TeacherCountBadge count={badges.groups[item.id] || 0} label={`${item.label} 처리할 일`} />
                    </button>
                ))}
            </nav>
            <div className={hasMenu ? `teacher-side-layout${narrow ? ' is-stacked' : ''}` : undefined}>
                {hasMenu ? (
                    <TeacherSideMenu
                        semantics={isSettings || isTools ? 'nav' : 'tabs'}
                        horizontal={narrow}
                        heading={isSettings ? '⚙️ 설정' : isTools ? '🧰 학급운영도구' : undefined}
                        note={isSettings ? '필요한 항목만 골라 관리하세요.' : isTools ? '도구를 선택하면 바로 실행됩니다.' : undefined}
                        ariaLabel={`${group.label} 세부 메뉴`}
                        activeId={activeId}
                        onSelect={(id) => setTabByGroup((current) => ({ ...current, [groupId]: id }))}
                        items={menuItems}
                    />
                ) : null}
                <section style={{ minWidth: 0, padding: 18, borderRadius: 18, border: '1px solid var(--ui-border)', background: 'var(--ui-surface)' }}>
                    {activeLabel
                        ? <TeacherPageTitle title={activeLabel} guideTabId={isSettings ? `settings:${activeId}` : activeId} />
                        : <TeacherPageTitle tabId={activeId} meta={activeId === 'students' ? '24명' : undefined} />}
                    <p style={{ color: 'var(--ui-ink-muted)' }}>
                        본문 자리 — 메뉴 이름: <strong>{activeLabel || getTeacherTabLabel(activeId)}</strong>
                    </p>
                </section>
            </div>
        </div>
    );
}
