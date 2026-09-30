import React, { useEffect, useRef, useState } from 'react';
import { timetableApi } from '../../../class-timetable/timetableApi.js';
import { formatTimetableDate, formatWeekLabel, shortSubjectName, subjectColorIndex } from '../../../class-timetable/timetableModel.js';
import useFittedWidgetBox from '../useFittedWidgetBox';
import { pickTimetableView } from './timetableView.js';
import '../../../class-timetable/timetableColors.css';
import './timetableWidget.css';

/*
 * 우리 반 스크린 `시간표` 위젯 (2026-09-29).
 * 열 때 이번 주·다음 주를 한 번에 읽고(요청 1회) 오늘·내일(다음 수업일)·오늘·내일 한 번에·이번 주·자동을
 * 그 안에서 그린다. 자동 전환은 1분마다 기기 시계(서울 시각)만 다시 보고 서버에는 다시 묻지 않는다.
 * 시간표는 학급운영도구 › 학급 시간표 관리에서 입력한다.
 *
 * 글씨(2026-09-30 선생님 요청 — 과목만 있으면 오른쪽이 비었다): 하루치 목록은 공용 맞춤 부품이 가로·세로 모두
 * 넘치지 않는 가장 큰 글씨를 찾는다. 가로로 넓은 위젯이면 교시를 두 줄로 나눠 세워 글씨가 더 커진다(CSS).
 */

const seoulHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));

// 글자 바닥 0.8rem(디자인 가이드) = 12.8px.
const MIN_TEXT_PX = 12.8;

const dayLabel = (day) => {
  if (!day?.date) return '';
  return day.label ? `${day.label} · ${formatTimetableDate(day.date)}` : formatTimetableDate(day.date);
};

// 화면 편집 중에는 위젯 본문이 끌기 손잡이라, 단추 누름이 이동으로 새지 않게 막는다(알림장 위젯과 같다).
const stopPointer = (event) => event.stopPropagation();

/* 주 목록 합치기(같은 주는 새 것으로). */
const mergeWeeks = (current, incoming) => {
  const byStart = new Map((current || []).map((week) => [week.weekStart, week]));
  (incoming || []).forEach((week) => { if (week?.weekStart) byStart.set(week.weekStart, week); });
  return [...byStart.values()];
};

/** 하루치 목록. 점심 줄은 그날 마지막 수업 전일 때만. */
function DayList({ day }) {
  const items = day.rows + (day.lunchAfter < day.rows ? 1 : 0);
  return (
    <ol className="class-board-timetable__day" style={{ '--rows': items, '--half': Math.ceil(items / 2) }}>
      {day.cells.map((cell, index) => (
        <React.Fragment key={index}>
          <li className={cell?.s ? `class-timetable-subject--${subjectColorIndex(cell.s)}` : 'is-empty'}>
            <span>{index + 1}교시</span>
            <strong>{cell?.s || '—'}</strong>
            {cell?.m ? <small>{cell.m}</small> : null}
          </li>
          {index + 1 === day.lunchAfter && index + 1 < day.rows ? (
            <li className="is-lunch"><span>🍚</span><strong>점심시간</strong></li>
          ) : null}
        </React.Fragment>
      ))}
    </ol>
  );
}

function DayState({ day }) {
  if (day.reason === 'no-class') return <p className="class-board-timetable__state">이날은 입력한 수업이 없습니다.</p>;
  return <p className="class-board-timetable__state">학급운영도구 › 학급 시간표 관리에서 시간표를 입력해 주세요.</p>;
}

// api: 운영은 실제 RPC. src/dev/ 실험실은 메모리 가짜를 넣는다.
export default function TimetableWidget({ config = {}, classId, dragHandleProps, api = timetableApi }) {
  const [state, setState] = useState({ key: '', status: 'loading', today: '', weeks: [] });
  const [hour, setHour] = useState(seoulHour);
  // 화살표로 옮긴 칸 수(2026-09-30). 보기를 바꾸면 0 으로 돌아온다(보기 이름과 함께 기억).
  const [nav, setNav] = useState({ view: '', shift: 0 });
  const requestedWeeksRef = useRef(new Set());

  useEffect(() => {
    let active = true;
    if (!classId) return () => { active = false; };
    void api.get(classId, null, 2)
      .then((result) => {
        if (!active) return;
        requestedWeeksRef.current = new Set((result.weeks || []).map((week) => week.weekStart));
        setState({ key: classId, status: 'ready', today: result.today, weeks: result.weeks || [] });
      })
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
  const viewName = config.view || 'auto';
  const shift = nav.view === viewName ? nav.shift : 0;
  const move = (step) => setNav({ view: viewName, shift: step === 0 ? 0 : shift + step });
  const view = current.status === 'ready'
    ? pickTimetableView({ view: viewName, switchHour: Number(config.switchHour) || 13, today: current.today, hour, weeks: current.weeks, shift })
    : null;

  // 화살표로 이번 주·다음 주 밖으로 가면 그 주만 한 번 더 읽는다(읽은 주는 기억해 다시 묻지 않는다).
  const neededWeek = view?.kind === 'need-week' ? view.weekStart : '';
  useEffect(() => {
    if (!neededWeek || !classId || requestedWeeksRef.current.has(neededWeek)) return undefined;
    requestedWeeksRef.current.add(neededWeek);
    let active = true;
    void api.get(classId, neededWeek, 1)
      .then((result) => { if (active) setState((prev) => ({ ...prev, weeks: mergeWeeks(prev.weeks, result.weeks) })); })
      // 못 읽으면 빈 주로 두어 `시간표를 입력해 주세요` 로 보인다(같은 주를 계속 다시 묻지 않게).
      .catch(() => { if (active) setState((prev) => ({ ...prev, weeks: mergeWeeks(prev.weeks, [{ weekStart: neededWeek, cells: null }]) })); });
    return () => { active = false; };
  }, [api, classId, neededWeek]);

  // 하루치 목록(하루·이틀)의 글씨는 넘치지 않는 가장 큰 크기. 내용이 바뀔 때와 틀 크기가 바뀔 때 다시 잰다.
  const fitSignature = view?.kind === 'day' || view?.kind === 'pair' ? JSON.stringify(view) : '';
  // 배치 후보를 모두 재 보고 글씨가 가장 크게 나오는 것을 고른다: 하루는 한 줄/두 줄, 이틀은 좌우/위아래 × 날마다 한 줄/두 줄.
  const bodyRef = useFittedWidgetBox(fitSignature, {
    property: '--timetable-text-size',
    minSize: MIN_TEXT_PX,
    layouts: view?.kind === 'pair' ? 'side,stack,side-two,stack-two' : 'one,two',
  });

  const subtitle = view?.kind === 'week'
    ? formatWeekLabel(view.weekStart)
    : view?.kind === 'day' ? dayLabel(view) : '';

  return (
    <article {...dragHandleProps} className={`class-board-timetable class-board-timetable--${tone}`}>
      <header>
        <span aria-hidden="true">🗓️</span>
        <div>
          {subtitle ? <small>{subtitle}{view?.changed ? ' · 바뀐 시간표' : ''}</small> : null}
          <h2>{heading}</h2>
        </div>
        {current.status === 'ready' ? (
          <nav className="class-board-timetable__nav" aria-label={viewName === 'week' ? '다른 주 시간표 보기' : '다른 날 시간표 보기'}>
            <button type="button" aria-label={viewName === 'week' ? '지난주' : '이전 수업일'} title={viewName === 'week' ? '지난주' : '이전 수업일'} onPointerDown={stopPointer} onClick={() => move(-1)}>◀</button>
            {shift !== 0 ? (
              <button type="button" className="class-board-timetable__back" onPointerDown={stopPointer} onClick={() => move(0)}>{viewName === 'week' ? '이번 주' : '오늘로'}</button>
            ) : null}
            <button type="button" aria-label={viewName === 'week' ? '다음 주' : '다음 수업일'} title={viewName === 'week' ? '다음 주' : '다음 수업일'} onPointerDown={stopPointer} onClick={() => move(1)}>▶</button>
          </nav>
        ) : null}
      </header>

      {current.status === 'loading' ? <p className="class-board-timetable__state">시간표를 불러오는 중…</p> : null}
      {current.status === 'error' ? <p className="class-board-timetable__state">시간표를 잠시 불러오지 못했습니다.</p> : null}
      {view?.kind === 'empty' ? <DayState day={view} /> : null}
      {view?.kind === 'need-week' ? <p className="class-board-timetable__state">그 주 시간표를 불러오는 중…</p> : null}

      {view?.kind === 'day' ? (
        <div ref={bodyRef} className="class-board-timetable__body">
          <DayList day={view} />
        </div>
      ) : null}

      {view?.kind === 'pair' ? (
        <div ref={bodyRef} className="class-board-timetable__body class-board-timetable__pair">
          {view.days.map((day) => (
            <section key={day.date || day.label} className="class-board-timetable__pair-day">
              <h3>{dayLabel(day)}{day.changed ? ' · 바뀐 시간표' : ''}</h3>
              {day.kind === 'day' ? <DayList day={day} /> : <DayState day={day} />}
            </section>
          ))}
        </div>
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
                    const cell = view.cells.at(index).at(period);
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
