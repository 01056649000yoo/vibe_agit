import React from 'react';

export default function TextSettings({ config = {}, onChange }) {
  const update = (patch, resetFittedSize = false) => {
    const next = { ...config, ...patch };
    if (resetFittedSize) delete next.bodySize;
    onChange(next);
  };
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>제목</span>
        <input maxLength={120} value={config.heading || ''} onChange={(event) => update({ heading: event.target.value }, true)} />
      </label>
      <label>
        <span>내용</span>
        <textarea maxLength={2000} rows={7} value={config.body || ''} onChange={(event) => update({ body: event.target.value }, true)} />
      </label>
      <p className="class-board-note">입력한 글은 칸에 가장 크게 자동 맞춰집니다. 오른쪽은 줄바꿈, 아래쪽은 보이는 줄 수, 모서리는 글씨 크기를 조절합니다.</p>
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
