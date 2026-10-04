import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// 관리자에게 안 본 선생님 문의가 있으면 이름 옆 빨간 불(2026-10-05, 선생님 요청).

test('기준은 관리자 대시보드 `새 의견 제보` 와 같은 status=open, 관리자에게만 센다', async () => {
    const hook = await readFile('src/hooks/useAdminInquiryAlert.js', 'utf8');
    const admin = await readFile('src/components/admin/AdminDashboard.jsx', 'utf8');
    assert.match(hook, /from\('feedback_reports'\)[\s\S]{0,120}\.eq\('status', 'open'\)/);
    assert.match(admin, /from\('feedback_reports'\)[\s\S]{0,140}\.eq\('status', 'open'\)/, '두 곳 기준이 같아야 함');
    assert.match(hook, /if \(!isAdmin\) return/);
    assert.match(hook, /return isAdmin \? count : 0;/);
    // 훅은 supabase 클라이언트를 불러 node 에서 직접 못 연다 — 값은 소스에서 읽는다.
    const [, minutes] = hook.match(/ADMIN_INQUIRY_REFRESH_MS = (\d+) \* 60 \* 1000/) || [];
    assert.ok(Number(minutes) >= 1, '60초 미만 폴링 금지');
});

test('계정 메뉴는 문의가 있을 때만 빨간 불, 관리자 화면은 의견 제보 탭으로 바로 연다', async () => {
    const menu = await readFile('src/components/teacher/TeacherAccountMenu.jsx', 'utf8');
    const dashboard = await readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8');
    const admin = await readFile('src/components/admin/AdminDashboard.jsx', 'utf8');
    assert.match(menu, /\{inquiryCount > 0 && <span className="teacher-account__alert"/);
    assert.match(menu, /새 문의 \$\{inquiryCount\}건/);
    assert.match(dashboard, /inquiryCount=\{adminInquiryCount\}/);
    assert.match(dashboard, /if \(adminInquiryCount > 0\) rememberAdminInitialTab\('feedback'\)/);
    assert.match(admin, /useState\(\(\) => takeAdminInitialTab\('active'\)\)/);
});
