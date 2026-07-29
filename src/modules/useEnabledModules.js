/**
 * 학급의 켜진 모듈 목록을 읽는 훅 (Stage 3a)
 *
 * 사용처: 학생 대시보드 메뉴 / 교사 설정 화면.
 * enabled_modules가 NULL이면 각 모듈의 defaultEnabled를 따른다(기존 동작 보존).
 */
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  getAllModules,
  getEnabledModules,
  getLegacyModuleFields,
  groupByPart,
  resolveEnabledModuleIds,
  CONFIGURED_MARK,
} from './registry';

const MODULE_SETTINGS_REFRESH_MS = 10000;

export function useEnabledModules(classId, audience = 'student') {
  const [moduleState, setModuleState] = useState({
    classId: null,
    enabledIds: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!classId || !supabase) return;

    const loadModules = async () => {
      const fields = ['enabled_modules', ...getLegacyModuleFields()].join(', ');
      const { data, error } = await supabase
        .from('classes')
        .select(fields)
        .eq('id', classId)
        .maybeSingle();
      if (cancelled) return;
      setModuleState({
        classId,
        enabledIds: error ? null : resolveEnabledModuleIds(data?.enabled_modules, data),
        error: error ?? null,
      });
    };

    loadModules();

    // 교사가 다른 화면/기기에서 토글하면 열린 학생 화면에도 즉시 반영한다.
    const channel = supabase
      .channel(`module_settings_${classId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'classes', filter: `id=eq.${classId}` },
        () => loadModules()
      )
      .subscribe();

    // 운영 Realtime publication/연결 상태와 무관하게 학생 화면이 최종 설정으로 수렴하도록
    // 보이는 탭에서만 가벼운 단일 행 조회를 주기적으로 수행한다.
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadModules();
    }, MODULE_SETTINGS_REFRESH_MS);

    // Realtime 연결이 끊겼던 경우 탭으로 돌아올 때 최종 상태를 즉시 다시 확인한다.
    const handleFocus = () => loadModules();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadModules();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [classId]);

  const loaded = moduleState.classId === classId;
  const enabledIds = loaded ? moduleState.enabledIds : null;
  // 선택 기능은 설정 조회가 확인되기 전/실패했을 때 숨긴다(fail closed).
  // NULL 설정의 기본값은 조회 성공 후 resolveEnabledModuleIds가 적용한다.
  const modules = loaded && !moduleState.error
    ? getEnabledModules(enabledIds, audience)
    : [];
  return {
    modules,
    grouped: groupByPart(modules),
    enabledIds,
    loading: !!classId && !loaded,
    error: loaded ? moduleState.error : null,
  };
}

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
