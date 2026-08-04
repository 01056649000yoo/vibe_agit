import React, { forwardRef, useId } from 'react';
import SpellingUnderlineInput from '../../modules/writing/tools/spelling-lookup/SpellingUnderlineInput';
import SpellingUnderlineTextarea from '../../modules/writing/tools/spelling-lookup/SpellingUnderlineTextarea';
import './WritingEditorFields.css';

const CONTENT_LINE_HEIGHT = 1.8;

/*
 * 글 쓰는 영역에 별도의 최대 폭을 두지 않는다 (2026-08-04 되돌림).
 *
 * 한때 720px 상한을 뒀다. 읽기 편한 줄 길이(30~40자)만 보고 정한 것인데, 화면에서 보니
 * **위쪽 `생각 일깨우기` 질문답변 블록보다 글 쓰는 칸이 좁아져** 어색했다.
 * 글 쓰는 칸은 그 화면의 다른 블록과 같은 폭이어야 한다.
 * 대신 독서록 카드를 과제 글쓰기 카드와 같은 치수로 맞춰 두 화면의 폭을 통일한다.
 */

/**
 * 과제 글쓰기와 학생 자율 글쓰기가 함께 쓰는 기본 제목/본문 입력부.
 * 저장·제출 규칙은 각 모듈이 맡고, 실제 글을 쓰는 감각만 동일하게 유지한다.
 *
 * 본문 칸은 **처음에 여덟 줄** 높이로 시작해 글이 길어지는 만큼 함께 늘어난다.
 * 칸을 크게 고정해 두면 아래쪽 `확인해 볼 표현` 칩이 화면 밖으로 밀려나 글을 쓰면서 볼 수 없다.
 * 열 줄이 넘어가면 모바일 세로 화면에서 칩이 밀리기 시작해 여덟 줄로 정했다(2026-08-04).
 *
 * 높이는 픽셀이 아니라 **줄 수**로 잡는다. 예전에는 600px 로 고정해 두어 글자가 작은 모바일이
 * 18.3줄, PC 가 16.1줄로 오히려 뒤집혀 있었다.
 */
const WritingEditorFields = forwardRef(function WritingEditorFields({
    title,
    onTitleChange,
    content,
    onContentChange,
    titlePlaceholder = '글의 제목을 적어주세요...',
    contentPlaceholder = '여기에 자유롭게 이야기를 시작해보세요...',
    disabled = false,
    isMobile = false,
    contentMinLines = 8
}, ref) {
    const fieldId = useId();
    const titleId = `${fieldId}-title`;
    const contentId = `${fieldId}-content`;

    return (
        <div className={`writing-editor-fields ${disabled ? 'is-disabled' : ''}`.trim()}>
            <div className="writing-editor-fields__field writing-editor-fields__field--title">
                <label htmlFor={titleId}>글 제목</label>
                <SpellingUnderlineInput
                    id={titleId}
                    type="text"
                    value={title}
                    onChange={(event) => onTitleChange(event.target.value)}
                    placeholder={titlePlaceholder}
                    autoCapitalize="sentences"
                    lang="ko"
                    style={{
                        width: '100%',
                        padding: '0',
                        fontSize: isMobile ? '1.45rem' : '1.85rem',
                        fontWeight: '900',
                        border: 'none',
                        outline: 'none',
                        color: disabled ? 'var(--ui-ink-muted)' : 'var(--ui-ink)',
                        background: 'transparent',
                        lineHeight: '1.4'
                    }}
                    disabled={disabled}
                />
            </div>
            <div className="writing-editor-fields__field writing-editor-fields__field--body">
                <label htmlFor={contentId}>글 내용</label>
                <SpellingUnderlineTextarea
                    id={contentId}
                    ref={ref}
                    value={content}
                    onChange={(event) => onContentChange(event.target.value)}
                    placeholder={contentPlaceholder}
                    autoCapitalize="sentences"
                    lang="ko"
                    enterKeyHint="enter"
                    wrap="soft"
                    autoGrow
                    style={{
                        width: '100%',
                        // 세로 여백을 뺀 나머지가 딱 `contentMinLines` 줄이 되게 한다.
                        minHeight: `calc(${contentMinLines * CONTENT_LINE_HEIGHT}em + 8px)`,
                        padding: '4px 0',
                        border: 'none',
                        fontSize: isMobile ? '1.08rem' : '1.2rem',
                        lineHeight: `${CONTENT_LINE_HEIGHT}`,
                        outline: 'none',
                        color: disabled ? 'var(--ui-ink-muted)' : 'var(--ui-ink-strong)',
                        resize: 'none',
                        background: 'transparent'
                    }}
                    disabled={disabled}
                />
            </div>
        </div>
    );
});

export default WritingEditorFields;
