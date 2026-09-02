import React from 'react';

export default function NoticeBoardSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>제목</span>
        <input maxLength={80} value={config.heading || ''} onChange={(event) => update({ heading: event.target.value })} />
      </label>
      <label>
        <span>알림 내용</span>
        <textarea maxLength={2000} rows={9} value={config.body || ''} onChange={(event) => update({ body: event.target.value })} />
      </label>
      <label>
        <span>알림장 색</span>
        <select value={config.tone || 'yellow'} onChange={(event) => update({ tone: event.target.value })}>
          <option value="yellow">노랑</option>
          <option value="sky">하늘</option>
          <option value="mint">민트</option>
          <option value="rose">분홍</option>
        </select>
      </label>
      <p className="class-board-note">작성한 내용은 현재 스크린의 `저장`을 누르면 함께 보관됩니다. 다시 열거나 발표 화면을 열어도 그대로 불러옵니다.</p>
    </div>
  );
}
