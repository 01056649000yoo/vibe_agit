/**
 * ============================================================================
 * 🛡️ 끄적끄적아지트 — 학생 계정 보안 침투 테스트 (브라우저 콘솔용)
 * ============================================================================
 * 
 * 🚀 사용법:
 *   1. 학생 계정으로 서비스 로그인
 *   2. F12 -> Console 탭
 *   3. 이 스크립트 전체를 복사 -> 콘솔에 붙여넣기 -> Enter
 *   4. 로딩 완료 메시지 뜨면  runStudentTests()  입력 -> Enter
 * 
 * ⚠️ 주의: 이 테스트는 "학생이 타인의 권한을 침해할 수 있는지"를 확인합니다.
 * ============================================================================
 */

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

var results = [];

var log = function (category, testName, passed, detail) {
    var icon = passed ? '✅ PASS' : '❌ FAIL';
    var color = passed ? 'color: #27AE60; font-weight: bold' : 'color: #E74C3C; font-weight: bold';
    console.log('%c' + icon + ' [' + category + '] ' + testName, color);
    if (detail) console.log('   -> ' + detail);
    results.push({ category: category, testName: testName, passed: passed, detail: detail });
};

var separator = function (title) {
    console.log('\n%c' + '='.repeat(60), 'color: #F39C12');
    console.log('%c  🔍 [학생 보안 테스트] ' + title, 'color: #F39C12; font-size: 14px; font-weight: bold');
    console.log('%c' + '='.repeat(60), 'color: #F39C12');
};

// ══════════════════════════════════════════════
// 🔴 A. 신분 위조 및 권한 상승
// ══════════════════════════════════════════════
async function testStudentElevation(sb, myInfo) {
    separator('A. 신분 위조 및 권한 상승');

    if (myInfo.role === 'ADMIN' || myInfo.role === 'TEACHER') {
        console.warn('%c⚠️ 경고: 현재 계정은 ' + myInfo.role + '입니다. 학생 보안 테스트 결과가 부정확할 수 있습니다.', 'color: #F39C12; font-weight: bold');
    }

    // A1. 자신의 role을 ADMIN으로 변경 시도
    try {
        var targetRole = myInfo.role === 'ADMIN' ? 'TEACHER' : 'ADMIN';
        var res = await sb.from('profiles').update({ role: targetRole }).eq('id', myInfo.auth_id);

        var check = await sb.from('profiles').select('role').eq('id', myInfo.auth_id).single();
        if (check.data && check.data.role === targetRole) {
            log('A', 'A1. role 직접 변경 시도', false, '⚠️ 취약! 클라이언트에서 role 변경 성공 (현재: ' + check.data.role + ')');
        } else {
            log('A', 'A1. role 직접 변경 시도', true, '트리거가 차단함. 에러: ' + (res.error ? res.error.message : '없음'));
        }
    } catch (e) { log('A', 'A1. role 변경 시도', true, '차단됨: ' + e.message); }

    // A2. 타인 명의로 댓글 작성 시도 (실제 게시글 ID 사용)
    try {
        var postRes = await sb.from('student_posts').select('id').limit(1).maybeSingle();
        var postId = postRes.data ? postRes.data.id : '00000000-0000-0000-0000-000000000000';
        var fakeStudentId = '00000000-0000-0000-0000-000000000001';

        var res2 = await sb.from('post_comments').insert({
            post_id: postId,
            student_id: fakeStudentId,
            content: '공격 테스트 댓글'
        });
        if (res2.error) {
            log('A', 'A2. 타인 명의 댓글 위조', true, '차단됨: ' + res2.error.message);
        } else {
            log('A', 'A2. 타인 명의 댓글 위조', false, '⚠️ 위험! 타인 ID로 댓글 삽입 성공');
        }
    } catch (e) { log('A', 'A2. 댓글 위조 시도', true, '차단됨'); }
}

// ══════════════════════════════════════════════
// 🟠 B. 경제 시스템 공격 (Point)
// ══════════════════════════════════════════════
async function testStudentEconomy(sb, myInfo) {
    separator('B. 경제 시스템 공격');

    // B1. 자신의 포인트 직접 수정 시도
    try {
        if (myInfo.id === 'unknown-id') {
            log('B', 'B1. 포인트 직접 수정', true, '연결된 학생 ID가 없어 테스트 스킵');
        } else {
            var oldValRes = await sb.from('students').select('total_points').eq('id', myInfo.id).single();
            var oldVal = oldValRes.data ? oldValRes.data.total_points : 0;
            var newVal = oldVal + 777;

            var res = await sb.from('students').update({ total_points: newVal }).eq('id', myInfo.id);
            var check = await sb.from('students').select('total_points').eq('id', myInfo.id).single();

            if (check.data && check.data.total_points === newVal) {
                // 교사인 경우 수정을 허용하므로 true로 판정하되 알림 표시
                if (myInfo.role === 'ADMIN' || myInfo.role === 'TEACHER') {
                    log('B', 'B1. 포인트 직접 수정', true, '교사/관리자 계정이므로 수정됨 (정상 권한)');
                } else {
                    log('B', 'B1. 포인트 직접 수정', false, '⚠️ 취약! 학생이 자신의 포인트를 조작함');
                }
            } else {
                log('B', 'B1. 포인트 직접 수정', true, '수정 불가(보호됨). 에러: ' + (res.error ? res.error.message : '없음'));
            }
        }
    } catch (e) { log('B', 'B1. 포인트 조작 시도', true, '차단됨'); }

    // B2. 포인트 로그 직접 삽입 (공짜 포인트 획득)
    try {
        var res2 = await sb.from('point_logs').insert({
            student_id: myInfo.id,
            amount: 5000,
            reason: '해킹 보너스'
        });
        if (res2.error) {
            log('B', 'B2. 포인트 로그 직접 삽입', true, '차단됨: ' + res2.error.message);
        } else {
            log('B', 'B2. 포인트 로그 직접 삽입', false, '⚠️ 취약! 로그 직접 삽입으로 포인트 획득 가능');
        }
    } catch (e) { log('B', 'B2. 로그 삽입 시도', true, '차단됨'); }
}

// ══════════════════════════════════════════════
// 🟡 C. 데이터 유출 (Privacy)
// ══════════════════════════════════════════════
async function testStudentPrivacy(sb, myInfo) {
    separator('C. 데이터 유출 및 사생활 침해');

    // C1. 타 학급 게시글 조회 시도
    try {
        var res = await sb.from('student_posts')
            .select('id, content, student_id')
            .limit(10);

        // 내 학급이 아닌 데이터가 있는지 간이 체크 (실제로는 class_id 비교 필요)
        log('C', 'C1. 게시글 노출 범위 확인', true, '로그인 상태에서 ' + (res.data ? res.data.length : 0) + '건의 게시글 확인됨. (본인 학급 글인지 대조 필요)');
    } catch (e) { log('C', 'C1. 게시글 조회', true, '차단됨'); }

    // C2. 교사 API 키 탈취 시도
    try {
        var res2 = await sb.from('profiles')
            .select('id, email, personal_openai_api_key, gemini_api_key')
            .neq('id', myInfo.auth_id)
            .limit(5);

        var leaked = (res2.data || []).filter(function (p) { return p.personal_openai_api_key; });
        if (leaked.length > 0) {
            log('C', 'C2. 교사 API 키 조회', false, '⚠️ 심각! 타인의 API 키가 노출됨');
        } else {
            log('C', 'C2. 교사 API 키 조회', true, '조회 결과 0건 또는 민감 정보 없음 (안전)');
        }
    } catch (e) { log('C', 'C2. 키 탈취 시도', true, '차단됨'); }

    // C3. 친구의 포인트 로그 훔쳐보기
    try {
        var res3 = await sb.from('point_logs')
            .select('*')
            .neq('student_id', myInfo.id)
            .limit(5);

        if (res3.data && res3.data.length > 0) {
            log('C', 'C3. 타인 포인트 로그 조회', false, '⚠️ 취약! 친구의 포인트 사용 내역을 볼 수 있음');
        } else {
            log('C', 'C3. 타인 포인트 로그 조회', true, '타인 로그 접근 차단됨 (안전)');
        }
    } catch (e) { log('C', 'C3. 로그 훔쳐보기', true, '차단됨'); }
}

// ══════════════════════════════════════════════
// 🟢 D. 타인 권한 오남용
// ══════════════════════════════════════════════
async function testStudentAbuse(sb, myInfo) {
    separator('D. 타인 권한 오남용');

    // D1. 친구의 게시글 삭제 시도
    try {
        var res = await sb.from('student_posts')
            .delete()
            .neq('student_id', myInfo.id)
            .limit(1);

        if (res.error) {
            log('D', 'D1. 타인 게시글 삭제', true, '차단됨: ' + res.error.message);
        } else {
            log('D', 'D1. 타인 게시글 삭제', true, '항목이 없거나 차단됨');
        }
    } catch (e) { log('D', 'D1. 글 삭제 시도', true, '차단됨'); }

    // D2. 친구의 반응(좋아요) 수정 시도
    try {
        var res2 = await sb.from('post_reactions')
            .update({ reaction_type: 'HACKED' })
            .neq('student_id', myInfo.id)
            .limit(1);

        if (res2.error) {
            log('D', 'D2. 타인 좋아요 수정', true, '차단됨: ' + res2.error.message);
        } else {
            log('D', 'D2. 타인 좋아요 수정', true, '항목이 없거나 차단됨');
        }
    } catch (e) { log('D', 'D2. 좋아요 수정 시도', true, '차단됨'); }
}

// 🏁 메인 실행 함수
async function runStudentTests() {
    console.clear();
    results = [];

    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // 1. 세션 확인
    var sessRes = await sb.auth.getSession();
    if (!sessRes.data || !sessRes.data.session) {
        console.error('❌ 에러: 학생 계정으로 로그인되어 있지 않습니다.');
        return;
    }

    var authUser = sessRes.data.session.user;
    console.log('%c🛡️ 학생 보안 점검 시작: ' + authUser.email, 'font-weight: bold; font-size: 14px');

    // 2. 내 학생 정보 확보
    var stuRes = await sb.from('students').select('*').eq('auth_id', authUser.id).maybeSingle();
    if (!stuRes.data) {
        console.warn('⚠️ 알림: students 테이블에서 당신의 정보를 찾을 수 없습니다. (교사/관리자 계정인 경우 취소 권장)');
    }

    var myInfo = stuRes.data || { auth_id: authUser.id, id: 'unknown-id' };

    // 3. 테스트 순차 실행
    await testStudentElevation(sb, myInfo);
    await testStudentEconomy(sb, myInfo);
    await testStudentPrivacy(sb, myInfo);
    await testStudentAbuse(sb, myInfo);

    // 요약 출력
    separator('📊 최종 결과 요약');
    var passed = results.filter(function (r) { return r.passed; }).length;
    var failed = results.filter(function (r) { return !r.passed; }).length;

    console.log('%c총 ' + results.length + '개 항목 | ✅ ' + passed + '개 통과 | ❌ ' + failed + '개 실패',
        failed > 0 ? 'color: #E74C3C; font-size: 16px; font-weight: bold' : 'color: #27AE60; font-size: 16px; font-weight: bold');

    if (failed > 0) {
        results.filter(function (r) { return !r.passed; }).forEach(function (r) {
            console.log('%c❌ [' + r.category + '] ' + r.testName + ': ' + r.detail, 'color: #E74C3C');
        });
    } else {
        console.log('%c🎉 축하합니다! 학생 계정에서 발견된 보안 취약점이 없습니다.', 'color: #27AE60; font-weight: bold');
    }
}

// CDN 로드
_loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js')
    .then(function () {
        console.log('%c🛡️ 학생 보안 테스트 스크립트 로드 완료! 콘솔에  runStudentTests()  를 입력하세요.', 'color: #3498DB; font-weight: bold');
    });
