import React from 'react';

/*
 * ⚠️ `kind` 는 서버도 검사한다(마이그레이션 20261233: 'seat' 또는 'role' 만 통과).
 *    여기에 값을 더하려면 서버 쪽도 함께 열어야 한다.
 */
const KIND_CHOICES = Object.freeze([
  { value: 'seat', label: '자리 배치' },
  { value: 'role', label: '역할 배치' },
]);

export default function ArrangementBoardSettings({ config = {}, onChange }) {
  const kind = config.kind === 'role' ? 'role' : 'seat';
  const update = (patch) => onChange({ ...config, ...patch });

  return (
    <div className="class-board-settings-grid">
      <label>
        <span>위젯 제목</span>
        <input
          maxLength={80}
          value={config.heading || ''}
          placeholder={kind === 'role' ? '오늘의 역할' : '오늘의 자리'}
          onChange={(event) => update({ heading: event.target.value })}
        />
      </label>
      <label>
        <span>무엇을 보여 줄까요</span>
        <select value={kind} onChange={(event) => update({ kind: event.target.value })}>
          {KIND_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>{choice.label}</option>
          ))}
        </select>
      </label>
      <p className="class-board-settings-note">
        학급운영도구의 <strong>자리·역할 배치</strong>에서 저장한 결과 중 <strong>가장 최근 것</strong>을 보여 줍니다.
        새로 뽑아 저장했다면 스크린을 다시 열면 바뀝니다.
      </p>
    </div>
  );
}
