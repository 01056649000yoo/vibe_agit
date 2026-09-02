import React, { useCallback, useEffect, useState } from 'react';
import { formatSeoulDate } from '../../../../../utils/seoulDate';
import { noticeBoardApi } from './noticeBoardApi';
import { publishClassBoardNotice } from './noticeStore';
import './noticeComposer.css';

/*
 * 날짜별 알림을 쓰고 고치는 부분. 설정창과 발표 화면이 같은 것을 쓴다.
 *
 * 저장은 보드 `저장`과 무관한 별도 RPC라 누르는 즉시 반영된다. 화면을 열 때는 한 번만 읽고,
 * 다른 날짜를 고를 때만 그 날짜를 더 읽는다.
 */

const NOTICE_LIMIT = 2000;
const emptyState = { status: 'loading', today: '', date: '', recent: [], body: '', savedBody: '' };

export default function NoticeComposer({
  classId,
  initialDate = null,
  showRecent = true,
  widgetHint = false,
  onSaved,
}) {
  const [state, setState] = useState(emptyState);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback((date = null) => {
    if (!classId) return;
    setError('');
    setMessage('');
    void noticeBoardApi.getNotices(classId, date)
      .then((result) => setState({
        status: 'ready',
        today: result?.today || '',
        date: result?.date || '',
        recent: Array.isArray(result?.recent) ? result.recent : [],
        body: result?.notice?.body || '',
        savedBody: result?.notice?.body || '',
      }))
      .catch((loadError) => {
        setState((current) => ({ ...current, status: 'ready' }));
        setError(loadError.message || '알림장을 불러오지 못했습니다.');
      });
  }, [classId]);

  useEffect(() => {
    setState(emptyState);
    load(initialDate);
  }, [initialDate, load]);

  const dirty = state.body !== state.savedBody;
  const isToday = Boolean(state.today) && state.date === state.today;
  const hasSaved = state.savedBody.length > 0;

  const write = async (body) => {
    if (!classId || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await noticeBoardApi.saveNotice(classId, state.date, body);
      const savedBody = result?.notice?.body || '';
      setState((current) => {
        const withoutDate = current.recent.filter((item) => item.date !== current.date);
        const nextRecent = savedBody
          ? [{ date: current.date, preview: savedBody.slice(0, 40) }, ...withoutDate]
            .sort((left, right) => String(right.date).localeCompare(String(left.date)))
          : withoutDate;
        return { ...current, body: savedBody, savedBody, recent: nextRecent };
      });
      publishClassBoardNotice({ classId, date: state.date, body: savedBody });
      onSaved?.({ date: state.date, body: savedBody });
      setMessage(savedBody ? '알림을 저장했습니다. 화면에 바로 반영됩니다.' : '이 날짜의 알림을 지웠습니다.');
    } catch (saveError) {
      setError(saveError.message || '알림을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const save = () => { if (dirty) void write(state.body); };

  const remove = () => {
    if (!hasSaved) return;
    const label = formatSeoulDate(state.date) || state.date;
    if (!window.confirm(`${label} 알림을 지울까요? 지우면 교실 화면에서도 사라집니다.`)) return;
    void write('');
  };

  if (state.status === 'loading') return <p className="class-board-note">알림장을 불러오는 중…</p>;

  return (
    <div className="class-board-notice-composer">
      <label>
        <span>알림 날짜</span>
        <div className="class-board-notice-composer__date">
          <input
            type="date"
            value={state.date}
            disabled={saving}
            onChange={(event) => { if (event.target.value) load(event.target.value); }}
          />
          <button type="button" disabled={saving || isToday} onClick={() => load(state.today || null)}>오늘</button>
        </div>
      </label>
      <p className="class-board-note">
        {formatSeoulDate(state.date) || state.date}
        {isToday ? ' · 지금 화면에 보이는 날짜입니다' : ' · 지난 알림을 고치는 중입니다'}
      </p>

      <label>
        <span>알림 내용</span>
        {/* 아이들과 함께 보면서 적는 자리라 입력칸 글씨도 교실에서 읽히는 크기로 둔다. */}
        <textarea
          className="class-board-notice-composer__body"
          maxLength={NOTICE_LIMIT}
          rows={4}
          disabled={saving}
          value={state.body}
          placeholder="예) 내일 준비물은 색연필과 풀입니다."
          onChange={(event) => setState((current) => ({ ...current, body: event.target.value }))}
        />
      </label>

      <div className="class-board-notice-composer__actions">
        <span>{state.body.length} / {NOTICE_LIMIT}자</span>
        <div className="class-board-notice-composer__buttons">
          {hasSaved ? (
            <button type="button" className="class-board-notice-composer__delete" disabled={saving} onClick={remove}>
              삭제
            </button>
          ) : null}
          <button type="button" className="class-board-primary" disabled={saving || !dirty} onClick={save}>
            {saving ? '저장 중…' : '알림 저장'}
          </button>
        </div>
      </div>

      {error ? <p className="class-board-error">{error}</p> : null}
      {message ? <p className="class-board-note is-done">{message}</p> : null}

      {showRecent && state.recent.length > 0 ? (
        <div className="class-board-notice-composer__recent">
          <span>지난 알림</span>
          <ul>
            {state.recent.map((item) => (
              <li key={item.date}>
                <button
                  type="button"
                  disabled={saving || item.date === state.date}
                  aria-current={item.date === state.date}
                  onClick={() => load(item.date)}
                >
                  <strong>{formatSeoulDate(item.date) || item.date}</strong>
                  <small>{item.preview}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="class-board-note">
        알림은 날짜마다 따로 저장되고, 저장하면 교실 화면의 알림장에 바로 나타납니다.
        {widgetHint ? ' 위젯의 제목과 색은 아래에서 정하며 스크린 `저장`을 눌러야 함께 보관됩니다.' : ''}
      </p>
    </div>
  );
}
