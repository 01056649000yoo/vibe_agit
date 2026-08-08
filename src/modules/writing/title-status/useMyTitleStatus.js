import { useCallback, useEffect, useMemo, useState } from 'react';
import { getReaderLevel, getWriterLevel } from '../../../constants/writerLevels';
import { classKey, dataCache } from '../../../lib/cache';
import { supabase } from '../../../lib/supabaseClient';

const TITLE_STATUS_TTL_MS = 30000;

const EMPTY_STATUS = {
    writerTotalChars: 0,
    writerCompletedPosts: 0,
    writerLevelOverride: null,
    readerScore: 0,
    readerPostCount: 0,
    readerLevelOverride: null,
    season: null
};

const normalizeTitleStatus = (data) => ({
    writerTotalChars: Number(data?.writer_total_chars || 0),
    writerCompletedPosts: Number(data?.writer_completed_posts || 0),
    writerLevelOverride: data?.writer_level_override == null ? null : Number(data.writer_level_override),
    readerScore: Number(data?.reader_score || 0),
    readerPostCount: Number(data?.reader_post_count || 0),
    readerLevelOverride: data?.reader_level_override == null ? null : Number(data.reader_level_override),
    season: data?.season || null
});

/** 나의 아지트와 글쓰기 발자국이 함께 쓰는 유일한 칭호 데이터 경로. */
const useMyTitleStatus = ({ studentSession, active = true, initialStatus = null, bootstrapLoading = false }) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const studentId = studentSession?.id;
    const [status, setStatus] = useState(() => initialStatus ? normalizeTitleStatus(initialStatus) : EMPTY_STATUS);
    const [loading, setLoading] = useState(!initialStatus);
    const [errorMessage, setErrorMessage] = useState('');

    const load = useCallback(async (forceRefresh = false) => {
        if (!classId || !studentId) {
            setLoading(false);
            setErrorMessage('학생 정보를 확인하지 못했어요.');
            return;
        }

        const cacheKey = classKey(classId, 'my-title-status', { student: studentId });
        if (forceRefresh) dataCache.invalidate(cacheKey);
        setLoading(true);
        setErrorMessage('');
        try {
            const next = await dataCache.get(cacheKey, async () => {
                const { data, error } = await supabase.rpc('get_my_title_status');
                if (error) throw error;
                return normalizeTitleStatus(data);
            }, TITLE_STATUS_TTL_MS);
            setStatus(next || EMPTY_STATUS);
        } catch (error) {
            console.error('나의 칭호 상태 로드 실패:', error.message);
            setStatus(EMPTY_STATUS);
            setErrorMessage('칭호를 잠시 확인하지 못했어요.');
        } finally {
            setLoading(false);
        }
    }, [classId, studentId]);

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

    return { status, writerLevel, readerLevel, loading, errorMessage, reload: () => load(true) };
};

export default useMyTitleStatus;
