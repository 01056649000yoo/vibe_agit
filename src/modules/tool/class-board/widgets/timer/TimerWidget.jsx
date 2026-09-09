import React, { useEffect, useState } from 'react';
import { playTimerAlarm, prepareClassBoardAudio } from '../audio/audioPlayer';
import { formatClockTime } from '../time/timeFormat';
import { clearClockRun, readClockRun, resumeTimer, writeClockRun } from '../time/clockRuns';

const stopPointer = (event) => event.stopPropagation();

export default function TimerWidget({ config = {}, instanceId = '' }) {
  const durationMs = Math.min(7200, Math.max(10, Number(config.durationSeconds) || 300)) * 1000;
  /*
   * 처음 그릴 때 저장해 둔 진행을 되살린다. 위젯을 옮기거나 스크린 탭을 바꾸거나 `전체 화면`
   * 새 탭으로 옮겨도 시간이 이어지게 하는 자리다(clockRuns.js).
   */
  const [restored] = useState(() => resumeTimer(
    readClockRun(instanceId, { kind: 'timer', durationMs }), durationMs));
  const [remainingOverride, setRemainingOverride] = useState(restored.remainingMs);
  const [endAt, setEndAt] = useState(restored.endAt);
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
        writeClockRun(instanceId, { kind: 'timer', durationMs, endAt: null, remainingMs: 0 });
        if (config.soundEnabled !== false) {
          void playTimerAlarm(config.alarmSound, config.alarmVolume);
        }
        return;
      }
      setNow(nextNow);
      timerId = window.setTimeout(tick, 200);
    };
    timerId = window.setTimeout(tick, 200);
    return () => window.clearTimeout(timerId);
  }, [config.alarmSound, config.alarmVolume, config.soundEnabled, durationMs, endAt, instanceId]);

  const toggle = () => {
    if (running) {
      const left = Math.max(0, endAt - Date.now());
      setRemainingOverride(left);
      setEndAt(null);
      writeClockRun(instanceId, { kind: 'timer', durationMs, endAt: null, remainingMs: left });
      return;
    }
    prepareClassBoardAudio();
    const nextRemaining = remainingMs > 0 ? remainingMs : durationMs;
    const nextEndAt = Date.now() + nextRemaining;
    setNow(Date.now());
    setEndAt(nextEndAt);
    // 흐른 시간이 아니라 **끝나는 시각**을 적는다. 화면이 없는 동안에도 시간은 흐른다.
    writeClockRun(instanceId, { kind: 'timer', durationMs, endAt: nextEndAt, remainingMs: null });
  };

  const reset = () => {
    setEndAt(null);
    setRemainingOverride(null);
    setNow(Date.now());
    clearClockRun(instanceId);
  };

  return (
    <section className={`class-board-clock class-board-clock--timer${remainingMs === 0 ? ' is-finished' : ''}`}>
      <span>{config.label || '활동 시간'}</span>
      <strong aria-live="polite">{formatClockTime(remainingMs)}</strong>
      <div>
        <button type="button" onPointerDown={stopPointer} onClick={toggle}>{running ? '잠시 멈춤' : remainingMs === 0 ? '다시 시작' : remainingMs < durationMs ? '이어서' : '시작'}</button>
        <button type="button" onPointerDown={stopPointer} onClick={reset}>초기화</button>
      </div>
    </section>
  );
}
