import { supabase } from '../../../lib/supabaseClient';

export const NEIGHBOR_AGIT_ACCEPTANCE_ITEMS = Object.freeze([
    { key: 'permissions', label: '권한 경계', description: '관리자·교사·학생 역할별 허용과 차단을 확인했습니다.' },
    { key: 'desktop', label: 'PC 화면', description: '공간·목록·미리보기를 넓은 화면에서 확인했습니다.' },
    { key: 'tablet', label: '태블릿 화면', description: '중간 너비에서 카드와 조작이 겹치지 않습니다.' },
    { key: 'mobile', label: '모바일 화면', description: '좁은 화면에서 한 열과 터치 조작을 확인했습니다.' },
    { key: 'performance', label: '성능', description: '상한·지연 조회·무폴링 계약과 회귀 검사가 통과했습니다.' },
    { key: 'operations', label: '운영 준비', description: '백업·롤백·긴급 중지 절차를 확인했습니다.' }
]);

const assertDashboard = (data) => {
    if (Number(data?.version) !== 1
        || !data?.rollout
        || !data?.summary
        || !Array.isArray(data?.eligible_classes)
        || !Array.isArray(data?.limited_classes)
        || !Array.isArray(data?.spaces)
        || !Array.isArray(data?.preview_feed)) {
        throw new Error('지원하지 않는 이웃 아지트 관리자 응답입니다.');
    }
    return data;
};

export const neighborAgitAdminApi = {
    async getDashboard(spaceId = null) {
        const { data, error } = await supabase.rpc('get_neighbor_admin_dashboard_v1', {
            p_space_id: spaceId || null
        });
        if (error) throw error;
        return assertDashboard(data);
    },

    async createTrial({ name, classIds }) {
        const { data, error } = await supabase.rpc('create_neighbor_internal_trial_v1', {
            p_name: name,
            p_class_ids: classIds
        });
        if (error) throw error;
        if (data?.success !== true || !data?.space_id || Number(data?.active_class_count) < 2) {
            throw new Error('내부 시험 공간 응답을 확인할 수 없습니다.');
        }
        return data;
    },

    async setLimitedClass(classId, enabled) {
        const { data, error } = await supabase.rpc('set_neighbor_limited_class_v1', {
            p_class_id: classId,
            p_enabled: enabled
        });
        if (error) throw error;
        if (data?.success !== true || data?.class_id !== classId || typeof data?.selected !== 'boolean') {
            throw new Error('제한 공개 학급 저장 결과를 확인할 수 없습니다.');
        }
        return data;
    },

    async setAcceptanceCheck(key, checked) {
        const { data, error } = await supabase.rpc('set_neighbor_acceptance_check_v1', {
            p_check_key: key,
            p_checked: checked
        });
        if (error) throw error;
        if (data?.success !== true || !data?.acceptance_checks) {
            throw new Error('인수 점검 저장 결과를 확인할 수 없습니다.');
        }
        return data;
    },

    async changeRollout(mode, confirmation = '') {
        const { data, error } = await supabase.rpc('change_neighbor_rollout_v1', {
            p_mode: mode,
            p_confirmation: confirmation
        });
        if (error) throw error;
        if (data?.success !== true || data?.mode !== mode) {
            throw new Error('공개 단계 변경 결과를 확인할 수 없습니다.');
        }
        return data;
    }
};
