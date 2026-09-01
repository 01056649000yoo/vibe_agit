import React from 'react';

export default function TimerSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>타이머 이름</span>
        <input maxLength={80} value={config.label || ''} onChange={(event) => update({ label: event.target.value })} />
      </label>
      <label>
        <span>시간(초)</span>
        <input type="number" min="10" max="7200" step="10" value={config.durationSeconds || 300} onChange={(event) => update({ durationSeconds: Number(event.target.value) })} />
      </label>
      <p className="class-board-note">10초부터 2시간까지 설정할 수 있습니다. 실행 상태는 저장하지 않으며 화면을 새로 열면 처음 시간으로 돌아갑니다.</p>
    </div>
  );
}
