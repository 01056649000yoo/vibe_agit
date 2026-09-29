import React from 'react';
import { TIMETABLE_SWITCH_HOURS, TIMETABLE_WIDGET_TONES, TIMETABLE_WIDGET_VIEWS } from './timetableWidgetOptions';

export default function TimetableSettings({ config = {}, onChange }) {
  const update = (patch) => onChange({ ...config, ...patch });
  const view = config.view || 'auto';
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>제목</span>
        <input maxLength={80} value={config.heading || ''} onChange={(event) => update({ heading: event.target.value })} />
      </label>
      <fieldset className="class-board-text-size">
        <legend>보여 줄 시간표</legend>
        <div role="group" aria-label="보여 줄 시간표">
          {TIMETABLE_WIDGET_VIEWS.map((item) => (
            <button key={item.id} type="button" aria-pressed={view === item.id} title={item.note} onClick={() => update({ view: item.id })}>
              {item.label}
            </button>
          ))}
        </div>
      </fieldset>
      {view === 'auto' ? (
        <label>
          <span>이 시각부터 다음 수업일 시간표</span>
          <select value={Number(config.switchHour) || 13} onChange={(event) => update({ switchHour: Number(event.target.value) })}>
            {TIMETABLE_SWITCH_HOURS.map((hour) => (
              <option key={hour} value={hour}>{hour < 12 ? `오전 ${hour}시` : hour === 12 ? '낮 12시' : `오후 ${hour - 12}시`}</option>
            ))}
          </select>
        </label>
      ) : null}
      <label>
        <span>분위기</span>
        <select value={config.tone || 'sky'} onChange={(event) => update({ tone: event.target.value })}>
          {TIMETABLE_WIDGET_TONES.map((tone) => <option key={tone.id} value={tone.id}>{tone.label}</option>)}
        </select>
      </label>
      <p className="class-board-note">
        `내일`은 다음 수업일입니다(금요일에는 월요일). 시간표 내용은 학급운영도구의 `학급 시간표 관리`에서 입력하고,
        그 주에만 바뀐 수업도 거기서 고치면 이 위젯에 바로 반영됩니다(스크린을 다시 열 때).
      </p>
    </div>
  );
}
