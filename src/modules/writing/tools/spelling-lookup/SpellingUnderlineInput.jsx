import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { findSpellingIssues } from './elementarySpellingEntries';
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
    const inputRef = useRef(null);
    const highlighterRef = useRef(null);
    const issues = useMemo(() => findSpellingIssues(value), [value]);
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
                {buildHighlightedTitle(value, issues)}
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
