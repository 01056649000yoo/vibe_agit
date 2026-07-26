/**
 * 학급의 켜진 모듈 목록을 읽는 훅 (Stage 3a)
 *
 * 사용처: 학생 대시보드 메뉴 / 교사 설정 화면.
 * enabled_modules가 NULL이면 각 모듈의 defaultEnabled를 따른다(기존 동작 보존).
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getEnabledModules, groupByPart } from './registry';

export function useEnabledModules(classId, audience = 'student') {
  const [enabledIds, setEnabledIds] = useState(null);
  // classId/supabase가 없으면 조회 자체를 안 하므로 처음부터 로딩 아님
  const [loading, setLoading] = useState(() => !!classId && !!supabase);

  useEffect(() => {
    let cancelled = false;
    if (!classId || !supabase) return;

    (async () => {
      const { data, error } = await supabase
        .from('classes')
        .select('enabled_modules')
        .eq('id', classId)
        .maybeSingle();
      if (cancelled) return;
      if (!error) setEnabledIds(data?.enabled_modules ?? null);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [classId]);

  const modules = getEnabledModules(enabledIds, audience);
  return { modules, grouped: groupByPart(modules), enabledIds, loading };
}

/** 교사가 모듈 on/off를 저장할 때 사용 */
export async function saveEnabledModules(classId, ids) {
  if (!supabase || !classId) return { error: new Error('classId/supabase 없음') };
  return supabase.from('classes').update({ enabled_modules: ids }).eq('id', classId);
}
