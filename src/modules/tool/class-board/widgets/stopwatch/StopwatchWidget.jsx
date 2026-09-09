import React, { useEffect, useState } from 'react';
import { formatElapsedTime } from '../time/timeFormat';
import { clearClockRun, readClockRun, resumeStopwatch, writeClockRun } from '../time/clockRuns';

const stopPointer = (event) => event.stopPropagation();

export default function StopwatchWidget({ config = {}, instanceId = '' }) {
  /*
   * 처음 그릴 때 저장해 둔 진행을 되살린다. 위젯을 옮기거나 스크린 탭을 바꾸거나 `전체 화면`
   * 새 탭으로 옮겨도 시간이 이어지게 하는 자리다(clockRuns.js).
   */
  const [restored] = useState(() => resumeStopwatch(readClockRun(instanceId, { kind: 'stopwatch' })));
  const [elapsedMs, setElapsedMs] = useState(restored.elapsedMs);
  const [startedAt, setStartedAt] = useState(restored.startedAt);
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
      writeClockRun(instanceId, { kind: 'stopwatch', startedAt: null, elapsedMs: displayedMs });
      return;
    }
    const current = Date.now();
    setNow(current);
    setStartedAt(current);
    // 흐른 시간이 아니라 **시작한 시각**을 적는다. 화면이 없는 동안에도 시간은 흐른다.
    writeClockRun(instanceId, { kind: 'stopwatch', startedAt: current, elapsedMs });
  };

  const reset = () => {
    setElapsedMs(0);
    setStartedAt(null);
    setNow(Date.now());
    clearClockRun(instanceId);
  };

  return (
    <section className="class-board-clock class-board-clock--stopwatch">
      <span>{config.label || '걸린 시간'}</span>
      <strong aria-live="polite">{formatElapsedTime(displayedMs)}</strong>
      <div>
        <button type="button" onPointerDown={stopPointer} onClick={toggle}>{running ? '기록 멈춤' : elapsedMs > 0 ? '이어서' : '시작'}</button>
        <button type="button" onPointerDown={stopPointer} onClick={reset}>초기화</button>
      </div>
    </section>
  );
}
