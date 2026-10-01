import QuizDragon from './QuizDragon';
import { dragonToneOf } from './dragonLines';
import { getDragonStage } from '../dragon/presentation';
import './clawIntroDialog.css';

/**
 * 처음 들어왔을 때 수호룡이 놀이 방법과 **상품이 무작위로 나온다는 것**(포인트부터 수호룡 상점 아이템까지)을
 * 확률과 함께 알려 준다. 뽑기 놀이라 확률을 숨기지 않는다. `처음 안내 다시 보기` 로 언제든 다시 연다.
 */
const ClawIntroDialog = ({ speciesId, writerLevel, passCount, dailyPlays, minPoints, odds, onClose }) => {
    const form = getDragonStage(writerLevel, speciesId).form;
    const greeting = dragonToneOf(form) === 'egg'
        ? '(알 속에서 목소리가 들린다) …반가워! 내가 문제를 낼게!'
        : '어서 와! 여기는 수호룡의 인형뽑기야. 내가 맞춤법 문제를 낼게!';
    return <div className="claw-intro" role="dialog" aria-modal="true" aria-labelledby="claw-intro-title">
        <div className="claw-intro__card">
            <h3 id="claw-intro-title">🧸 수호룡의 인형뽑기</h3>
            <QuizDragon speciesId={speciesId} writerLevel={writerLevel} line={greeting} />
            <ol className="claw-intro__steps">
                <li>수호룡이 맞춤법 문제 <b>10개</b>를 내요. 고르는 문제와 직접 고쳐 쓰는 문제가 섞여 있어요.</li>
                <li><b>{passCount}개 이상</b> 맞히면 <b>코인 1개</b>! 하루에 <b>{dailyPlays}번</b>까지 받을 수 있어요.</li>
                <li>코인을 넣고 집게를 움직여 인형을 뽑아요.</li>
                <li>인형을 뽑으면 <b>상품이 무작위로</b> 나와요 — <b>포인트</b>부터 <b>선생님 선물</b>, 드물게 <b>수호룡 상점 아이템</b>까지!</li>
                <li>오늘 기회를 다 썼는데 하나도 못 뽑았다면, 문제를 푼 상으로 <b>{minPoints}P</b>를 받아요.</li>
            </ol>
            <details className="claw-intro__odds" open>
                <summary>상품이 나올 확률 보기</summary>
                <ul>
                    {odds.points.map((row) => <li key={row.label}><span>{row.label}</span><b>{row.percent}%</b></li>)}
                    {odds.gift > 0 && <li><span>🎁 선생님 선물</span><b>{odds.gift}%</b></li>}
                    {odds.decor.map((row) => <li key={row.label}><span>🐉 수호룡 {row.label} 아이템</span><b>{row.percent}%</b></li>)}
                </ul>
                <p>수호룡 아이템은 <b>지금 내 단계에서 상점에서 살 수 있는 것</b> 중 아직 없는 것만 나와요. 꽝은 없어요.</p>
            </details>
            <button type="button" className="claw-intro__go" onClick={onClose}>알겠어, 시작하자!</button>
        </div>
    </div>;
};

export default ClawIntroDialog;
