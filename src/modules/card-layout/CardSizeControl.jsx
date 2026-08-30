import { CARD_SIZE_OPTIONS, normalizeCardSize } from './cardSize';
import './CardSizeControl.css';

/**
 * 카드 목록 화면에 붙이는 공통 크기 조절기.
 *
 * 값 저장과 카드 배치는 사용하는 화면이 맡는다. 그래서 이 컴포넌트 한 줄을
 * 빼도 데이터나 목록 동작은 바뀌지 않고, 새 카드 화면에도 같은 계약으로 붙일 수 있다.
 */
const CardSizeControl = ({
    value,
    onChange,
    label = '카드',
    ariaLabel = `${label} 크기 설정`,
    className = ''
}) => {
    const normalizedValue = normalizeCardSize(value);

    return (
        <div
            className={`card-size-control ${className}`.trim()}
            role="group"
            aria-label={ariaLabel}
        >
            <span className="card-size-control__label">{label}</span>
            <div className="card-size-control__options">
                {CARD_SIZE_OPTIONS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        className="card-size-control__option"
                        aria-pressed={normalizedValue === option.id}
                        onClick={() => onChange?.(option.id)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default CardSizeControl;
