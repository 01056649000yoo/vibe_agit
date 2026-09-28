// 레지스트리를 불러오지 않는 순수 도우미 — `node --test` 가 바로 부른다. 도구 목록은 teacherTools.js.

/**
 * 머리말 단축 단추(2026-09-28 선생님 요청).
 * 처음 값은 우리 반 스크린 — 동행 모드가 이 자리를 `우리 반 스크린` 으로 짚고, 이전 동작과도 같다.
 * 고른 도구는 이 기기(브라우저)에 기억한다. 도구 목록에서 빠진 것을 기억하고 있으면 처음 값으로 돌아간다.
 */
export const HEADER_TOOL_SHORTCUT_DEFAULT = 'class-board';
export const HEADER_TOOL_SHORTCUT_STORAGE_KEY = 'teacher-header-tool-shortcut-v1';

export const resolveHeaderToolShortcut = (savedId, toolIds) => {
    if (savedId && toolIds.includes(savedId)) return savedId;
    if (toolIds.includes(HEADER_TOOL_SHORTCUT_DEFAULT)) return HEADER_TOOL_SHORTCUT_DEFAULT;
    return toolIds[0] ?? null;
};
