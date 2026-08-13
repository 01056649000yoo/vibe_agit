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
