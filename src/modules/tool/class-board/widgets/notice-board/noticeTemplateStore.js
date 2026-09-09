/*
 * 알림장 서식 읽기·쓰기.
 *
 * `profiles.notice_templates` 한 열을 읽고 쓴다. 저장 방식은 자주 쓰는 피드백 문장
 * (`useFeedbackPhrases`)과 같다 — 화면을 먼저 바꾸고 DB 에 반영하되 실패하면 되돌린다.
 *
 * **처음 펼칠 때 읽는다.** 알림장을 열 때마다 미리 읽으면 서식을 쓰지 않는 교사에게도
 * 조회가 한 번씩 붙는다. 화면이 `서식` 을 펼친 뒤에만 부른다.
 */

import { supabase } from '../../../../../lib/supabaseClient';
import { normalizeNoticeTemplates } from './noticeTemplates';

export async function loadNoticeTemplates() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { data, error } = await supabase
        .from('profiles')
        .select('notice_templates')
        .eq('id', user.id)
        .maybeSingle();
    if (error) throw error;
    return normalizeNoticeTemplates(data?.notice_templates);
}

export async function saveNoticeTemplates(templates) {
    const next = normalizeNoticeTemplates(templates);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');

    const { error } = await supabase
        .from('profiles')
        .update({ notice_templates: next })
        .eq('id', user.id);
    if (error) throw error;
    return next;
}
