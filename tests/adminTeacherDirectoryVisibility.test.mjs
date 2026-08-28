import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [dashboard, cleanup, dormant, table, usageHook, usagePanel] = await Promise.all([
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('src/components/admin/AdminCleanupPanel.jsx', 'utf8'),
    readFile('src/components/admin/AdminDormantPanel.jsx', 'utf8'),
    readFile('src/components/admin/SelectableTeacherTable.jsx', 'utf8'),
    readFile('src/hooks/useAdminUsage.js', 'utf8'),
    readFile('src/components/admin/AdminUsagePanel.jsx', 'utf8')
]);

test('첫 선생님 화면은 전체 명단임을 밝히고 한 페이지 범위를 분명히 보여 준다', () => {
    assert.match(dashboard, /\{ id: 'active', label: '전체 명단' \}/);
    assert.match(dashboard, /const ITEMS_PER_PAGE = 25/);
    assert.match(dashboard, /\{start\}–\{end\} \/ 총 \{totalCount\}명/);
    assert.match(dashboard, /<select[\s\S]*?Array\.from\(\{ length: pageCount \}/);
    assert.doesNotMatch(dashboard, /Array\.from\(\{ length: teacherPageCount \}/);
});

test('정리 대상은 기본 진입 때 종류와 가입일로 후보를 숨기지 않는다', () => {
    assert.match(cleanup, /const \[groupId, setGroupId\] = useState\('ALL'\)/);
    assert.match(cleanup, /const \[graceDays, setGraceDays\] = useState\(0\)/);
    assert.match(cleanup, /groupId === 'ALL' \|\| row\.usage_status === groupId/);
    assert.match(cleanup, /전체 정리 후보/);
    assert.match(cleanup, /이름·학교·이메일 검색/);
    assert.match(cleanup, /cleanupCandidates\.length/);
});

test('관리자 대시보드는 정리 후보를 노출하지 않고 장기 미접속만 보여 준다', () => {
    assert.doesNotMatch(dashboard, /AdminCleanupPanel/);
    assert.doesNotMatch(dashboard, /id: 'cleanup'/);
    assert.doesNotMatch(dashboard, /정리 후보 전체/);
    assert.doesNotMatch(dashboard, /정리 대상/);
    assert.match(dashboard, /\{ id: 'dormant', label: '장기 미접속' \}/);
});

test('장기 미접속과 휴면계정은 모든 가입 교사를 90일·365일 고정 기준으로 나눈다', () => {
    assert.match(usageHook, /export const DORMANT_DAYS = 90/);
    assert.match(usageHook, /export const DORMANT_ACCOUNT_DAYS = 365/);
    assert.ok((usageHook.match(/p_dormant_days: DORMANT_DAYS/g) || []).length === 2);
    assert.match(usageHook, /inactiveDays >= DORMANT_DAYS && inactiveDays < DORMANT_ACCOUNT_DAYS/);
    assert.match(usageHook, /teachers\.filter\(t => Number\(t\.days_since_login\) >= DORMANT_ACCOUNT_DAYS\)/);
    assert.doesNotMatch(usageHook, /DORMANT_DAY_OPTIONS/);
    assert.doesNotMatch(usagePanel, /미접속 기준/);
    assert.match(dormant, /id: 'LONG_INACTIVE'/);
    assert.match(dormant, /id: 'DORMANT'/);
    assert.match(dormant, /휴면계정 1년 이상/);
    assert.match(dormant, /다시 로그인하면 자동 해제됩니다/);
});

test('장기 미접속과 정리 대상 표는 필터된 모든 행을 제한 높이 안에서 스크롤한다', () => {
    assert.match(dormant, /rows=\{rows\}/);
    assert.match(cleanup, /rows=\{rows\}/);
    assert.match(table, /rows\.map\(row/);
    assert.doesNotMatch(table, /rows\.slice/);
    assert.match(table, /maxHeight: '68vh'/);
    assert.match(table, /position: 'sticky', top: 0/);
});
