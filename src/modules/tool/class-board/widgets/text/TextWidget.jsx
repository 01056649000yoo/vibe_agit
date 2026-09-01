import React from 'react';
import { createResponsiveTextSize } from './textScale';

export default function TextWidget({ config = {}, dragHandleProps }) {
  return (
    <article
      {...dragHandleProps}
      className={`class-board-text class-board-text--${config.tone || 'paper'}`}
      style={{
        '--class-board-text-heading-size': createResponsiveTextSize(config.fontScale, 5),
        '--class-board-text-body-size': createResponsiveTextSize(config.fontScale, 3.25),
      }}
    >
      {config.heading ? <h2>{config.heading}</h2> : null}
      <div className="class-board-text__body">{config.body || '내용을 입력해 주세요.'}</div>
    </article>
  );
}
