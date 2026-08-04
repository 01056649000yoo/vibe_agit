import React, { forwardRef } from 'react';
import SpellingUnderlineInput from '../../modules/writing/tools/spelling-lookup/SpellingUnderlineInput';
import SpellingUnderlineTextarea from '../../modules/writing/tools/spelling-lookup/SpellingUnderlineTextarea';

const CONTENT_LINE_HEIGHT = 1.8;

/**
 * 글 쓰는 영역의 최대 가로 길이.
 *
 * 예전에는 감싸는 카드의 폭이 곧 입력창의 폭이었다. 그래서 화면마다 달랐고
 * (과제 666px / 독서록 720px), 특히 **미션에 질문이 있으면 카드가 1200px 로 넓어져
 * 한 줄이 51글자**가 됐다. 읽기 편한 줄은 보통 30~40글자다.
 *
 * 카드가 아니라 글 쓰는 영역 자체가 폭을 갖게 해서 어느 화면에서든 같게 만든다.
 * 화면이 이보다 좁으면(모바일) 이 값은 아무 일도 하지 않는다.
 */
export const WRITING_CONTENT_MAX_WIDTH = 720;

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
    return (
        <div style={{ maxWidth: `${WRITING_CONTENT_MAX_WIDTH}px`, margin: '0 auto' }}>
            <SpellingUnderlineInput
                type="text"
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder={titlePlaceholder}
                autoCapitalize="sentences"
                lang="ko"
                containerStyle={{ marginBottom: '24px' }}
                style={{
                    width: '100%',
                    padding: '16px 0',
                    fontSize: isMobile ? '1.5rem' : '2rem',
                    fontWeight: '900',
                    border: 'none',
                    borderBottom: '2px solid #F1F3F5',
                    outline: 'none',
                    color: disabled ? '#546E7A' : '#2C3E50',
                    background: 'transparent',
                    lineHeight: '1.4'
                }}
                disabled={disabled}
            />
            <SpellingUnderlineTextarea
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
                    // 세로 여백(10px×2)을 뺀 나머지가 딱 `contentMinLines` 줄이 되게 한다.
                    minHeight: `calc(${contentMinLines * CONTENT_LINE_HEIGHT}em + 20px)`,
                    padding: '10px 0',
                    border: 'none',
                    fontSize: isMobile ? '1.1rem' : '1.25rem',
                    lineHeight: `${CONTENT_LINE_HEIGHT}`,
                    outline: 'none',
                    color: disabled ? '#546E7A' : '#444',
                    resize: 'none',
                    background: 'transparent'
                }}
                disabled={disabled}
            />
        </div>
    );
});

export default WritingEditorFields;
