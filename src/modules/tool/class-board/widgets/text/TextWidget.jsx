import React from 'react';

export default function TextWidget({ config = {}, dragHandleProps }) {
  return (
    <article {...dragHandleProps} className={`class-board-text class-board-text--${config.tone || 'paper'}`}>
      {config.heading ? <h2>{config.heading}</h2> : null}
      <div className="class-board-text__body">{config.body || '내용을 입력해 주세요.'}</div>
    </article>
  );
}
