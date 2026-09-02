import React, { useEffect, useState } from 'react';
import { formatSeoulDate } from '../../../../../utils/seoulDate';
import { noticeBoardApi } from './noticeBoardApi';
import { subscribeClassBoardNotice } from './noticeStore';

const emptyState = { key: '', status: 'loading', today: '', body: '' };

export default function NoticeBoardWidget({ config = {}, classId, dragHandleProps }) {
  const [state, setState] = useState(emptyState);

  // 화면을 열 때 오늘 알림 한 번만 읽는다. 자동 새로고침은 하지 않는다.
  useEffect(() => {
    let active = true;
    if (!classId) return () => { active = false; };
    void noticeBoardApi.getNotices(classId)
      .then((result) => {
        if (!active) return;
        setState({
          key: classId,
          status: 'ready',
          today: result?.today || '',
          body: result?.notice?.body || '',
        });
      })
      .catch(() => { if (active) setState({ ...emptyState, key: classId, status: 'error' }); });
    return () => { active = false; };
  }, [classId]);

  // 설정창이나 발표 화면에서 오늘 알림을 저장하면 다시 읽지 않고 그대로 반영한다.
  useEffect(() => subscribeClassBoardNotice((event) => {
    setState((current) => {
      if (event.classId !== classId || !current.today || event.date !== current.today) return current;
      return { ...current, status: 'ready', body: event.body };
    });
  }), [classId]);

  const current = state.key === classId ? state : { ...emptyState, status: 'loading' };
  const tone = config.tone || 'yellow';
  const heading = config.heading || '알림장';

  return (
    <article {...dragHandleProps} className={`class-board-notice class-board-notice--${tone}`}>
      <header>
        <span aria-hidden="true">📒</span>
        <div>
          <small>{formatSeoulDate(current.today)}</small>
          <h2>{heading}</h2>
        </div>
      </header>
      {current.status === 'loading' ? <p className="class-board-notice__state">알림을 불러오는 중…</p> : null}
      {current.status === 'error' ? <p className="class-board-notice__state">알림을 잠시 불러오지 못했습니다.</p> : null}
      {current.status === 'ready' && !current.body
        ? <p className="class-board-notice__state">오늘 알림이 아직 없습니다.</p>
        : null}
      {current.status === 'ready' && current.body ? <div>{current.body}</div> : null}
    </article>
  );
}
