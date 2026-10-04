import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/*
 * 관리자에게 "아직 안 본 선생님 문의(의견 제보)" 가 있는지(2026-10-05, 선생님 요청).
 *
 * 왜: 새 문의 수는 관리자 대시보드 안에만 있어서, 교사 화면으로 지내는 동안에는 문의가 왔는지 알 수 없었다.
 * 머리말 이름 옆(계정 메뉴)에 빨간 불로 띄운다. 기준은 관리자 대시보드 `새 의견 제보` 와 같은 status='open'.
 *
 * 관리자 한 명에게만 도는 개수 하나(head 조회)라 부담이 없다. 그래도 60초 미만 폴링은 두지 않는다 —
 * 화면에 돌아올 때(focus·보이기)와 5분마다만 다시 센다.
 */
export const ADMIN_INQUIRY_REFRESH_MS = 5 * 60 * 1000;
export const ADMIN_INITIAL_TAB_KEY = 'agit-admin-initial-tab-v1';

export const useAdminInquiryAlert = (isAdmin) => {
    const [count, setCount] = useState(0);

    const refresh = useCallback(async () => {
        if (!isAdmin) return;
        const { count: open, error } = await supabase
            .from('feedback_reports')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'open');
        if (!error) setCount(open || 0);
    }, [isAdmin]);

    useEffect(() => {
        if (!isAdmin) return undefined;
        const initial = setTimeout(refresh, 0);
        const timer = setInterval(refresh, ADMIN_INQUIRY_REFRESH_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearTimeout(initial);
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [isAdmin, refresh]);

    return isAdmin ? count : 0;
};

/** 관리자 화면을 열 때 처음 보여 줄 탭을 넘긴다(새 문의가 있으면 `의견 제보` 로 바로). */
export const rememberAdminInitialTab = (tab) => {
    try { window.sessionStorage.setItem(ADMIN_INITIAL_TAB_KEY, tab); } catch { /* 못 넘겨도 첫 탭으로 열릴 뿐 */ }
};

export const takeAdminInitialTab = (fallback = 'active') => {
    try {
        const tab = window.sessionStorage.getItem(ADMIN_INITIAL_TAB_KEY);
        window.sessionStorage.removeItem(ADMIN_INITIAL_TAB_KEY);
        return tab || fallback;
    } catch {
        return fallback;
    }
};
