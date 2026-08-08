import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
    DEFAULT_WRITING_EDITOR_SETTINGS,
    isWritingToolEnabled,
    normalizeWritingEditorSettings
} from './settings';

const SETTINGS_STALE_MS = 60000;
const errorKey = (error) => error ? `${error.code || ''}:${error.message || ''}` : '';

const WritingEditorSettingsContext = createContext({
    settings: DEFAULT_WRITING_EDITOR_SETTINGS,
    loading: false,
    error: null,
    isToolEnabled: (toolId) => isWritingToolEnabled(DEFAULT_WRITING_EDITOR_SETTINGS, toolId)
});

export const WritingEditorSettingsProvider = ({ classId, overrideSettings, children }) => {
    const [state, setState] = useState({
        classId: null,
        settings: DEFAULT_WRITING_EDITOR_SETTINGS,
        error: null
    });

    useEffect(() => {
        if (overrideSettings || !classId) return undefined;
        let cancelled = false;
        let loadedAt = 0;
        let focusTimerId = null;

        const loadSettings = async () => {
            const { data, error } = await supabase
                .from('classes')
                .select('writing_editor_settings')
                .eq('id', classId)
                .maybeSingle();
            if (cancelled) return;
            const nextState = {
                classId,
                settings: error
                    ? DEFAULT_WRITING_EDITOR_SETTINGS
                    : normalizeWritingEditorSettings(data?.writing_editor_settings),
                error: error || null
            };
            loadedAt = Date.now();
            setState((previous) => (
                previous.classId === nextState.classId
                && JSON.stringify(previous.settings) === JSON.stringify(nextState.settings)
                && errorKey(previous.error) === errorKey(nextState.error)
                    ? previous
                    : nextState
            ));
        };

        const initialTimer = window.setTimeout(() => void loadSettings(), 0);
        const handleFocus = () => {
            if (document.visibilityState !== 'visible' || Date.now() - loadedAt < SETTINGS_STALE_MS) return;
            if (focusTimerId) window.clearTimeout(focusTimerId);
            focusTimerId = window.setTimeout(() => {
                focusTimerId = null;
                void loadSettings();
            }, Math.floor(Math.random() * 5000));
        };
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleFocus);

        return () => {
            cancelled = true;
            window.clearTimeout(initialTimer);
            if (focusTimerId) window.clearTimeout(focusTimerId);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleFocus);
        };
    }, [classId, overrideSettings]);

    const settings = useMemo(
        () => normalizeWritingEditorSettings(overrideSettings || (
            state.classId === classId ? state.settings : DEFAULT_WRITING_EDITOR_SETTINGS
        )),
        [classId, overrideSettings, state.classId, state.settings]
    );
    const value = useMemo(() => ({
        settings,
        loading: !overrideSettings && Boolean(classId) && state.classId !== classId,
        error: state.classId === classId ? state.error : null,
        isToolEnabled: (toolId) => isWritingToolEnabled(settings, toolId)
    }), [classId, overrideSettings, settings, state.classId, state.error]);

    return (
        <WritingEditorSettingsContext.Provider value={value}>
            {children}
        </WritingEditorSettingsContext.Provider>
    );
};

export const useWritingEditorSettings = () => useContext(WritingEditorSettingsContext);
