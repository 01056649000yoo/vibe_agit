import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { findSpellingIssues, MAX_SPELLING_ISSUES } from './spellingDetectionRules';
import { useWritingEditorSettings } from '../../editor-settings/WritingEditorSettingsContext';
import { SPELLING_LOOKUP_TOOL_ID } from '../../editor-settings/settings';
import { loadElementarySpellingDetector } from './elementarySpellingDetectorLoader';
import './SpellingUnderlineTextarea.css';

const buildHighlightedTitle = (text, issues) => {
    if (!text) return '\u200b';

    const content = [];
    let cursor = 0;
    issues.forEach((issue) => {
        if (issue.start > cursor) content.push(text.slice(cursor, issue.start));
        content.push(
            <span className="spelling-underline-mark" key={issue.id}>
                {text.slice(issue.start, issue.end)}
            </span>
        );
        cursor = issue.end;
    });
    if (cursor < text.length) content.push(text.slice(cursor));
    return content;
};

const SpellingUnderlineInput = forwardRef(function SpellingUnderlineInput({
    value = '',
    style = {},
    containerStyle = {},
    ...props
}, forwardedRef) {
    const { isToolEnabled } = useWritingEditorSettings();
    const spellingLookupEnabled = isToolEnabled(SPELLING_LOOKUP_TOOL_ID);
    const inputRef = useRef(null);
    const highlighterRef = useRef(null);
    // 본문과 같은 이유로 완성형(NFC)으로 맞춘 뒤 찾고 그린다.
    const normalizedValue = useMemo(() => String(value || '').normalize('NFC'), [value]);
    const [elementaryDetector, setElementaryDetector] = useState(null);
    useEffect(() => {
        if (!spellingLookupEnabled) return undefined;
        let active = true;
        loadElementarySpellingDetector()
            .then((detector) => { if (active) setElementaryDetector(() => detector); })
            .catch(() => {});
        return () => { active = false; };
    }, [spellingLookupEnabled]);
    const issues = useMemo(() => {
        if (!spellingLookupEnabled) return [];
        const staticIssues = findSpellingIssues(normalizedValue);
        if (!elementaryDetector) return staticIssues;
        const found = [...staticIssues];
        for (const candidate of elementaryDetector(normalizedValue, MAX_SPELLING_ISSUES)) {
            if (found.length >= MAX_SPELLING_ISSUES) break;
            const overlaps = found.some((item) => candidate.start < item.end && candidate.end > item.start);
            if (!overlaps) found.push(candidate);
        }
        return found.sort((left, right) => left.start - right.start);
    }, [elementaryDetector, normalizedValue, spellingLookupEnabled]);
    useImperativeHandle(forwardedRef, () => inputRef.current);

    const sharedStyle = {
        ...style,
        width: style.width || '100%',
        boxSizing: style.boxSizing || 'border-box',
        fontFamily: style.fontFamily || 'inherit'
    };

    const handleScroll = (event) => {
        if (highlighterRef.current) highlighterRef.current.scrollLeft = event.currentTarget.scrollLeft;
    };

    return (
        <div className="spelling-underline-layer-wrap" style={containerStyle}>
            <div
                ref={highlighterRef}
                className="spelling-underline-layer spelling-underline-layer--single"
                style={sharedStyle}
                aria-hidden="true"
            >
                {buildHighlightedTitle(normalizedValue, issues)}
            </div>
            <input
                {...props}
                ref={inputRef}
                value={value}
                onScroll={handleScroll}
                spellCheck={false}
                autoCorrect="off"
                style={{ ...sharedStyle, background: 'transparent', backgroundColor: 'transparent' }}
            />
        </div>
    );
});

export default SpellingUnderlineInput;
