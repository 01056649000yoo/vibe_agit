import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { findSpellingIssues } from './elementarySpellingEntries';
import { openSpellingLookup } from './events';
import './SpellingUnderlineTextarea.css';

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
                title={`${issue.entry.question}: ${issue.entry.answer}`}
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
    ...props
}, forwardedRef) {
    const textareaRef = useRef(null);
    const highlighterRef = useRef(null);
    const issues = useMemo(() => findSpellingIssues(value), [value]);
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

    const handleScroll = (event) => {
        if (highlighterRef.current) {
            highlighterRef.current.scrollTop = event.currentTarget.scrollTop;
            highlighterRef.current.scrollLeft = event.currentTarget.scrollLeft;
        }
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
                    {buildHighlightedContent(value, issues)}
                </div>
                <textarea
                    {...props}
                    ref={textareaRef}
                    value={value}
                    onScroll={handleScroll}
                    spellCheck={false}
                    autoCorrect="off"
                    style={{ ...sharedStyle, background: 'transparent', backgroundColor: 'transparent' }}
                />
            </div>

            {uniqueIssues.length > 0 && (
                <div className="spelling-underline-notice" role="status">
                    <span>〰️ 맞춤법 수첩에서 확인해 볼 표현 {issues.length}개</span>
                    <div>
                        {uniqueIssues.slice(0, 4).map((issue) => (
                            <button
                                type="button"
                                key={issue.entryId}
                                onClick={() => openSpellingLookup(issue.text)}
                            >
                                {issue.text} 찾아보기
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
