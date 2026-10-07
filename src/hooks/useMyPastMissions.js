import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
    PAST_MISSION_EXCLUDED_TYPES,
    PAST_MISSION_FIELDS,
    PAST_MISSION_PAGE_SIZE,
    pastMissionSearchTerm
} from '../modules/writing/mission-form/pastMission';

const SEARCH_DEBOUNCE_MS = 300;

/**
 * 내가 낸 과제(모든 학급·보관한 과제 포함) 한 쪽(20개)씩, 최신순.
 * 창을 열 때만 부른다 — 한 선생님 과제는 많아야 수십 개라 교사 id 색인으로 바로 끝난다.
 */
const useMyPastMissions = ({ enabled, search }) => {
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [items, setItems] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const timerId = window.setTimeout(() => setDebouncedSearch(pastMissionSearchTerm(search)), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(timerId);
    }, [search]);

    useEffect(() => { setPage(1); }, [debouncedSearch]);

    const load = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        setError('');
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.id) throw new Error('로그인 정보를 확인하지 못했습니다.');
            const from = (page - 1) * PAST_MISSION_PAGE_SIZE;
            let query = supabase
                .from('writing_missions')
                .select(PAST_MISSION_FIELDS, { count: 'exact' })
                .eq('teacher_id', user.id)
                // input_template 은 비지 않는 칸이라 여기서 거른다(mission_type 은 빈 값이 있어 NOT IN 이 빈 값까지 지운다).
                .not('input_template', 'in', `(${PAST_MISSION_EXCLUDED_TYPES.join(',')})`)
                .order('created_at', { ascending: false })
                .range(from, from + PAST_MISSION_PAGE_SIZE - 1);
            if (debouncedSearch) {
                query = query.or(`title.ilike.*${debouncedSearch}*,guide.ilike.*${debouncedSearch}*`);
            }
            const { data, error: fetchError, count } = await query;
            if (fetchError) throw fetchError;
            setItems(data || []);
            setTotalCount(Number(count || 0));
        } catch (err) {
            setItems([]);
            setError(err.message || '내가 낸 과제를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [enabled, page, debouncedSearch]);

    useEffect(() => { load(); }, [load]);

    return {
        items, totalCount, loading, error, page, setPage, reload: load,
        pageCount: Math.max(1, Math.ceil(totalCount / PAST_MISSION_PAGE_SIZE))
    };
};

export default useMyPastMissions;
