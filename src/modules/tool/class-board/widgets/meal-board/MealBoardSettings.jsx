import React from 'react';
import { MEAL_COLUMN_CHOICES, normalizeMealColumns } from './mealColumns';

export default function MealBoardSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>위젯 제목</span>
        <input maxLength={80} value={config.heading || ''} onChange={(event) => update({ heading: event.target.value })} />
      </label>
      <label>
        <span>급식 이름 배열</span>
        <select value={normalizeMealColumns(config.columns)} onChange={(event) => update({ columns: event.target.value })}>
          {MEAL_COLUMN_CHOICES.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
        </select>
      </label>
      <label className="class-board-checkbox-field">
        <input type="checkbox" checked={config.showAllergens !== false} onChange={(event) => update({ showAllergens: event.target.checked })} />
        <span>알레르기 정보 표시</span>
      </label>
      <p className="class-board-note">학교는 `얘들아, 밥 먹자!`에서 설정합니다. 스크린을 열 때 그 학급의 오늘 급식을 한 번 불러오며 자동 새로고침은 하지 않습니다. 급식 이름은 위젯에 남는 자리에 가득 차도록 저절로 커지고, 알레르기 안내는 이름 바로 아래에 붙습니다. 그날 메뉴에 따라 2열·3열 중 잘 보이는 쪽이 달라지니 둘 다 눌러 보세요.</p>
    </div>
  );
}
