import React from 'react';
import { normalizeSoundVolume, playTimerAlarm, prepareClassBoardAudio, TIMER_SOUND_OPTIONS } from '../audio/audioPlayer';

export default function TimerSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>타이머 이름</span>
        <input maxLength={80} value={config.label || ''} onChange={(event) => update({ label: event.target.value })} />
      </label>
      <label>
        <span>시간(초)</span>
        <input type="number" min="10" max="7200" step="10" value={config.durationSeconds || 300} onChange={(event) => update({ durationSeconds: Number(event.target.value) })} />
      </label>
      <label className="class-board-checkbox-field">
        <input type="checkbox" checked={config.soundEnabled !== false} onChange={(event) => update({ soundEnabled: event.target.checked })} />
        <span>종료 소리 사용</span>
      </label>
      <label>
        <span>종료 소리</span>
        <select disabled={config.soundEnabled === false} value={config.alarmSound || 'chime'} onChange={(event) => update({ alarmSound: event.target.value })}>
          {TIMER_SOUND_OPTIONS.map((sound) => <option key={sound.id} value={sound.id}>{sound.label}</option>)}
        </select>
      </label>
      <label>
        <span>소리 크기 {Math.round(normalizeSoundVolume(config.alarmVolume) * 100)}%</span>
        <input disabled={config.soundEnabled === false} type="range" min="0" max="1" step="0.05" value={normalizeSoundVolume(config.alarmVolume)} onChange={(event) => update({ alarmVolume: Number(event.target.value) })} />
      </label>
      <button
        type="button"
        className="class-board-sound-preview"
        disabled={config.soundEnabled === false}
        onClick={() => {
          prepareClassBoardAudio();
          void playTimerAlarm(config.alarmSound, config.alarmVolume);
        }}
      >🔊 종료 소리 미리 듣기</button>
      <p className="class-board-note">10초부터 2시간까지 설정할 수 있습니다. `시작`을 누르면 브라우저 소리가 준비되고, 종료할 때 선택한 소리가 납니다. 실행 상태는 저장하지 않습니다.</p>
    </div>
  );
}
