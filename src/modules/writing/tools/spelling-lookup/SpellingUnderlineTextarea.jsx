import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
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
    const scrollFrameRef = useRef(0);
    // 모바일 키보드는 같은 글자를 조합형(NFD)으로 넘기기도 한다. 수첩 규칙은 완성형 기준이라
    // 밑줄을 찾을 때와 그릴 때 모두 같은 완성형(NFC) 문장을 쓴다.
    const normalizedValue = useMemo(() => String(value || '').normalize('NFC'), [value]);
    const issues = useMemo(() => findSpellingIssues(normalizedValue), [normalizedValue]);
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
