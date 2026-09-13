/*
 * 동행 모드 진행 상태 읽기·쓰기.
 *
 * `profiles.teacher_tour_state` 한 열만 본다. 저장 방식은 알림장 서식
 * (`noticeTemplateStore`)과 같다 — profiles 는 이미 본인만 읽고 쓰도록 잠겨 있어
 * 따로 RPC 를 두지 않는다.
 *
 * **저장에 실패해도 화면은 계속 간다.** 진행 위치를 못 적는 것은 불편할 뿐이고,
 * 그 때문에 학급 만들기가 막히면 안 된다. 부르는 쪽이 실패를 삼킨다.
 */

import { supabase } from './supabaseClient';
import { normalizeTourState } from '../guides/teacherTour.js';

export async function loadTeacherTourState(userId) {
    if (!userId) return normalizeTourState(null);
    const { data, error } = await supabase
        .from('profiles')
        .select('teacher_tour_state')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw error;
    return normalizeTourState(data?.teacher_tour_state);
}

export async function saveTeacherTourState(userId, state) {
    if (!userId) return normalizeTourState(state);
    const next = normalizeTourState(state);
    const { error } = await supabase
        .from('profiles')
        .update({ teacher_tour_state: next })
        .eq('id', userId);
    if (error) throw error;
    return next;
}

/**
 * 지금 단계가 끝났는지 판정할 재료.
 * 학급 수는 대시보드가 이미 들고 있으므로 그대로 받고, 학생 수만 **그 단계일 때만**
 * 센다. 동행 모드를 쓰지 않는 교사에게 조회가 한 번도 붙지 않도록.
 */
export async function countActiveStudents(classId) {
    if (!classId) return 0;
    const { count, error } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', classId)
        .is('deleted_at', null);
    if (error) throw error;
    return count || 0;
}

/** `첫 글쓰기 수업` 의 과제 만들기 단계가 보는 숫자. 그 단계일 때만 부른다. */
export async function countClassMissions(classId) {
    if (!classId) return 0;
    const { count, error } = await supabase
        .from('writing_missions')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', classId);
    if (error) throw error;
    return count || 0;
}
