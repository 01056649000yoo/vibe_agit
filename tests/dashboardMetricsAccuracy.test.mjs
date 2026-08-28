/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

const [migration, servicePanel, resourceStatus, adminDashboard, adminOverview, usagePanel, cards, classAnalysis] = await Promise.all([
    read('supabase/migrations/20261163_dashboard_metrics_accuracy.sql'),
    read('src/components/admin/AdminServicePanel.jsx'),
    read('src/components/admin/AdminResourceStatus.jsx'),
    read('src/components/admin/AdminDashboard.jsx'),
    read('src/components/admin/AdminDashboardOverview.jsx'),
    read('src/components/admin/AdminUsagePanel.jsx'),
    read('src/components/teacher/classOperationsCards.js'),
    read('src/components/teacher/ClassAnalysis.jsx'),
]);

test('학생 코드 로그인과 저장 세션 복구가 접속 시각을 남긴다', () => {
    const bindStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.bind_student_auth');
    const restoreStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.get_student_by_auth');
    const bind = migration.slice(bindStart, restoreStart);
    const restore = migration.slice(restoreStart, migration.indexOf('REVOKE ALL ON FUNCTION public.bind_student_auth'));

    assert.match(bind, /SET auth_id = v_auth_id,[\s\S]*?last_login = NOW\(\)/);
    assert.match(restore, /SET last_login = NOW\(\)/);
    assert.match(restore, /last_login < NOW\(\) - INTERVAL '10 minutes'/);
    assert.match(migration, /idx_students_class_last_login/);
});

test('서비스 현황은 한국 날짜와 실제 제출 글을 같은 기간으로 센다', () => {
    assert.match(migration, /timezone\('Asia\/Seoul', NOW\(\)\)::DATE/);
    assert.match(migration, /v_week_start := \(v_today_date - 6\)::TIMESTAMP AT TIME ZONE 'Asia\/Seoul'/);
    assert.match(migration, /WHERE is_submitted IS TRUE[\s\S]*?COALESCE\(first_submitted_at, created_at\) >= v_today_start/);
    assert.match(migration, /WHERE metric_day >= v_today_date - \(v_days - 1\)/);
    assert.match(migration, /recorded_at = NOW\(\)/);
    assert.match(servicePanel, /label="제출된 글"/);
    assert.match(servicePanel, /memory_low: '메모리 여유 부족'/);
    assert.match(servicePanel, /docker_memory_pressure: '도커 메모리 압박'/);
    assert.match(servicePanel, /host_memory_pressure: '맥 메모리 압박'/);
});

test('관리자 첫 화면은 서비스 현황의 오늘 집계를 그대로 재사용한다', async () => {
    const healthHook = await read('src/components/admin/useAdminHealthSummary.js');

    assert.match(healthHook, /admin_get_service_overview_v1/);
    assert.match(healthHook, /todayTeachers: data\?\.today\?\.teachers \?\? null/);
    assert.match(healthHook, /todayStudents: data\?\.today\?\.students \?\? null/);
    assert.match(healthHook, /todaySubmittedPosts: data\?\.today\?\.posts \?\? null/);
    assert.match(adminDashboard, /label: '오늘 접속 교사'/);
    assert.match(adminDashboard, /label: '오늘 접속 학생'/);
    assert.match(adminDashboard, /label: '오늘 제출글'/);
});

test('교사 학급 현황은 접속과 글쓰기 활동을 분리한다', () => {
    assert.match(cards, /label: '접속 학생'/);
    assert.match(cards, /numeratorPath: 'summary\.accessed_students'/);
    assert.match(cards, /label: '글쓰기 활동 학생'/);
    assert.match(classAnalysis, /accessed_students: 0/);
    assert.match(migration, /'accessed_students',[\s\S]*?last_login >= v_period_start/);
    assert.doesNotMatch(migration, /MAX\(p\.updated_at\) AS last_activity_at/);
    assert.doesNotMatch(migration, /COALESCE\(p\.first_submitted_at, p\.updated_at, p\.created_at\)/);

    const reviewClassJoins = migration.match(/review\.class_id = p_class_id/g) || [];
    assert.equal(reviewClassJoins.length, 2, '독서록 확인 집계와 목록 모두 학급 조건으로 조인해야 한다');
});

test('관리자 요약의 이름과 집계 대상이 실제 의미와 같다', () => {
    // 이름과 집계 대상의 짝을 본다. 사이에 기준(basis)이 끼는 것은 허용한다 — 기준 표기는
    // 2026-08-28에 더했고, 짝이 어긋나는 것만 막으면 된다.
    assert.match(adminDashboard, /label: '가입 선생님',[^\n]*?value: usage\.overview \? `\$\{usage\.overview\.teacher_total\}명`/);
    assert.match(adminDashboard, /label: '신규 승인 대기',[^\n]*?value: `\$\{newSignupCount\}명`/);
    assert.match(adminDashboard, /label: '활동 교사',[^\n]*?value: usage\.overview \? `\$\{usage\.overview\.teacher_active\}명`/);
    assert.doesNotMatch(adminDashboard, /label="활동 중인 선생님"/);
    assert.match(adminDashboard, /label: '글쓰기 학생'/);
    assert.doesNotMatch(usagePanel, /const OverviewStrip/);
    assert.match(adminOverview, /group\.items\.map/);

    const usageStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_teacher_usage');
    const usageEnd = migration.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_usage_overview');
    const usageFunction = migration.slice(usageStart, usageEnd);
    assert.match(usageFunction, /is_approved BOOLEAN,\s*approval_revoked_at TIMESTAMPTZ,\s*api_mode TEXT/);
    assert.match(usageFunction, /p\.approval_revoked_at/);
    assert.match(usageFunction, /WHERE p\.role = 'TEACHER'/);
    assert.doesNotMatch(usageFunction, /p\.role IN \('TEACHER', 'ADMIN'\)/);
    assert.match(usageFunction, /e\.actor_student_id/);
    assert.doesNotMatch(usageFunction, /MAX\(GREATEST\(sp\.created_at, COALESCE\(sp\.updated_at/);
});

test('서버 값이 없으면 정상으로 꾸미지 않는다', () => {
    assert.match(resourceStatus, /if \(value === null \|\| value === undefined \|\| value === ''\) return null/);
    assert.match(resourceStatus, /const dbTone = Number\.isFinite\(dbSize\) \? 'good' : 'none'/);
    assert.match(resourceStatus, /!Number\.isFinite\(containers\) \|\| !Number\.isFinite\(healthy\)/);
    assert.ok((resourceStatus.match(/아직 재지 않았습니다\./g) || []).length >= 5);
});
