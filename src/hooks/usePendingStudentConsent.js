import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/*
 * 학생 개인정보 동의서를 아직 확인하지 않은 담당 학급을 찾는다 (2026-09-11).
 *
 * 왜 따로 조회하나:
 *   학급 목록은 `useTeacherDashboard` 가 bootstrap RPC 와 캐시로 들고 있다. 거기에 열을 더하면
 *   RPC·캐시·표시 세 곳을 함께 고쳐야 한다. 관문은 로그인 직후 한 번만 보면 되므로
 *   **미확인 학급만** 가볍게 따로 묻는다. 없으면 아무 화면도 띄우지 않는다.
 *
 * 관리자는 이 관문을 거치지 않는다 — 관리자 계정은 학급을 운영하지 않는다.
 */
const usePendingStudentConsent = (session, profile) => {
    const [pending, setPending] = useState(null);   // null = 아직 모름
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const userId = session?.user?.id;
        if (!userId || profile?.role === 'ADMIN') { setPending([]); return; }
        try {
            const { data, error: loadError } = await supabase
                .from('classes')
                .select('id, name')
                .eq('teacher_id', userId)
                .is('deleted_at', null)
                .is('student_consent_confirmed_at', null)
                .order('created_at', { ascending: false })
                .limit(50);
            if (loadError) throw loadError;
            setPending(Array.isArray(data) ? data : []);
            setError('');
        } catch (loadError) {
            // 조회에 실패하면 관문을 띄우지 않는다. 확인을 못 받는 것보다 선생님이 갇히는 것이 더 나쁘다.
            setPending([]);
            setError(loadError.message || '');
        }
    }, [profile?.role, session?.user?.id]);

    useEffect(() => { void load(); }, [load]);

    return { pending, loading: pending === null, error, markConfirmed: () => setPending([]) };
};

export default usePendingStudentConsent;
