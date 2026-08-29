import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/** 관리자 첫 화면과 서비스 관리 탭이 같은 원장 응답을 공유한다. 폴링·Realtime은 사용하지 않는다. */
export const useAdminServiceManagement = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        const { data: result, error: rpcError } = await supabase.rpc('admin_get_service_management_v1', {
            p_scan_limit: 12
        });
        if (rpcError) {
            setError(rpcError.message);
        } else {
            setError('');
            setData(result);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [load]);

    return { data, loading, error, refresh: load };
};
