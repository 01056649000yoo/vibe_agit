import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dashboard = readFileSync('src/components/teacher/TeacherDashboard.jsx', 'utf8');
const css = readFileSync('src/components/teacher/TeacherDashboard.css', 'utf8');
const accountMenu = readFileSync('src/components/teacher/TeacherAccountMenu.jsx', 'utf8');

test('머리말은 자주 쓰는 것 · 소식 · 계정 셋으로 갈린다', () => {
    /*
     * 2026-09-14 지적: "메뉴가 너무 정신이 없다".
     * 한 줄에 여덟 개가 같은 크기·같은 회색으로 있었고, 강조가 넷이라(노랑·주황·빨강·빨간 배지)
     * 강조가 없는 것과 같았다. 색이 아니라 **자리**로 가른다.
     */
    assert.match(dashboard, /className="teacher-dashboard__tools"/);
    assert.match(dashboard, /teacher-dashboard__tools-group--news/);
    assert.match(dashboard, /<TeacherAccountMenu/);
    assert.match(css, /\.teacher-dashboard__tools-group--news \{[^}]*border-left/);
});

test('어쩌다 쓰는 것만 접고 자주 쓰는 것은 밖에 남긴다', () => {
    // 활용 안내서와 우리 반 스크린은 매일 쓴다. 접으면 한 번 더 눌러야 한다.
    const header = dashboard.slice(dashboard.indexOf('teacher-dashboard__tools'), dashboard.indexOf('</header>'));
    assert.match(header, /활용 안내서/);
    assert.match(header, /우리 반 스크린/);
    // 계정 항목은 메뉴 안에 있다.
    assert.ok(!header.includes('🛡️ 관리자'), '관리자가 아직 머리말에 나와 있습니다.');
    ['관리자', '내 정보 수정', '로그아웃'].forEach((label) => assert.ok(accountMenu.includes(label), `${label} 가 계정 메뉴에 없습니다.`));
});

test('동행 모드가 짚는 자리는 접지 않는다', () => {
    /*
     * 숨은 단추에는 테두리를 씌울 수 없다. `우리 반 스크린`(class-board-open)을 접으면
     * 그 단계에서 "메뉴를 누르세요" 앞에 선생님이 갇힌다.
     */
    const header = dashboard.slice(dashboard.indexOf('teacher-dashboard__tools'), dashboard.indexOf('</header>'));
    assert.match(header, /tourAnchor\(TEACHER_TOUR_ANCHORS\.CLASS_BOARD_OPEN\)/);
    assert.ok(!accountMenu.includes('tourAnchor'), '계정 메뉴 안에 동행 모드 자리가 들어갔습니다.');
});

test('로그아웃은 더 이상 빨갛지 않다', () => {
    // 하루에 한 번 쓸까 말까 한 단추가 제일 튀면 안 된다.
    assert.ok(!/로그아웃[\s\S]{0,200}#DC3545/.test(dashboard), '로그아웃이 아직 빨간색입니다.');
    assert.match(css, /\.teacher-account__item\.is-leave \{[^}]*--ui-ink-muted/);
});

test('업무 메뉴는 네 무리가 보이고 머리말과 다른 층이다', () => {
    /*
     * 열한 개가 평평하게 늘어서 있었다(간격 14px · 회색 1px 선). 간격을 넓히고 선을 진하게 한다.
     * 묶어서 접지는 않는다 — 동행 모드 스무 단계가 이 메뉴를 하나씩 짚는다.
     */
    assert.match(css, /\.teacher-dashboard__nav-item\.is-section-start \{\s*margin-left: 26px;/);
    assert.match(css, /\.teacher-dashboard__nav \{[\s\S]{0,220}background: var\(--ui-surface-muted\)/);
    // 회색 줄 위에서 지금 자리가 흰 바탕으로 떠오른다.
    assert.match(dashboard, /background: isActive \? 'white' : 'transparent'/);
});
