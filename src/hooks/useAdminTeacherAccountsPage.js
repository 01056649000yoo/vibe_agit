import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const SEARCH_DEBOUNCE_MS = 300;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 3000;

const EMPTY_COUNTS = Object.freeze({ approved: 0, pending_new: 0, pending_revoked: 0 });

const normalizeItem = (item) => ({
    ...item,
    teachers: {
        name: item.teacher_name || '',
        school_name: item.school_name || '',
        phone: item.phone || ''
    }
});

/**
 * 관리자 교사 계정 목록은 서버에서 검색·상태 필터·페이지 상한을 모두 적용한다.
 * 브라우저는 현재 10명만 보관하며, 포커스 복귀와 5분 갱신도 같은 페이지 RPC만 다시 부른다.
 */
const useAdminTeacherAccountsPage = ({ status, search, page, pageSize = 10, enabled = true }) => {
    const [debouncedSearch, setDebouncedSearch] = useState(search);
    const [items, setItems] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [counts, setCounts] = useState(EMPTY_COUNTS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const timerId = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timerId);
    }, [search]);

    const refresh = useCallback(async ({ showLoading = true } = {}) => {
        if (!enabled) return;
        if (showLoading) setLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase.rpc('admin_get_teacher_accounts_page_v1', {
                p_status: status,
                p_search: debouncedSearch || null,
                p_limit: pageSize,
                p_offset: (page - 1) * pageSize
            });
            if (fetchError) throw fetchError;

            const nextItems = Array.isArray(data?.items) ? data.items.map(normalizeItem) : [];
            const nextTotal = Number(data?.total_count || 0);
            const maxPage = Math.max(1, Math.ceil(nextTotal / pageSize));

            // 삭제·승인 변경으로 마지막 페이지가 비면 호출자가 1페이지씩 뒤로 이동할 수 있게 비운다.
            // 평소에는 서버가 반환한 현재 페이지만 저장한다.
            setItems(page > maxPage ? [] : nextItems);
            setTotalCount(nextTotal);
            setCounts({ ...EMPTY_COUNTS, ...(data?.counts || {}) });
        } catch (err) {
            setItems([]);
            setError(err.message || '선생님 목록을 불러오지 못했습니다.');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [debouncedSearch, enabled, page, pageSize, status]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        if (!enabled) return undefined;

        let lastRefreshAt = 0;
        const refreshQuietly = () => {
            const now = Date.now();
            if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) return;
            lastRefreshAt = now;
            refresh({ showLoading: false });
        };
        const intervalId = window.setInterval(refreshQuietly, REFRESH_INTERVAL_MS);
        const handleFocus = () => refreshQuietly();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshQuietly();
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [enabled, refresh]);

    return { items, totalCount, counts, loading, error, refresh, debouncedSearch };
};

export default useAdminTeacherAccountsPage;
