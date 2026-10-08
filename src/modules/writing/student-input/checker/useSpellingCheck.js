import { useEffect, useMemo, useState } from 'react';
import { loadElementarySpellingDetector } from './elementarySpellingDetectorLoader';
import { spellingLearningApi } from '../../spelling-learning/api';
import { checkSpelling, issuesSafeWhileTyping, uniqueSpellingIssues } from './spellingEngine';

const NO_ISSUES = Object.freeze([]);

/**
 * 입력기 안에서 맞춤법 밑줄 자리를 구한다.
 *
 * - 기본 자료 500개는 첫 화면을 막지 않게 뒤에서 한 번만 받는다(여러 입력기가 같은 청크를 함께 쓴다).
 * - 공통·반별 자료는 `entries` 가 'student' 이면 학생 자료를 받는다(기기 저장·바뀐 것만, 5분 묶음).
 *   배열을 주면 그것을 쓰고, false 면 받지 않는다(교사 화면 미리보기 등).
 * - 글자를 칠 때마다 글 전체를 훑으면 학교 태블릿에서 타이핑이 밀린다. `delayMs` 만큼 손을 멈춘 뒤에만 다시 훑고,
 *   그동안은 직전 밑줄을 겹치는 앞부분까지만 남긴다. 0 이면 바로 훑는다(제목처럼 짧은 칸).
 * - 모바일 키보드는 같은 글자를 조합형(NFD)으로 넘기기도 해 완성형(NFC)으로 맞춘 글로 찾고 그린다.
 *
 * @returns {{ text: string, issues: Array, uniqueIssues: Array }}
 */
export function useSpellingCheck(value, { enabled = true, entries = 'student', delayMs = 350 } = {}) {
    const text = useMemo(() => String(value || '').normalize('NFC'), [value]);
    const [scannedText, setScannedText] = useState(text);
    const [elementaryDetector, setElementaryDetector] = useState(null);
    const [fetchedEntries, setFetchedEntries] = useState(NO_ISSUES);

    useEffect(() => {
        if (!enabled) return undefined;
        let active = true;
        loadElementarySpellingDetector()
            .then((detector) => { if (active) setElementaryDetector(() => detector); })
            .catch(() => {});
        return () => { active = false; };
    }, [enabled]);

    useEffect(() => {
        if (!enabled || entries !== 'student') return undefined;
        let active = true;
        spellingLearningApi.getStudentEntries()
            .then((rows) => { if (active) setFetchedEntries(Array.isArray(rows) ? rows : NO_ISSUES); })
            .catch(() => {});
        return () => { active = false; };
    }, [enabled, entries]);

    useEffect(() => {
        if (scannedText === text) return undefined;
        if (!delayMs) {
            setScannedText(text);
            return undefined;
        }
        const timer = setTimeout(() => setScannedText(text), delayMs);
        return () => clearTimeout(timer);
    }, [delayMs, scannedText, text]);

    const activeEntries = Array.isArray(entries) ? entries : entries === 'student' ? fetchedEntries : NO_ISSUES;
    const issues = useMemo(() => {
        if (!enabled) return NO_ISSUES;
        const scanned = delayMs ? scannedText : text;
        const found = checkSpelling(scanned, { elementaryDetector, entries: activeEntries });
        return issuesSafeWhileTyping(found, scanned, text);
    }, [activeEntries, delayMs, elementaryDetector, enabled, scannedText, text]);
    const uniqueIssues = useMemo(() => uniqueSpellingIssues(issues), [issues]);

    return { text, issues, uniqueIssues };
}
