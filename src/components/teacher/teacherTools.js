import { getAllModules } from '../../modules/registry';

/**
 * 학급운영도구 목록의 원본 — 학급운영도구 화면(`TeachingToolsHub`)과 머리말 단축 단추가 같이 쓴다.
 * 두 곳이 따로 거르면 한쪽에만 도구가 보이는 일이 생긴다(한 곳만 고치고 끝내지 않는다).
 */
export const TEACHER_TOOL_MODULES = getAllModules()
    .filter((module) => module.part === 'tool' && module.available !== false && typeof module.teacherEntry === 'function')
    .sort((a, b) => (a.tool?.order ?? 100) - (b.tool?.order ?? 100));

export const TEACHER_TOOL_IDS = TEACHER_TOOL_MODULES.map((module) => module.id);
