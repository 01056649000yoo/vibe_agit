import React from 'react';
import { CLASS_BOARD_TEXT_SIZE_STEPS, resolveClassBoardTextSizing } from './textScale';

export default function TextSettings({ config = {}, onChange }) {
  const update = (patch, resetFittedSize = false) => {
    const next = { ...config, ...patch };
    if (resetFittedSize) delete next.bodySize;
    onChange(next);
  };
  const sizing = resolveClassBoardTextSizing(config);
  const chooseStep = (stepId) => update({ sizeMode: 'step', sizeStep: stepId }, true);
  const chooseFill = () => update({ sizeMode: 'fill' }, true);
  return (
    <div className="class-board-settings-grid">
      <label>
        <span>제목</span>
        <input maxLength={120} value={config.heading || ''} onChange={(event) => update({ heading: event.target.value }, true)} />
      </label>
      <label>
        <span>내용</span>
        <textarea maxLength={2000} rows={7} value={config.body || ''} onChange={(event) => update({ body: event.target.value }, true)} />
      </label>
      <fieldset className="class-board-text-size">
        <legend>글씨 크기</legend>
        <div role="group" aria-label="글씨 크기">
          {CLASS_BOARD_TEXT_SIZE_STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              aria-pressed={sizing.mode === 'step' && sizing.stepId === step.id}
              onClick={() => chooseStep(step.id)}
            >{step.label}</button>
          ))}
          <button type="button" aria-pressed={sizing.mode === 'fill'} onClick={chooseFill}>상자에 꽉 채우기</button>
        </div>
      </fieldset>
      <p className="class-board-note">
        {sizing.mode === 'step'
          ? '고른 크기로 보여 주고, 글이 상자를 넘칠 때만 알아서 줄입니다. 상자를 다시 키우면 고른 크기까지 돌아옵니다.'
          : '입력한 글은 칸에 가장 크게 자동 맞춰집니다. 오른쪽은 줄바꿈, 아래쪽은 보이는 줄 수, 모서리는 글씨 크기를 조절합니다.'}
      </p>
      <label>
        <span>분위기</span>
        <select value={config.tone || 'paper'} onChange={(event) => update({ tone: event.target.value })}>
          <option value="paper">종이</option>
          <option value="sky">하늘</option>
          <option value="sun">햇살</option>
          <option value="mint">민트</option>
        </select>
      </label>
    </div>
  );
}
