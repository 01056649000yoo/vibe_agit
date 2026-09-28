// @ts-check
/*
 * 실제 앱 화면 스모크(e2e/app-render-smoke.spec.cjs)용 가짜 Supabase 응답.
 *
 * 원칙
 * - 운영 DB 에 가지 않는다. 모든 요청은 http://fake-supabase.test 로 가고 page.route 가 여기서 답한다.
 * - 실존 인물·실제 ID 를 쓰지 않는다. ID 는 모두 00000000-… 꼴의 가짜 UUID 다.
 * - 역할별 "새로 시작한 학급" 수준의 최소 현실 데이터만 둔다(학생 0명·글 0편).
 *   응답 모양은 supabase/migrations 의 최신 정의를 따른다(각 항목 옆에 출처 파일).
 * - 여기 없는 RPC 는 스펙이 마이그레이션의 RETURNS 형식으로 기본값을 만든다(표·SETOF → [], jsonb → null …).
 *   어떤 요청이 기본값을 받았는지는 스펙이 기록한다.
 */
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SUPABASE_URL = 'http://fake-supabase.test';
const FAR_FUTURE_EXP = 4102444800; // 2100-01-01. 클라이언트는 서명을 검증하지 않고 exp 만 본다.
const NOW_ISO = '2026-09-25T00:00:00.000Z';

const IDS = Object.freeze({
    teacher: '00000000-0000-4000-8000-00000000a001',
    admin: '00000000-0000-4000-8000-00000000a002',
    studentAuth: '00000000-0000-4000-8000-00000000a003',
    student: '00000000-0000-4000-8000-00000000b001',
    class: '00000000-0000-4000-8000-00000000c001'
});

const POLICY_VERSION = readFileSync(path.join(ROOT, 'src', 'constants', 'policyVersion.js'), 'utf8')
    .match(/POLICY_VERSION\s*=\s*'([^']+)'/)[1];

const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** 서명 없는 가짜 JWT. 형식(header.payload.signature)과 exp 만 맞춘다. */
const fakeJwt = (claims) => [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ aud: 'authenticated', role: 'authenticated', iat: 1700000000, exp: FAR_FUTURE_EXP, ...claims }),
    'fake-signature'
].join('.');

const buildUser = ({ id, email, fullName, anonymous }) => ({
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: anonymous ? '' : email,
    is_anonymous: anonymous,
    app_metadata: anonymous ? { provider: 'anonymous', providers: ['anonymous'] } : { provider: 'google', providers: ['google'] },
    user_metadata: anonymous ? {} : { full_name: fullName },
    identities: [],
    created_at: '2026-03-02T00:00:00.000Z',
    updated_at: NOW_ISO
});

const buildSession = (user) => ({
    access_token: fakeJwt({ sub: user.id, email: user.email, is_anonymous: user.is_anonymous }),
    refresh_token: `fake-refresh-${user.id}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: FAR_FUTURE_EXP,
    user
});

const USERS = Object.freeze({
    teacher: buildUser({ id: IDS.teacher, email: 'teacher@example.test', fullName: '가상 교사', anonymous: false }),
    admin: buildUser({ id: IDS.admin, email: 'admin@example.test', fullName: '가상 관리자', anonymous: false }),
    student: buildUser({ id: IDS.studentAuth, anonymous: true })
});

const FIXTURE_CLASS = { id: IDS.class, name: '가상 3학년 1반', created_at: '2026-03-02T00:00:00.000Z' };

// supabase/migrations/20261285_announcement_two_week_window.sql — get_teacher_app_bootstrap_v1
const teacherBootstrap = ({ userId, role, fullName, classes }) => ({
    version: 1,
    profile: {
        id: userId, role, full_name: fullName, is_approved: true,
        primary_class_id: classes[0]?.id || null, api_mode: 'SYSTEM',
        created_at: '2026-03-02T00:00:00.000Z', last_login_at: NOW_ISO,
        ai_prompt_template: null, frequent_tags: [], default_rubric: null, mission_default_settings: null
    },
    teacher: {
        name: fullName, school_name: '가상초등학교', school_office_code: 'X00', school_code: '0000000',
        school_address: '가상시 가상로 1', school_verified_at: null, phone: ''
    },
    classes: classes.map((row) => ({ ...row, teacher_id: userId })),
    announcements: []
});

// supabase/migrations/20260330_student_login_takeover.sql — get_student_by_auth (student 안 키는 camelCase)
const studentByAuth = {
    success: true,
    student: { id: IDS.student, name: '가상 학생', code: 'TEST01', classId: IDS.class, className: FIXTURE_CLASS.name }
};

// 20261126(기본) → 20261241(바깥 포장) — get_student_home_bootstrap_v1
const studentHomeBootstrap = {
    version: 1,
    generated_at: NOW_ISO,
    student: { id: IDS.student, name: '가상 학생', class_id: IDS.class, total_points: 0, pet_data: {}, last_feedback_check: null },
    // enabled_modules 가 비면 resolveEnabledModuleIds 가 매니페스트 기본값을 쓴다(새 학급과 같다).
    class_config: { enabled_modules: [], vocab_tower_enabled: false, writing_editor_settings: {} },
    home: {
        unstarted_missions: 0, draft_missions: 0, pending_missions: 0, returned_count: 0,
        has_activity: false, has_new_mission: false, has_new_lab_activity: false,
        neighbor_agit_available: false, neighbor_agit_space_id: null, neighbor_agit_new_count: 0,
        class_agit_available: false
    },
    activity_notifications: { version: 1, unread_count: 0, latest: null },
    feedback_notifications: { version: 1, unread_count: 0, latest: null },
    title_status: {}, reading_daily: {}, diary_daily: {}, reading_marathon: {}
};

/** 역할별 RPC 응답. 함수면 (body) => 응답. `undefined` 를 돌려주면 기본값 처리로 넘어간다. */
const commonRpc = {
    get_my_policy_consent_v1: { agreed_versions: [POLICY_VERSION] }
};

// 화면이 version 을 확인하는 빈 학급 응답. 모양은 운영 DB 응답(2026-09-28 권한 점검 때 본 키)과 같다.
// get_teacher_mission_overview_v1 — src/hooks/useMissionManager.js
const teacherMissionOverview = { version: 1, missions: [], total_students: 0, submission_board: null, submission_counts: {} };
// get_student_mission_list_v1 — src/components/student/MissionList.jsx
const studentMissionList = { version: 1, missions: [], posts: [] };
// get_my_reading_library_v1 — src/modules/writing/reading-log/ReadingLogPage.jsx
const studentReadingLibrary = { version: 1, logs: [], links: [], reviews: [], library_items: [], draft_statuses: [] };

const ROLE_FIXTURES = Object.freeze({
    teacher: {
        user: USERS.teacher,
        rpc: {
            ...commonRpc,
            get_teacher_app_bootstrap_v1: teacherBootstrap({ userId: IDS.teacher, role: 'TEACHER', fullName: '가상 교사', classes: [FIXTURE_CLASS] }),
            get_teacher_mission_overview_v1: teacherMissionOverview,
            // 급식판(머리말 단축 단추 → 곧바로 전체화면 검사, 2026-09-28). 학교가 연결된 학급.
            get_teacher_meal_board_workspace_v1: {
                school: { officeCode: 'B10', schoolCode: '7000000', schoolName: '가상초등학교' },
                allergens: [],
                students: []
            }
        },
        functions: {
            'neis-meal': { meals: [{ mealType: '중식', calories: '600 Kcal', dishes: [{ name: '가상 비빔밥', allergenCodes: [] }] }] }
        }
    },
    // 가입해 승인은 받았지만 학급을 아직 안 만든 교사(현실에서 가장 흔한 첫 화면).
    teacherNoClass: {
        user: USERS.teacher,
        rpc: {
            ...commonRpc,
            get_teacher_app_bootstrap_v1: teacherBootstrap({ userId: IDS.teacher, role: 'TEACHER', fullName: '가상 교사', classes: [] })
        }
    },
    admin: {
        user: USERS.admin,
        rpc: {
            ...commonRpc,
            get_teacher_app_bootstrap_v1: teacherBootstrap({ userId: IDS.admin, role: 'ADMIN', fullName: '가상 관리자', classes: [FIXTURE_CLASS] }),
            get_teacher_mission_overview_v1: teacherMissionOverview
        },
        functions: { 'verify-admin-mode': { success: true } }
    },
    student: {
        user: USERS.student,
        rpc: {
            ...commonRpc,
            get_student_by_auth: studentByAuth,
            get_student_home_bootstrap_v1: studentHomeBootstrap,
            get_student_mission_list_v1: studentMissionList,
            get_my_reading_library_v1: studentReadingLibrary
        }
    }
});

/**
 * 마이그레이션에서 함수별 마지막 정의의 RETURNS 형식을 읽는다.
 * 픽스처가 없는 RPC 에 "실제 DB 가 빈 학급에서 돌려줄 법한" 기본값을 주기 위한 것이다.
 */
const readRpcReturnKinds = () => {
    const dir = path.join(ROOT, 'supabase', 'migrations');
    const kinds = new Map();
    const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
    // 저장소의 마이그레이션 파일만 읽는다(사용자 입력 없음). 앞뒤가 고정 낱말이라 되돌아가며 헤매지 않는다.
    // eslint-disable-next-line security/detect-unsafe-regex
    const pattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(/gi;
    for (const file of files) {
        const sql = readFileSync(path.join(dir, file), 'utf8');
        for (const match of sql.matchAll(pattern)) {
            const after = sql.slice(match.index + match[0].length, match.index + match[0].length + 4000);
            // eslint-disable-next-line security/detect-unsafe-regex -- 4,000자로 자른 저장소 SQL 만 본다
            const returns = after.match(/\bRETURNS\s+(SETOF\s+[\w.]+|TABLE\b|[\w.]+(?:\s*\[\])?)/i);
            if (!returns) continue;
            kinds.set(match[1].toLowerCase(), returns[1].toLowerCase().replace(/\s+/g, ' '));
        }
    }
    return kinds;
};

/** RETURNS 형식 → 빈 학급에서의 기본 응답. */
const defaultForReturnKind = (kind) => {
    if (!kind) return { status: 200, body: null, kind: 'unknown' };
    if (kind.startsWith('setof') || kind === 'table' || kind.endsWith('[]')) return { status: 200, body: [], kind };
    if (kind === 'void') return { status: 204, body: undefined, kind };
    if (kind === 'boolean' || kind === 'bool') return { status: 200, body: false, kind };
    if (/^(integer|int|int4|int8|bigint|numeric|smallint|double|real)$/.test(kind)) return { status: 200, body: 0, kind };
    return { status: 200, body: null, kind };
};

module.exports = {
    SUPABASE_URL,
    IDS,
    USERS,
    ROLE_FIXTURES,
    buildSession,
    readRpcReturnKinds,
    defaultForReturnKind,
    LEGACY_STORAGE_KEY: `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
};
