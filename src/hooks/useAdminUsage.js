import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * 관리자 사용량 대시보드 데이터 훅.
 *
 * 집계는 전부 DB(admin_get_teacher_usage / admin_get_usage_overview)에서 수행한다.
 * 예전처럼 classes·students 전 row를 프론트로 끌어와 세면 계정이 늘수록 타임아웃이 나므로,
 * 여기서는 RPC 결과만 받아 화면 상태로 보관한다.
 */

export const USAGE_STATUS = {
    ACTIVE: 'ACTIVE',
    IDLE: 'IDLE',
    DORMANT: 'DORMANT',
    NO_STUDENT: 'NO_STUDENT',
    NEVER_STARTED: 'NEVER_STARTED'
};

export const USAGE_STATUS_META = {
    [USAGE_STATUS.ACTIVE]: { label: '활동 중', color: '#38A169', background: '#F0FFF4', border: '#9AE6B4' },
    [USAGE_STATUS.IDLE]: { label: '조용함', color: '#718096', background: '#F7FAFC', border: '#CBD5E0' },
    [USAGE_STATUS.DORMANT]: { label: '장기 미접속', color: '#D69E2E', background: '#FFFAF0', border: '#F6E05E' },
    [USAGE_STATUS.NO_STUDENT]: { label: '학생 미등록', color: '#DD6B20', background: '#FFFAF0', border: '#FBD38D' },
    [USAGE_STATUS.NEVER_STARTED]: { label: '학급 미개설', color: '#E53E3E', background: '#FFF5F5', border: '#FEB2B2' }
};

export const ACTIVITY_DAY_OPTIONS = [7, 30, 90];

// 관리자 화면의 장기 미접속 기준은 여기 한 곳에서만 정한다.
// 삭제 기준이 아니라 확인·비활성화 판단을 돕는 표시 기준이다.
export const DORMANT_DAYS = 90;
const DEFAULT_ACTIVITY_DAYS = 30;

const useAdminUsage = ({
    activityDays: initialActivityDays = DEFAULT_ACTIVITY_DAYS,
    enabled = true
} = {}) => {
    const [activityDays, setActivityDays] = useState(initialActivityDays);
    const [teachers, setTeachers] = useState([]);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchUsage = useCallback(async ({ showLoading = true } = {}) => {
        if (!enabled) return;
        if (showLoading) setLoading(true);
        setError(null);

        try {
            const [usageResult, overviewResult] = await Promise.all([
                supabase.rpc('admin_get_teacher_usage', {
                    p_dormant_days: DORMANT_DAYS,
                    p_activity_days: activityDays
                }),
                supabase.rpc('admin_get_usage_overview', {
                    p_dormant_days: DORMANT_DAYS,
                    p_activity_days: activityDays
                })
            ]);

            if (usageResult.error) throw usageResult.error;
            if (overviewResult.error) throw overviewResult.error;

            setTeachers(usageResult.data || []);
            setOverview(overviewResult.data || null);
        } catch (err) {
            setError(err.message || '사용량 데이터를 불러오지 못했습니다.');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, [enabled, activityDays]);

    useEffect(() => {
        fetchUsage();
    }, [fetchUsage]);

    /**
     * 장기 미접속은 학급·학생 보유 여부와 무관하게 모든 가입 교사의 마지막 접속일로 판정한다.
     * DB의 usage_status는 학급 미개설/학생 미등록을 별도 분류하므로 그것만 보면 일부가 빠질 수 있다.
     */
    const dormantTeachers = useMemo(
        () => teachers.filter(t => Number(t.days_since_login) >= DORMANT_DAYS),
        [teachers]
    );

    /** 정리 후보: 학급을 안 만들었거나(NEVER_STARTED), 만들고도 학생이 0명(NO_STUDENT) */
    const cleanupCandidates = useMemo(
        () => teachers.filter(
            t => t.usage_status === USAGE_STATUS.NEVER_STARTED || t.usage_status === USAGE_STATUS.NO_STUDENT
        ),
        [teachers]
    );

    return {
        teachers,
        overview,
        dormantTeachers,
        cleanupCandidates,
        loading,
        error,
        dormantDays: DORMANT_DAYS,
        activityDays,
        setActivityDays,
        refresh: fetchUsage
    };
};

export default useAdminUsage;
