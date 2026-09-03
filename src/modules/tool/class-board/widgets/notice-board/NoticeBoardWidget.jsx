import React, { useEffect, useState } from 'react';
import { formatSeoulDate } from '../../../../../utils/seoulDate';
import { noticeBoardApi } from './noticeBoardApi';
import { buildNoticeDates, getNeighborNoticeDate } from './noticeHistory';
import { subscribeClassBoardNotice } from './noticeStore';

/*
 * 화면을 열 때 오늘 알림과 최근 날짜 목록을 한 번에 읽는다(요청 1회).
 *
 * `지난 알림` 버튼은 그때 받은 날짜 목록 안에서만 움직이므로 목록을 다시 조회하지 않는다.
 * 아직 펼치지 않은 날짜를 처음 열 때만 그 하루치를 더 읽고, 읽은 날짜는 화면이 열려 있는
 * 동안 기억해 되돌아와도 다시 읽지 않는다. 자동 새로고침·폴링은 하지 않는다.
 * 버튼을 위젯 안에 두었기 때문에 전체화면에서도 그대로 눌러 넘길 수 있다.
 */

const NOTICE_HISTORY_LIMIT = 30; // 매니페스트 requestBudget.maxRows 와 같은 값
const emptyState = { key: '', status: 'loading', today: '', date: '', dates: [], bodies: {} };
const hasBody = (bodies, date) => Object.prototype.hasOwnProperty.call(bodies, date);
// 화면 편집 중에는 위젯 본문이 드래그 손잡이라, 버튼 누름이 이동으로 새지 않게 막는다.
const stopPointer = (event) => event.stopPropagation();

export default function NoticeBoardWidget({ config = {}, classId, dragHandleProps }) {
  const [state, setState] = useState(emptyState);

  useEffect(() => {
    let active = true;
    if (!classId) return () => { active = false; };
    void noticeBoardApi.getNotices(classId, null, NOTICE_HISTORY_LIMIT)
      .then((result) => {
        if (!active) return;
        const today = result?.today || '';
        const date = result?.date || today;
        setState({
          key: classId,
          status: 'ready',
          today,
          date,
          dates: buildNoticeDates(today, result?.recent),
          bodies: { [date]: result?.notice?.body || '' },
        });
      })
      .catch(() => { if (active) setState({ ...emptyState, key: classId, status: 'error' }); });
    return () => { active = false; };
  }, [classId]);

  // 아직 읽지 않은 날짜로 넘겼을 때만 그 하루치를 더 읽는다.
  useEffect(() => {
    const date = state.date;
    if (state.key !== classId || !date || hasBody(state.bodies, date)) return () => {};
    let active = true;
    void noticeBoardApi.getNotices(classId, date, NOTICE_HISTORY_LIMIT)
      .then((result) => {
        if (!active) return;
        setState((current) => (current.key === classId ? {
          ...current,
          status: current.date === date ? 'ready' : current.status,
          dates: buildNoticeDates(current.today, result?.recent),
          bodies: { ...current.bodies, [date]: result?.notice?.body || '' },
        } : current));
      })
      .catch(() => {
        if (!active) return;
        setState((current) => (current.key === classId && current.date === date
          ? { ...current, status: 'error' }
          : current));
      });
    return () => { active = false; };
  }, [classId, state.key, state.date, state.bodies]);

  // 설정창이나 발표 화면에서 알림을 저장하면 다시 읽지 않고 그대로 반영한다.
  useEffect(() => subscribeClassBoardNotice((event) => {
    setState((current) => {
      if (current.key !== classId || !event?.date) return current;
      const body = event.body || '';
      const bodies = { ...current.bodies, [event.date]: body };
      const kept = current.dates.filter((item) => item !== event.date);
      const dates = buildNoticeDates(current.today, body ? [...kept, event.date] : kept);
      // 보고 있던 날짜의 알림이 지워졌으면 오늘로 돌아온다.
      const date = dates.includes(current.date) ? current.date : current.today;
      return { ...current, dates, bodies, date, status: hasBody(bodies, date) ? 'ready' : current.status };
    });
  }), [classId]);

  const current = state.key === classId ? state : { ...emptyState, status: 'loading' };
  const tone = config.tone || 'yellow';
  const heading = config.heading || '알림장';
  const isToday = Boolean(current.today) && current.date === current.today;
  const body = current.bodies[current.date] || '';
  const olderDate = getNeighborNoticeDate(current.dates, current.date, 'older');
  const newerDate = getNeighborNoticeDate(current.dates, current.date, 'newer');

  const show = (date) => {
    if (!date) return;
    setState((prev) => (prev.key === classId
      ? { ...prev, date, status: hasBody(prev.bodies, date) ? 'ready' : 'loading' }
      : prev));
  };

  return (
    <article {...dragHandleProps} className={`class-board-notice class-board-notice--${tone}`}>
      <header>
        <span aria-hidden="true">📒</span>
        <div>
          <small>{formatSeoulDate(current.date)}{isToday ? '' : ' · 지난 알림'}</small>
          <h2>{heading}</h2>
        </div>
        {current.dates.length > 1 ? (
          <nav className="class-board-notice__nav" aria-label="지난 알림 넘기기">
            <button
              type="button"
              title="지난 알림"
              aria-label="지난 알림"
              disabled={!olderDate}
              onPointerDown={stopPointer}
              onClick={() => show(olderDate)}
            >◀</button>
            <button
              type="button"
              title="다음 알림"
              aria-label="다음 알림"
              disabled={!newerDate}
              onPointerDown={stopPointer}
              onClick={() => show(newerDate)}
            >▶</button>
            {!isToday ? (
              <button
                type="button"
                className="class-board-notice__today"
                title="오늘 알림으로 돌아가기"
                onPointerDown={stopPointer}
                onClick={() => show(current.today)}
              >오늘</button>
            ) : null}
          </nav>
        ) : null}
      </header>
      {current.status === 'loading' ? <p className="class-board-notice__state">알림을 불러오는 중…</p> : null}
      {current.status === 'error' ? <p className="class-board-notice__state">알림을 잠시 불러오지 못했습니다.</p> : null}
      {current.status === 'ready' && !body
        ? <p className="class-board-notice__state">{isToday ? '오늘 알림이 아직 없습니다.' : '이 날짜의 알림이 없습니다.'}</p>
        : null}
      {current.status === 'ready' && body ? <div>{body}</div> : null}
    </article>
  );
}
