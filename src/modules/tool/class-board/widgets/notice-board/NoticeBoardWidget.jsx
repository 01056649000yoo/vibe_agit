import React from 'react';

export default function NoticeBoardWidget({ config = {}, dragHandleProps }) {
  return (
    <article {...dragHandleProps} className={`class-board-notice class-board-notice--${config.tone || 'yellow'}`}>
      <header><span aria-hidden="true">📒</span><h2>{config.heading || '알림장'}</h2></header>
      <div>{config.body || '알림 내용을 입력해 주세요.'}</div>
    </article>
  );
}
