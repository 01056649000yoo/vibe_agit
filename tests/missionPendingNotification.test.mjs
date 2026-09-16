import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('과제 카드(MissionItem)는 미확인 글(pendingCount > 0)이 있으면 NEW 배지와 강조 스타일을 가진다', async () => {
    const code = await readFile('src/components/teacher/MissionList.jsx', 'utf8');

    // NEW 배지 선언 확인
    assert.match(code, /NEW \{pendingCount\}/, 'NEW {pendingCount} 배지가 없습니다.');
    assert.match(code, /hasPending\s*=\s*pendingCount\s*>\s*0\s*&&\s*!isMeetingMission/, 'hasPending 조건이 올바르지 않습니다.');

    // 카드 테두리 하이라이트 확인
    assert.match(code, /hasPending\s*\?\s*['"]1\.5px solid #FCA5A5['"]/, 'hasPending 시 카드 테두리 하이라이트가 누락되었습니다.');

    // 버튼 텍스트에 미확인 건수 표시 확인
    assert.match(code, /미확인 \$\{pendingCount\}/, '확인 버튼에 미확인 건수 표시가 누락되었습니다.');
});

test('미확인 글이 있는 과제가 1개 이상이면 필터바에 "확인 필요" 탭이 추가된다', async () => {
    const code = await readFile('src/components/teacher/MissionList.jsx', 'utf8');

    assert.match(code, /id:\s*['"]pending['"]/, 'pending 필터 id가 누락되었습니다.');
    assert.match(code, /label:\s*['"]🔔 확인 필요['"]/, '🔔 확인 필요 필터 라벨이 누락되었습니다.');
    assert.match(code, /activeFilter === 'pending'/, 'pending 필터 선택 분기가 누락되었습니다.');
});

test('선생님 대시보드는 과제 미확인 건수를 받아 2차 메뉴와 1차 메뉴에 알림을 표시한다', async () => {
    const dashCode = await readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8');

    // 상태 선언 및 전달 확인
    assert.match(dashCode, /missionPendingTotal,\s*setMissionPendingTotal/, 'missionPendingTotal 상태가 없습니다.');
    assert.match(dashCode, /onPendingCountChange=\{setMissionPendingTotal\}/, 'TeacherWritingHub로 onPendingCountChange가 전달되지 않았습니다.');

    // 2차 탭 뱃지 확인
    assert.match(dashCode, /tab\.id === 'dashboard' && missionPendingTotal > 0/, '과제 탭 미확인 뱃지 조건이 누락되었습니다.');
    assert.match(dashCode, /teacher-subtab__badge-new/, 'teacher-subtab__badge-new 클래스가 누락되었습니다.');

    // 1차 탭 알림 확인
    assert.match(dashCode, /missionPendingTotal\s*>\s*0/, '글쓰기 탭 미확인 조건이 누락되었습니다.');
    assert.match(dashCode, /teacher-dashboard__nav-new/, 'teacher-dashboard__nav-new 클래스가 누락되었습니다.');
});

test('대시보드 CSS는 새 알림 뱃지와 도트 스타일을 디자인 시스템 규칙에 맞게 갖춘다', async () => {
    const css = await readFile('src/components/teacher/TeacherDashboard.css', 'utf8');

    assert.match(css, /\.teacher-subtab__badge-new\s*\{/, 'teacher-subtab__badge-new 스타일이 없습니다.');
    assert.match(css, /font-size:\s*var\(--ui-text-xs\);/, '뱃지 글자 크기가 디자인 시스템 토큰을 쓰지 않았습니다.');
    assert.match(css, /\.teacher-dashboard__nav-dot\s*\{/, 'teacher-dashboard__nav-dot 스타일이 없습니다.');
});
