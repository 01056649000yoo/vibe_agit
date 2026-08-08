import { supabase } from '../lib/supabaseClient';
import {
  getAllModules,
  CONFIGURED_MARK,
} from './registry';

/**
 * 교사가 모듈 on/off를 저장할 때 사용.
 * 모두 끈 경우에도 "설정했음"이 남도록 표식을 함께 저장한다
 * (표식이 없으면 빈 배열이 미설정으로 취급돼 기본 모듈이 다시 켜진다).
 */
export async function saveEnabledModules(classId, ids) {
  if (!supabase || !classId) return { error: new Error('classId/supabase 없음') };
  const payload = [CONFIGURED_MARK, ...ids.filter((x) => x !== CONFIGURED_MARK)];
  const legacyUpdates = Object.fromEntries(
    getAllModules()
      .filter((m) => m.legacyFlag)
      .map((m) => [m.legacyFlag, ids.includes(m.id)])
  );
  return supabase
    .from('classes')
    .update({ enabled_modules: payload, ...legacyUpdates })
    .eq('id', classId)
    .select('enabled_modules')
    .maybeSingle();
}
