import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';

const DEFAULT_STATUS = {
    today: null,
    dailyLimit: 1,
    completedToday: 0,
    remainingToday: 1,
    canComplete: true,
    hasTodayDiary: false,
    loading: true,
    error: ''
};

/**
 * 오늘 일기를 더 쓸 수 있는지. 서버가 완료 원장으로 세므로 화면 숫자와 실제 허용이 어긋나지 않는다.
 * 조회에 실패하면 막지 않는다 — 잠깐의 통신 문제로 학생이 글을 못 쓰게 되면 안 된다.
 */
const useDiaryDailyStatus = (studentId) => {
    const [status, setStatus] = useState(DEFAULT_STATUS);

    const load = useCallback(async () => {
        if (!studentId) return;
        const { data, error } = await supabase.rpc('get_my_diary_daily_status');
        if (error) {
            console.error('일기 오늘 상태 불러오기 실패:', error.message);
            setStatus({ ...DEFAULT_STATUS, loading: false, error: error.message });
            return;
        }
        setStatus({
            today: data?.today || null,
            dailyLimit: Number(data?.daily_limit ?? 1),
            completedToday: Number(data?.completed_today ?? 0),
            remainingToday: Number(data?.remaining_today ?? 0),
            canComplete: Boolean(data?.can_complete),
            hasTodayDiary: Boolean(data?.has_today_diary),
            loading: false,
            error: ''
        });
    }, [studentId]);

    // 렌더 도중 연쇄 갱신이 나지 않도록 한 틱 미뤄 부른다(독서록 훅과 같은 방식).
    useEffect(() => {
        if (!studentId) return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [load, studentId]);

    return { ...status, reload: load };
};

export default useDiaryDailyStatus;
