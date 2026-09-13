export const SPELLING_LOOKUP_TOOL_ID = 'spelling-lookup';
export const LAB_RESULTS_TOOL_ID = 'lab-results';
export const AI_SPELL_CHECK_TOOL_ID = 'ai-spell-check';

/*
 * 기본으로 켜 두는 글쓰기 도움 기능.
 *
 * 연구소 결과 불러오기는 2026-08-19부터 기본 켜짐이다 — 연구소가 기본 동선이 됐고,
 * 필요 없는 학급만 교사 설정에서 끄면 된다.
 *
 * AI 맞춤법 검사는 2026-09-13부터 기본 켜짐이다. 594개 학급 중 **13개만** 켜 두고 있었는데,
 * 끈 학급은 하나도 없었다 — 기본 목록에 없어 **있는 줄 몰라서** 안 쓴 것이지 싫어서가
 * 아니었다. 이 기능은 교사가 `다시 쓰기` 를 요청한 글에서만 열리고, 켜면 그 글이
 * OpenAI 로 전송된다(개인정보 처리방침 제5조). 원치 않는 학급은 설정에서 끈다.
 *
 * **DB 기본값과 같아야 한다** — 새 학급은 DB 기본값으로 만들어지고 화면은 이 값을 쓴다.
 * `tests/writingEditorDefaults.test.mjs` 가 두 곳을 함께 본다.
 */
export const DEFAULT_WRITING_EDITOR_SETTINGS = Object.freeze({
    enabled_tools: Object.freeze([SPELLING_LOOKUP_TOOL_ID, LAB_RESULTS_TOOL_ID, AI_SPELL_CHECK_TOOL_ID])
});

export const normalizeWritingEditorSettings = (value) => {
    const enabledTools = Array.isArray(value?.enabled_tools)
        ? value.enabled_tools.filter((toolId) => typeof toolId === 'string' && toolId.trim())
        : [...DEFAULT_WRITING_EDITOR_SETTINGS.enabled_tools];

    return {
        ...(value && typeof value === 'object' ? value : {}),
        enabled_tools: [...new Set(enabledTools)]
    };
};

export const isWritingToolEnabled = (settings, toolId) => (
    normalizeWritingEditorSettings(settings).enabled_tools.includes(toolId)
);

export const setWritingToolEnabled = (settings, toolId, enabled) => {
    const current = normalizeWritingEditorSettings(settings);
    const enabledTools = new Set(current.enabled_tools);
    if (enabled) enabledTools.add(toolId);
    else enabledTools.delete(toolId);
    return { ...current, enabled_tools: [...enabledTools] };
};
