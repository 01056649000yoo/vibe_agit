import './GuideInfoButton.css';

/**
 * 설명을 여는 공용 정보 아이콘 버튼.
 *
 * 화면에 설명을 덧붙일 때 `ⓘ`, `!`, `?` 같은 문자나 별도 아이콘 버튼을
 * 직접 만들지 말고 이 컴포넌트를 쓴다. 버튼의 클릭 범위와 SVG 중심을 한곳에서
 * 맞춰 두어, 폰트마다 아이콘 위치가 달라지는 문제를 막는다.
 *
 * `size='sm'` 은 작은 글자 옆에 붙일 때만 쓴다(예: 학생 지도 카드의 `낱말 상태` 줄).
 * 기본 크기가 옆 글자보다 커 보이는 자리에서만 쓰고, 화면 제목 옆에는 기본 크기를 유지한다.
 */
const GuideInfoButton = ({ label, title = label, className = '', onClick, variant = 'icon', size = 'md' }) => (
    <button
        type="button"
        className={`guide-info-button${variant === 'help' ? ' guide-info-button--help' : ''}${size === 'sm' ? ' guide-info-button--sm' : ''} ${className}`.trim()}
        aria-label={label}
        title={title}
        onClick={onClick}
    >
        {variant === 'help' ? (
            <><span aria-hidden="true">💡</span><span>도움말</span></>
        ) : (
            <svg
                className="guide-info-button__icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
            >
                <circle cx="10" cy="10" r="7.5" />
                <path d="M10 8.75v5" />
                <circle className="guide-info-button__dot" cx="10" cy="5.75" r=".8" />
            </svg>
        )}
    </button>
);

export default GuideInfoButton;
