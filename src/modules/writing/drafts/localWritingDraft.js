import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 학생이 쓰다 만 글을 이 단말에 임시로 남겨 둔다.
 *
 * 태블릿 배터리가 나가거나 실수로 뒤로 가도 쓰던 글이 사라지지 않게 하는 것이 목적이다.
 * 서버에 보내지 않으므로 다른 단말에서는 보이지 않는다 — 서버 저장은 각 화면의 `저장` 이 맡는다.
 *
 * 과제 글쓰기(`StudentWriting`)와 독서록(`ReadingLogPage`)·일기(`DiaryPage`)가 같은 파일을 쓴다.
 */

/** 화면마다 열쇠 앞가지를 다르게 두어 과제 글과 독서록이 서로 덮어쓰지 않게 한다. */
export const buildDraftKey = (scope, ...parts) => (
    parts.every(Boolean) ? `${scope}_${parts.join('_')}` : null
);

export const readLocalDraft = (key) => {
    if (!key) return null;
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.warn('로컬 임시 저장본을 읽지 못했습니다:', err);
        return null;
    }
};

export const writeLocalDraft = (key, draft) => {
    if (!key) return null;
    try {
        const savedAt = new Date().toISOString();
        window.localStorage.setItem(key, JSON.stringify({ ...draft, savedAt }));
        return savedAt;
    } catch (err) {
        // 사파리 프라이빗 모드/쿼터 초과/보안 정책으로 localStorage 쓰기 실패 가능.
        console.warn('로컬 임시 저장에 실패했습니다:', err);
        return null;
    }
};

export const removeLocalDraft = (key) => {
    if (!key) return;
    try {
        window.localStorage.removeItem(key);
    } catch (err) {
        console.warn('로컬 임시 저장본을 지우지 못했습니다:', err);
    }
};

/** 손을 멈추고 이만큼 지나면 남긴다. 글자마다 저장하면 느린 태블릿에서 입력이 밀린다. */
const SAVE_DELAY_MS = 1500;

/** 내용이 같은지 견주기 위한 한 줄 표현. 실패하면 `null` — 그때는 잠그지 않는다(저장이 우선). */
const draftFingerprint = (draft) => {
    try {
        return JSON.stringify(draft);
    } catch {
        return null;
    }
};

/**
 * 방금 지운 그 내용을 **다시 쓰려는 것인가**.
 *
 * 왜 필요한가 — 완성 저장이 끝나면 화면은 임시본을 지운다. 그런데 그 직후 `저장했어요` 알림창이
 * 화면을 붙드는 동안, 1.5초 뒤로 예약돼 있던 자동 저장이 깨어나 **방금 지운 내용을 그대로 다시
 * 쓴다**. 학생이 확인을 누르기까지는 반드시 1.5초가 넘으므로 사실상 매번 되살아났다.
 * 독서록에서 실제로 그 일이 났고, 되살아난 임시본이 다음 `새 글` 화면에 올라와 학생이
 * "이미 한 편 있어요" 앞에 갇혔다(2026-08-25).
 *
 * 화면마다 "완료하면 자동 저장을 꺼라" 를 기억하게 하면 새 글쓰기 화면이 생길 때마다 또 빠뜨린다.
 * 그래서 **지운 장치 자신이 기억한다** — 지운 내용과 똑같으면 다시 쓰지 않고, 학생이 다시 손대
 * 내용이 달라지면 저절로 풀린다.
 */
export const isClearedDraft = (cleared, key, draft) => {
    if (!cleared || !key || cleared.key !== key || cleared.fingerprint === null) return false;
    return cleared.fingerprint === draftFingerprint(draft);
};

/** 기본값도 렌더마다 새로 만들지 않아야 효과가 헛돌지 않는다. */
const ALWAYS_HAS_CONTENT = () => true;

/**
 * 쓰는 중인 내용을 자동으로 이 단말에 남기고, 다시 들어왔을 때 되살린다.
 *
 * @param {string|null} key        저장 열쇠. `null` 이면 아무 것도 하지 않는다.
 * @param {object}      draft      지금 화면의 내용. 이 값이 바뀌면 잠시 뒤 저장한다.
 * @param {object}      options
 * @param {boolean}     options.enabled   불러오는 중이거나 저장 중이면 `false` 로 꺼 둔다.
 * @param {function}    options.hasContent 비어 있는 글까지 저장하지 않도록 판단한다.
 * @param {function}    options.onRestore  되살릴 내용이 있을 때 한 번 불린다.
 *
 * @returns {{ savedAt: Date|null, error: string, clear: function }}
 *          `clear` 는 서버 저장에 성공했을 때 불러 임시본을 지운다.
 */
export const useLocalWritingDraft = (key, draft, {
    enabled = true,
    hasContent = ALWAYS_HAS_CONTENT,
    onRestore
} = {}) => {
    // 남아 있던 임시본의 시각은 첫 렌더에 한 번만 읽는다.
    // 되살리기 효과 안에서 상태를 바꾸면 렌더가 연쇄로 한 번 더 돈다.
    const [savedAt, setSavedAt] = useState(() => {
        const stored = readLocalDraft(key);
        return stored?.savedAt ? new Date(stored.savedAt) : null;
    });
    const [error, setError] = useState('');
    const restoredKeyRef = useRef(null);
    // 방금 지운 열쇠와 그때 내용. 규칙과 근거는 위 `isClearedDraft` 에 있다.
    const clearedRef = useRef(null);
    // `saveNow` 가 늘 최신 내용을 남기도록, 지금 화면의 내용을 따로 담아 둔다.
    const draftRef = useRef(draft);
    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    // 되살리기는 열쇠 하나당 한 번만. 되살린 내용이 다시 저장을 부르는 고리를 막는다.
    // `hasContent`·`onRestore` 는 부르는 쪽에서 `useCallback` 으로 묶어 넘긴다.
    useEffect(() => {
        if (!key || !enabled || restoredKeyRef.current === key) return;
        restoredKeyRef.current = key;

        const stored = readLocalDraft(key);
        if (!stored) return;

        const { savedAt: storedAt, ...storedDraft } = stored;
        if (!hasContent(storedDraft)) return;

        onRestore?.(storedDraft, storedAt ? new Date(storedAt) : null);
    }, [key, enabled, hasContent, onRestore]);

    useEffect(() => {
        if (!key || !enabled || !hasContent(draft)) return undefined;
        // 방금 지운 그 내용이면 다시 쓰지 않는다.
        if (isClearedDraft(clearedRef.current, key, draft)) return undefined;

        const timer = setTimeout(() => {
            const written = writeLocalDraft(key, draft);
            if (written) {
                setSavedAt(new Date(written));
                setError('');
            } else {
                setError('이 기기에 임시 저장할 공간이 부족해요. 저장 버튼을 눌러 주세요.');
            }
        }, SAVE_DELAY_MS);

        return () => clearTimeout(timer);
    }, [key, enabled, draft, hasContent]);

    // 화면을 덮거나 앱을 벗어날 때는 기다리지 않고 바로 남긴다.
    // 모바일에서는 `beforeunload` 가 오지 않는 경우가 많아 `visibilitychange` 를 함께 쓴다.
    useEffect(() => {
        if (!key || !enabled) return undefined;

        const saveNow = () => {
            if (!hasContent(draft)) return;
            // 완성 저장 직후 화면을 덮거나 앱을 벗어나도 지운 내용이 되살아나지 않게 한다.
            if (isClearedDraft(clearedRef.current, key, draft)) return;
            writeLocalDraft(key, draft);
        };
        const onHide = () => {
            if (document.visibilityState === 'hidden') saveNow();
        };

        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', saveNow);
        return () => {
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', saveNow);
        };
    }, [key, enabled, draft, hasContent]);

    const clear = useCallback(() => {
        removeLocalDraft(key);
        // 지운 내용을 기억해 둔다. 예약돼 있던 자동 저장이 깨어나도 이 내용은 다시 쓰지 않는다.
        clearedRef.current = { key, fingerprint: draftFingerprint(draftRef.current) };
        setSavedAt(null);
        setError('');
    }, [key]);

    // 학생이 `임시 저장` 을 눌렀을 때처럼 기다리지 않고 지금 남긴다.
    const saveNow = useCallback(() => {
        if (!key) return null;
        // 학생이 스스로 누른 저장이므로 잠금을 푼다 — 다시 쓰는 중이라는 뜻이다.
        clearedRef.current = null;
        const written = writeLocalDraft(key, draftRef.current);
        if (written) {
            setSavedAt(new Date(written));
            setError('');
        } else {
            setError('이 기기에 임시 저장할 공간이 부족해요.');
        }
        return written;
    }, [key]);

    return { savedAt, error, clear, saveNow };
};
