import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { POLICY_VERSION } from '../src/constants/policyVersion.js';

const read = (file) => readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20261279_policy_consent_records.sql');
const setup = read('src/components/teacher/TeacherProfileSetup.jsx');
const gate = read('src/components/teacher/StudentConsentGate.jsx');
const dashboard = read('src/components/teacher/TeacherDashboard.jsx');
const classManager = read('src/components/teacher/ClassManager.jsx');
const privacy = read('src/components/layout/PrivacyPolicy.jsx');

test('약관 판은 시행일 모양이고 처리방침 본문의 시행일과 같다', () => {
    /*
     * 왜 (2026-09-11): 판 이름이 동의 기록·처리방침 머리말 두 곳에 흩어지면 하나만 고쳐져
     * "동의한 판"이 실제 시행판과 어긋난다. 개정할 때 두 곳을 함께 올린다.
     */
    assert.match(POLICY_VERSION, /^\d{4}-\d{2}-\d{2}$/);
    const [y, m, d] = POLICY_VERSION.split('-').map(Number);
    assert.ok(privacy.includes(`${y}년 ${m}월 ${d}일부터 적용`),
        `처리방침 제12조의 시행일이 POLICY_VERSION(${POLICY_VERSION})과 다릅니다.`);
});

test('가입할 때 약관 동의를 서버 시계로 기록한다', () => {
    // 전에는 체크만 확인하고 버렸다. "언제 어느 판에 동의했나"에 답할 수 없었다.
    assert.match(setup, /supabase\.rpc\('record_policy_consent_v1', \{ p_version: POLICY_VERSION \}\)/);
    // 프로필이 만들어진 뒤에 불러야 기록할 행이 있다.
    assert.ok(setup.indexOf("rpc('setup_teacher_profile'") < setup.indexOf("rpc('record_policy_consent_v1'"));
    // 시각은 서버가 찍는다. 클라이언트가 시각을 보내지 않는다.
    assert.match(migration, /SET terms_agreed_at = NOW\(\),\s*privacy_agreed_at = NOW\(\)/);
    assert.doesNotMatch(setup, /agreed_at/);
});

test('기존 교사는 가입일로 소급 기록하고 소급임을 남긴다', () => {
    assert.match(migration, /SET terms_agreed_at = created_at,\s*privacy_agreed_at = created_at,\s*agreed_policy_version = 'backfill'/);
    // 재실행해도 이미 있는 기록을 덮지 않는다.
    assert.match(migration, /AND terms_agreed_at IS NULL/);
});

test('학생 동의서 확인은 학급 단위이고 본인 학급만 기록된다', () => {
    assert.match(migration, /student_consent_confirmed_at TIMESTAMPTZ/);
    // RPC 가 teacher_id = auth.uid() 로 거른다. 남의 학급 id 를 섞어도 건너뛴다.
    assert.match(migration, /WHERE id = ANY \(p_class_ids\)\s*AND teacher_id = auth\.uid\(\)/);
    // 비로그인에는 닫는다(2026-09-09 보안 점검 원칙).
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.confirm_class_student_consent_v1\(UUID\[\]\) FROM PUBLIC, anon/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.record_policy_consent_v1\(TEXT\) FROM PUBLIC, anon/);
});

test('미확인 학급이 있으면 대시보드 대신 관문이 뜨고, 훅보다 아래에서 갈라진다', () => {
    assert.match(dashboard, /const studentConsent = usePendingStudentConsent\(session, profile\)/);
    assert.match(dashboard, /if \(studentConsent\.pending\.length > 0\)/);
    // 훅은 이른 return 보다 위에 둔다(PITFALLS). 갈라지는 자리가 훅 호출보다 뒤여야 한다.
    const lastHook = Math.max(dashboard.lastIndexOf('useEffect('), dashboard.lastIndexOf('useState('), dashboard.lastIndexOf('useMemo('));
    assert.ok(dashboard.indexOf('if (studentConsent.loading) return null;') > lastHook);
    // 관문은 학급 이름을 보여 주고 체크해야만 진행된다.
    assert.match(gate, /disabled=\{!checked \|\| saving\}/);
    assert.match(gate, /supabase\.rpc\('confirm_class_student_consent_v1'/);
    // 확인 문구는 한 곳에서 정하고 학급 만들기도 같은 문구를 쓴다.
    assert.match(gate, /export const STUDENT_CONSENT_STATEMENT/);
    assert.match(classManager, /STUDENT_CONSENT_STATEMENT/);
});

test('새 학급은 만들 때 확인받아 관문이 다시 뜨지 않는다', () => {
    assert.match(classManager, /if \(!consentChecked\)/);
    assert.match(classManager, /rpc\('confirm_class_student_consent_v1', \{ p_class_ids: \[data\.id\] \}\)/);
    // 학급을 만든 뒤에 기록한다(학급 id 가 있어야 한다).
    assert.ok(classManager.indexOf(".from('classes')") < classManager.indexOf("rpc('confirm_class_student_consent_v1'"));
});
