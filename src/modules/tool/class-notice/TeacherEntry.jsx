import React, { useCallback, useEffect, useState } from 'react';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import { formatSeoulDate } from '../../../utils/seoulDate';
import NoticeComposer from '../class-board/widgets/notice-board/NoticeComposer';
import { noticeBoardApi } from '../class-board/widgets/notice-board/noticeBoardApi';
import './classNotice.css';

/*
 * 알림장을 우리 반 스크린과 따로 여는 학급 기록 화면.
 *
 * 알림 내용은 학급+날짜 표에 있으므로 스크린에서 위젯을 빼거나 스크린 탭을 지워도 남는다.
 * 여기서는 날짜 목록을 최신순 40개씩 넘겨 보고, 고른 날짜 하나를 스크린과 같은 작성 부품으로 고친다.
 */

const emptyLog = { status: 'loading', today: '', notices: [], nextCursor: null };

export default function ClassNoticeTeacherEntry({ activeClass }) {
  const classId = activeClass?.id || null;
  const [log, setLog] = useState(emptyLog);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const loadLog = useCallback(() => {
    if (!classId) return;
    setError('');
    setLog(emptyLog);
    void noticeBoardApi.getLog(classId)
      .then((result) => setLog({
        status: 'ready',
        today: result?.today || '',
        notices: Array.isArray(result?.notices) ? result.notices : [],
        nextCursor: result?.nextCursor || null,
      }))
      .catch((loadError) => {
        setLog({ ...emptyLog, status: 'ready' });
        setError(loadError.message || '알림장 목록을 불러오지 못했습니다.');
      });
  }, [classId]);

  useEffect(() => {
    setSelectedDate(null);
    loadLog();
  }, [loadLog]);

  const loadMore = async () => {
    if (!classId || !log.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const result = await noticeBoardApi.getLog(classId, log.nextCursor);
      setLog((current) => ({
        ...current,
        notices: [...current.notices, ...(Array.isArray(result?.notices) ? result.notices : [])],
        nextCursor: result?.nextCursor || null,
      }));
    } catch (moreError) {
      setError(moreError.message || '지난 알림을 더 불러오지 못했습니다.');
    } finally {
      setLoadingMore(false);
    }
  };

  if (!classId) return <div className="class-notice-empty">학급을 먼저 선택해 주세요.</div>;

  const writingDate = selectedDate || log.today || null;

  return (
    <section className="class-notice">
      <header className="class-notice__header">
        <div>
          <span>학급운영도구 · {activeClass.name}</span>
          <h2>📒 알림장</h2>
          <p>날짜마다 알림을 남기고 지난 알림을 다시 봅니다. 우리 반 스크린에 알림장을 올리면 같은 내용이 교실 화면에 함께 나옵니다.</p>
        </div>
        <div className="class-notice__header-actions">
          <TeacherGuideButton tabId="class-notice" variant="help" />
        </div>
      </header>

      {error ? <div className="class-notice-alert">{error}<button type="button" onClick={() => setError('')}>닫기</button></div> : null}

      <div className="class-notice__workspace">
        <div className="class-notice__list-panel">
          <div className="class-notice__panel-heading">
            <strong>지난 알림</strong>
            <span>{log.status === 'ready' ? `${log.notices.length}일치` : ''}</span>
          </div>
          {log.status === 'loading' ? <p className="class-notice__note">알림장을 불러오는 중…</p> : null}
          {log.status === 'ready' && log.notices.length === 0
            ? <p className="class-notice__note">아직 저장한 알림이 없습니다. 오른쪽에서 오늘 알림을 적어 보세요.</p>
            : null}
          {log.notices.length > 0 ? (
            <ul className="class-notice__list">
              {log.notices.map((item) => (
                <li key={item.date}>
                  <button
                    type="button"
                    className={item.date === writingDate ? 'is-active' : undefined}
                    aria-current={item.date === writingDate}
                    onClick={() => setSelectedDate(item.date)}
                  >
                    <strong>
                      {formatSeoulDate(item.date) || item.date}
                      {item.date === log.today ? <em>오늘</em> : null}
                    </strong>
                    <small>{item.preview}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {log.nextCursor ? (
            <button type="button" className="class-notice__more" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? '불러오는 중…' : '지난 알림 더 보기'}
            </button>
          ) : null}
        </div>

        <div className="class-notice__editor-panel">
          <div className="class-notice__panel-heading">
            <strong>{writingDate === log.today ? '오늘 알림' : '지난 알림 고치기'}</strong>
            {selectedDate && selectedDate !== log.today ? (
              <button type="button" onClick={() => setSelectedDate(null)}>오늘로</button>
            ) : null}
          </div>
          {log.status === 'ready' ? (
            <NoticeComposer
              key={writingDate || 'today'}
              classId={classId}
              initialDate={writingDate}
              showRecent={false}
              onSaved={loadLog}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
