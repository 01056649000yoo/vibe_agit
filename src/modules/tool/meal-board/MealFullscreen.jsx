import React, { useEffect, useState } from 'react';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import ModalPortal from '../../../components/common/ModalPortal';
import { readLocalStorageJson } from '../../../lib/browserStorage';
import {
  MEAL_COLUMN_OPTIONS,
  MEAL_TEXT_STEPS,
  MEAL_VIEW_STORAGE_KEY,
  formatMealDate,
  mealTextScale,
  normalizeMealView
} from './mealBoardEngine';

export default function MealFullscreen({ school, date, meals, allergenMap, onClose }) {
  const [view, setView] = useState(() => normalizeMealView(readLocalStorageJson(MEAL_VIEW_STORAGE_KEY, null)));

  useEffect(() => {
    try {
      window.localStorage.setItem(MEAL_VIEW_STORAGE_KEY, JSON.stringify(view));
    } catch {
      // 저장소가 막힌 환경에서도 지금 보고 있는 화면 설정은 그대로 유지한다.
    }
  }, [view]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose(); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return <ModalPortal>
    <div className="meal-fullscreen" role="dialog" aria-modal="true" aria-labelledby="meal-fullscreen-title">
      <header className="meal-fullscreen-header">
        <div>
          <span className="meal-kicker">오늘의 식탁</span>
          <h2 id="meal-fullscreen-title">{school?.schoolName || '우리 학교'} 급식</h2>
          <p>{formatMealDate(date)}</p>
        </div>
        <div className="meal-fullscreen-tools">
          <div className="meal-view-control" role="group" aria-label="글자 크기">
            <span>글자</span>
            {MEAL_TEXT_STEPS.map((step) => <button
              type="button"
              key={step.id}
              className={view.textStep === step.id ? 'is-selected' : ''}
              aria-pressed={view.textStep === step.id}
              onClick={() => setView((current) => ({ ...current, textStep: step.id }))}
            >{step.label}</button>)}
          </div>
          <div className="meal-view-control" role="group" aria-label="열 수">
            <span>열</span>
            {MEAL_COLUMN_OPTIONS.map((columns) => <button
              type="button"
              key={columns}
              className={view.columns === columns ? 'is-selected' : ''}
              aria-pressed={view.columns === columns}
              onClick={() => setView((current) => ({ ...current, columns }))}
            >{columns}열</button>)}
          </div>
          <ModalCloseButton onClick={onClose} label="전체화면 급식판 닫기" tone="onDark" />
        </div>
      </header>

      <main className={`meal-fullscreen-grid ${meals.length > 1 ? 'has-multiple' : ''}`}>
        {meals.length === 0 ? <section className="meal-fullscreen-empty">
          <span aria-hidden="true">🍽️</span>
          <h3>등록된 급식이 없어요</h3>
          <p>방학·휴일이거나 학교에서 아직 급식을 등록하지 않았을 수 있어요.</p>
        </section> : meals.map((meal, index) => <article
          className="meal-display-card"
          style={{ '--dish-cols': view.columns, '--dish-scale': mealTextScale(view.textStep) }}
          key={`${meal.mealType}-${index}`}
        >
          <div className="meal-display-card-heading">
            <span>{index === 0 ? '🍚' : index === 1 ? '🥗' : '🍲'}</span>
            <h3>{meal.mealType || '급식'}</h3>
            {meal.calories ? <em>{meal.calories}</em> : null}
          </div>
          <div className="meal-display-dishes">
            {(meal.dishes || []).map((dish, dishIndex) => <div key={`${dish.name}-${dishIndex}`}>
              <strong>{dish.name}</strong>
              {dish.allergenCodes?.length ? <small>
                {dish.allergenCodes.map((code) => allergenMap.get(Number(code)) || code).join(' · ')}
              </small> : null}
            </div>)}
          </div>
        </article>)}
      </main>

      <footer className="meal-fullscreen-footer">
        <span>알레르기 표시는 학교 제공 급식 정보를 바탕으로 합니다.</span>
        <strong>학생 이름과 비고는 이 화면에 표시되지 않아요.</strong>
      </footer>
    </div>
  </ModalPortal>;
}
