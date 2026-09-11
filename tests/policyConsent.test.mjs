import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { POLICY_VERSION } from '../src/constants/policyVersion.js';

const read = (file) => readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20261279_policy_consent_records.sql');
const history = read('supabase/migrations/20261280_policy_consent_history.sql');
const hook = read('src/hooks/usePendingStudentConsent.js');
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

test('가입할 때 약관 동의를 서버 시계로 이력에 기록한다', () => {
    // 전에는 체크만 확인하고 버렸다. "언제 어느 판에 동의했나"에 답할 수 없었다.
    assert.match(setup, /supabase\.rpc\('record_policy_consent_v1', \{ p_version: POLICY_VERSION, p_kind: 'signup' \}\)/);
    // 프로필이 만들어진 뒤에 불러야 기록할 행이 있다.
    assert.ok(setup.indexOf("rpc('setup_teacher_profile'") < setup.indexOf("rpc('record_policy_consent_v1'"));
    // 시각은 서버가 찍는다. 클라이언트가 시각을 보내지 않는다.
    assert.match(history, /VALUES \(auth\.uid\(\), v_version, p_kind, NOW\(\), NOW\(\)\)/);
    assert.doesNotMatch(setup, /agreed_at/);
});

test('동의는 이력으로 쌓인다 — 첫 동의(가입일 소급)와 추가 동의가 둘 다 남는다', () => {
    /*
     * 사용자 결정(2026-09-11): 기존 교사는 첫 동의를 가입일로 소급하고, 개정판에는 다음 로그인 때
     * 추가로 동의한다. 둘 다 남아야 하므로 열 몇 개가 아니라 표다.
     */
    assert.match(history, /CREATE TABLE IF NOT EXISTS public\.policy_consents/);
    assert.match(history, /kind IN \('signup', 'reconsent', 'backfill'\)/);
    assert.match(history, /UNIQUE \(user_id, policy_version\)/);
    // 20261279 가 열에 소급한 기록을 표로 옮기고 열은 없앤다(두 곳에 두면 어긋난다).
    assert.match(history, /SELECT id, 'backfill', 'backfill', terms_agreed_at, privacy_agreed_at, terms_agreed_at/);
    assert.match(history, /DROP COLUMN IF EXISTS agreed_policy_version/);
    // 옮긴 수를 확인하고 나서야 지운다.
    assert.ok(history.indexOf('동의 기록을 옮기다 빠졌습니다') < history.indexOf('DROP COLUMN IF EXISTS terms_agreed_at'));
    // 클라이언트는 소급 기록을 만들 수 없다.
    assert.match(history, /IF p_kind NOT IN \('signup', 'reconsent'\)/);
    // 표는 브라우저 역할에 열지 않는다.
    assert.match(history, /REVOKE ALL ON TABLE public\.policy_consents FROM PUBLIC, anon, authenticated/);
});

test('관문은 개정 시행일부터 열리고, 추가 동의와 학급 확인을 한 화면에서 받는다', () => {
    // 배포일과 시행일이 달라도 화면은 시행일에 맞춰 열린다. 그 전에는 개정판이 효력이 없다.
    assert.match(hook, /hasPolicyTakenEffect\(\)/);
    assert.match(hook, /POLICY_VERSION\.split\('-'\)\.map\(Number\)/);
    assert.match(hook, /needsPolicyConsent: !agreed\.includes\(POLICY_VERSION\)/);
    // 추가 동의는 kind=reconsent 로 첫 동의와 따로 남는다.
    assert.match(gate, /p_version: POLICY_VERSION, p_kind: 'reconsent'/);
    // 약관·처리방침을 읽을 수 있는 링크가 있고, 둘 다 체크해야 넘어간다.
    assert.match(gate, /href="\/terms"/);
    assert.match(gate, /href="\/privacy"/);
    assert.match(gate, /\(!needsPolicyConsent \|\| \(terms && privacy\)\) && \(!needStudents \|\| students\)/);
});

test('학생 동의서 확인은 학급 단위이고 본인 학급만 기록된다', () => {
    assert.match(migration, /student_consent_confirmed_at TIMESTAMPTZ/);
    // RPC 가 teacher_id = auth.uid() 로 거른다. 남의 학급 id 를 섞어도 건너뛴다.
    assert.match(migration, /WHERE id = ANY \(p_class_ids\)\s*AND teacher_id = auth\.uid\(\)/);
    // 비로그인에는 닫는다(2026-09-09 보안 점검 원칙).
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.confirm_class_student_consent_v1\(UUID\[\]\) FROM PUBLIC, anon/);
    assert.match(history, /REVOKE ALL ON FUNCTION public\.record_policy_consent_v1\(TEXT, TEXT\) FROM PUBLIC, anon/);
});

test('미확인 학급이 있으면 대시보드 대신 관문이 뜨고, 훅보다 아래에서 갈라진다', () => {
    assert.match(dashboard, /const studentConsent = usePendingStudentConsent\(session, profile\)/);
    assert.match(dashboard, /if \(studentConsent\.pending\)/);
    // 훅은 이른 return 보다 위에 둔다(PITFALLS). 갈라지는 자리가 훅 호출보다 뒤여야 한다.
    const lastHook = Math.max(dashboard.lastIndexOf('useEffect('), dashboard.lastIndexOf('useState('), dashboard.lastIndexOf('useMemo('));
    assert.ok(dashboard.indexOf('if (studentConsent.loading) return null;') > lastHook);
    // 관문은 학급 이름을 보여 주고 체크해야만 진행된다.
    assert.match(gate, /disabled=\{!ready \|\| saving\}/);
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
