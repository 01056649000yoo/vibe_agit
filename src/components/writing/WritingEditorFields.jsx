import React, { forwardRef } from 'react';

/**
 * 과제 글쓰기와 학생 자율 글쓰기가 함께 쓰는 기본 제목/본문 입력부.
 * 저장·제출 규칙은 각 모듈이 맡고, 실제 글을 쓰는 감각만 동일하게 유지한다.
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
    contentMinHeight = 600
}, ref) {
    return (
        <>
            <input
                type="text"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder={titlePlaceholder}
                spellCheck={true}
                autoCorrect="off"
                autoCapitalize="sentences"
                lang="ko"
                style={{
                    width: '100%',
                    padding: '16px 0',
                    fontSize: isMobile ? '1.5rem' : '2rem',
                    fontWeight: '900',
                    border: 'none',
                    borderBottom: '2px solid #F1F3F5',
                    marginBottom: '24px',
                    outline: 'none',
                    color: disabled ? '#546E7A' : '#2C3E50',
                    background: 'transparent',
                    lineHeight: '1.4'
                }}
                disabled={disabled}
            />
            <textarea
                ref={ref}
                value={content}
                onChange={(event) => onContentChange(event.target.value)}
                placeholder={contentPlaceholder}
                spellCheck={true}
                autoCorrect="off"
                autoCapitalize="sentences"
                lang="ko"
                enterKeyHint="enter"
                wrap="soft"
                style={{
                    width: '100%',
                    minHeight: `${contentMinHeight}px`,
                    padding: '10px 0',
                    border: 'none',
                    fontSize: isMobile ? '1.1rem' : '1.25rem',
                    lineHeight: '1.8',
                    outline: 'none',
                    color: disabled ? '#546E7A' : '#444',
                    resize: 'none',
                    background: 'transparent'
                }}
                disabled={disabled}
            />
        </>
    );
});

export default WritingEditorFields;
