import { useEffect, useMemo, useState } from 'react';
import { onGrayBatchDone, onGrayResult, requestGraySuggestions } from './grayApi';
import { pickParagraphsToSend, placeGraySuggestions, splitParagraphs } from './paragraphs';

/** 기기 안 기억(문단 글 → 제안) — 한 화면의 모든 입력칸이 함께 쓴다. 오래된 것부터 버린다. */
const CACHE_LIMIT = 300;
const sharedCache = new Map();
const remember = (cache, text, suggestions) => {
    cache.delete(text);
    cache.set(text, suggestions);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
};
// 서버 결과는 화면의 입력칸이 몇 개든 한 번만 기억에 넣는다.
onGrayResult((text, suggestions) => remember(sharedCache, text, suggestions));

/**
 * 회색 점선 '한번 살펴볼까요?' 자리를 구한다.
 *
 * - 손을 멈추고 `delayMs`(1.2초) 뒤, 아직 결과가 없는 문단을 **화면 공용 줄**에 세운다(grayApi 가 모아 한 번에 보낸다).
 * - 서버가 꺼져 있으면 잠시 묻지 않는다. 빨간 줄은 이 훅과 상관없이 늘 그어진다.
 * - `source` 를 주면 서버 대신 그 함수를 부른다(실험실 미리보기용, 학생 화면에서는 주지 않는다).
 *
 * @returns {Array<{ id, kind:'gray', start, end, original, suggestion, category }>}
 */
export function useLookCloser(text, { enabled = false, delayMs = 1200, source = null } = {}) {
    const [cache] = useState(() => (source ? new Map() : sharedCache));
    const [version, setVersion] = useState(0);
    const paragraphs = useMemo(() => (enabled ? splitParagraphs(text) : []), [enabled, text]);

    // 다른 입력칸이 보낸 요청의 결과도 이 칸에 들어 있을 수 있다 — 보내기가 끝날 때마다 다시 그린다.
    useEffect(() => {
        if (!enabled || source) return undefined;
        return onGrayBatchDone(() => setVersion((value) => value + 1));
    }, [enabled, source]);

    useEffect(() => {
        if (!enabled) return undefined;
        const toSend = pickParagraphsToSend(paragraphs, cache);
        if (!toSend.length) return undefined;
        let active = true;
        const timer = setTimeout(() => {
            if (!source) {
                requestGraySuggestions(toSend.map((paragraph) => paragraph.text));
                return;
            }
            source(toSend)
                .then((results) => {
                    if (!active || !results?.size) return;
                    results.forEach((suggestions, paragraphText) => remember(cache, paragraphText, suggestions));
                    setVersion((value) => value + 1);
                })
                .catch(() => {});
        }, delayMs);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [cache, delayMs, enabled, paragraphs, source]);

    // version 이 바뀌면 기억이 늘어난 것 — 다시 자리를 맞춘다.
    return useMemo(() => (enabled ? placeGraySuggestions(paragraphs, cache) : []), [cache, enabled, paragraphs, version]); // eslint-disable-line react-hooks/exhaustive-deps
}
