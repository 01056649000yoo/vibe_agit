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
        return dataCache.get(key, async () => {
            const { data, error } = await supabase.rpc('get_student_home_bootstrap_v1');
            if (error) throw error;
            if (Number(data?.version) !== 1) throw new Error('지원하지 않는 학생 홈 데이터 버전입니다.');
            return data;
        }, HOME_TTL_MS);
    },

    invalidate(studentId) {
        if (!studentId) return;
        dataCache.invalidate(keyFor(studentId));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(STUDENT_HOME_INVALIDATE_EVENT, { detail: { studentId } }));
        }
    }
};
