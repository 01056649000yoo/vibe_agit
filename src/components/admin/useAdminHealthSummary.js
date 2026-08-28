import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * 관리자 상단에 늘 띄우는 **오늘 활동·건강 요약**.
 *
 * 예전에는 디스크·컨테이너·경고가 `운영 > 서버 상태` 탭 **안에만** 있어서, 문제가 나도 그 탭을
 * 열어야만 알았다(2026-08-25 정리). 상단은 "지금 손대야 하나"에 답하는 자리다.
 *
 * ⚠️ 서비스 현황 패널과 **같은 RPC** 를 쓴다. 새 조회를 만들지 않는다 — 같은 값을 두 곳에서
 *    따로 세면 화면마다 다른 숫자가 나온다.
 * 오늘 접속·제출 수와 맥 본체 현재 메모리·스왑도 같은 RPC 에서 받는다. 도커 VM 값과 섞지 않는다.
 */
export const useAdminHealthSummary = () => {
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        // 상단은 곁눈질용이라 추이(trend)까지 받지 않는다. 최소 기간만 요청한다.
        const { data, error: rpcError } = await supabase.rpc('admin_get_service_overview_v1', {
            p_trend_days: 1
        });
        if (rpcError) {
            setError(rpcError.message);
            return;
        }
        setError('');
        const latest = data?.latest || null;
        const alerts = Array.isArray(data?.alerts) ? data.alerts : [];
        const openAlerts = alerts.filter((alert) => alert.status === 'open');
        const backup = data?.backup || null;
        setSummary({
            todayTeachers: data?.today?.teachers ?? null,
            todayStudents: data?.today?.students ?? null,
            todaySubmittedPosts: data?.today?.posts ?? null,
            containerHealthy: latest?.container_healthy ?? null,
            containerTotal: latest?.container_total ?? null,
            diskFreeGb: latest?.disk_free_gb ?? null,
            hostMemoryAvailablePct: latest?.host_mem_available_pct ?? null,
            hostSwapUsedMb: latest?.host_swap_used_mb ?? null,
            openAlertCount: openAlerts.length,
            openAlertKeys: openAlerts.map((alert) => alert.alert_key),
            resourceSampledAt: latest?.resource_sampled_at ?? null,
            backupExpectedApps: backup?.expected_apps ?? 3,
            backupAppRecorded: backup?.daily_app_recorded ?? 0,
            backupAppPassed: backup?.daily_app_passed ?? 0,
            backupFresh: backup?.daily_fresh ?? false,
            restoreAppRecorded: backup?.restore_app_recorded ?? 0,
            restoreAppPassed: backup?.restore_app_passed ?? 0,
            restoreFresh: backup?.restore_fresh ?? false,
            backupAttentionCount: backup?.attention_count ?? 0
        });
    }, []);

    // 렌더 도중 연쇄 갱신이 나지 않도록 한 틱 미뤄 부른다(다른 화면 훅과 같은 방식).
    useEffect(() => {
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [load]);

    return { summary, error, reload: load };
};
