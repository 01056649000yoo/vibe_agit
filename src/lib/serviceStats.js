/*
 * 로그인 화면에 보여 줄 현황 총계.
 *
 * 비로그인도 부를 수 있는 `get_service_stats_v1()` 하나만 부른다. 그 함수는 정수 넷만
 * 돌려주고, 한 시간에 한 번만 실제로 센다(자세한 이유는 20261282 마이그레이션 머리말).
 *
 * **실패해도 로그인 화면은 그대로 뜬다.** 현황은 곁들이는 정보라, 숫자를 못 읽었다고
 * 선생님이 로그인을 못 하면 안 된다. 부르는 쪽이 null 을 받아 그 줄만 감춘다.
 */

import { supabase } from './supabaseClient';

const toCount = (value) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0);

export async function loadServiceStats() {
    const { data, error } = await supabase.rpc('get_service_stats_v1');
    if (error) throw error;
    return {
        teachers: toCount(data?.teachers),
        classes: toCount(data?.classes),
        students: toCount(data?.students),
        posts: toCount(data?.posts)
    };
}
