import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { EMPTY_FOOTPRINT_DETAIL } from './StudentWritingFootprintStats';

/** 학생 본인의 칭호 제외 발자국 데이터를 한 번에 읽고 포인트 사용처를 결합한다. */
export const useMyWritingFootprint = (active) => {
    const [detail, setDetail] = useState(EMPTY_FOOTPRINT_DETAIL);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        const [detailResult, spendingResult] = await Promise.all([
            supabase.rpc('get_my_writing_footprint_detail'),
            supabase.rpc('get_my_point_spending_breakdown')
        ]);
        if (detailResult.error) {
            console.error('글쓰기 발자국 로드 실패:', detailResult.error.message);
            setErrorMessage('발자국을 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
        } else {
            if (spendingResult.error) console.warn('포인트 사용처 로드 실패:', spendingResult.error.message);
            setDetail({
                ...EMPTY_FOOTPRINT_DETAIL,
                ...(detailResult.data || {}),
                spending: spendingResult.error
                    ? EMPTY_FOOTPRINT_DETAIL.spending
                    : { ...EMPTY_FOOTPRINT_DETAIL.spending, ...(spendingResult.data || {}) }
            });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!active) return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [active, load]);

    return { detail, loading, errorMessage, reload: load };
};
