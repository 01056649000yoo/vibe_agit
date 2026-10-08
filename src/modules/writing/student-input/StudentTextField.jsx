import { forwardRef, useImperativeHandle, useRef } from 'react';
import { renderMarks } from './StudentTextArea';
import { useSpellingCheck } from './checker/useSpellingCheck';
import { useSpellingSwitch } from './useSpellingSwitch';
import './StudentTextInput.css';

/**
 * 학생이 쓰는 한 줄 입력기(제목·이름 붙이기 등) — 맞춤법 밑줄이 붙어 있다.
 * 여러 줄 입력기(StudentTextArea)와 같은 검사·같은 설정을 쓴다. 짧은 칸이라 손을 멈추길 기다리지 않고 바로 훑는다.
 *
 * input 에 넘기는 속성은 그대로 넘긴다. 더 받는 것: spelling · spellingEntries · containerStyle
 */
const StudentTextField = forwardRef(function StudentTextField({
    value = '',
    style = {},
    containerStyle = {},
    spelling = 'class',
    spellingEntries = 'student',
    spellingPending,
    ...props
}, forwardedRef) {
    const { enabled } = useSpellingSwitch(spelling);
    const { text, issues } = useSpellingCheck(value, { enabled, entries: spellingEntries, delayMs: 0, ...(spellingPending === undefined ? {} : { pending: spellingPending }) });
    const inputRef = useRef(null);
    const highlighterRef = useRef(null);
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
                {text ? renderMarks(text, issues, false) : '​'}
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

export default StudentTextField;
