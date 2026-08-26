import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [dashboard, cleanup, dormant, table] = await Promise.all([
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('src/components/admin/AdminCleanupPanel.jsx', 'utf8'),
    readFile('src/components/admin/AdminDormantPanel.jsx', 'utf8'),
    readFile('src/components/admin/SelectableTeacherTable.jsx', 'utf8')
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

test('장기 미접속과 정리 대상 표는 필터된 모든 행을 제한 높이 안에서 스크롤한다', () => {
    assert.match(dormant, /rows=\{rows\}/);
    assert.match(cleanup, /rows=\{rows\}/);
    assert.match(table, /rows\.map\(row/);
    assert.doesNotMatch(table, /rows\.slice/);
    assert.match(table, /maxHeight: '68vh'/);
    assert.match(table, /position: 'sticky', top: 0/);
});
