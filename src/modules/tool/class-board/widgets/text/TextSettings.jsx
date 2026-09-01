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
        <small>칸을 키우거나 줄이면 선택한 크기를 기준으로 글씨도 함께 바뀝니다.</small>
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
