import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(file, 'utf8');
const store = read('src/store/useAuthStore.js');
const withdrawal = read('src/hooks/useTeacherDashboard.js');
const client = read('src/lib/supabaseClient.js');
const schools = read('src/utils/schoolApi.js');

test('탈퇴할 때 저장소를 비우기 전에 먼저 로그아웃한다', () => {
    /*
     * 2026-09-13 제보: 탈퇴하고 다시 들어오면 로그인 창 대신 가입 화면이 떴고,
     * 학교를 검색하면 "교사 로그인이 만료되었습니다" 가 떴다.
     *
     * 저장소를 먼저 비우면 그 사이 supabase 클라이언트가 메모리에 들고 있던 세션을
     * 다시 적어 넣어, 지워진 계정의 출입증이 브라우저에 남는다.
     */
    const signOutAt = withdrawal.indexOf("supabase.auth.signOut({ scope: 'local' })");
    const clearAt = withdrawal.indexOf('localStorage.clear()');
    assert.ok(signOutAt > 0, '탈퇴에서 로그아웃을 찾지 못했습니다.');
    assert.ok(clearAt > 0, '탈퇴에서 저장소 비우기를 찾지 못했습니다.');
    assert.ok(signOutAt < clearAt, '저장소를 먼저 비우면 세션이 되살아나 남습니다.');
});

test('프로필을 못 읽으면 계정이 아직 있는지 인증 서버에 물어본다', () => {
    /*
     * 프로필이 없다는 것만으로는 "이제 막 가입하는 사람" 과 "탈퇴로 사라진 계정" 을
     * 가를 수 없다. PostgREST 는 토큰의 서명만 보므로 둘 다 통과한다.
     */
    assert.match(store, /signOutIfAccountGone: async \(\) => \{/);
    assert.match(store, /await get\(\)\.signOutIfAccountGone\(\);/);
    assert.match(store, /supabase\.auth\.getUser\(\)/);
});

test('통신이 끊긴 것과 계정이 사라진 것을 가른다', () => {
    /*
     * 여기서 헷갈리면 잠깐 인터넷이 끊긴 멀쩡한 선생님을 로그아웃시킨다.
     * 인증 서버가 **거절했을 때(401·403)** 만 정리한다.
     */
    assert.match(store, /error\?\.status === 401 \|\| error\?\.status === 403/);
    assert.match(store, /if \(!rejected\) return false;/);
});

test('사라진 계정은 이 브라우저만 정리한다', () => {
    // 서버에 없는 계정이라 서버 로그아웃은 실패한다. scope 를 local 로 둬야 정리가 끝난다.
    assert.match(store, /supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
    assert.match(store, /set\(\{ session: null, profile: null, teacherBootstrap: null, profileLoading: false \}\)/);
});

test('세션은 쿠키에 있으므로 localStorage 만 비워서는 안 지워진다', () => {
    /*
     * 2026-09-13: 탈퇴가 `localStorage.clear()` 만 했는데 세션은 `sb-agit-auth-token`
     * **쿠키**에 있었다. 계정이 지워진 뒤에는 서버 로그아웃도 실패해, 죽은 출입증이
     * 브라우저에 그대로 남았다.
     */
    assert.match(client, /export const clearStoredAuthSession = \(\) => \{/);
    // 조각 쿠키(…-token.0, .1)가 하나라도 남으면 옛 토큰이 되살아난다.
    assert.match(client, /name\.startsWith\(SHARED_AUTH_COOKIE_NAME\)/);
    assert.match(client, /Max-Age=0/);

    const clearAt = withdrawal.indexOf('clearStoredAuthSession()');
    assert.ok(clearAt > 0, '탈퇴가 쿠키를 지우지 않습니다.');
});

test('학교 검색이 401 이면 죽은 가입 화면에 가두지 않는다', () => {
    /*
     * 빨간 글씨만 띄우면 선생님은 아무것도 못 하고 갇힌다. 흔적을 정리해
     * 로그인 화면으로 돌려보낸다.
     */
    assert.match(schools, /const isSignedOut = \(error\) => error\?\.context\?\.status === 401;/);
    assert.match(schools, /signOutIfAccountGone\(\)/);
    assert.ok(schools.includes('로그인이 풀렸습니다'), '무엇을 해야 하는지 알려 주어야 합니다.');
});
