import React, { useEffect, useRef, useState } from 'react';
import { classBoardApi } from '../../classBoardApi';
import { playPickerSelected, playPickerTick, prepareClassBoardAudio } from '../audio/audioPlayer';

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
  const [rollingName, setRollingName] = useState('');
  const [rolling, setRolling] = useState(false);
  const [loadedClassId, setLoadedClassId] = useState(null);
  const [error, setError] = useState('');
  const rollTimerRef = useRef(null);

  useEffect(() => {
    let active = true;
    if (rollTimerRef.current) {
      window.clearTimeout(rollTimerRef.current);
      rollTimerRef.current = null;
    }
    void classBoardApi.getRoster(classId).then((result) => {
      if (!active) return;
      const nextNames = Array.isArray(result?.names) ? result.names.slice(0, 100) : [];
      setNames(nextNames);
      setRemaining(nextNames);
      setSelectedName('');
      setRollingName('');
      setRolling(false);
      setError('');
      setLoadedClassId(classId);
    }).catch((loadError) => {
      if (!active) return;
      setRolling(false);
      setRollingName('');
      setError(loadError.message || '학생 명단을 불러오지 못했습니다.');
      setLoadedClassId(classId);
    });
    return () => { active = false; };
  }, [classId]);

  useEffect(() => () => {
    if (rollTimerRef.current) window.clearTimeout(rollTimerRef.current);
  }, []);

  const pick = () => {
    if (rolling) return;
    const source = config.allowRepeats ? names : remaining.length > 0 ? remaining : names;
    if (source.length === 0) return;
    const index = randomIndex(source.length);
    const targetName = source.at(index);
    const totalSteps = 20;
    let step = 0;
    prepareClassBoardAudio();
    setSelectedName('');
    setRolling(true);

    const advance = () => {
      const progress = step / (totalSteps - 1);
      const finished = step === totalSteps - 1;
      const nextName = finished ? targetName : source.at(randomIndex(source.length));
      setRollingName(nextName);
      if (finished) {
        setSelectedName(targetName);
        setRollingName('');
        setRolling(false);
        if (!config.allowRepeats) setRemaining(source.filter((_, itemIndex) => itemIndex !== index));
        if (config.soundEnabled !== false) void playPickerSelected(config.soundVolume);
        rollTimerRef.current = null;
        return;
      }
      if (config.soundEnabled !== false) void playPickerTick(progress, config.soundVolume);
      step += 1;
      const delay = 45 + Math.round(progress * progress * 300);
      rollTimerRef.current = window.setTimeout(advance, delay);
    };
    advance();
  };

  const reset = () => {
    setRemaining(names);
    setSelectedName('');
    setRollingName('');
  };

  if (loadedClassId !== classId) return <div className="class-board-widget-loading">학생 명단을 준비하는 중…</div>;
  if (error) return <div className="class-board-widget-error">{error}</div>;
  return (
    <section className={`class-board-picker${rolling ? ' is-rolling' : ''}`}>
      <span>{config.title || '오늘의 발표자'}</span>
      <strong aria-live={rolling ? 'off' : 'polite'}>{rollingName || selectedName || (names.length > 0 ? '누구일까요?' : '등록된 학생이 없어요')}</strong>
      <small>{config.allowRepeats ? `${names.length}명 중 다시 뽑을 수 있어요` : `${remaining.length}/${names.length}명 남음`}</small>
      <div>
        <button type="button" disabled={names.length === 0 || rolling} onPointerDown={stopPointer} onClick={pick}>{rolling ? '뽑는 중…' : remaining.length === 0 && !config.allowRepeats ? '다시 섞어 뽑기' : '한 명 뽑기'}</button>
        <button type="button" disabled={names.length === 0 || rolling} onPointerDown={stopPointer} onClick={reset}>처음부터</button>
      </div>
    </section>
  );
}
