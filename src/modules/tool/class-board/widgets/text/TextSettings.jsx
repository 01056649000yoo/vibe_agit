import React from 'react';

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

