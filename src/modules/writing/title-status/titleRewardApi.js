import { supabase } from '../../../lib/supabaseClient';

/** 화면은 학생·학급 ID를 보내지 않는다. 서버가 로그인 연결에서 수령 대상을 확정한다. */
export const titleRewardApi = Object.freeze({
    async claim(trackId, levels = null) {
        const params = { p_track_id: trackId };
        if (Array.isArray(levels) && levels.length > 0) params.p_levels = levels;
        const { data, error } = await supabase.rpc('claim_my_title_rewards_v1', params);
        if (error) throw error;
        return data;
    }
});
