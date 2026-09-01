import React from 'react';
import { WEATHER_OPTIONS } from './weatherOptions';

export default function WeatherSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>날씨</span>
        <select value={config.condition || 'sunny'} onChange={(event) => update({ condition: event.target.value })}>
          {WEATHER_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.label}</option>)}
        </select>
      </label>
      <label>
        <span>기온</span>
        <input type="number" min="-40" max="50" value={config.temperature ?? 20} onChange={(event) => update({ temperature: Number(event.target.value) })} />
      </label>
      <label>
        <span>날씨 한마디</span>
        <input maxLength={80} value={config.message || ''} onChange={(event) => update({ message: event.target.value })} />
      </label>
      <p className="class-board-note">외부 위치 정보 없이 교사가 직접 고르는 수업용 날씨 카드입니다.</p>
    </div>
  );
}
