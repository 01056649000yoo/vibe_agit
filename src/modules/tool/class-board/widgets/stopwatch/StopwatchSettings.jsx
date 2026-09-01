import React from 'react';

export default function StopwatchSettings({ config = {}, onChange }) {
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>스톱워치 이름</span>
        <input maxLength={80} value={config.label || ''} onChange={(event) => onChange({ ...config, label: event.target.value })} />
      </label>
      <p className="class-board-note">측정 중인 시간은 이 화면에만 유지되며 새로고침하면 00:00으로 돌아갑니다.</p>
    </div>
  );
}
