import React, { useEffect, useState } from 'react';
import { classBoardApi } from '../../classBoardApi';

const stopPointer = (event) => event.stopPropagation();
const randomIndex = (length) => {
  if (length <= 1) return 0;
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return Math.floor((values[0] / 4294967296) * length);
  }
  return Math.floor(Math.random() * length);
};

export default function StudentPickerWidget({ config = {}, classId }) {
  const [names, setNames] = useState([]);
  const [remaining, setRemaining] = useState([]);
  const [selectedName, setSelectedName] = useState('');
  const [loadedClassId, setLoadedClassId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void classBoardApi.getRoster(classId).then((result) => {
      if (!active) return;
      const nextNames = Array.isArray(result?.names) ? result.names.slice(0, 100) : [];
      setNames(nextNames);
      setRemaining(nextNames);
      setSelectedName('');
      setError('');
      setLoadedClassId(classId);
    }).catch((loadError) => {
      if (!active) return;
      setError(loadError.message || '학생 명단을 불러오지 못했습니다.');
      setLoadedClassId(classId);
    });
    return () => { active = false; };
  }, [classId]);

  const pick = () => {
    const source = config.allowRepeats ? names : remaining.length > 0 ? remaining : names;
    if (source.length === 0) return;
    const index = randomIndex(source.length);
    setSelectedName(source.at(index));
    if (!config.allowRepeats) setRemaining(source.filter((_, itemIndex) => itemIndex !== index));
  };

  const reset = () => {
    setRemaining(names);
    setSelectedName('');
  };

  if (loadedClassId !== classId) return <div className="class-board-widget-loading">학생 명단을 준비하는 중…</div>;
  if (error) return <div className="class-board-widget-error">{error}</div>;
  return (
    <section className="class-board-picker">
      <span>{config.title || '오늘의 발표자'}</span>
      <strong aria-live="polite">{selectedName || (names.length > 0 ? '누구일까요?' : '등록된 학생이 없어요')}</strong>
      <small>{config.allowRepeats ? `${names.length}명 중 다시 뽑을 수 있어요` : `${remaining.length}/${names.length}명 남음`}</small>
      <div>
        <button type="button" disabled={names.length === 0} onPointerDown={stopPointer} onClick={pick}>{remaining.length === 0 && !config.allowRepeats ? '다시 섞어 뽑기' : '한 명 뽑기'}</button>
        <button type="button" disabled={names.length === 0} onPointerDown={stopPointer} onClick={reset}>처음부터</button>
      </div>
    </section>
  );
}
