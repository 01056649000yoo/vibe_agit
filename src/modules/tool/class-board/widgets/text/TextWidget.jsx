import React from 'react';
import { createResponsiveTextSize } from './textScale';
import useFittedClassBoardText from './useFittedClassBoardText';

export default function TextWidget({ config = {}, dragHandleProps }) {
  const textRef = useFittedClassBoardText(config);
  return (
    <article
      {...dragHandleProps}
      ref={textRef}
      className={`class-board-text class-board-text--${config.tone || 'paper'}`}
      style={{
        '--class-board-text-heading-size': createResponsiveTextSize(1.5, 5),
        '--class-board-text-body-size': createResponsiveTextSize(1.5, 3.25),
      }}
    >
      {config.heading ? <h2>{config.heading}</h2> : null}
      <div className="class-board-text__body">{config.body || '내용을 입력해 주세요.'}</div>
    </article>
  );
}
