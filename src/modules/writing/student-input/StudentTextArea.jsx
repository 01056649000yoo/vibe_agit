import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MAX_SPELLING_ISSUES } from './checker/spellingEngine';
import { useSpellingCheck } from './checker/useSpellingCheck';
import { useLookCloser } from './checker/gray/useLookCloser';
import { recordGrayChoice } from './checker/gray/grayApi';
import { applyGraySuggestion, visibleGrayIssues } from './checker/gray/paragraphs';
import GrayLinePanel from './GrayLinePanel';
import { useSpellingSwitch } from './useSpellingSwitch';
import './StudentTextInput.css';

// 학생이 `그대로 두기` 한 회색 점선은 이 화면을 쓰는 동안 다시 긋지 않는다(새로 고치면 다시 보인다).
const keptGray = new Set();

/** React 가 onChange 로 알아듣게 입력창 값을 바꾼다 — 부모 화면의 저장·자동 백업 흐름을 그대로 탄다. */
const setTextareaValue = (textarea, nextValue, caret) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (!textarea || !setter) return;
    setter.call(textarea, nextValue);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
};

const renderMarks = (text, issues, withTitle) => {
    const content = [];
    let cursor = 0;
    issues.forEach((issue) => {
        if (issue.start > cursor) content.push(text.slice(cursor, issue.start));
        const gray = issue.kind === 'gray';
        content.push(
            <span
                className={gray ? 'spelling-gray-mark' : 'spelling-underline-mark'}
                key={issue.id}
                title={withTitle ? (gray ? `${issue.original} → ${issue.suggestion}?` : `${issue.wrong} → ${issue.right}`) : undefined}
            >
                {text.slice(issue.start, issue.end)}
            </span>
        );
        cursor = issue.end;
    });
    if (cursor < text.length) content.push(text.slice(cursor));
    return content;
};

/**
 * 학생이 글을 쓰는 여러 줄 입력기 — 맞춤법 밑줄이 붙어 있다. 글을 쓰는 화면에는 이 부품을 그대로 넣는다.
 *
 * 실제 textarea 위에 포인터를 받지 않는 같은 글을 겹쳐 그려 밑줄을 긋는다. 그래서 커서·선택·자동 저장은
 * 원래 textarea 가 그대로 맡고, 모바일 Chrome 처럼 기기 맞춤법 표시를 끈 브라우저에서도 밑줄이 보인다.
 * 학생 글을 바꾸지 않는다. 밑줄을 누르면 고칠 말을 보여 줄 뿐이다.
 *
 * textarea 에 넘기는 속성(onChange·placeholder·rows·maxLength…)은 그대로 넘긴다. 더 받는 것:
 * @param {'class'|'on'|'off'} spelling   'class'(기본) = 학급 글쓰기 설정의 맞춤법 수첩 켜기를 따른다
 * @param {'student'|Array|false} spellingEntries  공통·반별 자료. 기본은 학생 자료를 받는다
 * @param {(issue) => void} onIssueClick  칩을 눌렀을 때. 기본은 맞춤법 수첩 열기
 * @param {boolean} showIssueNotice  아래 `확인해 볼 표현` 칩(기본 켬)
 * @param {boolean} autoGrow  글이 길어지는 만큼 세로로 늘어난다
 * @param {'class'|'on'|'off'} grayLine  회색 점선 '한번 살펴볼까요?'. 'class'(기본) = 학급 설정(처음 값 꺼짐)
 * @param {Function} grayLineSource  실험실 미리보기 전용 — 서버 대신 부를 함수(학생 화면에서는 주지 않는다)
 */
const StudentTextArea = forwardRef(function StudentTextArea({
    value = '',
    onScroll,
    style = {},
    autoGrow = false,
    spelling = 'class',
    spellingEntries = 'student',
    spellingPending,
    onIssueClick,
    showIssueNotice = true,
    grayLine = 'class',
    grayLineSource = null,
    ...props
}, forwardedRef) {
    const { enabled, grayEnabled, openIssue } = useSpellingSwitch(spelling, onIssueClick, grayLine);
    const { text, issues, uniqueIssues } = useSpellingCheck(value, { enabled, entries: spellingEntries, delayMs: 350, ...(spellingPending === undefined ? {} : { pending: spellingPending }) });
    const textareaRef = useRef(null);
    const highlighterRef = useRef(null);
    const scrollFrameRef = useRef(0);
    const [keptVersion, setKeptVersion] = useState(0);
    const grayCandidates = useLookCloser(text, { enabled: grayEnabled, source: grayLineSource });
    // 빨간 물결이 있는 자리에는 회색 점선을 긋지 않는다(빨간 물결이 먼저다).
    const grayIssues = useMemo(
        () => visibleGrayIssues(grayCandidates, issues, keptGray),
        [grayCandidates, issues, keptVersion] // eslint-disable-line react-hooks/exhaustive-deps
    );
    const marks = useMemo(() => [...issues, ...grayIssues].sort((a, b) => a.start - b.start), [grayIssues, issues]);

    const applyGray = (issue) => {
        const next = applyGraySuggestion(text, issue);
        if (next === null) return;
        if (!grayLineSource) recordGrayChoice(issue, 'applied');
        setTextareaValue(textareaRef.current, next, issue.start + issue.suggestion.length);
    };
    const keepGray = (issue) => {
        keptGray.add(`${issue.original}→${issue.suggestion}`);
        if (!grayLineSource) recordGrayChoice(issue, 'kept');
        setKeptVersion((value) => value + 1);
    };

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
    useEffect(syncScroll, [text]);

    /*
     * 글이 길어지는 만큼 입력창도 세로로 늘어난다.
     * 안쪽에 스크롤이 생기지 않으므로 아래쪽 `확인해 볼 표현` 칩이 늘 글 바로 밑에 붙어 있고,
     * 입력창이 스스로 스크롤할 일이 없어져 밑줄이 밀리는 문제도 함께 사라진다.
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
    }, [autoGrow, text, style.fontSize, style.lineHeight]);

    const handleScroll = (event) => {
        syncScroll();
        onScroll?.(event);
    };

    return (
        <div className="spelling-underline-field">
            <div className="spelling-underline-layer-wrap">
                <div ref={highlighterRef} className="spelling-underline-layer" style={sharedStyle} aria-hidden="true">
                    {text ? [...renderMarks(text, marks, true), '​'] : '​'}
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

            {showIssueNotice && uniqueIssues.length > 0 && (
                <div className="spelling-underline-notice" role="status">
                    <span>
                        〰️ 맞춤법 수첩에서 확인해 볼 표현 {issues.length >= MAX_SPELLING_ISSUES ? `${MAX_SPELLING_ISSUES}개 이상` : `${issues.length}개`}
                    </span>
                    <div>
                        {uniqueIssues.slice(0, 4).map((issue) => (
                            <button type="button" key={issue.entryId} onClick={() => openIssue(issue)}>
                                {issue.text} <span aria-hidden="true">→</span> {issue.right}
                            </button>
                        ))}
                        {uniqueIssues.length > 4 && <small>외 {uniqueIssues.length - 4}개</small>}
                    </div>
                </div>
            )}

            {/* 빨간 물결(틀렸어요)이 먼저, 회색 점선(살펴볼까요?)은 그 아래 */}
            {showIssueNotice && <GrayLinePanel issues={grayIssues} onApply={applyGray} onKeep={keepGray} />}
        </div>
    );
});

export { renderMarks };
export default StudentTextArea;
