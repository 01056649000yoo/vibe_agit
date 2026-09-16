// 다했니 연동 화면이 서버와 이야기하는 단 하나의 자리.
//   · 키 저장·검증·삭제, 정산 실행은 엣지 함수로(민감·권한 필요).
//   · 반 설정·학생 매칭·대시보드는 RLS 가 지키는 테이블/RPC 로 직접.
// 원본 API 키는 이 파일을 거쳐서도 절대 되돌려 받지 않는다(상태만 조회).

import { supabase } from './supabaseClient';

function unwrap(data, error) {
    if (error) throw new Error(error.message || '요청에 실패했습니다.');
    if (data && data.error) throw new Error(data.error);
    return data;
}

// ── 자격증명(키) ──
export async function getCredentialStatus() {
    const { data, error } = await supabase.functions.invoke('dahandin-credential', { body: { action: 'status' } });
    return unwrap(data, error)?.status ?? null;
}
export async function saveCredential(apiKey) {
    const { data, error } = await supabase.functions.invoke('dahandin-credential', { body: { action: 'save', apiKey } });
    return unwrap(data, error)?.status ?? null;
}
export async function deleteCredential() {
    const { data, error } = await supabase.functions.invoke('dahandin-credential', { body: { action: 'delete' } });
    return unwrap(data, error)?.status ?? null;
}

// ── 반 설정 ──
export async function getClassSettings(classId) {
    const { data, error } = await supabase
        .from('dahandin_class_settings')
        .select('enabled, points_per_cookie, auto_schedule, schedule_weekday, schedule_hour, last_run_on')
        .eq('class_id', classId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { enabled: false, points_per_cookie: 10, auto_schedule: 'off', schedule_weekday: null, schedule_hour: 17, last_run_on: null };
}
export async function upsertClassSettings(classId, patch) {
    const { error } = await supabase
        .from('dahandin_class_settings')
        .upsert({ class_id: classId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'class_id' });
    if (error) throw new Error(error.message);
}

// ── 학생 매칭 ──
export async function getLinks(classId) {
    const { data, error } = await supabase
        .from('dahandin_student_links')
        .select('id, student_id, dahandin_code, last_cookie, active')
        .eq('class_id', classId);
    if (error) throw new Error(error.message);
    return data ?? [];
}

/** 매칭을 통째로 저장한다. rows: [{student_id, dahandin_code}] */
export async function saveLinks(classId, rows) {
    // 기존 것을 지우고 새로 넣는다(매칭 편집은 통째 저장이 예측 가능하다).
    const del = await supabase.from('dahandin_student_links').delete().eq('class_id', classId);
    if (del.error) throw new Error(del.error.message);
    if (!rows.length) return;
    const payload = rows.map((r) => ({
        class_id: classId,
        student_id: r.student_id,
        dahandin_code: r.dahandin_code,
        last_cookie: Number.isFinite(r.last_cookie) ? r.last_cookie : 0,
        active: true
    }));
    const { error } = await supabase.from('dahandin_student_links').insert(payload);
    if (error) throw new Error(error.message);
}

// ── 정산 ──
export async function runSync(classId) {
    const { data, error } = await supabase.functions.invoke('dahandin-cookie-sync', { body: { classId } });
    return unwrap(data, error);
}

// ── 대시보드 ──
export async function getDashboard(classId, days = 30) {
    const { data, error } = await supabase.rpc('get_dahandin_dashboard_v1', { p_class_id: classId, p_days: days });
    if (error) throw new Error(error.message);
    return data;
}
