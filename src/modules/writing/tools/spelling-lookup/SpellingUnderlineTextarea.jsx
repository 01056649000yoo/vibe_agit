import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { findSpellingIssues, MAX_SPELLING_ISSUES } from './spellingDetectionRules';
import { openSpellingLookup } from './events';
import { useWritingEditorSettings } from '../../editor-settings/WritingEditorSettingsContext';
import { SPELLING_LOOKUP_TOOL_ID } from '../../editor-settings/settings';
import { spellingLearningApi } from '../../spelling-learning/api';
import { findClassSpellingIssues } from '../../spelling-learning/detection';
import './SpellingUnderlineTextarea.css';

/** 손을 멈추고 이만큼 지나면 다시 훑는다. 한글 한 글자를 조합하는 시간보다 넉넉하다. */
const SCAN_DELAY_MS = 350;

/** 두 문장이 앞에서부터 몇 글자까지 똑같은지. */
const commonPrefixLength = (left, right) => {
    const limit = Math.min(left.length, right.length);
    let index = 0;
    while (index < limit && left.charAt(index) === right.charAt(index)) index += 1;
    return index;
};

const buildHighlightedContent = (text, issues) => {
    if (!text) return '\u200b';

    const content = [];
    let cursor = 0;

    issues.forEach((issue) => {
        if (issue.start > cursor) content.push(text.slice(cursor, issue.start));
        content.push(
            <span
                className="spelling-underline-mark"
                key={issue.id}
                title={`${issue.wrong} → ${issue.right}`}
            >
                {text.slice(issue.start, issue.end)}
            </span>
        );
        cursor = issue.end;
    });

    if (cursor < text.length) content.push(text.slice(cursor));
    content.push('\u200b');
    return content;
};

/**
 * 모바일 Chrome에서도 기기 키보드 설정과 무관하게 수첩 기반 밑줄을 그리는 textarea.
 * 실제 입력 요소 위에 포인터를 받지 않는 동일 문장을 겹쳐 그리므로 커서·선택·자동 저장은 기존 textarea가 그대로 담당한다.
 */
const SpellingUnderlineTextarea = forwardRef(function SpellingUnderlineTextarea({
    value = '',
    onScroll,
    style = {},
    autoGrow = false,
    ...props
}, forwardedRef) {
    const { isToolEnabled } = useWritingEditorSettings();
    const spellingLookupEnabled = isToolEnabled(SPELLING_LOOKUP_TOOL_ID);
    const textareaRef = useRef(null);
    const highlighterRef = useRef(null);
    const scrollFrameRef = useRef(0);
    // 모바일 키보드는 같은 글자를 조합형(NFD)으로 넘기기도 한다. 수첩 규칙은 완성형 기준이라
    // 밑줄을 찾을 때와 그릴 때 모두 같은 완성형(NFC) 문장을 쓴다.
    const normalizedValue = useMemo(() => String(value || '').normalize('NFC'), [value]);

    // 글자를 칠 때마다 글 전체를 훑으면 학교 태블릿에서 타이핑이 밀린다.
    // 손을 잠깐 멈춘 뒤에만 다시 찾는다. 글을 쓰는 중에는 직전 밑줄이 그대로 남아 있다.
    const [scannedValue, setScannedValue] = useState(normalizedValue);
    const [classEntries, setClassEntries] = useState([]);
    useEffect(() => {
        if (!spellingLookupEnabled) return undefined;
        let active = true;
        spellingLearningApi.getStudentEntries()
            .then((entries) => { if (active) setClassEntries(Array.isArray(entries) ? entries : []); })
            .catch(() => {});
        return () => { active = false; };
    }, [spellingLookupEnabled]);

    useEffect(() => {
        if (scannedValue === normalizedValue) return undefined;
        const timer = setTimeout(() => setScannedValue(normalizedValue), SCAN_DELAY_MS);
        return () => clearTimeout(timer);
    }, [normalizedValue, scannedValue]);

    // 아직 훑지 않은 글자에 예전 위치의 밑줄이 남으면 엉뚱한 곳에 그어진다.
    // 훑은 문장과 화면의 문장이 어긋난 동안에는 겹치는 앞부분까지만 밑줄을 남긴다.
    const issues = useMemo(() => {
        if (!spellingLookupEnabled) return [];
        const staticIssues = findSpellingIssues(scannedValue);
        const remaining = Math.max(0, MAX_SPELLING_ISSUES - staticIssues.length);
        const customIssues = findClassSpellingIssues(scannedValue, classEntries, remaining)
            .filter((custom) => !staticIssues.some((item) => custom.start < item.end && custom.end > item.start));
        const found = [...staticIssues, ...customIssues].sort((a, b) => a.start - b.start).slice(0, MAX_SPELLING_ISSUES);
        if (scannedValue === normalizedValue) return found;
        const safeLength = commonPrefixLength(scannedValue, normalizedValue);
        return found.filter((issue) => issue.end <= safeLength);
    }, [classEntries, normalizedValue, scannedValue, spellingLookupEnabled]);
    const uniqueIssues = useMemo(() => {
        const seen = new Set();
        return issues.filter((issue) => {
            if (seen.has(issue.entryId)) return false;
            seen.add(issue.entryId);
            return true;
        });
    }, [issues]);

    useImperativeHandle(forwardedRef, () => textareaRef.current);

    const sharedStyle = {
        ...style,
        width: style.width || '100%',
        boxSizing: style.boxSizing || 'border-box',
        fontFamily: style.fontFamily || 'inherit',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word'
    };

    // 모바일은 손을 뗀 뒤에도 미끄러지는 관성 스크롤이라 이벤트가 띄엄띄엄 온다.
    // 화면을 그리는 시점에 맞춰 따라가야 밑줄이 출렁이지 않는다.
    const syncScroll = () => {
        if (scrollFrameRef.current) return;
        scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = 0;
            const textarea = textareaRef.current;
            const highlighter = highlighterRef.current;
            if (!textarea || !highlighter) return;
            highlighter.scrollTop = textarea.scrollTop;
            highlighter.scrollLeft = textarea.scrollLeft;
        });
    };

    useEffect(() => () => {
        if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    }, []);

    // 글을 이어 쓰면 입력창이 스스로 아래로 스크롤하는데 그 때는 scroll 이벤트가 오지 않는다.
    useEffect(syncScroll, [normalizedValue]);

    /*
     * 글이 길어지는 만큼 입력창도 세로로 늘어난다.
     *
     * 안쪽에 스크롤이 생기지 않으므로 아래쪽 `확인해 볼 표현` 칩이 늘 글 바로 밑에 붙어 있고,
     * 학생이 쓰면서 함께 볼 수 있다. 입력창이 스스로 스크롤할 일이 없어져 밑줄이 밀리는 문제도 함께 사라진다.
     * 높이를 한 번 `auto` 로 되돌려야 글을 지웠을 때 다시 줄어든다. 최소 높이는 CSS 가 지킨다.
     */
    useLayoutEffect(() => {
        if (!autoGrow) return undefined;
        const textarea = textareaRef.current;
        if (!textarea) return undefined;

        const fit = () => {
            textarea.style.height = 'auto';
            textarea.style.height = `${textarea.scrollHeight}px`;
        };
        fit();

        // 화면 폭이 바뀌면 줄바꿈이 달라져 필요한 높이도 달라진다.
        window.addEventListener('resize', fit);
        return () => window.removeEventListener('resize', fit);
    }, [autoGrow, normalizedValue, style.fontSize, style.lineHeight]);

    const handleScroll = (event) => {
        syncScroll();
        onScroll?.(event);
    };

    return (
        <div className="spelling-underline-field">
            <div className="spelling-underline-layer-wrap">
                <div
                    ref={highlighterRef}
                    className="spelling-underline-layer"
                    style={sharedStyle}
                    aria-hidden="true"
                >
                    {buildHighlightedContent(normalizedValue, issues)}
                </div>
                <textarea
                    {...props}
                    ref={textareaRef}
                    value={value}
                    onScroll={handleScroll}
                    spellCheck={false}
                    autoCorrect="off"
                    style={{
                        ...sharedStyle,
                        background: 'transparent',
                        backgroundColor: 'transparent',
                        // 스스로 늘어나므로 안쪽 스크롤막대가 잠깐씩 나타나지 않게 한다.
                        ...(autoGrow ? { overflowY: 'hidden' } : {})
                    }}
                />
            </div>

            {uniqueIssues.length > 0 && (
                <div className="spelling-underline-notice" role="status">
                    <span>
                        〰️ 맞춤법 수첩에서 확인해 볼 표현 {issues.length >= MAX_SPELLING_ISSUES ? `${MAX_SPELLING_ISSUES}개 이상` : `${issues.length}개`}
                    </span>
                    <div>
                        {uniqueIssues.slice(0, 4).map((issue) => (
                            <button
                                type="button"
                                key={issue.entryId}
                                onClick={() => openSpellingLookup(issue.text, issue)}
                            >
                                {issue.text} <span aria-hidden="true">→</span> {issue.right}
                            </button>
                        ))}
                        {uniqueIssues.length > 4 && <small>외 {uniqueIssues.length - 4}개</small>}
                    </div>
                </div>
            )}
        </div>
    );
});

export default SpellingUnderlineTextarea;
