import React from 'react';
import NoticeComposer from './NoticeComposer';

export default function NoticeBoardSettings({ config = {}, classId, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <NoticeComposer classId={classId} />
      <label>
        <span>위젯 제목</span>
        <input maxLength={80} value={config.heading || ''} onChange={(event) => update({ heading: event.target.value })} />
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
    </div>
  );
}
