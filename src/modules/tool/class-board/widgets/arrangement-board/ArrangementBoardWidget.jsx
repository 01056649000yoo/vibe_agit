import React, { useEffect, useState } from 'react';
import HistoryResultBoard from '../../../classroom-arrangement/HistoryResultBoard';
import { arrangementBoardApi } from './arrangementBoardApi';
import useFittedArrangement from './useFittedArrangement';
import '../../../classroom-arrangement/classroomArrangement.css';
import './arrangementBoard.css';

/*
 * 자리·역할 배치 결과를 교실 화면에 띄운다.
 *
 * 새로 만드는 자료는 없다 — 배치 도구가 저장해 둔 결과 중 **가장 최근 한 건**을 읽어
 * 그 도구가 쓰는 것과 **같은 부품**(`HistoryResultBoard`)으로 그린다.
 * 따로 그리면 자리표 모양이 두 곳에서 갈라진다.
 *
 * ⚠️ 열 때 한 번만 읽는다(`type: 'live-once'`). 교실 프로젝터에 하루 종일 떠 있으므로
 *    되풀이해 읽으면 안 된다. 새로 뽑았으면 교사가 화면을 다시 열면 된다.
 */

const normalizeKind = (value) => (value === 'role' ? 'role' : 'seat');
const kindLabel = (kind) => (kind === 'role' ? '역할' : '자리');

const formatSavedAt = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

/*
 * `initialResult` 는 실험실(`?dev-lab=`)에서만 쓴다. 결과를 직접 넣어 주면 DB 를 부르지 않아
 * 실제 학급과 저장된 배치 없이도 눈으로 볼 수 있다. 운영 화면은 이 값을 넘기지 않는다.
 */
export default function ArrangementBoardWidget({ config = {}, classId, dragHandleProps, initialResult = null }) {
  const kind = normalizeKind(config.kind);
  const wanted = `${classId || ''}:${kind}`;
  const [loaded, setLoaded] = useState(() => (initialResult
    ? { key: wanted, status: initialResult.payload ? 'ready' : 'empty', result: initialResult }
    : null));

  useEffect(() => {
    let active = true;
    if (initialResult || !classId) return () => { active = false; };
    arrangementBoardApi.getLatest(classId, kind)
      .then((result) => {
        if (!active) return;
        // 결과가 없으면 서버가 종류만 담아 준다 — 아직 한 번도 안 뽑은 학급이다.
        setLoaded({ key: wanted, status: result?.payload ? 'ready' : 'empty', result: result || null });
      })
      .catch(() => { if (active) setLoaded({ key: wanted, status: 'error', result: null }); });
    return () => { active = false; };
  }, [classId, kind, wanted, initialResult]);

  /*
   * ⚠️ 효과 안에서 곧바로 setState 하면 렌더가 연달아 돈다(react-hooks/set-state-in-effect).
   *    그래서 "무엇을 불러왔는지"만 들고 있다가, 지금 필요한 것과 다르면 불러오는 중으로 본다.
   */
  const state = loaded?.key === wanted ? loaded : { status: 'loading', result: null };
  const savedAt = formatSavedAt(state.result?.createdAt);
  /*
   * 내용이 바뀌거나 상자 크기가 바뀔 때 다시 맞춘다.
   * ⚠️ 사람 수가 곧 높이다 — 24명과 6명을 같은 크기로 그리면 한쪽은 잘리고 한쪽은 작다.
   */
  const fitRef = useFittedArrangement(`${state.status}:${state.result?.id || ''}`);

  return (
    <div className="class-board-arrangement">
      <header className="class-board-arrangement__head" {...(dragHandleProps || {})}>
        <strong>{config.heading || `오늘의 ${kindLabel(kind)}`}</strong>
        {state.status === 'ready' && savedAt ? <span>{savedAt} 뽑기</span> : null}
      </header>

      {state.status === 'loading' && (
        <p className="class-board-arrangement__note">배치 결과를 불러오는 중이에요…</p>
      )}
      {state.status === 'empty' && (
        <p className="class-board-arrangement__note">
          아직 저장된 {kindLabel(kind)} 배치가 없어요.
          <br />
          학급운영도구의 <strong>자리·역할 배치</strong>에서 뽑고 저장하면 여기에 나타납니다.
        </p>
      )}
      {state.status === 'error' && (
        <p className="class-board-arrangement__note">배치 결과를 불러오지 못했어요. 화면을 다시 열어 주세요.</p>
      )}
      {state.status === 'ready' && (
        <div className="class-board-arrangement__body" ref={fitRef}>
          <HistoryResultBoard kind={state.result.kind || kind} payload={state.result.payload} />
        </div>
      )}
    </div>
  );
}
