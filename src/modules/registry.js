/**
 * 모듈 레지스트리 (Stage 3a)
 *
 * 여기 배열 한 줄만 추가하면 새 기능이 메뉴에 등장한다 — 대시보드/메뉴 파일 수정 불필요.
 * 지금은 비어 있고(등록된 모듈 0개), 기존 기능은 종전 방식대로 동작한다.
 * 기능은 Stage 3b에서 하나씩 이 목록으로 옮긴다(옮길 때마다 동작 검증 후 커밋).
 */
import { validateManifest } from './types';

/** 등록된 모듈 매니페스트 목록 */
const manifests = [
  // 예시(아직 미등록):
  // dragonManifest,   // src/modules/game/dragon/manifest.js
  // vocabTowerManifest,
];

// 개발 중 매니페스트 실수 조기 발견 (프로덕션 빌드에서는 console이 제거됨)
if (import.meta.env.DEV) {
  const ids = new Set();
  manifests.forEach((m) => {
    const problems = validateManifest(m);
    if (problems.length) console.error(`[모듈 레지스트리] ${m?.id ?? '(id없음)'}: ${problems.join(', ')}`);
    if (ids.has(m?.id)) console.error(`[모듈 레지스트리] id 중복: ${m.id}`);
    ids.add(m?.id);
  });
}

/** 등록된 전체 모듈 */
export function getAllModules() {
  return manifests;
}

/**
 * 특정 학급에서 켜진 모듈만 반환.
 * @param {string[]|null|undefined} enabledIds  학급의 enabled_modules (없으면 defaultEnabled 기준)
 * @param {'student'|'teacher'} audience  현재 화면 대상
 */
export function getEnabledModules(enabledIds, audience) {
  const list = Array.isArray(enabledIds) ? enabledIds : null;
  return manifests.filter((m) => {
    if (m.audience !== 'both' && m.audience !== audience) return false;
    if (m.core) return true;
    return list ? list.includes(m.id) : !!m.defaultEnabled;
  });
}

/** 파트별로 묶어서 반환 (메뉴 그룹 렌더용) */
export function groupByPart(modules) {
  return modules.reduce((acc, m) => {
    (acc[m.part] ||= []).push(m);
    return acc;
  }, {});
}

/** id로 모듈 찾기 */
export function getModule(id) {
  return manifests.find((m) => m.id === id) ?? null;
}
