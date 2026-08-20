import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const DEFAULT_STATUS = {
    isEnabled: false,
    today: null,
    dailyLimit: 1,
    completedToday: 0,
    rewardedToday: 0,
    remainingToday: 1,
    canComplete: true,
    hasTodayDiary: false,
    loading: true,
    error: ''
};

const normalizeStatus = (data) => ({
    isEnabled: data?.is_enabled === true,
    today: data?.today || null,
    dailyLimit: Number(data?.daily_limit ?? 1),
    completedToday: Number(data?.completed_today ?? 0),
    rewardedToday: Number(data?.rewarded_today ?? 0),
    remainingToday: Number(data?.remaining_today ?? 0),
    canComplete: Boolean(data?.can_complete),
    hasTodayDiary: Boolean(data?.has_today_diary),
    loading: false,
    error: ''
});

/**
 * 오늘 일기 작성 수와 교사 확인 보상 현황을 읽는다.
 * 조회에 실패하면 막지 않는다 — 잠깐의 통신 문제로 학생이 글을 못 쓰게 되면 안 된다.
 */
const useDiaryDailyStatus = (studentId, { enabled = true, initialStatus = null } = {}) => {
    const [status, setStatus] = useState(() => initialStatus ? normalizeStatus(initialStatus) : DEFAULT_STATUS);

    const load = useCallback(async () => {
        if (!studentId || !enabled) return;
        const { data, error } = await supabase.rpc('get_my_diary_daily_status');
        if (error) {
            console.error('일기 오늘 상태 불러오기 실패:', error.message);
            setStatus({ ...DEFAULT_STATUS, loading: false, error: error.message });
            return;
        }
        setStatus(normalizeStatus(data));
    }, [enabled, studentId]);

    // 렌더 도중 연쇄 갱신이 나지 않도록 한 틱 미뤄 부른다(독서록 훅과 같은 방식).
    useEffect(() => {
        if (initialStatus) {
            const timerId = window.setTimeout(() => setStatus(normalizeStatus(initialStatus)), 0);
            return () => window.clearTimeout(timerId);
        }
        if (!studentId || !enabled) return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [enabled, initialStatus, load, studentId]);

    return { ...status, reload: load };
};

export default useDiaryDailyStatus;
