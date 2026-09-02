import React, { useCallback, useEffect, useState } from 'react';
import { readLocalStorageJson, writeLocalStorageJson } from '../../../../../lib/browserStorage';
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

/*
 * 입력칸 글씨 크기는 교사가 고른다. 아이들과 함께 보면서 적는 자리라 기본을 가장 큰 계단에 둔다.
 * 고른 값은 이 브라우저에만 남는 화면 편의 설정이다(내용이 아니므로 서버에 저장하지 않는다).
 */
const FONT_STORAGE_KEY = 'class_board_notice_font';
const FONT_STEPS = Object.freeze([
  Object.freeze({ id: 'lg', label: '보통', size: 'var(--ui-text-lg)' }),
  Object.freeze({ id: 'xl', label: '크게', size: 'var(--ui-text-xl)' }),
  Object.freeze({ id: '3xl', label: '더 크게', size: 'var(--ui-text-3xl)' }),
  // 가장 큰 단계는 공용 글자 계단의 맨 위(2rem)보다 크다. 계단을 흔들지 않으려고
  // 이 부품 안에서만 쓰는 값으로 두었다(정의는 noticeComposer.css).
  Object.freeze({ id: 'display', label: '아주 크게', size: 'var(--notice-input-display)' }),
]);
const DEFAULT_FONT_STEP = 'display';
const getFontStep = (id) => FONT_STEPS.find((step) => step.id === id) || FONT_STEPS.at(-1);

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
  const [fontStepId, setFontStepId] = useState(() => {
    const saved = readLocalStorageJson(FONT_STORAGE_KEY, null);
    return FONT_STEPS.some((step) => step.id === saved) ? saved : DEFAULT_FONT_STEP;
  });

  const chooseFontStep = (id) => {
    setFontStepId(id);
    writeLocalStorageJson(FONT_STORAGE_KEY, id);
  };

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
        <div className="class-board-notice-composer__body-heading">
          <span>알림 내용</span>
          {/* 아이들과 함께 보면서 적는 자리라 입력칸 글씨 크기를 교사가 고른다. */}
          <div className="class-board-notice-composer__font" role="group" aria-label="입력 글씨 크기">
            {FONT_STEPS.map((step) => (
              <button
                key={step.id}
                type="button"
                className={step.id === fontStepId ? 'is-active' : undefined}
                aria-pressed={step.id === fontStepId}
                title={`입력 글씨 ${step.label}`}
                onClick={() => chooseFontStep(step.id)}
              >{step.label}</button>
            ))}
          </div>
        </div>
        <textarea
          className="class-board-notice-composer__body"
          style={{ fontSize: getFontStep(fontStepId).size }}
          maxLength={NOTICE_LIMIT}
          rows={3}
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
