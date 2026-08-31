import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    getDiaryLevel,
    getReaderLevel,
    getReadingLevel,
    getWriterLevel
} from '../../../constants/writerLevels';
import { classKey, dataCache } from '../../../lib/cache';
import { supabase } from '../../../lib/supabaseClient';
import { titleRewardApi } from './titleRewardApi';
import { EMPTY_TITLE_STATUS, normalizeTitleStatus } from './titleSeason';

const TITLE_STATUS_TTL_MS = 30000;

/** 나의 아지트와 글쓰기 발자국이 함께 쓰는 유일한 칭호 데이터 경로. */
const useMyTitleStatus = ({ studentSession, active = true, initialStatus = null, bootstrapLoading = false }) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const studentId = studentSession?.id;
    const [status, setStatus] = useState(() => initialStatus ? normalizeTitleStatus(initialStatus) : EMPTY_TITLE_STATUS);
    const [loading, setLoading] = useState(!initialStatus);
    const [errorMessage, setErrorMessage] = useState('');
    const [claimingTrack, setClaimingTrack] = useState(null);
    const [rewardErrorMessage, setRewardErrorMessage] = useState('');

    const cacheKey = useMemo(
        () => classId && studentId ? classKey(classId, 'my-title-status', { student: studentId }) : null,
        [classId, studentId]
    );

    const load = useCallback(async (forceRefresh = false) => {
        if (!classId || !studentId) {
            setLoading(false);
            setErrorMessage('학생 정보를 확인하지 못했어요.');
            return;
        }

        if (forceRefresh) dataCache.invalidate(cacheKey);
        setLoading(true);
        setErrorMessage('');
        try {
            const next = await dataCache.get(cacheKey, async () => {
                const { data, error } = await supabase.rpc('get_my_title_status');
                if (error) throw error;
                return normalizeTitleStatus(data);
            }, TITLE_STATUS_TTL_MS);
            setStatus(next || EMPTY_TITLE_STATUS);
        } catch (error) {
            console.error('나의 칭호 상태 로드 실패:', error.message);
            setStatus(EMPTY_TITLE_STATUS);
            setErrorMessage('칭호를 잠시 확인하지 못했어요.');
        } finally {
            setLoading(false);
        }
    }, [cacheKey, classId, studentId]);

    const claimRewards = useCallback(async (trackId, levels = null) => {
        if (!cacheKey || claimingTrack) return null;
        setClaimingTrack(trackId);
        setRewardErrorMessage('');
        try {
            const result = await titleRewardApi.claim(trackId, levels);
            const next = normalizeTitleStatus(result?.title_status);
            setStatus(next);
            dataCache.set(cacheKey, next);
            return result;
        } catch (error) {
            console.error('칭호 단계 보상 수령 실패:', error.message);
            setRewardErrorMessage(error.message || '보상을 받지 못했어요. 잠시 후 다시 시도해주세요.');
            return null;
        } finally {
            setClaimingTrack(null);
        }
    }, [cacheKey, claimingTrack]);

    useEffect(() => {
        if (!initialStatus) return;
        setStatus(normalizeTitleStatus(initialStatus));
        setLoading(false);
        setErrorMessage('');
    }, [initialStatus]);

    useEffect(() => {
        if (!active) return undefined;
        if (initialStatus || bootstrapLoading) return undefined;
        const timerId = window.setTimeout(() => load(), 0);
        return () => window.clearTimeout(timerId);
    }, [active, bootstrapLoading, initialStatus, load]);

    const writerLevel = useMemo(
        () => getWriterLevel(status.writerTotalChars, status.writerCompletedPosts, status.writerLevelOverride),
        [status.writerCompletedPosts, status.writerLevelOverride, status.writerTotalChars]
    );
    const readerLevel = useMemo(
        () => getReaderLevel(status.readerScore, status.readerLevelOverride),
        [status.readerLevelOverride, status.readerScore]
    );
    const diaryLevel = useMemo(
        () => getDiaryLevel(status.diaryDays, status.diaryLevelOverride),
        [status.diaryDays, status.diaryLevelOverride]
    );
    const readingLevel = useMemo(
        () => getReadingLevel(status.readingLogCount, status.readingBookCount, status.readingLevelOverride),
        [status.readingBookCount, status.readingLevelOverride, status.readingLogCount]
    );

    return {
        status,
        writerLevel,
        readerLevel,
        diaryLevel,
        readingLevel,
        loading,
        errorMessage,
        claimingTrack,
        rewardErrorMessage,
        claimRewards,
        reload: () => load(true)
    };
};

export default useMyTitleStatus;
