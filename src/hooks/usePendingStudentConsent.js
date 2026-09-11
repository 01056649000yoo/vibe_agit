import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { POLICY_VERSION } from '../constants/policyVersion';

/*
 * 로그인 직후 교사에게 받아야 할 것이 남았는지 찾는다 (2026-09-11).
 *
 *   1) 약관·처리방침 **추가 동의** — 기존 교사의 첫 동의는 가입일로 소급돼 있다(kind=backfill).
 *      개정판(POLICY_VERSION)에는 아직 동의하지 않았으므로 한 번 더 받는다(kind=reconsent).
 *   2) 학생 개인정보 **동의서 확인** — 담당 학급 중 아직 확인하지 않은 것.
 *
 * 둘 다 **개정 시행일(POLICY_VERSION)부터** 받는다. 그 전에는 개정판이 효력이 없으므로
 * 관문을 띄우지 않는다 — 배포일과 시행일이 달라도 화면은 시행일에 맞춰 열린다.
 *
 * 왜 따로 조회하나:
 *   학급 목록은 `useTeacherDashboard` 가 bootstrap RPC 와 캐시로 들고 있다. 관문은 로그인 직후
 *   한 번만 보면 되므로 미확인 학급만 가볍게 따로 묻는다. 관리자는 학급을 운영하지 않아 거치지 않는다.
 */
const hasPolicyTakenEffect = (today = new Date()) => {
    const [y, m, d] = POLICY_VERSION.split('-').map(Number);
    const effective = new Date(y, m - 1, d);            // 맥미니·브라우저 모두 한국 시간
    return today >= effective;
};

const usePendingStudentConsent = (session, profile) => {
    const [state, setState] = useState(null);   // null = 아직 모름
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        const userId = session?.user?.id;
        if (!userId || profile?.role === 'ADMIN' || !hasPolicyTakenEffect()) {
            setState({ classes: [], needsPolicyConsent: false });
            return;
        }
        try {
            const [{ data: classes, error: classError }, { data: consent, error: consentError }] = await Promise.all([
                supabase.from('classes').select('id, name')
                    .eq('teacher_id', userId).is('deleted_at', null).is('student_consent_confirmed_at', null)
                    .order('created_at', { ascending: false }).limit(50),
                supabase.rpc('get_my_policy_consent_v1'),
            ]);
            if (classError) throw classError;
            if (consentError) throw consentError;
            const agreed = Array.isArray(consent?.agreed_versions) ? consent.agreed_versions : [];
            setState({
                classes: Array.isArray(classes) ? classes : [],
                needsPolicyConsent: !agreed.includes(POLICY_VERSION),
            });
            setError('');
        } catch (loadError) {
            // 조회에 실패하면 관문을 띄우지 않는다. 확인을 못 받는 것보다 선생님이 갇히는 것이 더 나쁘다.
            setState({ classes: [], needsPolicyConsent: false });
            setError(loadError.message || '');
        }
    }, [profile?.role, session?.user?.id]);

    useEffect(() => { void load(); }, [load]);

    const pending = Boolean(state && (state.classes.length > 0 || state.needsPolicyConsent));
    return {
        loading: state === null,
        pending,
        classes: state?.classes || [],
        needsPolicyConsent: Boolean(state?.needsPolicyConsent),
        error,
        markConfirmed: () => setState({ classes: [], needsPolicyConsent: false }),
    };
};

export { hasPolicyTakenEffect };
export default usePendingStudentConsent;
