import React from 'react';

export default function StudentPickerSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>뽑기 제목</span>
        <input maxLength={80} value={config.title || ''} onChange={(event) => update({ title: event.target.value })} />
      </label>
      <label className="class-board-checkbox-field">
        <input type="checkbox" checked={Boolean(config.allowRepeats)} onChange={(event) => update({ allowRepeats: event.target.checked })} />
        <span>같은 학생을 다시 뽑을 수 있게 하기</span>
      </label>
      <p className="class-board-note">현재 학급의 활성 학생 이름만 화면을 열 때 한 번 불러옵니다. 뽑기 결과와 순서는 저장하지 않습니다.</p>
    </div>
  );
}
