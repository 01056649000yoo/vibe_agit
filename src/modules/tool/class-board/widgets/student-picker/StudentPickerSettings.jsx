import React from 'react';
import { normalizeSoundVolume, playPickerSelected, prepareClassBoardAudio } from '../audio/audioPlayer';

export default function StudentPickerSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>뽑기 제목</span>
        <input maxLength={80} value={config.title || ''} onChange={(event) => update({ title: event.target.value })} />
      </label>
      <label className="class-board-checkbox-field">
        <input type="checkbox" checked={Boolean(config.allowRepeats)} onChange={(event) => update({ allowRepeats: event.target.checked })} />
        <span>같은 학생을 다시 뽑을 수 있게 하기</span>
      </label>
      <label className="class-board-checkbox-field">
        <input type="checkbox" checked={config.soundEnabled !== false} onChange={(event) => update({ soundEnabled: event.target.checked })} />
        <span>이름 전환·선정 효과음 사용</span>
      </label>
      <label>
        <span>효과음 크기 {Math.round(normalizeSoundVolume(config.soundVolume, 0.55) * 100)}%</span>
        <input disabled={config.soundEnabled === false} type="range" min="0" max="1" step="0.05" value={normalizeSoundVolume(config.soundVolume, 0.55)} onChange={(event) => update({ soundVolume: Number(event.target.value) })} />
      </label>
      <button
        type="button"
        className="class-board-sound-preview"
        disabled={config.soundEnabled === false}
        onClick={() => {
          prepareClassBoardAudio();
          void playPickerSelected(config.soundVolume);
        }}
      >🔊 선정 소리 미리 듣기</button>
      <p className="class-board-note">현재 학급의 활성 학생 이름만 화면을 열 때 한 번 불러옵니다. 이름 전환은 점점 느려진 뒤 한 명을 확정하며, 뽑기 결과와 순서는 저장하지 않습니다.</p>
    </div>
  );
}
