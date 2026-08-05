import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const EMPTY_STATUS = Object.freeze({
    dailyLimit: 3,
    completedToday: 0,
    remainingToday: 3,
    canComplete: true
});

const normalizeStatus = (data) => {
    const dailyLimit = Math.max(1, Number(data?.daily_limit) || EMPTY_STATUS.dailyLimit);
    const completedToday = Math.max(0, Number(data?.completed_today) || 0);
    const remainingValue = data?.remaining_today == null
        ? dailyLimit - completedToday
        : Number(data.remaining_today) || 0;
    const remainingToday = Math.max(0, remainingValue);
    return {
        dailyLimit,
        completedToday,
        remainingToday,
        canComplete: data?.can_complete ?? remainingToday > 0
    };
};

export const useReadingLogDailyStatus = (studentId, { enabled = true } = {}) => {
    const [status, setStatus] = useState(EMPTY_STATUS);
    const [loading, setLoading] = useState(Boolean(studentId && enabled));
    const [error, setError] = useState('');

    const refresh = useCallback(async () => {
        if (!studentId || !enabled) return EMPTY_STATUS;
        setLoading(true);
        setError('');
        const { data, error: rpcError } = await supabase.rpc('get_my_reading_log_daily_status');
        if (rpcError) {
            console.error('오늘 독서록 작성 현황 불러오기 실패:', rpcError.message);
            setError('오늘 작성 현황을 불러오지 못했어요.');
            setLoading(false);
            return null;
        }
        const nextStatus = normalizeStatus(data);
        setStatus(nextStatus);
        setLoading(false);
        return nextStatus;
    }, [enabled, studentId]);

    useEffect(() => {
        if (!studentId || !enabled) return undefined;
        const timerId = window.setTimeout(refresh, 0);
        return () => window.clearTimeout(timerId);
    }, [enabled, refresh, studentId]);

    return { ...status, loading, error, refresh };
};

export default useReadingLogDailyStatus;
