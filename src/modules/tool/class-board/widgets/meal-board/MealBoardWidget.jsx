import React, { useEffect, useMemo, useState } from 'react';
import { mealBoardApi } from '../../../meal-board/mealBoardApi';
import { formatMealDate, getSeoulDateString } from '../../../meal-board/mealBoardEngine';
import { normalizeMealColumns } from './mealColumns';
import useFittedMealDishes from './useFittedMealDishes';

const emptyState = { key: '', status: 'idle', school: null, meals: [], allergens: [] };

export default function MealBoardWidget({ config = {}, classId, dragHandleProps }) {
  const date = useMemo(() => getSeoulDateString(), []);
  const [state, setState] = useState(emptyState);

  useEffect(() => {
    let active = true;
    if (!classId) return () => { active = false; };
    void mealBoardApi.getWorkspace(classId).then(async (workspace) => {
      const school = workspace?.school || null;
      const allergens = Array.isArray(workspace?.allergens) ? workspace.allergens : [];
      if (!school?.officeCode || !school?.schoolCode) {
        if (active) setState({ key: classId, status: 'no-school', school: null, meals: [], allergens });
        return;
      }
      const meal = await mealBoardApi.getMeal({
        officeCode: school.officeCode,
        schoolCode: school.schoolCode,
        date,
      });
      if (active) setState({
        key: classId,
        status: 'ready',
        school,
        meals: Array.isArray(meal?.meals) ? meal.meals.slice(0, 3) : [],
        allergens,
      });
    }).catch(() => {
      if (active) setState({ ...emptyState, key: classId, status: 'error' });
    });
    return () => { active = false; };
  }, [classId, date]);

  const current = state.key === classId ? state : { ...emptyState, status: 'loading' };
  const allergenMap = new Map(current.allergens.map((item) => [Number(item.code), item.label]));
  const heading = config.heading || '오늘의 급식';
  const columns = normalizeMealColumns(config.columns);
  const showAllergens = config.showAllergens !== false;
  // 급식 이름·열 수·알레르기 표시가 바뀌면 남은 자리에 맞춰 글씨를 다시 맞춘다.
  const mealsRef = useFittedMealDishes([
    columns,
    showAllergens,
    current.meals.map((meal) => (meal.dishes || []).map((dish) => dish.name).join('·')).join('|'),
  ].join('/'));

  return (
    <section {...dragHandleProps} className="class-board-meal">
      <header>
        <span aria-hidden="true">🍚</span>
        <div><small>{formatMealDate(date)}</small><h2>{heading}</h2></div>
        {current.school?.schoolName ? <em>{current.school.schoolName}</em> : null}
      </header>
      {current.status === 'loading' ? <p className="class-board-meal__state">급식을 불러오는 중…</p> : null}
      {current.status === 'error' ? <p className="class-board-meal__state">급식을 잠시 불러오지 못했습니다.</p> : null}
      {current.status === 'no-school' ? <p className="class-board-meal__state">`얘들아, 밥 먹자!`에서 학교를 먼저 설정해 주세요.</p> : null}
      {current.status === 'ready' && current.meals.length === 0 ? <p className="class-board-meal__state">오늘 등록된 급식이 없습니다.</p> : null}
      {current.meals.length > 0 ? <div
        ref={mealsRef}
        className="class-board-meal__meals"
        style={{ '--class-board-meal-columns': columns }}
      >
        {current.meals.map((meal, mealIndex) => <article key={`${meal.mealType}-${mealIndex}`}>
          <strong>{meal.mealType || '급식'}{meal.calories ? <em>{meal.calories}</em> : null}</strong>
          <div>{(meal.dishes || []).slice(0, 10).map((dish, dishIndex) => <span key={`${dish.name}-${dishIndex}`}>
            <b>{dish.name}</b>
            {showAllergens && dish.allergenCodes?.length ? <small>{dish.allergenCodes.map((code) => allergenMap.get(Number(code)) || code).join(' · ')}</small> : null}
          </span>)}</div>
        </article>)}
      </div> : null}
      <footer>학교 제공 나이스 급식 정보</footer>
    </section>
  );
}
