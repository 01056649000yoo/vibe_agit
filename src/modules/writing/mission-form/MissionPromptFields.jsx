const baseFieldStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px',
    border: '1px solid #ddd',
    borderRadius: '12px',
    fontSize: 'var(--ui-text-lg)'
};

/**
 * 교사가 미션을 제시할 때 공통으로 쓰는 주제·안내 입력틀.
 * 저장 방식은 소유하지 않고, 일반 미션과 공동 활동이 각자의 저장 경계만 연결한다.
 */
const MissionPromptFields = ({
    title,
    guide,
    onTitleChange,
    onGuideChange,
    isMobile = false,
    titleAccessory = null,
    titlePlaceholder = '글쓰기 주제',
    guidePlaceholder = '안내 가이드 (학생들에게 보여줄 기본 설명)',
    titleMaxLength,
    guideMaxLength,
    required = false,
    disabled = false
}) => (
    <>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
            <input
                type="text"
                aria-label="글쓰기 주제"
                placeholder={titlePlaceholder}
                value={title}
                maxLength={titleMaxLength}
                required={required}
                disabled={disabled}
                onChange={(event) => onTitleChange(event.target.value)}
                style={{ ...baseFieldStyle, flex: 2, minHeight: '48px' }}
            />
            {titleAccessory}
        </div>
        <textarea
            aria-label="학생 글쓰기 안내"
            placeholder={guidePlaceholder}
            value={guide}
            maxLength={guideMaxLength}
            required={required}
            disabled={disabled}
            onChange={(event) => onGuideChange(event.target.value)}
            style={{ ...baseFieldStyle, minHeight: '80px', resize: 'vertical' }}
        />
    </>
);

export default MissionPromptFields;
