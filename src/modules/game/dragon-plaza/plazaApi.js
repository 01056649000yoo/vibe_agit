import { supabase } from '../../../lib/supabaseClient';

/**
 * 광장 데이터 길. 열 때 한 번씩만 읽는다(폴링·실시간 구독 없음).
 * 친구 목록은 `친구 아지트`와 같은 RPC(이름·수호룡·장착 장식·칭호 원자료, 최대 100명)를 쓴다 — 새 RPC를 만들지 않는다.
 */
const must = ({ data, error }, fallback) => {
    if (error) throw error;
    return data ?? fallback;
};

export const plazaApi = Object.freeze({
    loadClassmates: async () => must(await supabase.rpc('get_student_hideout_directory'), []),
    // 내 자리: 친구 목록에는 내가 빠지므로 내 수호룡·칭호를 따로 읽는다.
    loadMe: async (studentId) => {
        const [{ data: me }, { data: title }] = await Promise.all([
            supabase.from('students').select('id, name, pet_data').eq('id', studentId).maybeSingle(),
            supabase.rpc('get_my_title_status')
        ]);
        return {
            id: studentId, name: me?.name || '나', pet_data: me?.pet_data || {},
            writer_total_chars: Number(title?.writer_total_chars) || 0,
            writer_completed_posts: Number(title?.writer_completed_posts) || 0,
            reader_score: Number(title?.reader_score) || 0
        };
    },
    // 새 글 표시용 최근 공개 글(최신순 50편, 서버 상한)
    loadFeed: async () => must(await supabase.rpc('get_class_public_writing_feed_v1', { p_group: 'all', p_limit: 50 }), {}).items || [],
    // 같은 반 친구가 정복한 어휘의 탑 덱 번호(`20261414`). 아직 적용 전이거나 실패하면 책상 배지만 빠진다.
    loadConquests: async () => must(await supabase.rpc('get_class_vocab_conquests_v1'), {}).students || [],
    loadVisitors: async () => must(await supabase.rpc('get_my_hideout_visitors_v1'), {}).visitors || []
});
