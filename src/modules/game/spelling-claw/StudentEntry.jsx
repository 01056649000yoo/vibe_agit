import { useState } from 'react';
import ClawPlayScreen from './ClawPlayScreen';
import { createServerClawSession } from './clawServerSession';

/**
 * 학생 놀이터의 수호룡의 인형뽑기(2026-10-02 공개). 문제·채점·코인·상품은 모두 서버가 정한다(`createServerClawSession`).
 * 3D 엔진은 목표를 달성해 인형뽑기 창이 열릴 때만 받는다(ClawMachineStage).
 */
export default function SpellingClawStudentEntry({ onBack, points, onPointsChange }) {
    const [session] = useState(createServerClawSession);
    return <div className="claw-entry claw-bench">
        <header className="claw-entry__bar">
            <button type="button" onClick={onBack}>← 놀이터</button>
            <h1>🧸 수호룡의 인형뽑기</h1>
            {typeof points === 'number' && <span className="claw-entry__points">내 포인트 <b>{points.toLocaleString('ko-KR')}P</b></span>}
        </header>
        <ClawPlayScreen session={session} onPointsChange={onPointsChange} />
    </div>;
}
