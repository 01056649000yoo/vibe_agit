/**
 * 모듈 레지스트리 (Stage 3a)
 *
 * 여기 배열에 매니페스트를 추가하면 교사 설정 목록과 학생 활성 목록에 반영된다.
 * 기능은 Stage 3b에서 하나씩 이 목록으로 옮긴다(옮길 때마다 동작 검증 후 커밋).
 */
import { validateManifest } from './types';

/** 교사가 실제로 설정을 저장했음을 나타내는 표식 (빈 목록과 미설정을 구분) */
export const CONFIGURED_MARK = '__configured__';
import { dragonManifest } from './game/dragon/manifest';
import { vocabTowerManifest } from './game/vocab-tower/manifest';
import { friendsHideoutManifest } from './community/friends-hideout/manifest';
import { ideaMarketManifest } from './writing/idea-market/manifest';
import { readingLogManifest } from './writing/reading-log/manifest';
import { diaryManifest } from './writing/diary/manifest';
import { writingFootprintManifest } from './writing/writing-footprint/manifest';
import { samlinkManifest } from './tool/samlink/manifest';
import { classroomArrangementManifest } from './tool/classroom-arrangement/manifest';
import { mealBoardManifest } from './tool/meal-board/manifest';
import { classBoardManifest } from './tool/class-board/manifest';
import { classNoticeManifest } from './tool/class-notice/manifest';
import { spellingLearningManifest } from './writing/spelling-learning/manifest';
import { neighborAgitManifest } from './community/neighbor-agit/manifest';
import { labActivitiesManifest } from './writing/lab-activities/manifest';
import { classAgitManifest } from './class-agit/manifest';

/** 등록된 모듈 매니페스트 목록 */
const manifests = [
  dragonManifest, // src/modules/game/dragon/
  vocabTowerManifest, // src/modules/game/vocab-tower/
  friendsHideoutManifest, // src/modules/community/friends-hideout/
  ideaMarketManifest, // src/modules/writing/idea-market/
  readingLogManifest, // src/modules/writing/reading-log/
  diaryManifest, // src/modules/writing/diary/
  writingFootprintManifest, // src/modules/writing/writing-footprint/
  samlinkManifest, // src/modules/tool/samlink/
  classroomArrangementManifest, // src/modules/tool/classroom-arrangement/
  mealBoardManifest, // src/modules/tool/meal-board/
  classBoardManifest, // src/modules/tool/class-board/
  classNoticeManifest, // src/modules/tool/class-notice/
  spellingLearningManifest, // src/modules/writing/spelling-learning/
  neighborAgitManifest, // src/modules/community/neighbor-agit/
  labActivitiesManifest, // src/modules/writing/lab-activities/
  classAgitManifest, // C0 내부 전시실 시안, 기본 OFF
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

/** 이전 개별 on/off 컬럼을 가진 모듈의 컬럼명 목록 (점진 마이그레이션용) */
export function getLegacyModuleFields() {
  return [...new Set(manifests.flatMap((m) => [m.legacyFlag, ...(m.legacyFields || [])]).filter(Boolean))];
}

/**
 * 저장된 모듈 설정이 없을 때 기존 개별 플래그를 반영한 초기 목록을 만든다.
 * 반환값의 CONFIGURED_MARK는 메모리에서 "명시적 목록"으로 해석하기 위한 것이며,
 * 교사가 토글하기 전에는 DB에 기록되지 않는다.
 */
export function resolveEnabledModuleIds(enabledIds, legacySettings = {}) {
  const saved = Array.isArray(enabledIds) ? enabledIds : null;
  if (saved && saved.length > 0) return saved;

  const defaults = manifests
    .filter((m) => {
      const legacyValue = m.resolveLegacyEnabled
        ? m.resolveLegacyEnabled(legacySettings)
        : m.legacyFlag
          ? Reflect.get(legacySettings, m.legacyFlag)
          : undefined;
      return typeof legacyValue === 'boolean' ? legacyValue : !!m.defaultEnabled;
    })
    .map((m) => m.id);

  return [CONFIGURED_MARK, ...defaults];
}

/**
 * 특정 학급에서 켜진 모듈만 반환.
 * @param {string[]|null|undefined} enabledIds  학급의 enabled_modules (없으면 defaultEnabled 기준)
 * @param {'student'|'teacher'} audience  현재 화면 대상
 */
export function getEnabledModules(enabledIds, audience) {
  // 교사가 모든 모듈을 끈 상태(빈 목록)와 "아직 설정 안 함"(NULL)을 구분해야 한다.
  // 저장 시 CONFIGURED 표식을 함께 넣으므로, 표식이 있으면 빈 목록도 의도된 설정으로 본다.
  // 표식 없는 빈 배열은 사고(잘못된 쓰기)로 보고 미설정 취급 → 메뉴가 통째로 비지 않음.
  const arr = Array.isArray(enabledIds) ? enabledIds : null;
  const configured = arr?.includes(CONFIGURED_MARK);
  const list = arr && (arr.length > 0 || configured)
    ? arr.filter((x) => x !== CONFIGURED_MARK)
    : null;
  return manifests.filter((m) => {
    // 보관 중인 모듈은 기존 학급 설정에 ON 값이 남아 있어도 어느 화면에도 노출하지 않는다.
    if (m.available === false) return false;
    if (m.audience !== 'both' && m.audience !== audience) return false;
    if (m.core) return true;
    return list ? list.includes(m.id) : !!m.defaultEnabled;
  });
}

/** id로 모듈 찾기 */
export function getModule(id) {
  return manifests.find((m) => m.id === id) ?? null;
}

/** 친구 아지트의 자율 글 필터. 모듈 매니페스트 선언만 화면 계약으로 정규화한다. */
export function getCommunityFeedSelfTypes() {
  return manifests
    .filter((manifest) => manifest.communityFeed?.group === 'self' && manifest.writingPolicy?.type)
    .map((manifest) => ({
      id: manifest.writingPolicy.type,
      label: manifest.communityFeed.label,
      icon: manifest.communityFeed.icon,
      description: manifest.communityFeed.description,
      emptyMessage: manifest.communityFeed.emptyMessage,
      order: manifest.communityFeed.order,
    }))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}
