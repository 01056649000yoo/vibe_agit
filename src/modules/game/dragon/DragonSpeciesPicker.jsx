import React from 'react';
import DragonAvatar from './DragonAvatar';
import { DRAGON_SPECIES, getDragonStage } from './presentation';
import './DragonSpeciesPicker.css';

const DragonSpeciesPicker = ({ currentSpecies, isReselection = false, isBusy, onSelect, onCancel }) => (
    <section className="dragon-species-picker" aria-labelledby="dragon-species-picker-title">
        <div className="dragon-species-picker__heading">
            <span aria-hidden="true">🥚</span>
            <div>
                <h3 id="dragon-species-picker-title">{isReselection ? '함께할 수호룡을 다시 선택해요' : '함께 키울 수호룡을 골라요'}</h3>
                <p>
                    {isReselection
                        ? '작가 3단계에 받은 한 번의 기회예요. 선택하면 다시 바꿀 수 없어요.'
                        : '모든 수호룡은 같은 속도로 자라요. 가장 마음에 드는 알을 선택하세요.'}
                </p>
            </div>
        </div>
        <div className="dragon-species-picker__grid">
            {DRAGON_SPECIES.map((species) => {
                const selected = currentSpecies === species.id;
                const dragon = getDragonStage(1, species.id);
                return (
                    <button
                        key={species.id}
                        type="button"
                        className={`dragon-species-option ${selected ? 'is-current' : ''}`}
                        style={{ '--dragon-species-accent': species.accent, '--dragon-species-soft': species.soft }}
                        disabled={isBusy || (isReselection && selected)}
                        onClick={() => onSelect(species.id)}
                    >
                        <DragonAvatar dragon={dragon} readerLevel={1} alt="" style={{ width: '112px', height: '112px' }} />
                        <strong>{species.name}</strong>
                        <span>{species.description}</span>
                        <em>{selected ? '현재 함께하는 용' : '이 알 선택하기'}</em>
                    </button>
                );
            })}
        </div>
        {onCancel && (
            <button type="button" className="dragon-species-picker__cancel" onClick={onCancel} disabled={isBusy}>
                지금 모습 그대로 둘게요
            </button>
        )}
    </section>
);

export default DragonSpeciesPicker;
