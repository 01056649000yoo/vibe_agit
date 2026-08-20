import { dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';

const HOME_TTL_MS = 60000;
const keyFor = (studentId) => `student-home:v1:${studentId}`;
export const STUDENT_HOME_INVALIDATE_EVENT = 'agit:student-home-invalidate';

export const studentHomeApi = {
    async get(studentId, { force = false } = {}) {
        if (!studentId) return null;
        const key = keyFor(studentId);
        if (force) dataCache.invalidate(key);
        const data = await dataCache.get(key, async () => {
            const { data, error } = await supabase.rpc('get_student_home_bootstrap_v1');
            if (error) throw error;
            if (Number(data?.version) !== 1) throw new Error('지원하지 않는 학생 홈 데이터 버전입니다.');
            return data;
        }, HOME_TTL_MS);
        return data;
    },

    async getLatestRewrite() {
        const { data, error } = await supabase.rpc('get_my_latest_rewrite_v1');
        if (error) throw error;
        if (data == null) return null;
        const supportedKind = ['assignment', 'reading_log', 'diary'].includes(data.kind);
        if (Number(data.version) !== 1 || !data.id || !supportedKind
            || (data.kind === 'assignment' && !data.mission_id)
            || (data.kind === 'diary' && !data.source_key)) {
            throw new Error('지원하지 않는 다시 쓰기 응답입니다.');
        }
        return data;
    },

    // notify: false 는 캐시만 버리고 즉시 다시 부르지는 않는다. 알림을 한 건씩 확인할 때
    // 매번 홈 RPC를 다시 부르면 스무 번 확인에 스무 번 왕복이 생기므로, 창을 닫을 때
    // 한 번만 notify 로 부른다. 캐시를 버리는 것만으로는 앱이 이미 들고 있는 값이
    // 바뀌지 않으므로 화면 상태는 호출한 쪽에서 함께 갱신해야 한다.
    invalidate(studentId, { notify = true } = {}) {
        if (!studentId) return;
        dataCache.invalidate(keyFor(studentId));
        if (notify && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(STUDENT_HOME_INVALIDATE_EVENT, { detail: { studentId } }));
        }
    }
};
