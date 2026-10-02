import { useEffect } from 'react';
import './clawCelebration.css';

const PIECES = Array.from({ length: 28 }, (_, index) => index);

/** 짧은 축하 소리(WebAudio). 소리를 낼 수 없는 기기에서는 조용히 넘어간다. */
const playFanfare = () => {
    try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        const context = new Context();
        [523, 659, 784, 1047, 1319, 1568].forEach((frequency, index) => {
            const at = context.currentTime + index * 0.11;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'square';
            oscillator.frequency.setValueAtTime(frequency, at);
            gain.gain.setValueAtTime(0.05, at);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(at);
            oscillator.stop(at + 0.24);
        });
        setTimeout(() => context.close().catch(() => {}), 1500);
    } catch { /* 소리 없이 진행 */ }
};

/**
 * 큰 상품(선생님 선물·수호룡 아이템) 당첨 축하(2026-10-02 선생님 요청). 포인트는 위 노란 띠로 충분하고,
 * 드물게 나오는 두 상품만 화면 가득 축하한다. 4.5초 뒤 저절로 닫히고, 눌러도 닫힌다. 움직임 줄이기 설정이면 꽃가루를 멈춘다.
 */
const ClawCelebration = ({ prize, plushName, onClose }) => {
    useEffect(() => {
        playFanfare();
        const timer = setTimeout(onClose, 4500);
        return () => clearTimeout(timer);
    }, [onClose]);
    const isGift = prize.kind === 'gift';
    return <div className="claw-celebrate" role="alertdialog" aria-modal="true" aria-labelledby="claw-celebrate-title" onClick={onClose}>
        <div className="claw-celebrate__confetti" aria-hidden="true">
            {PIECES.map((piece) => <i key={piece} style={{ '--piece': piece }} />)}
        </div>
        <div className={`claw-celebrate__card is-${prize.kind}`}>
            <span className="claw-celebrate__icon" aria-hidden="true">{isGift ? '🎁' : '🐉'}</span>
            <small>{plushName} 인형을 뽑았더니…</small>
            <h3 id="claw-celebrate-title">{isGift ? '선생님 선물 당첨!' : '수호룡 아이템 당첨!'}</h3>
            <strong>{isGift ? prize.gift?.name : prize.item?.name}</strong>
            <p>{isGift ? '선생님께 보여 드리고 선물을 받아요.' : '나의 아지트 수호룡 꾸미기에 바로 들어가요.'}</p>
            <button type="button" onClick={onClose}>와! 확인</button>
        </div>
    </div>;
};

export default ClawCelebration;
