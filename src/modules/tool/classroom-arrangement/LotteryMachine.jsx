import React from 'react';

const BALLS = [
  ['#f59e0b', '0s'], ['#ef4444', '-.38s'], ['#3b82f6', '-.76s'], ['#10b981', '-1.14s'],
  ['#8b5cf6', '-1.52s'], ['#ec4899', '-1.9s'], ['#f97316', '-2.28s'], ['#06b6d4', '-2.66s']
];

export default function LotteryMachine({ rollingName, current, total }) {
  const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  return <div className="arrange-lottery" role="status" aria-live="polite" aria-label={`추첨 중 ${current}/${total}, ${rollingName || '이름을 고르는 중'}`}>
    <div className="arrange-lottery-label" aria-hidden="true">🎱 추첨 중 · {current}/{total}</div>
    <div className="arrange-lottery-drum" aria-hidden="true">
      <div className="arrange-lottery-glass">
        <span className="arrange-lottery-shine" />
        {BALLS.map(([color, delay], index) => <i key={color} style={{ '--ball-color': color, '--ball-delay': delay, '--ball-index': index }} />)}
        <strong>{rollingName || '···'}</strong>
      </div>
      <span className="arrange-lottery-neck" />
      <span className="arrange-lottery-base" />
    </div>
    <div className="arrange-lottery-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
  </div>;
}
