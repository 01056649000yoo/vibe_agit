import React, { useEffect, useState } from 'react';
import { formatElapsedTime } from '../time/timeFormat';

const stopPointer = (event) => event.stopPropagation();

export default function StopwatchWidget({ config = {} }) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(startedAt);
  const displayedMs = elapsedMs + (running ? Math.max(0, now - startedAt) : 0);

  useEffect(() => {
    if (!startedAt) return undefined;
    let timerId;
    const tick = () => {
      setNow(Date.now());
      timerId = window.setTimeout(tick, 200);
    };
    timerId = window.setTimeout(tick, 200);
    return () => window.clearTimeout(timerId);
  }, [startedAt]);

  const toggle = () => {
    if (running) {
      setElapsedMs(displayedMs);
      setStartedAt(null);
      return;
    }
    const current = Date.now();
    setNow(current);
    setStartedAt(current);
  };

  const reset = () => {
    setElapsedMs(0);
    setStartedAt(null);
    setNow(Date.now());
  };

  return (
    <section className="class-board-clock class-board-clock--stopwatch">
      <span>{config.label || '걸린 시간'}</span>
      <strong aria-live="polite">{formatElapsedTime(displayedMs)}</strong>
      <div>
        <button type="button" onPointerDown={stopPointer} onClick={toggle}>{running ? '기록 멈춤' : '시작'}</button>
        <button type="button" onPointerDown={stopPointer} onClick={reset}>초기화</button>
      </div>
    </section>
  );
}
