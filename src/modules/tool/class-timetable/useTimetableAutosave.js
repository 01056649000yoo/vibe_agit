import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * 시간표 자동 저장. 스크린 자동 저장(class-board/host/useClassBoardAutosave.js)과 같은 원칙을 작게 따른다.
 * - 바뀐 뒤 잠시(TIMETABLE_AUTOSAVE_DELAY_MS) 조용하면 저장, 한 번에 하나만 보낸다.
 * - "바뀌었나"는 마지막으로 보낸 내용과 견준다(서버 응답과 견주지 않는다).
 * - 실패하면 저절로 다시 보내지 않는다(`다시 저장`). 다시 고치면 그때 다시 시도한다.
 * - 저장 전에 창을 닫으려 하면 한 번 묻는다.
 */

export const TIMETABLE_AUTOSAVE_DELAY_MS = 1200;

export const TIMETABLE_SAVE_STATUS_TEXT = Object.freeze({
    idle: '',
    pending: '고치는 중…',
    saving: '저장 중…',
    saved: '자동 저장됨',
    error: '저장하지 못했습니다',
});

export default function useTimetableAutosave({ value, enabled, save, onSaved, onError }) {
    const [status, setStatus] = useState('idle');
    const [lastSavedKey, setLastSavedKey] = useState(null);
    const valueRef = useRef(value);
    valueRef.current = value;
    const lastSavedKeyRef = useRef(null);
    const timerRef = useRef(0);
    const inFlightRef = useRef(null);
    const handlersRef = useRef({ save, onSaved, onError });
    handlersRef.current = { save, onSaved, onError };

    const key = value ? JSON.stringify(value) : '';
    const hasUnsaved = Boolean(value) && lastSavedKey !== null && key !== lastSavedKey;

    const setSavedKey = (next) => {
        lastSavedKeyRef.current = next;
        setLastSavedKey(next);
    };

    /** 불러온 내용을 "이미 저장됨"으로 둔다. 새로 저장해야 하는 내용이면 null 을 넘긴다. */
    const baseline = useCallback((savedValue) => {
        if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; }
        setSavedKey(savedValue ? JSON.stringify(savedValue) : '');
        setStatus('idle');
    }, []);

    const flush = useCallback(async () => {
        if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; }
        if (inFlightRef.current) await inFlightRef.current.catch(() => {});
        const current = valueRef.current;
        if (!current) return true;
        const currentKey = JSON.stringify(current);
        if (currentKey === lastSavedKeyRef.current) return true;
        setStatus('saving');
        const request = Promise.resolve(handlersRef.current.save(current));
        inFlightRef.current = request;
        try {
            const result = await request;
            setSavedKey(currentKey);
            handlersRef.current.onSaved?.(result, current);
            const latest = valueRef.current ? JSON.stringify(valueRef.current) : '';
            setStatus(latest === currentKey ? 'saved' : 'pending');
            return latest === currentKey;
        } catch (error) {
            setStatus('error');
            handlersRef.current.onError?.(error);
            return false;
        } finally {
            if (inFlightRef.current === request) inFlightRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!enabled || !value || lastSavedKey === null) return undefined;
        if (key === lastSavedKey) {
            setStatus((current) => (current === 'pending' ? 'saved' : current));
            return undefined;
        }
        setStatus((current) => (current === 'error' || current === 'saving' ? current : 'pending'));
        timerRef.current = window.setTimeout(() => { timerRef.current = 0; void flush(); }, TIMETABLE_AUTOSAVE_DELAY_MS);
        return () => { if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; } };
    }, [enabled, value, key, lastSavedKey, flush]);

    useEffect(() => {
        if (!hasUnsaved) return undefined;
        const warn = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [hasUnsaved]);

    return { status, hasUnsaved, flush, baseline };
}
