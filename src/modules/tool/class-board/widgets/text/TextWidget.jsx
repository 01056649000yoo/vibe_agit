import React from 'react';
import { normalizeTextScale } from './textScale';

export default function TextWidget({ config = {}, dragHandleProps }) {
  const fontScale = normalizeTextScale(config.fontScale);
  return (
    <article
      {...dragHandleProps}
      className={`class-board-text class-board-text--${config.tone || 'paper'}`}
      style={{
        '--class-board-text-heading-size': `${Math.round(fontScale * 1000) / 100}cqmin`,
        '--class-board-text-body-size': `${Math.round(fontScale * 650) / 100}cqmin`,
      }}
    >
      {config.heading ? <h2>{config.heading}</h2> : null}
      <div className="class-board-text__body">{config.body || '내용을 입력해 주세요.'}</div>
    </article>
  );
}
