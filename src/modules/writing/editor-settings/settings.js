export const SPELLING_LOOKUP_TOOL_ID = 'spelling-lookup';
export const LAB_RESULTS_TOOL_ID = 'lab-results';

export const DEFAULT_WRITING_EDITOR_SETTINGS = Object.freeze({
    enabled_tools: Object.freeze([SPELLING_LOOKUP_TOOL_ID])
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
