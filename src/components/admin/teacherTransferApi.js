import { supabase } from '../../lib/supabaseClient';

/*
 * 교사 계정 이관(관리자 전용, 2026-10-21). 서버 함수(20261403)가 관리자 확인·사전 점검·실행을 모두 맡는다.
 * 화면은 서버가 알려 주는 결과만 보여 주고, 확인 문구(옛 계정 이메일)는 서버가 다시 비교한다.
 */
const call = async (name, args) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message || '요청을 처리하지 못했어요.');
    return data;
};

export const findTeachers = async (query) => (await call('admin_find_teachers_v1', { p_query: query }))?.teachers ?? [];

/** 사전 점검: 아무것도 바꾸지 않고 어떤 열에서 몇 행이 옮겨지는지·충돌이 없는지 본다. */
export const previewTeacherTransfer = (oldId, newId) =>
    call('admin_transfer_teacher_account_v1', { p_old: oldId, p_new: newId, p_apply: false, p_confirm: null });

/** 실행: `confirm` 은 옛 계정의 이메일이어야 한다. */
export const runTeacherTransfer = (oldId, newId, confirm) =>
    call('admin_transfer_teacher_account_v1', { p_old: oldId, p_new: newId, p_apply: true, p_confirm: confirm });

export const listTeacherTransfers = async () => (await call('admin_list_teacher_transfers_v1', {}))?.transfers ?? [];

/** 화면이 확인 문구를 먼저 맞춰 보는 규칙(서버도 같은 비교를 한다: 대소문자·앞뒤 공백 무시). */
export const confirmMatches = (typed, email) => String(typed ?? '').trim().toLowerCase() === String(email ?? '').trim().toLowerCase() && String(email ?? '').trim() !== '';
