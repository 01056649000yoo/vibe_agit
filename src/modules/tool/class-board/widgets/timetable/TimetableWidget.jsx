import React, { useEffect, useState } from 'react';
import { timetableApi } from '../../../class-timetable/timetableApi.js';
import { formatTimetableDate, formatWeekLabel, shortSubjectName, subjectColorIndex } from '../../../class-timetable/timetableModel.js';
import { pickTimetableView } from './timetableView.js';
import '../../../class-timetable/timetableColors.css';
import './timetableWidget.css';

/*
 * 우리 반 스크린 `시간표` 위젯 (2026-09-29).
 * 열 때 이번 주·다음 주를 한 번에 읽고(요청 1회) 오늘·내일(다음 수업일)·이번 주·자동을 그 안에서 그린다.
 * 자동 전환은 1분마다 기기 시계(서울 시각)만 다시 보고 서버에는 다시 묻지 않는다.
 * 시간표는 학급운영도구 › 학급 시간표 관리에서 입력한다.
 */

const seoulHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

// api: 운영은 실제 RPC. src/dev/ 실험실은 메모리 가짜를 넣는다.
export default function TimetableWidget({ config = {}, classId, dragHandleProps, api = timetableApi }) {
  const [state, setState] = useState({ key: '', status: 'loading', today: '', weeks: [] });
  const [hour, setHour] = useState(seoulHour);

  useEffect(() => {
    let active = true;
    if (!classId) return () => { active = false; };
    void api.get(classId, null, 2)
      .then((result) => { if (active) setState({ key: classId, status: 'ready', today: result.today, weeks: result.weeks || [] }); })
      .catch(() => { if (active) setState({ key: classId, status: 'error', today: '', weeks: [] }); });
    return () => { active = false; };
  }, [api, classId]);

  // 자동 전환은 기기 시계만 본다(서버에 다시 묻지 않음).
  useEffect(() => {
    if ((config.view || 'auto') !== 'auto') return undefined;
    const timer = window.setInterval(() => setHour(seoulHour()), 60_000);
    return () => window.clearInterval(timer);
  }, [config.view]);

  const current = state.key === classId ? state : { status: 'loading' };
  const tone = config.tone || 'sky';
  const heading = config.heading || '시간표';
  const view = current.status === 'ready'
    ? pickTimetableView({ view: config.view || 'auto', switchHour: Number(config.switchHour) || 13, today: current.today, hour, weeks: current.weeks })
    : null;

  const subtitle = view?.kind === 'week'
    ? formatWeekLabel(view.weekStart)
    : view?.date ? `${view.label} · ${formatTimetableDate(view.date)}` : '';

  return (
    <article {...dragHandleProps} className={`class-board-timetable class-board-timetable--${tone}`}>
      <header>
        <span aria-hidden="true">🗓️</span>
        <div>
          {subtitle ? <small>{subtitle}{view?.changed ? ' · 바뀐 시간표' : ''}</small> : null}
          <h2>{heading}</h2>
        </div>
      </header>

      {current.status === 'loading' ? <p className="class-board-timetable__state">시간표를 불러오는 중…</p> : null}
      {current.status === 'error' ? <p className="class-board-timetable__state">시간표를 잠시 불러오지 못했습니다.</p> : null}
      {view?.kind === 'empty' && view.reason === 'no-timetable' ? (
        <p className="class-board-timetable__state">학급운영도구 › 학급 시간표 관리에서 시간표를 입력해 주세요.</p>
      ) : null}
      {view?.kind === 'empty' && view.reason === 'no-class' ? (
        <p className="class-board-timetable__state">이날은 입력한 수업이 없습니다.</p>
      ) : null}

      {view?.kind === 'day' ? (
        <ol className="class-board-timetable__day" style={{ '--rows': view.rows + (view.lunchAfter < view.rows ? 1 : 0) }}>
          {view.cells.map((cell, index) => (
            <React.Fragment key={index}>
              <li className={cell?.s ? `class-timetable-subject--${subjectColorIndex(cell.s)}` : 'is-empty'}>
                <span>{index + 1}교시</span>
                <strong>{cell?.s || '—'}</strong>
                {cell?.m ? <small>{cell.m}</small> : null}
              </li>
              {index + 1 === view.lunchAfter && index + 1 < view.rows ? (
                <li className="is-lunch"><span>🍚</span><strong>점심시간</strong></li>
              ) : null}
            </React.Fragment>
          ))}
        </ol>
      ) : null}

      {view?.kind === 'week' ? (
        <table className="class-board-timetable__week" style={{ '--rows': view.rows + (view.lunchAfter < view.rows ? 1 : 0) + 1, '--cols': view.days.length + 1 }}>
          <thead>
            <tr>
              <th aria-label="교시" />
              {view.days.map((day, index) => (
                <th key={day.id} className={index === view.todayIndex ? 'is-today' : undefined}>{day.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: view.rows }, (_, period) => (
              <React.Fragment key={period}>
                <tr>
                  <th>{period + 1}</th>
                  {view.days.map((day, index) => {
                    const cell = view.cells[index][period];
                    return (
                      <td
                        key={day.id}
                        className={[
                          cell?.s ? `class-timetable-subject--${subjectColorIndex(cell.s)}` : 'is-empty',
                          index === view.todayIndex ? 'is-today' : '',
                        ].filter(Boolean).join(' ')}
                        title={cell?.s ? `${cell.s}${cell.m ? ` · ${cell.m}` : ''}` : undefined}
                      ><span>{cell?.s ? shortSubjectName(cell.s) : ''}</span></td>
                    );
                  })}
                </tr>
                {period + 1 === view.lunchAfter && period + 1 < view.rows ? (
                  <tr className="is-lunch"><th>🍚</th><td colSpan={view.days.length}>점심시간</td></tr>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      ) : null}
    </article>
  );
}
