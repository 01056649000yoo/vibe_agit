import React, { useEffect, useState } from 'react';
import { formatClockTime } from '../time/timeFormat';

const stopPointer = (event) => event.stopPropagation();

export default function TimerWidget({ config = {} }) {
  const durationMs = Math.min(7200, Math.max(10, Number(config.durationSeconds) || 300)) * 1000;
  const [remainingOverride, setRemainingOverride] = useState(null);
  const [endAt, setEndAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = endAt ? Math.max(0, endAt - now) : remainingOverride ?? durationMs;
  const running = Boolean(endAt);

  useEffect(() => {
    if (!endAt) return undefined;
    let timerId;
    const tick = () => {
      const nextNow = Date.now();
      if (nextNow >= endAt) {
        setNow(nextNow);
        setRemainingOverride(0);
        setEndAt(null);
        return;
      }
      setNow(nextNow);
      timerId = window.setTimeout(tick, 200);
    };
    timerId = window.setTimeout(tick, 200);
    return () => window.clearTimeout(timerId);
  }, [endAt]);

  const toggle = () => {
    if (running) {
      setRemainingOverride(Math.max(0, endAt - Date.now()));
      setEndAt(null);
      return;
    }
    const nextRemaining = remainingMs > 0 ? remainingMs : durationMs;
    setNow(Date.now());
    setEndAt(Date.now() + nextRemaining);
  };

  const reset = () => {
    setEndAt(null);
    setRemainingOverride(null);
    setNow(Date.now());
  };

  return (
    <section className={`class-board-clock class-board-clock--timer${remainingMs === 0 ? ' is-finished' : ''}`}>
      <span>{config.label || '활동 시간'}</span>
      <strong aria-live="polite">{formatClockTime(remainingMs)}</strong>
      <div>
        <button type="button" onPointerDown={stopPointer} onClick={toggle}>{running ? '잠시 멈춤' : remainingMs === 0 ? '다시 시작' : '시작'}</button>
        <button type="button" onPointerDown={stopPointer} onClick={reset}>초기화</button>
      </div>
    </section>
  );
}
