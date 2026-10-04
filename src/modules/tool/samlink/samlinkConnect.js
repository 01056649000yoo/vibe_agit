/**
 * 쌤링크 ↔ 아지트 선생님 계정 연결(2026-10-05, 선생님 결정).
 *
 * 아지트는 1분짜리 한 번 쓰는 연결표(`issue_samlink_connect_ticket_v1`)만 쌤링크에 넘긴다 — 로그인 토큰은 넘기지 않는다.
 * - iframe(학급운영도구 → URL 단축하기): 쌤링크 화면이 `samlink:request-ticket` 을 보내면 연결표를 돌려준다.
 * - 쌤링크.kr 직접: "아지트 계정으로 연결" → `/?samlink-connect=1` 로 들어오면 로그인 뒤 연결표를 들고
 *   `https://샘링크.kr/connect#ticket=` 으로 돌아간다(# 뒤라 서버 로그에 남지 않음).
 * 받는 쪽: URL 저장소 `app/account-bar.tsx`·`app/api/account/connect`.
 */
export const SAMLINK_ORIGIN = 'https://xn--9y2br3k43n.kr';
const CONNECT_PARAM = 'samlink-connect';
const PENDING_KEY = 'agit-samlink-connect-pending-v1';

export const issueSamlinkTicket = async (supabase) => {
    const { data, error } = await supabase.rpc('issue_samlink_connect_ticket_v1');
    if (error || typeof data !== 'string') throw error || new Error('연결표를 받지 못했습니다.');
    return data;
};

/** 쌤링크 iframe 이 보낸 요청인지: 출처와 보낸 창이 모두 맞아야 한다. */
export const isSamlinkTicketRequest = (event, frameWindow) => event.origin === SAMLINK_ORIGIN
    && Boolean(frameWindow) && event.source === frameWindow
    && event.data?.type === 'samlink:request-ticket';

/** 첫 화면에서 `?samlink-connect=1` 을 기억해 두고 주소에서 지운다(로그인을 거쳐도 남도록 sessionStorage). */
export const captureSamlinkConnectRequest = (win = window) => {
    const url = new URL(win.location.href);
    if (url.searchParams.get(CONNECT_PARAM) !== '1') return false;
    try { win.sessionStorage.setItem(PENDING_KEY, String(Date.now())); } catch { /* 저장 못 해도 지금 바로 처리는 된다 */ }
    url.searchParams.delete(CONNECT_PARAM);
    win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return true;
};

/** 기억해 둔 연결 요청이 있으면(10분 안) 꺼낸다. 한 번 꺼내면 지운다. */
export const takeSamlinkConnectRequest = (win = window) => {
    try {
        const stored = Number(win.sessionStorage.getItem(PENDING_KEY));
        win.sessionStorage.removeItem(PENDING_KEY);
        return Number.isFinite(stored) && stored > 0 && Date.now() - stored < 10 * 60 * 1000;
    } catch {
        return false;
    }
};

export const isApprovedTeacherProfile = (profile) => profile?.role === 'ADMIN'
    || (profile?.role === 'TEACHER' && profile?.is_approved === true && !profile?.approval_revoked_at);

export const samlinkConnectReturnUrl = (ticket) => `${SAMLINK_ORIGIN}/connect#ticket=${encodeURIComponent(ticket)}`;
