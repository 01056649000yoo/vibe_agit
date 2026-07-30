/**
 * 학급의 켜진 모듈 목록을 읽는 훅 (Stage 3a)
 *
 * 사용처: 학생 대시보드 메뉴 / 교사 설정 화면.
 * enabled_modules가 NULL이면 각 모듈의 defaultEnabled를 따른다(기존 동작 보존).
 */
import { useEffect, useMemo, useState } from 'react';
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

const sameIds = (left, right) => {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return JSON.stringify(left) === JSON.stringify(right);
};

const errorKey = (error) => error ? `${error.code || ''}:${error.message || ''}` : '';

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
      const nextState = {
        classId,
        enabledIds: error ? null : resolveEnabledModuleIds(data?.enabled_modules, data),
        error: error ?? null,
      };
      // 10초 안전 폴링이 같은 값을 매번 새 객체로 넣으면 App 전체가 다시 렌더된다.
      // 글쓰기처럼 입력 상태가 중요한 화면은 부모 렌더와 무관해야 하지만, 셸에서도 불필요한 파동을 차단한다.
      setModuleState((previous) => (
        previous.classId === nextState.classId &&
        sameIds(previous.enabledIds, nextState.enabledIds) &&
        errorKey(previous.error) === errorKey(nextState.error)
          ? previous
          : nextState
      ));
    };

    loadModules();

    // [실시간 구독 제거 — 2026-07-30]
    // 교사가 모듈을 켜고 끄면 `classes` 를 학급 단위로 구독해 즉시 반영했다. 학급 전원에게 퍼지는
    // 구독이라 리얼타임 한도(`max_events_per_second=100`)를 쓰는데, 아래 주기 조회와 화면 복귀
    // 갱신이 이미 같은 일을 하도록 만들어져 있었다("Realtime 연결 상태와 무관하게 수렴"). 그래서 뺐다.
    // 모듈 토글은 드물게 일어나고, 늦어도 아래 주기 안에 반영된다.

    // 학생 화면이 최종 설정으로 수렴하도록 보이는 탭에서만 가벼운 단일 행 조회를 주기적으로 수행한다.
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadModules();
    }, MODULE_SETTINGS_REFRESH_MS);

    // 탭으로 돌아올 때 최종 상태를 즉시 다시 확인한다.
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
    };
  }, [classId]);

  const loaded = moduleState.classId === classId;
  const enabledIds = loaded ? moduleState.enabledIds : null;
  // 선택 기능은 설정 조회가 확인되기 전/실패했을 때 숨긴다(fail closed).
  // NULL 설정의 기본값은 조회 성공 후 resolveEnabledModuleIds가 적용한다.
  const modules = useMemo(() => (
    loaded && !moduleState.error
      ? getEnabledModules(enabledIds, audience)
      : []
  ), [loaded, moduleState.error, enabledIds, audience]);
  const grouped = useMemo(() => groupByPart(modules), [modules]);
  return {
    modules,
    grouped,
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
