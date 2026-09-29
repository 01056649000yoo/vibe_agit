import React, { useCallback, useEffect, useRef, useState } from 'react';
import useConfirmDialog from '../../../../../components/common/useConfirmDialog';
import { readLocalStorageJson, writeLocalStorageJson } from '../../../../../lib/browserStorage';
import { formatSeoulDate } from '../../../../../utils/seoulDate';
import { noticeBoardApi } from './noticeBoardApi';
import { publishClassBoardNotice } from './noticeStore';
import {
  DEFAULT_NOTICE_TEMPLATES,
  MAX_NOTICE_TEMPLATE_NAME,
  isNoticeTemplateEmpty,
  noticeTemplateLabel,
  normalizeNoticeTemplates,
  validateNoticeTemplate,
  withNoticeTemplateAt,
} from './noticeTemplates';
import { loadNoticeTemplates, saveNoticeTemplates } from './noticeTemplateStore';
import { findPreviousNoticeDate, isHeldNotice, NOTICE_AUTOSAVE_DELAY_MS, shouldAutoSaveNotice } from './noticeAutosave';

const defaultTemplateStore = Object.freeze({ load: loadNoticeTemplates, save: saveNoticeTemplates });
import './noticeComposer.css';

/*
 * 날짜별 알림을 쓰고 고치는 부분. 설정창·발표 화면·알림장 도구가 같은 것을 쓴다.
 *
 * 저장은 보드 `저장`과 무관한 별도 RPC다. 2026-09-29 부터 **치는 대로 자동 저장**한다 —
 * 입력을 멈추고 잠시 뒤 한 번 저장하고, 교실 화면(다른 창 포함)에 바로 나간다.
 * 규칙은 `noticeAutosave.js` 한 곳에 있다: 빈 입력칸은 저장하지 않는다(지우기는 `삭제` 단추로만).
 * 화면을 열 때는 한 번만 읽고, 다른 날짜나 지난 알림을 고를 때만 그 날짜를 더 읽는다.
 */

const NOTICE_LIMIT = 2000;
/*
 * `held`: 서식·지난 알림으로 채운 내용. 한 글자라도 고치기 전에는 저장하지 않는다 — 불러온 즉시 저장하면
 * 채우지 않은 빈 틀이 교실 화면에 그대로 걸린다. 그대로 쓰려면 `이대로 저장`.
 */
const emptyState = { status: 'loading', today: '', date: '', recent: [], body: '', savedBody: '', held: null };

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

const SAVE_STATUS_TEXT = Object.freeze({
  held: '가져온 내용입니다 · 고치면 자동으로 저장됩니다',
  pending: '입력 중…',
  saving: '저장 중…',
  saved: '저장됨 · 교실 화면에 나갔습니다',
  empty: '비어 있어 저장하지 않았습니다 · 알림을 지우려면 `삭제`',
  error: '저장하지 못했습니다',
});

export default function NoticeComposer({
  classId,
  initialDate = null,
  showRecent = true,
  widgetHint = false,
  /* `sheet`: 화면 전체로 여는 알림장 쓰기(발표 화면). 입력칸이 남는 높이를 모두 쓴다. */
  variant = 'panel',
  autoFocus = false,
  onSaved,
  /*
   * 알림장·서식을 읽고 쓰는 통로는 밖에서 넣을 수 있다. 운영에서는 기본값(실제 RPC)을 쓰고,
   * `src/dev/` 미리보기는 DB 없이 화면만 보려고 샘플을 넣는다.
   */
  api = noticeBoardApi,
  templateStore = defaultTemplateStore,
}) {
  const [state, setState] = useState(emptyState);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [busy, setBusy] = useState(false);
  /*
   * 서식은 알림 본문과 **다른 곳에 저장된다**(교사 프로필). 펼치기 전에는 읽지 않는다 —
   * 알림장을 열 때마다 미리 읽으면 서식을 쓰지 않는 교사에게도 조회가 한 번씩 붙는다.
   */
  const [templates, setTemplates] = useState(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [message, setMessage] = useState('');
  /*
   * 묻는 것은 앱 안 창으로(2026-09-29 점검). 브라우저 기본 창(confirm·prompt)은 크롬에서 전체화면을 강제로 풀어,
   * 교실 화면에서 알림장을 쓰다가 전체화면이 풀렸다. 서식 이름은 그 줄 안의 입력칸으로 받는다.
   */
  const { ask, confirmDialog } = useConfirmDialog();
  const [naming, setNaming] = useState(null);
  const [error, setError] = useState('');
  const [fontStepId, setFontStepId] = useState(() => {
    const saved = readLocalStorageJson(FONT_STORAGE_KEY, null);
    return FONT_STEPS.some((step) => step.id === saved) ? saved : DEFAULT_FONT_STEP;
  });

  // 자동 저장은 타이머·요청이 화면 그리기와 어긋나므로 최신 값을 ref 로 본다.
  const latestRef = useRef(state);
  latestRef.current = state;
  const timerRef = useRef(0);
  const inFlightRef = useRef(null);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const chooseFontStep = (id) => {
    setFontStepId(id);
    writeLocalStorageJson(FONT_STORAGE_KEY, id);
  };

  const applySaved = (date, savedBody, { replaceBody = false } = {}) => {
    setState((current) => {
      if (current.date !== date) return current;
      const withoutDate = current.recent.filter((item) => item.date !== date);
      const nextRecent = savedBody
        ? [{ date, preview: savedBody.slice(0, 40) }, ...withoutDate]
          .sort((left, right) => String(right.date).localeCompare(String(left.date)))
        : withoutDate;
      // 자동 저장 뒤에는 입력칸을 건드리지 않는다 — 서버가 끝 빈칸을 잘라 돌려주므로 덮으면 치던 띄어쓰기가 사라진다.
      return { ...current, savedBody, recent: nextRecent, ...(replaceBody ? { body: savedBody } : {}) };
    });
  };

  /* 한 번에 하나만 보낸다. 보내는 동안 더 친 글은 끝난 뒤 다시 본다. */
  const persist = useCallback(async ({ date, body }, { replaceBody = false } = {}) => {
    if (!classId || !date) return false;
    setSaveStatus('saving');
    setError('');
    const request = (async () => {
      const result = await api.saveNotice(classId, date, body);
      return result?.notice?.body || '';
    })();
    inFlightRef.current = request;
    try {
      const savedBody = await request;
      const wasNew = !latestRef.current.savedBody && Boolean(savedBody);
      applySaved(date, savedBody, { replaceBody });
      publishClassBoardNotice({ classId, date, body: savedBody });
      // 알림장 도구의 날짜 목록은 알림이 새로 생기거나 없어질 때만 다시 읽는다(치는 동안 매번 읽지 않는다).
      if (wasNew || !savedBody || replaceBody) onSavedRef.current?.({ date, body: savedBody });
      setSaveStatus(savedBody ? 'saved' : 'idle');
      return true;
    } catch (saveError) {
      setSaveStatus('error');
      setError(saveError.message || '알림을 저장하지 못했습니다.');
      return false;
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  }, [api, classId]);

  const flush = useCallback(async () => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; }
    if (inFlightRef.current) await inFlightRef.current.catch(() => {});
    const { date, body, savedBody, status, held } = latestRef.current;
    if (status !== 'ready' || isHeldNotice(body, held)) return true;
    const decision = shouldAutoSaveNotice(body, savedBody);
    if (decision === 'empty') { setSaveStatus('empty'); return true; }
    if (decision !== 'save') return true;
    return persist({ date, body });
  }, [persist]);

  // 입력이 멈추면 저장한다.
  useEffect(() => {
    if (state.status !== 'ready') return undefined;
    const decision = shouldAutoSaveNotice(state.body, state.savedBody);
    if (decision === 'unchanged') return undefined;
    if (isHeldNotice(state.body, state.held)) { setSaveStatus('held'); return undefined; }
    if (decision === 'empty') { setSaveStatus('empty'); return undefined; }
    setSaveStatus('pending');
    timerRef.current = window.setTimeout(() => { timerRef.current = 0; void flush(); }, NOTICE_AUTOSAVE_DELAY_MS);
    return () => { if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; } };
  }, [state.body, state.savedBody, state.status, state.held, flush]);

  // 창을 닫거나 다른 화면으로 가도 친 글은 남긴다(응답은 기다리지 않는다).
  useEffect(() => () => {
    const { date, body, savedBody, status, held } = latestRef.current;
    if (status !== 'ready' || isHeldNotice(body, held)) return;
    if (shouldAutoSaveNotice(body, savedBody) !== 'save' || !classId || !date) return;
    void api.saveNotice(classId, date, body)
      .then((result) => publishClassBoardNotice({ classId, date, body: result?.notice?.body || '' }))
      .catch(() => {});
  }, [api, classId]);

  const load = useCallback((date = null) => {
    if (!classId) return;
    setError('');
    setMessage('');
    setSaveStatus('idle');
    void api.getNotices(classId, date)
      .then((result) => setState({
        status: 'ready',
        today: result?.today || '',
        date: result?.date || '',
        recent: Array.isArray(result?.recent) ? result.recent : [],
        body: result?.notice?.body || '',
        savedBody: result?.notice?.body || '',
        held: null,
      }))
      .catch((loadError) => {
        setState((current) => ({ ...current, status: 'ready' }));
        setError(loadError.message || '알림장을 불러오지 못했습니다.');
      });
  }, [api, classId]);

  useEffect(() => {
    setState(emptyState);
    load(initialDate);
  }, [initialDate, load]);

  /* 다른 날짜로 가기 전에 쓰던 것을 먼저 저장한다. */
  const switchDate = async (date) => {
    setBusy(true);
    try {
      await flush();
      load(date);
    } finally {
      setBusy(false);
    }
  };

  const dirty = state.body.trim() !== state.savedBody.trim();
  const isToday = Boolean(state.today) && state.date === state.today;
  const hasSaved = state.savedBody.length > 0;
  const previousDate = findPreviousNoticeDate(state.recent, state.date);

  /* ── 지난 알림 가져오기 ─────────────────────────────────────────────────
   * 가장 최근에 알림을 쓴 날(보고 있는 날짜보다 앞)의 내용을 입력칸에 채운다. 주말·방학을 건너도
   * "어제"가 아니라 "마지막으로 쓴 날"이다. 목록에는 미리보기만 있어 그 날짜를 한 번 더 읽는다.
   */
  const importPrevious = async () => {
    if (!previousDate || busy) return;
    if (state.body.trim() && !(await ask({ title: '쓰던 내용 대신 지난 알림을 넣을까요?', confirmLabel: '넣기' }))) return;
    setBusy(true);
    setError('');
    try {
      const result = await api.getNotices(classId, previousDate);
      const body = result?.notice?.body || '';
      if (!body) { setError('가져올 지난 알림이 없습니다.'); return; }
      setState((current) => ({ ...current, body, held: body }));
      setMessage(`${formatSeoulDate(previousDate) || previousDate} 알림을 가져왔습니다. 고치면 자동으로 저장됩니다.`);
    } catch (loadError) {
      setError(loadError.message || '지난 알림을 가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /* 가져온 내용을 고치지 않고 그대로 쓴다. */
  const saveHeld = () => {
    const { date, body } = latestRef.current;
    setState((current) => ({ ...current, held: null }));
    void persist({ date, body });
  };

  /* ── 서식 ─────────────────────────────────────────────────────────────────
   * 불러오기는 **입력칸을 채울 뿐 바로 저장하지 않는다**(held). 고치기 시작하면 자동 저장된다.
   * 쓰던 글이 있으면 먼저 물어본다.
   */
  const openTemplates = () => {
    setTemplateOpen((open) => !open);
    if (templates || templateBusy) return;
    setTemplateBusy(true);
    void templateStore.load()
      .then((loaded) => setTemplates(loaded))
      .catch((loadError) => setError(loadError.message || '서식을 불러오지 못했습니다.'))
      .finally(() => setTemplateBusy(false));
  };

  const applyTemplate = async (template) => {
    if (isNoticeTemplateEmpty(template)) return;
    if (dirty && !(await ask({ title: '쓰던 내용이 사라집니다. 서식을 불러올까요?', confirmLabel: '불러오기' }))) return;
    setState((current) => ({ ...current, body: template.body, held: template.body }));
    setMessage('서식을 불러왔습니다. 고치면 자동으로 저장됩니다.');
  };

  const persistTemplates = async (next, done) => {
    const previous = templates;
    setTemplates(next);
    setTemplateBusy(true);
    setError('');
    try {
      await templateStore.save(next);
      setMessage(done);
    } catch (saveError) {
      setTemplates(previous);
      setError(saveError.message || '서식을 저장하지 못했습니다.');
    } finally {
      setTemplateBusy(false);
    }
  };

  const startNaming = (index) => setNaming({ index, name: templates?.at(index)?.name || '' });

  const storeTemplate = (index, rawName) => {
    const name = String(rawName || '').slice(0, MAX_NOTICE_TEMPLATE_NAME);
    setNaming(null);
    const candidate = { name, body: state.body };
    const invalid = validateNoticeTemplate(candidate);
    if (invalid) { setError(invalid); return; }
    void persistTemplates(withNoticeTemplateAt(templates, index, candidate),
      `지금 내용을 ${noticeTemplateLabel(candidate, index)}에 저장했습니다.`);
  };

  const clearTemplate = async (index) => {
    if (!(await ask({ title: `${noticeTemplateLabel(templates?.at(index), index)}을(를) 비울까요?`, confirmLabel: '비우기', tone: 'danger' }))) return;
    void persistTemplates(withNoticeTemplateAt(templates, index, { name: '', body: '' }), '서식을 비웠습니다.');
  };

  const fillDefaults = () => void persistTemplates(
    normalizeNoticeTemplates(DEFAULT_NOTICE_TEMPLATES), '기본 서식을 담았습니다. 자유롭게 고쳐 쓰세요.');

  const remove = async () => {
    if (!hasSaved) return;
    const label = formatSeoulDate(state.date) || state.date;
    if (!(await ask({ title: `${label} 알림을 지울까요?`, body: '지우면 교실 화면에서도 사라집니다.', confirmLabel: '지우기', tone: 'danger' }))) return;
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; }
    if (inFlightRef.current) await inFlightRef.current.catch(() => {});
    if (await persist({ date: state.date, body: '' }, { replaceBody: true })) setMessage('이 날짜의 알림을 지웠습니다.');
  };

  if (state.status === 'loading') return <p className="class-board-note">알림장을 불러오는 중…</p>;

  const disabled = busy;
  const statusText = Reflect.get(SAVE_STATUS_TEXT, saveStatus) || '';

  return (
    <div className={`class-board-notice-composer class-board-notice-composer--${variant}`}>
      <div className="class-board-notice-composer__toolbar">
        <label>
          <span>알림 날짜</span>
          <div className="class-board-notice-composer__date">
            <input
              type="date"
              value={state.date}
              disabled={disabled}
              onChange={(event) => { if (event.target.value) void switchDate(event.target.value); }}
            />
            <button type="button" disabled={disabled || isToday} onClick={() => void switchDate(state.today || null)}>오늘</button>
          </div>
        </label>
        <button
          type="button"
          className="class-board-notice-composer__import"
          disabled={disabled || !previousDate}
          title={previousDate ? `${formatSeoulDate(previousDate) || previousDate} 알림을 입력칸에 넣습니다` : '가져올 지난 알림이 없습니다'}
          onClick={() => void importPrevious()}
        >📋 지난 알림 가져오기{previousDate ? ` (${formatSeoulDate(previousDate) || previousDate})` : ''}</button>
      </div>
      <p className="class-board-note">
        {formatSeoulDate(state.date) || state.date}
        {isToday ? ' · 지금 화면에 보이는 날짜입니다' : ' · 지난 알림을 고치는 중입니다'}
      </p>

      {/* 되풀이해 쓰는 틀을 서식 1·2·3 으로 저장해 두고 불러 쓴다. 펼친 뒤에야 읽는다. */}
      <div className="class-board-notice-composer__templates">
        <button
          type="button"
          className="class-board-notice-composer__templates-toggle"
          aria-expanded={templateOpen}
          disabled={disabled}
          onClick={openTemplates}
        >{templateOpen ? '▾' : '▸'} 서식 불러오기 · 저장</button>

        {templateOpen ? (
          <div className="class-board-notice-composer__templates-body">
            {templateBusy && !templates ? <p className="class-board-note">서식을 불러오는 중…</p> : null}
            {templates ? (
              <>
                <ul>
                  {templates.map((template, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        className="class-board-notice-composer__template-load"
                        disabled={disabled || templateBusy || isNoticeTemplateEmpty(template)}
                        title={isNoticeTemplateEmpty(template) ? '비어 있는 칸입니다' : template.body.slice(0, 60)}
                        onClick={() => void applyTemplate(template)}
                      >
                        <strong>{noticeTemplateLabel(template, index)}</strong>
                        <small>{isNoticeTemplateEmpty(template) ? '비어 있음' : template.body.replace(/\n+/gu, ' ').slice(0, 24)}</small>
                      </button>
                      {naming?.index === index ? (
                        <form
                          className="class-board-notice-composer__template-name"
                          onSubmit={(event) => { event.preventDefault(); storeTemplate(index, naming.name); }}
                        >
                          <input
                            autoFocus
                            value={naming.name}
                            maxLength={MAX_NOTICE_TEMPLATE_NAME}
                            placeholder={`비워 두면 "서식 ${index + 1}"`}
                            aria-label={`서식 ${index + 1}의 이름`}
                            onChange={(event) => setNaming({ index, name: event.target.value })}
                          />
                          <button type="submit" disabled={templateBusy}>저장</button>
                          <button type="button" onClick={() => setNaming(null)}>그만두기</button>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={disabled || templateBusy || !state.body.trim()}
                            title="지금 쓴 내용을 이 칸에 저장합니다"
                            onClick={() => startNaming(index)}
                          >지금 내용 저장</button>
                          <button
                            type="button"
                            disabled={disabled || templateBusy || isNoticeTemplateEmpty(template)}
                            title="이 칸을 비웁니다"
                            onClick={() => void clearTemplate(index)}
                          >비우기</button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                {templates.every(isNoticeTemplateEmpty) ? (
                  <button type="button" disabled={templateBusy} onClick={fillDefaults}>기본 서식 담기</button>
                ) : null}
                <p className="class-board-note">서식을 불러오면 입력칸이 채워지고, 다른 글처럼 자동으로 저장됩니다.</p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <label className="class-board-notice-composer__body-field">
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
          disabled={disabled}
          autoFocus={autoFocus}
          value={state.body}
          placeholder="예) 내일 준비물은 색연필과 풀입니다."
          onChange={(event) => setState((current) => ({ ...current, body: event.target.value }))}
          onBlur={() => { if (dirty && !isHeldNotice(state.body, state.held)) void flush(); }}
        />
      </label>

      <div className="class-board-notice-composer__actions">
        <span>{state.body.length} / {NOTICE_LIMIT}자</span>
        <span className={`class-board-notice-composer__status is-${saveStatus}`} role="status" aria-live="polite">{statusText}</span>
        <div className="class-board-notice-composer__buttons">
          {saveStatus === 'held' ? (
            <button type="button" className="class-board-primary" disabled={disabled} onClick={saveHeld}>이대로 저장</button>
          ) : null}
          {saveStatus === 'error' ? (
            <button type="button" className="class-board-primary" onClick={() => void flush()}>다시 저장</button>
          ) : null}
          {hasSaved ? (
            <button type="button" className="class-board-notice-composer__delete" disabled={disabled} onClick={() => void remove()}>
              삭제
            </button>
          ) : null}
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
                  disabled={disabled || item.date === state.date}
                  aria-current={item.date === state.date}
                  onClick={() => void switchDate(item.date)}
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
        알림은 날짜마다 따로 저장됩니다. 입력을 멈추면 자동으로 저장되고 교실 화면의 알림장에 바로 나타납니다.
        {widgetHint ? ' 위젯의 제목과 색은 아래에서 정하며 스크린과 함께 자동으로 저장됩니다.' : ''}
      </p>
      {confirmDialog}
    </div>
  );
}
