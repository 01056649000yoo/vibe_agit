import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { classKey, dataCache } from '../lib/cache';

export const TEACHER_WRITING_REVIEWED_EVENT = 'teacher-writing-reviewed';

const CACHE_TTL_MS = 30000;
const POLL_INTERVAL_MS = 60000;

const EMPTY_COUNTS = Object.freeze({
    readingLogs: 0,
    diaries: 0
});

export const notifyTeacherWritingReviewed = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(TEACHER_WRITING_REVIEWED_EVENT));
    }
};

/**
 * 교사 대시보드에서 현재 학급의 미확인 독서록 및 미확인 일기 수를 관리하는 훅.
 *
 * 학생이 새 글을 쓰면 unreviewed 상태가 되어 NEW 표기가 붙고,
 * 교사가 검토를 완료(또는 보완 요청)하면 카운트가 줄어들며 0건이 되면 NEW 표기가 사라집니다.
 */
export const useTeacherUnreviewedWriting = (classId) => {
    const [counts, setCounts] = useState(EMPTY_COUNTS);
    const [loading, setLoading] = useState(false);
    const activeRef = useRef(true);

    const fetchCounts = useCallback(async (force = false) => {
        if (!classId) {
            setCounts(EMPTY_COUNTS);
            return EMPTY_COUNTS;
        }

        const cacheKey = classKey(classId, 'teacher-unreviewed-writing');
        if (force) {
            dataCache.invalidate(cacheKey);
        }

        try {
            setLoading(true);
            const result = await dataCache.get(cacheKey, async () => {
                const [readingLogRes, diaryRes] = await Promise.allSettled([
                    supabase.rpc('get_teacher_reading_log_overview', {
                        p_class_id: classId,
                        p_review_filter: 'unreviewed',
                        p_limit: 1,
                        p_offset: 0
                    }),
                    supabase.rpc('get_teacher_diary_overview', {
                        p_class_id: classId,
                        p_review_filter: 'unreviewed',
                        p_limit: 1,
                        p_offset: 0
                    })
                ]);

                const readingLogs = readingLogRes.status === 'fulfilled'
                    ? Number(readingLogRes.value?.data?.counts?.unreviewed || 0)
                    : 0;

                const diaries = diaryRes.status === 'fulfilled'
                    ? Number(diaryRes.value?.data?.counts?.unreviewed ?? diaryRes.value?.data?.pending_count ?? 0)
                    : 0;

                return { readingLogs, diaries };
            }, CACHE_TTL_MS);

            if (activeRef.current) {
                setCounts(result || EMPTY_COUNTS);
            }
            return result;
        } catch (error) {
            console.error('미확인 글 수 조회 실패:', error);
            if (activeRef.current) {
                setCounts(EMPTY_COUNTS);
            }
            return EMPTY_COUNTS;
        } finally {
            if (activeRef.current) {
                setLoading(false);
            }
        }
    }, [classId]);

    // 학급 변경 시 조회
    useEffect(() => {
        activeRef.current = true;
        fetchCounts();
        return () => {
            activeRef.current = false;
        };
    }, [fetchCounts]);

    // 검토 완료 이벤트 및 창 포커스 시 갱신
    useEffect(() => {
        if (!classId) return undefined;

        const handleReviewed = () => {
            fetchCounts(true);
        };

        const handleFocus = () => {
            fetchCounts();
        };

        window.addEventListener(TEACHER_WRITING_REVIEWED_EVENT, handleReviewed);
        window.addEventListener('focus', handleFocus);

        // 60초 주기 백그라운드 갱신
        const intervalId = window.setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchCounts();
            }
        }, POLL_INTERVAL_MS);

        return () => {
            window.removeEventListener(TEACHER_WRITING_REVIEWED_EVENT, handleReviewed);
            window.removeEventListener('focus', handleFocus);
            window.clearInterval(intervalId);
        };
    }, [classId, fetchCounts]);

    const readingLogsUnreviewedCount = counts.readingLogs || 0;
    const diariesUnreviewedCount = counts.diaries || 0;
    const totalWritingUnreviewedCount = readingLogsUnreviewedCount + diariesUnreviewedCount;

    return {
        readingLogsUnreviewedCount,
        diariesUnreviewedCount,
        totalWritingUnreviewedCount,
        loading,
        refresh: () => fetchCounts(true)
    };
};
