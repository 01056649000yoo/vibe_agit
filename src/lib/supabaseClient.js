import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const SHARED_AUTH_COOKIE_NAME = 'sb-agit-auth-token';

const isValidConfig = supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http');

const legacyStorageKey = (() => {
    if (!isValidConfig) return null;
    try {
        return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
    } catch {
        return null;
    }
})();

if (import.meta.env.DEV) console.log("Supabase URL 확인:", supabaseUrl);

// 주소가 없거나 유효하지 않을 때 앱이 멈추지 않도록 체크합니다.
if (!supabaseUrl || !supabaseUrl.startsWith('http')) {
    console.error("적절한 Supabase URL이 설정되지 않았습니다. .env 파일을 확인해주세요.");
}

export const supabase = isValidConfig
    ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: {
            name: SHARED_AUTH_COOKIE_NAME,
            path: '/',
            sameSite: 'lax',
            secure: window.location.protocol === 'https:'
        }
    })
    : null;

let legacyMigrationPromise = null;

const readLegacySession = () => {
    if (!legacyStorageKey || legacyStorageKey === SHARED_AUTH_COOKIE_NAME) return null;

    try {
        const stored = window.localStorage.getItem(legacyStorageKey);
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        const session = parsed?.currentSession || parsed;
        if (!session?.access_token || !session?.refresh_token) return null;
        return session;
    } catch {
        return null;
    }
};

/**
 * 예전 localStorage 세션을 두 앱이 함께 읽는 루트 쿠키로 한 번만 옮긴다.
 * 새 세션 저장이 확인된 뒤에만 예전 값을 지워, 배포 직후 로그인 유실을 막는다.
 */
export const migrateLegacyAuthSession = async () => {
    if (!supabase || !legacyStorageKey) return;
    if (legacyMigrationPromise) return legacyMigrationPromise;

    legacyMigrationPromise = (async () => {
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session) return;

        const legacySession = readLegacySession();
        if (!legacySession) return;

        const { data, error } = await supabase.auth.setSession({
            access_token: legacySession.access_token,
            refresh_token: legacySession.refresh_token
        });

        if (!error && data.session) {
            window.localStorage.removeItem(legacyStorageKey);
        }
    })().finally(() => {
        legacyMigrationPromise = null;
    });

    return legacyMigrationPromise;
};

/**
 * 이 브라우저에 남은 로그인 흔적을 **확실히** 지운다.
 *
 * 세션은 `localStorage` 가 아니라 **쿠키**(`sb-agit-auth-token`)에 있다. 그래서
 * `localStorage.clear()` 만으로는 지워지지 않는다. 게다가 `@supabase/ssr` 은 세션이 길면
 * `…-token.0`, `…-token.1` 처럼 조각내 저장하므로, 한 조각만 남아도 다음 접속에서
 * 엉뚱한 옛 토큰이 복원된다.
 *
 * 계정이 이미 지워진 뒤에는 서버 로그아웃이 실패하므로 라이브러리가 쿠키를 못 지우는
 * 경우가 있다. 그때 탈퇴한 계정의 출입증이 남아 "가입 화면이 뜨고 학교 검색은
 * 로그인이 만료되었다고 하는" 상태가 됐다(2026-09-13 제보). 이름으로 직접 지운다.
 */
export const clearStoredAuthSession = () => {
    if (typeof document === 'undefined') return;

    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    const names = new Set([SHARED_AUTH_COOKIE_NAME]);
    // 조각 쿠키는 몇 개까지 늘어날지 알 수 없으니, 지금 있는 것을 이름으로 훑어 모은다.
    document.cookie.split(';').forEach((entry) => {
        const name = entry.split('=')[0]?.trim();
        if (name && name.startsWith(SHARED_AUTH_COOKIE_NAME)) names.add(name);
    });

    names.forEach((name) => {
        document.cookie = `${name}=; Max-Age=0; path=/; sameSite=lax${secure}`;
    });

    try {
        if (legacyStorageKey) window.localStorage.removeItem(legacyStorageKey);
    } catch { /* 사생활 보호 모드면 못 지운다 — 쿠키만으로도 충분하다 */ }
};
