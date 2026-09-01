import React from 'react';
import { normalizeTextScale, TEXT_SCALE_OPTIONS } from './textScale';

export default function TextSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>제목</span>
        <input maxLength={120} value={config.heading || ''} onChange={(event) => update({ heading: event.target.value })} />
      </label>
      <label>
        <span>내용</span>
        <textarea maxLength={2000} rows={7} value={config.body || ''} onChange={(event) => update({ body: event.target.value })} />
      </label>
      <fieldset className="class-board-text-scale">
        <legend>글씨 크기</legend>
        <div role="group" aria-label="텍스트 글씨 크기">
          {TEXT_SCALE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={normalizeTextScale(config.fontScale) === option.value}
              onClick={() => update({ fontScale: option.value })}
            >{option.label}</button>
          ))}
        </div>
        <small>아주 크게는 글이 칸을 거의 채우도록 자동 맞춤됩니다. 오른쪽·아래쪽·모서리를 드래그하면 글씨도 함께 맞춰집니다.</small>
      </fieldset>
      <label>
        <span>분위기</span>
        <select value={config.tone || 'paper'} onChange={(event) => update({ tone: event.target.value })}>
          <option value="paper">종이</option>
          <option value="sky">하늘</option>
          <option value="sun">햇살</option>
          <option value="mint">민트</option>
        </select>
      </label>
    </div>
  );
}
