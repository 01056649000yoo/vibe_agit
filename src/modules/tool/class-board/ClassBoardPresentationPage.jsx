import React, { useEffect, useState } from 'react';
import { classBoardApi } from './classBoardApi';
import { normalizeClassBoard } from './classBoardModel';
import BoardCanvas from './host/BoardCanvas';
import './classBoard.css';

export default function ClassBoardPresentationPage({ boardId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    let active = true;
    void classBoardApi.getPresentation(boardId)
      .then((result) => {
        if (!active) return;
        setData({ ...result, board: normalizeClassBoard(result.board) });
        document.title = `${result.board?.title || '우리 반 스크린'} | 끄적끄적 아지트`;
      })
      .catch((loadError) => { if (active) setError(loadError.message || '발표 화면을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [boardId]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  if (loading) return <div className="class-board-presentation-state">우리 반 스크린을 준비하는 중…</div>;
  if (error || !data?.board) {
    return (
      <div className="class-board-presentation-state is-error">
        <span>🔒</span><h1>발표 화면을 열 수 없습니다.</h1>
        <p>{error || '스크린 정보를 찾지 못했습니다.'}</p>
        <a href="/?tool=class-board">우리 반 스크린으로 돌아가기</a>
      </div>
    );
  }

  return (
    <main className="class-board-presentation-page">
      <header className="class-board-presentation-header">
        <div><span>{data.class?.name}</span><h1>{data.board.title}</h1></div>
        <div>
          <time>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</time>
          <button type="button" onClick={() => window.location.reload()}>새로고침</button>
          <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? '전체화면 나가기' : '전체화면'}</button>
        </div>
      </header>
      <BoardCanvas board={data.board} classId={data.class?.id} presentation />
    </main>
  );
}
