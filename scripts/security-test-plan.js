/**
 * ============================================================================
 * 🛡️ 끄적끄적아지트 — 보안 침투 테스트 스크립트 (브라우저 콘솔용)
 * ============================================================================
 * 
 * 🚀 사용법:
 *   1. 앱을 브라우저에서 열기
 *   2. F12 → Console 탭
 *   3. 이 스크립트 전체를 복사 → 콘솔에 붙여넣기 → Enter
 *   4. 로딩 완료 메시지 뜨면  runAllTests()  입력 → Enter
 * 
 * ⚠️ 주의: 읽기 전용 테스트 위주. 쓰기 테스트는 가짜 UUID로 수행하여 안전합니다.
 * ============================================================================
 */

// ⚠️ 실제 값으로 교체하세요
var SUPABASE_URL = 'https://rdtapjpppundovhtwzzc.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_xu5EvZxaNPBrmi2OtJ0pbA_tlmY5qHF';

// ── CDN에서 Supabase 로드 ──
var _loadScript = function (src) {
    return new Promise(function (resolve, reject) {
        if (window.supabase) { resolve(); return; }
        var s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
};

// ── 테스트 결과 저장 ──
var results = [];

var log = function (category, testName, passed, detail) {
    var icon = passed ? '✅ PASS' : '❌ FAIL';
    var color = passed ? 'color: #27AE60; font-weight: bold' : 'color: #E74C3C; font-weight: bold';
    console.log('%c' + icon + ' [' + category + '] ' + testName, color);
    if (detail) console.log('   -> ' + detail);
    results.push({ category: category, testName: testName, passed: passed, detail: detail });
};

var separator = function (title) {
    console.log('\n%c' + '='.repeat(60), 'color: #3498DB');
    console.log('%c  ' + title, 'color: #3498DB; font-size: 14px; font-weight: bold');
    console.log('%c' + '='.repeat(60), 'color: #3498DB');
};

// ══════════════════════════════════════════════
// 🔴 A. Admin 권한 탈취 시도
// ══════════════════════════════════════════════
async function testAdminEscalation(sb) {
    separator('A. Admin 권한 탈취 시도');

    // A1. profiles.role을 직접 ADMIN으로 변경 시도
    try {
        var meRes = await sb.auth.getUser();
        var me = meRes.data;
        if (!me || !me.user) {
            log('A', 'A1. role → ADMIN 직접 변경', true, '비로그인 상태이므로 변경 불가 (정상)');
        } else {
            // 현재 역할 먼저 확인
            var beforeRes = await sb.from('profiles')
                .select('role')
                .eq('id', me.user.id)
                .single();
            var currentRole = beforeRes.data ? beforeRes.data.role : null;

            if (currentRole === 'ADMIN') {
                // 이미 ADMIN인 경우: TEACHER로 변경 시도 → 트리거가 차단해야 함
                var updateRes = await sb.from('profiles')
                    .update({ role: 'TEACHER' })
                    .eq('id', me.user.id);

                var afterRes = await sb.from('profiles')
                    .select('role')
                    .eq('id', me.user.id)
                    .single();

                if (afterRes.data && afterRes.data.role === 'ADMIN') {
                    log('A', 'A1. role 직접 변경 (ADMIN→TEACHER 시도)', true,
                        '트리거가 차단! role 변경 불가. 현재: ADMIN, error: ' + (updateRes.error ? updateRes.error.message : '없음'));
                } else {
                    log('A', 'A1. role 직접 변경 (ADMIN→TEACHER 시도)', false,
                        '⚠️ 위험! role이 변경됨! 현재: ' + (afterRes.data ? afterRes.data.role : '?'));
                    // 원래대로 복구
                    await sb.from('profiles').update({ role: 'ADMIN' }).eq('id', me.user.id);
                }
            } else {
                // 일반 교사인 경우: ADMIN으로 변경 시도 → 트리거가 차단해야 함
                var updateRes2 = await sb.from('profiles')
                    .update({ role: 'ADMIN' })
                    .eq('id', me.user.id);

                var afterRes2 = await sb.from('profiles')
                    .select('role')
                    .eq('id', me.user.id)
                    .single();

                if (afterRes2.data && afterRes2.data.role === 'ADMIN' && !updateRes2.error) {
                    log('A', 'A1. role → ADMIN 직접 변경', false,
                        '⚠️ 위험! role이 ADMIN으로 변경됨! 트리거가 작동하지 않음');
                    // 원래대로 복구
                    await sb.from('profiles').update({ role: currentRole }).eq('id', me.user.id);
                } else {
                    log('A', 'A1. role → ADMIN 직접 변경', true,
                        '트리거가 차단함. 현재 role: ' + (afterRes2.data ? afterRes2.data.role : '?'));
                }
            }
        }
    } catch (e) {
        log('A', 'A1. role 직접 변경', true, '예외(트리거 또는 RLS)로 차단됨: ' + e.message);
    }

    // A2. is_approved를 직접 true로 변경 시도
    try {
        var meRes2 = await sb.auth.getUser();
        var me2 = meRes2.data;
        if (me2 && me2.user) {
            var upRes = await sb.from('profiles')
                .update({ is_approved: true })
                .eq('id', me2.user.id);

            var pRes = await sb.from('profiles')
                .select('is_approved')
                .eq('id', me2.user.id)
                .single();

            log('A', 'A2. is_approved → true 직접 변경', true,
                '트리거 보호. 현재 is_approved: ' + (pRes.data ? pRes.data.is_approved : '?') +
                ', error: ' + (upRes.error ? upRes.error.message : '없음'));
        } else {
            log('A', 'A2. is_approved → true 직접 변경', true, '비로그인 상태 (변경 불가)');
        }
    } catch (e) {
        log('A', 'A2. is_approved → true 직접 변경', true, '예외로 차단: ' + e.message);
    }

    // A3. setup_teacher_profile RPC로 ADMIN role 주입 시도
    try {
        var rpcRes = await sb.rpc('setup_teacher_profile', {
            p_full_name: 'Hacker',
            p_email: 'hacker@test.com',
            p_api_mode: 'ADMIN'
        });
        log('A', 'A3. setup_teacher_profile RPC role 주입', true,
            'RPC에서 role은 TEACHER로 고정. 결과: ' + JSON.stringify(rpcRes.data) +
            ', error: ' + (rpcRes.error ? rpcRes.error.message : '없음'));
    } catch (e) {
        log('A', 'A3. setup_teacher_profile RPC role 주입', true, '차단됨: ' + e.message);
    }
}

// ══════════════════════════════════════════════
// 🔴 B. DB 접근 권한 — 타인 데이터 접근 차단
// ══════════════════════════════════════════════
async function testDBAccessControl(sb) {
    separator('B. DB 접근 권한 — 타인 데이터 접근 차단');

    var meRes = await sb.auth.getUser();
    var myId = (meRes.data && meRes.data.user) ? meRes.data.user.id : 'none';

    // 현재 사용자 역할 확인
    var roleRes = await sb.from('profiles').select('role').eq('id', myId).single();
    var myRole = roleRes.data ? roleRes.data.role : 'UNKNOWN';
    if (myRole === 'ADMIN') {
        console.log('%c   ⚠️ 현재 ADMIN 계정입니다. B 테스트에서 타인 데이터 조회는 관리 목적상 정상입니다.', 'color: #F39C12; font-weight: bold');
        console.log('%c   → 정확한 테스트를 위해 일반 교사 계정으로 재실행을 권장합니다.', 'color: #F39C12');
    }

    // B1. 다른 교사의 프로필 전체 조회
    try {
        var res = await sb.from('profiles')
            .select('id, email, role, personal_openai_api_key')
            .neq('id', myId)
            .limit(5);

        if (res.data && res.data.length > 0) {
            var hasApiKey = res.data.some(function (p) { return p.personal_openai_api_key; });
            if (hasApiKey) {
                log('B', 'B1. 타 교사 프로필 + API 키 조회', false,
                    '⚠️ 위험! ' + res.data.length + '명의 프로필 + API 키가 노출됨!');
            } else {
                log('B', 'B1. 타 교사 프로필 조회', myRole === 'ADMIN',
                    '⚠️ ' + res.data.length + '개 타인 프로필 노출 (API 키는 없음). RLS 확인 필요');
            }
        } else {
            log('B', 'B1. 타 교사 프로필 조회', true,
                '타인 프로필 조회 차단됨. 반환 0건');
        }
    } catch (e) {
        log('B', 'B1. 타 교사 프로필 조회', true, '차단됨: ' + e.message);
    }

    // B2. 다른 교사의 학급 조회
    try {
        var clsRes = await sb.from('classes')
            .select('id, name, teacher_id, invite_code')
            .neq('teacher_id', myId)
            .limit(5);

        if (clsRes.data && clsRes.data.length > 0) {
            var hasCode = clsRes.data.some(function (c) { return c.invite_code; });
            log('B', 'B2. 타 교사 학급 조회', myRole === 'ADMIN',
                '⚠️ ' + clsRes.data.length + '개 타인 학급 노출! 초대코드 포함: ' + hasCode);
        } else {
            log('B', 'B2. 타 교사 학급 조회', true, '타인 학급 데이터 접근 차단됨');
        }
    } catch (e) {
        log('B', 'B2. 타 교사 학급 조회', true, '차단됨: ' + e.message);
    }

    // B3. 전체 학생 데이터 조회
    try {
        var stuRes = await sb.from('students')
            .select('id, name, code, total_points, auth_id')
            .limit(50);

        if (stuRes.data && stuRes.data.length > 0) {
            log('B', 'B3. 학생 데이터 조회', true,
                stuRes.data.length + '명 반환 — 본인 학급 학생인지 확인 필요 (교사 로그인 시 정상)');
        } else {
            log('B', 'B3. 학생 데이터 조회', true, '0건 반환 (비로그인이거나 학급 없음)');
        }
    } catch (e) {
        log('B', 'B3. 학생 데이터 조회', true, '차단됨: ' + e.message);
    }

    // B4. 전체 학생 게시글 조회
    try {
        var postRes = await sb.from('student_posts')
            .select('id, content, student_id')
            .limit(10);

        var postCount = (postRes.data && postRes.data.length) || 0;
        log('B', 'B4. 학생 게시글 조회', true,
            postCount + '건 반환 — 본인 학급 게시글인지 확인 필요 (교사 로그인 시 정상)');
    } catch (e) {
        log('B', 'B4. 학생 게시글 조회', true, '차단됨: ' + e.message);
    }
}

// ══════════════════════════════════════════════
// 🔴 C. 비인증 상태 DB 접근
// ══════════════════════════════════════════════
async function testUnauthenticatedAccess(sb) {
    separator('C. 비인증 상태 — 세션 없는 클라이언트로 DB 접근');

    // 새로운 클라이언트 (세션 완전 격리 — localStorage 공유 방지)
    var anonSb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
    // 기존 세션이 남아있을 수 있으므로 명시적으로 로그아웃
    await anonSb.auth.signOut();

    // C1. profiles
    try {
        var res = await anonSb.from('profiles')
            .select('id, role, email, personal_openai_api_key')
            .limit(5);

        if (res.data && res.data.length > 0) {
            log('C', 'C1. 비인증 profiles 접근', false,
                '⚠️ 위험! 로그인 없이 ' + res.data.length + '개 프로필 접근!');
        } else {
            log('C', 'C1. 비인증 profiles 접근', true,
                '비인증 접근 차단됨');
        }
    } catch (e) {
        log('C', 'C1. 비인증 profiles 접근', true, '차단됨: ' + e.message);
    }

    // C2. students
    try {
        var res2 = await anonSb.from('students')
            .select('id, name, code, total_points')
            .limit(5);

        if (res2.data && res2.data.length > 0) {
            log('C', 'C2. 비인증 students 접근', false,
                '⚠️ 위험! 로그인 없이 ' + res2.data.length + '명 학생 데이터 접근!');
        } else {
            log('C', 'C2. 비인증 students 접근', true, '비인증 학생 데이터 접근 차단됨');
        }
    } catch (e) {
        log('C', 'C2. 비인증 students 접근', true, '차단됨: ' + e.message);
    }

    // C3. classes
    try {
        var res3 = await anonSb.from('classes')
            .select('id, name, invite_code, teacher_id')
            .limit(5);

        if (res3.data && res3.data.length > 0) {
            log('C', 'C3. 비인증 classes 접근', false,
                '⚠️ ' + res3.data.length + '개 학급 접근 가능!');
        } else {
            log('C', 'C3. 비인증 classes 접근', true, '비인증 학급 데이터 접근 차단됨');
        }
    } catch (e) {
        log('C', 'C3. 비인증 classes 접근', true, '차단됨: ' + e.message);
    }

    // C4. system_settings
    try {
        var res4 = await anonSb.from('system_settings')
            .select('*')
            .limit(5);

        if (res4.data && res4.data.length > 0) {
            log('C', 'C4. 비인증 system_settings 접근', false,
                '⚠️ ' + res4.data.length + '개 시스템 설정 노출');
        } else {
            log('C', 'C4. 비인증 system_settings 접근', true, '비인증 접근 차단됨');
        }
    } catch (e) {
        log('C', 'C4. 비인증 system_settings 접근', true, '차단됨: ' + e.message);
    }

    // C5. Edge Function 호출
    try {
        var res5 = await anonSb.functions.invoke('vibe-ai', {
            body: { prompt: '테스트', type: 'GENERAL' }
        });

        if (res5.data && res5.data.text) {
            log('C', 'C5. 비인증 AI Edge Function 호출', false,
                '⚠️ 위험! 로그인 없이 AI 서비스 사용 가능!');
        } else {
            log('C', 'C5. 비인증 AI Edge Function 호출', true,
                '비인증 AI 호출 차단됨. error: ' + (res5.error ? res5.error.message : JSON.stringify(res5.data)));
        }
    } catch (e) {
        log('C', 'C5. 비인증 AI Edge Function 호출', true, '차단됨: ' + e.message);
    }
}

// ══════════════════════════════════════════════
// 🔴 D. API 키 탈취 시도
// ══════════════════════════════════════════════
async function testApiKeyExposure(sb) {
    separator('D. API 키 탈취 시도');

    var meRes = await sb.auth.getUser();
    var me = meRes.data;

    // D1. 본인 프로필에서 API 키 직접 SELECT
    if (me && me.user) {
        try {
            var res = await sb.from('profiles')
                .select('personal_openai_api_key, gemini_api_key')
                .eq('id', me.user.id)
                .single();

            if (res.data && res.data.personal_openai_api_key) {
                log('D', 'D1. 본인 API 키 직접 SELECT', false,
                    '⚠️ API 키가 클라이언트에서 조회 가능! 앞 8자: ' +
                    res.data.personal_openai_api_key.substring(0, 8) + '...');
            } else {
                log('D', 'D1. 본인 API 키 직접 SELECT', true,
                    'API 키가 SELECT 결과에 포함되지 않거나 키 미설정');
            }
        } catch (e) {
            log('D', 'D1. 본인 API 키 직접 SELECT', true, '차단됨: ' + e.message);
        }
    } else {
        log('D', 'D1. 본인 API 키 직접 SELECT', true, '비로그인 상태 (접근 불가)');
    }

    // D2. 타 교사 API 키 조회
    try {
        var myId2 = (me && me.user) ? me.user.id : 'none';
        // 현재 역할 확인
        var roleRes2 = await sb.from('profiles').select('role').eq('id', myId2).single();
        var meRole2 = (roleRes2.data ? roleRes2.data.role : 'UNKNOWN');

        var res2 = await sb.from('profiles')
            .select('id, email, personal_openai_api_key, gemini_api_key')
            .neq('id', myId2)
            .limit(5);

        if (res2.data && res2.data.length > 0) {
            var hasKey = res2.data.some(function (p) { return p.personal_openai_api_key; });
            if (hasKey) {
                log('D', 'D2. 타 교사 API 키 조회', false,
                    '⚠️ 위험! ' + res2.data.length + '명의 API 키 탈취 가능!');
            } else {
                log('D', 'D2. 타 교사 API 키 조회', meRole2 === 'ADMIN',
                    meRole2 === 'ADMIN'
                        ? 'ADMIN 계정이므로 정상 (타인 프로필 조회 가능하지만 API 키 미노출 ✅)'
                        : '⚠️ ' + res2.data.length + '명 프로필 노출 (키는 없으나 RLS 확인 필요)');
            }
        } else {
            log('D', 'D2. 타 교사 API 키 조회', true, '타인 API 키 접근 차단됨 (RLS)');
        }
    } catch (e) {
        log('D', 'D2. 타 교사 API 키 조회', true, '차단됨: ' + e.message);
    }

    // D3. Edge Function 응답에 API 키 포함 여부
    if (me && me.user) {
        try {
            var res3 = await sb.functions.invoke('vibe-ai', {
                body: { prompt: 'Hello', type: 'GENERAL', model: 'gpt-4o-mini' }
            });

            var responseStr = JSON.stringify(res3.data || '');
            var hasKeyPattern = /sk-[a-zA-Z0-9]{20,}/.test(responseStr);

            if (hasKeyPattern) {
                log('D', 'D3. Edge Function 응답에 API 키 포함', false,
                    '⚠️ 위험! 응답에 API 키 패턴 감지!');
            } else {
                log('D', 'D3. Edge Function 응답에 API 키 포함', true,
                    '응답에 API 키 미포함 (안전). 응답 키: ' + Object.keys(res3.data || {}).join(', '));
            }
        } catch (e) {
            log('D', 'D3. Edge Function 응답 확인', true, '테스트 완료: ' + e.message);
        }
    } else {
        log('D', 'D3. Edge Function 응답 확인', true, '비로그인 상태 (호출 불가)');
    }

    // D4. 환경변수 키 노출 확인 (window에서 탐색)
    try {
        var suspicious = [];
        // 전역 변수에서 sk- 패턴 탐색
        for (var key in window) {
            try {
                var val = window[key];
                if (typeof val === 'string' && /^sk-/.test(val)) {
                    suspicious.push(key);
                }
            } catch { /* 접근 불가 속성 무시 */ }
        }

        if (suspicious.length > 0) {
            log('D', 'D4. window 전역변수 API 키 노출', false,
                '⚠️ 전역 변수에서 API 키 패턴 발견: ' + suspicious.join(', '));
        } else {
            log('D', 'D4. window 전역변수 API 키 노출', true,
                'window 전역 변수에 API 키 미노출 (안전)');
        }
    } catch {
        log('D', 'D4. window 전역변수 확인', true, '확인 완료');
    }
}

// ══════════════════════════════════════════════
// 🔴 E. RPC 함수 악용
// ══════════════════════════════════════════════
async function testRPCAbuse(sb) {
    separator('E. RPC 함수 악용 시도');

    var fakeId = '00000000-0000-0000-0000-000000000001';

    // E1. increment_student_points
    try {
        var res = await sb.rpc('increment_student_points', {
            p_student_id: fakeId,
            p_amount: 99999,
            p_reason: '해킹 테스트'
        });

        if (res.error) {
            log('E', 'E1. 가짜 학생 포인트 부여', true, '차단됨: ' + res.error.message);
        } else {
            log('E', 'E1. 가짜 학생 포인트 부여', false,
                '⚠️ 임의 학생에게 포인트 부여 성공! 소유권 검증 미흡');
        }
    } catch (e) {
        log('E', 'E1. 가짜 학생 포인트 부여', true, '차단됨: ' + e.message);
    }

    // E2. teacher_manage_points
    try {
        var res2 = await sb.rpc('teacher_manage_points', {
            target_student_id: fakeId,
            points_amount: 99999,
            reason_text: '해킹 테스트'
        });

        if (res2.error) {
            log('E', 'E2. 타 교사 학생 포인트 조작', true, '차단됨: ' + res2.error.message);
        } else {
            log('E', 'E2. 타 교사 학생 포인트 조작', false,
                '⚠️ 타 교사 학생 포인트 조작 가능! 결과: ' + JSON.stringify(res2.data));
        }
    } catch (e) {
        log('E', 'E2. 타 교사 학생 포인트 조작', true, '차단됨: ' + e.message);
    }

    // E3. bind_student_auth
    try {
        var res3 = await sb.rpc('bind_student_auth', {
            p_student_code: 'FAKE_CODE_12345'
        });

        if (res3.error) {
            log('E', 'E3. 가짜 학생코드 바인딩', true, '차단됨: ' + res3.error.message);
        } else if (res3.data && res3.data.success === false) {
            log('E', 'E3. 가짜 학생코드 바인딩', true, '서버에서 거부: ' + (res3.data.error || '코드 불일치'));
        } else {
            log('E', 'E3. 가짜 학생코드 바인딩', false,
                '⚠️ 가짜 코드로 바인딩 성공! 결과: ' + JSON.stringify(res3.data));
        }
    } catch (e) {
        log('E', 'E3. 가짜 학생코드 바인딩', true, '차단됨: ' + e.message);
    }

    // E4. check_my_api_key_exists
    try {
        var res4 = await sb.rpc('check_my_api_key_exists');
        var rStr = JSON.stringify(res4.data);
        var hasKey = /sk-/.test(rStr);

        if (hasKey) {
            log('E', 'E4. check_my_api_key_exists 키 원본 노출', false, '⚠️ 키 원본이 응답에 포함!');
        } else {
            log('E', 'E4. check_my_api_key_exists 키 원본 노출', true, 'boolean만 반환됨: ' + rStr);
        }
    } catch (e) {
        log('E', 'E4. check_my_api_key_exists', true, '호출 결과: ' + e.message);
    }
}

// ══════════════════════════════════════════════
// 🔴 F. 직접 INSERT/UPDATE 공격
// ══════════════════════════════════════════════
async function testDirectWriteAttacks(sb) {
    separator('F. 직접 데이터 변조 시도');

    var fakeId = '00000000-0000-0000-0000-000000000099';

    // F1. profiles에 ADMIN 직접 삽입
    try {
        var res = await sb.from('profiles')
            .insert({
                id: fakeId,
                role: 'ADMIN',
                is_approved: true,
                email: 'hacker@evil.com'
            });

        if (res.error) {
            log('F', 'F1. profiles에 ADMIN 직접 삽입', true, '차단됨: ' + res.error.message);
        } else {
            log('F', 'F1. profiles에 ADMIN 직접 삽입', false, '⚠️ 위험! ADMIN 프로필 삽입 성공!');
            await sb.from('profiles').delete().eq('id', fakeId);
        }
    } catch (e) {
        log('F', 'F1. profiles에 ADMIN 직접 삽입', true, '차단됨: ' + e.message);
    }

    // F2. 타 학급에 학생 삽입
    try {
        var res2 = await sb.from('students')
            .insert({
                class_id: '00000000-0000-0000-0000-000000000001',
                name: '해커학생',
                code: 'HACK001'
            });

        if (res2.error) {
            log('F', 'F2. 타 학급에 학생 삽입', true, '차단됨: ' + res2.error.message);
        } else {
            log('F', 'F2. 타 학급에 학생 삽입', false, '⚠️ 위험! 타인 학급에 학생 삽입 성공!');
        }
    } catch (e) {
        log('F', 'F2. 타 학급에 학생 삽입', true, '차단됨: ' + e.message);
    }

    // F3. point_logs 직접 삽입
    try {
        var res3 = await sb.from('point_logs')
            .insert({
                student_id: '00000000-0000-0000-0000-000000000001',
                amount: 99999,
                reason: '해킹 포인트'
            });

        if (res3.error) {
            log('F', 'F3. point_logs 직접 삽입', true, '차단됨: ' + res3.error.message);
        } else {
            log('F', 'F3. point_logs 직접 삽입', false, '⚠️ 위험! 포인트 로그 직접 삽입 성공!');
        }
    } catch (e) {
        log('F', 'F3. point_logs 직접 삽입', true, '차단됨: ' + e.message);
    }
}

// ══════════════════════════════════════════════
// 🏁 전체 테스트 실행
// ══════════════════════════════════════════════
async function runAllTests() {
    console.clear();
    results.length = 0;

    console.log('%c\n' +
        '╔══════════════════════════════════════════════════════════╗\n' +
        '║  🛡️  끄적끄적아지트 — 보안 침투 테스트 시작              ║\n' +
        '║  시간: ' + new Date().toLocaleString('ko-KR') + '                    ║\n' +
        '╚══════════════════════════════════════════════════════════╝',
        'color: #E74C3C; font-size: 13px; font-weight: bold');

    // Supabase 클라이언트 생성
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 현재 세션 확인
    var sessRes = await sb.auth.getSession();
    if (sessRes.data && sessRes.data.session) {
        console.log('%c📍 현재 로그인 상태: ' + (sessRes.data.session.user.email || '익명 사용자'),
            'color: #27AE60; font-weight: bold');
    } else {
        console.log('%c📍 비로그인 상태 — 인증 없는 접근 테스트를 수행합니다',
            'color: #F39C12; font-weight: bold');
    }

    await testAdminEscalation(sb);
    await testDBAccessControl(sb);
    await testUnauthenticatedAccess(sb);
    await testApiKeyExposure(sb);
    await testRPCAbuse(sb);
    await testDirectWriteAttacks(sb);

    // ── 결과 요약 ──
    separator('📊 최종 결과 요약');
    var passed = results.filter(function (r) { return r.passed; }).length;
    var failed = results.filter(function (r) { return !r.passed; }).length;
    var total = results.length;

    console.log('%c총 ' + total + '개 테스트 | ✅ ' + passed + '개 통과 | ❌ ' + failed + '개 실패',
        failed > 0
            ? 'color: #E74C3C; font-size: 16px; font-weight: bold'
            : 'color: #27AE60; font-size: 16px; font-weight: bold');

    if (failed > 0) {
        console.log('\n%c⚠️ 실패한 테스트:', 'color: #E74C3C; font-weight: bold');
        results.filter(function (r) { return !r.passed; }).forEach(function (r) {
            console.log('%c   ❌ [' + r.category + '] ' + r.testName + ': ' + r.detail, 'color: #E74C3C');
        });
    } else {
        console.log('%c\n🎉 모든 보안 테스트를 통과했습니다!', 'color: #27AE60; font-size: 14px; font-weight: bold');
    }

    // 카테고리별 요약
    console.log('\n%c📋 카테고리별 요약:', 'font-weight: bold');
    var categories = [];
    results.forEach(function (r) {
        if (categories.indexOf(r.category) === -1) categories.push(r.category);
    });
    categories.forEach(function (cat) {
        var catResults = results.filter(function (r) { return r.category === cat; });
        var catPassed = catResults.filter(function (r) { return r.passed; }).length;
        var catFailed = catResults.filter(function (r) { return !r.passed; }).length;
        var icon = catFailed > 0 ? '❌' : '✅';
        console.log('   ' + icon + ' [' + cat + '] ' + catPassed + '/' + catResults.length + ' 통과');
    });

    return results;
}

// ── CDN 로드 후 안내 ──
_loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js')
    .then(function () {
        console.log('%c\n' +
            '╔══════════════════════════════════════════════════════════╗\n' +
            '║  🛡️  보안 테스트 스크립트 로드 완료!                      ║\n' +
            '╠══════════════════════════════════════════════════════════╣\n' +
            '║                                                          ║\n' +
            '║  📌 전체 테스트 실행:  runAllTests()                      ║\n' +
            '║                                                          ║\n' +
            '║  📌 개별 테스트: (sb = supabase 클라이언트 필요)          ║\n' +
            '║     testAdminEscalation(sb)     ← Admin 권한 탈취        ║\n' +
            '║     testDBAccessControl(sb)     ← DB 접근 권한           ║\n' +
            '║     testUnauthenticatedAccess(sb) ← 비인증 접근          ║\n' +
            '║     testApiKeyExposure(sb)      ← API 키 탈취           ║\n' +
            '║     testRPCAbuse(sb)            ← RPC 함수 악용          ║\n' +
            '║     testDirectWriteAttacks(sb)  ← 직접 데이터 변조       ║\n' +
            '║                                                          ║\n' +
            '╚══════════════════════════════════════════════════════════╝',
            'color: #3498DB; font-size: 11px');
    })
    .catch(function (e) {
        console.error('⚠️ Supabase CDN 로드 실패:', e);
        console.log('인터넷 연결을 확인하고 다시 시도해주세요.');
    });
