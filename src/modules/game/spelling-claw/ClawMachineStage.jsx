import { useCallback, useEffect, useRef, useState } from 'react';
import { CLAW_PLUSHES } from './plushCatalog';
import './clawMachineStage.css';

const DIRECTIONS = [
    { dir: 'u', label: '뒤로', mark: '▲' },
    { dir: 'l', label: '왼쪽', mark: '◀' },
    { dir: 'r', label: '오른쪽', mark: '▶' },
    { dir: 'd', label: '앞으로', mark: '▼' }
];
const VIEWS = [{ id: 'front', label: '앞' }, { id: 'side', label: '옆' }, { id: 'top', label: '위' }];
const DIFFICULTIES = [{ id: 'easy', label: '튼튼' }, { id: 'normal', label: '보통' }, { id: 'hard', label: '흐물' }];

/**
 * 인형뽑기 기계 화면(2026-10-01, 1단계 시제품). 3D·물리 엔진(`engine/clawEngine.js`)은 열 때만 받는다
 * (three.js + Rapier 약 1.5MB, 인형 8종 약 3.5MB). 코인은 이 부품이 갖지 않는다 — `onSpendCoin` 이
 * 참을 돌려줄 때만 한 판을 시작한다(2단계에서 서버가 코인을 차감하고 상품을 정한다).
 */
const ClawMachineStage = ({ coins, onSpendCoin, onWon, onRoundEnd, onPerf, quality = 'auto', difficulty = 'easy' }) => {
    const containerRef = useRef(null);
    const engineRef = useRef(null);
    const handlersRef = useRef({ onWon, onRoundEnd, onPerf });
    handlersRef.current = { onWon, onRoundEnd, onPerf };
    const [loading, setLoading] = useState('3D 기계를 준비하는 중…');
    const [error, setError] = useState('');
    const [hud, setHud] = useState({ mode: 'ready', timer: 20, view: 'front', difficulty });
    const [toast, setToast] = useState('');
    const [sound, setSound] = useState(true);

    useEffect(() => {
        let cancelled = false;
        let engine = null;
        let toastTimer = 0;
        const container = containerRef.current;
        import('./engine/clawEngine.js')
            .then(({ createClawEngine }) => createClawEngine({
                container,
                plushes: CLAW_PLUSHES,
                difficulty,
                quality,
                onProgress: (message) => { if (!cancelled) setLoading(message); },
                onEvent: (event) => {
                    if (event.type === 'state') setHud({ mode: event.mode, timer: event.timer, view: event.view, difficulty: event.difficulty });
                    else if (event.type === 'toast') {
                        setToast(event.message);
                        clearTimeout(toastTimer);
                        toastTimer = setTimeout(() => setToast(''), 1400);
                    } else if (event.type === 'won') handlersRef.current.onWon?.(event.plushId, event.thumb);
                    else if (event.type === 'roundEnd') handlersRef.current.onRoundEnd?.(event.won);
                    else if (event.type === 'perf') handlersRef.current.onPerf?.(event);
                }
            }))
            .then((created) => {
                engine = created;
                if (cancelled) { engine?.dispose(); return; }
                engineRef.current = engine;
                setLoading('');
            })
            .catch((loadError) => { if (!cancelled) setError(loadError?.message || '3D 기계를 불러오지 못했어요.'); });
        return () => {
            cancelled = true;
            clearTimeout(toastTimer);
            engine?.dispose();
            engineRef.current = null;
        };
        // 품질을 바꾸면 기계를 새로 만든다. 난이도는 아래에서 바로 바꾼다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quality]);

    useEffect(() => { engineRef.current?.setDifficulty(difficulty); }, [difficulty]);

    // 코인 넣기는 서버가 코인을 쓴 뒤에 판을 시작한다(학생 화면). onSpendCoin 은 참/거짓 또는 그 약속을 돌려준다.
    const [spending, setSpending] = useState(false);
    const press = useCallback(async () => {
        const engine = engineRef.current;
        if (!engine || spending) return;
        if (engine.getMode() === 'play') { engine.pressDrop(); return; }
        if (engine.getMode() !== 'ready') return;
        if (coins <= 0) { setToast('맞춤법 퀴즈를 통과하면 코인을 받아요'); return; }
        setSpending(true);
        let ok = false;
        try { ok = Boolean(await onSpendCoin?.()); } catch { ok = false; }
        if (!ok) { setSpending(false); setToast('코인을 넣지 못했어요. 다시 해 보세요'); return; }
        // 코인은 이미 서버에서 빠졌다. 기계가 아직 '준비'가 아니면(막 끝난 판 정리 중 등) 잠깐 기다려서라도 판을 시작한다.
        for (let waited = 0; waited < 4000; waited += 100) {
            const current = engineRef.current;
            if (!current) { setSpending(false); return; }
            if (current.getMode() === 'ready') { current.startRound(); setSpending(false); return; }
            await new Promise((resolve) => { setTimeout(resolve, 100); });
        }
        setSpending(false);
        setToast('기계가 준비되지 않았어요. 화면을 새로고침해 주세요');
    }, [coins, onSpendCoin, spending]);

    const setDirection = (dir, on) => engineRef.current?.setInput(dir, on);
    const playing = hud.mode === 'play';

    // 단추가 꺼질 때(시간 종료 등) 손가락을 뗀 신호가 오지 않아도 방향 입력이 눌린 채로 남지 않게 비운다.
    useEffect(() => {
        if (playing) return;
        for (const item of DIRECTIONS) engineRef.current?.setInput(item.dir, false);
    }, [playing]);

    return <div className="claw-stage">
        <div className="claw-stage__canvas" ref={containerRef} />
        {(loading || error) && <div className="claw-stage__loading" role="status">{error || loading}</div>}

        <div className="claw-stage__hud">
            <span className="claw-stage__chip" title="남은 코인"><span className="claw-stage__coin" aria-hidden="true" />{coins}</span>
            <span className={`claw-stage__chip${playing && hud.timer <= 5 ? ' is-low' : ''}`}>집게 {hud.timer}초</span>
            <span className="claw-stage__seg" role="group" aria-label="시점">
                {VIEWS.map((view) => <button key={view.id} type="button" aria-pressed={hud.view === view.id} onClick={() => engineRef.current?.setView(view.id)}>{view.label}</button>)}
            </span>
            <button type="button" className="claw-stage__chip" aria-pressed={sound} onClick={() => { engineRef.current?.setSound(!sound); setSound(!sound); }}>
                {sound ? '♪ 켬' : '♪ 끔'}
            </button>
            <span className="claw-stage__chip claw-stage__chip--muted" title="집게 힘(교사 설정)">
                {DIFFICULTIES.find((item) => item.id === hud.difficulty)?.label || '튼튼'}
            </span>
        </div>

        {toast && <div className="claw-stage__toast" role="status">{toast}</div>}

        <div className="claw-stage__controls" onTouchMove={(event) => event.preventDefault()}>
            <div className="claw-stage__dpad" aria-label="집게 이동">
                {DIRECTIONS.map((item) => <button
                    key={item.dir} type="button" className={`is-${item.dir}`} aria-label={item.label} disabled={!playing}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        // 손가락이 단추 밖으로 미끄러져도 이동이 이어지게 붙잡는다(붙잡지 못하는 환경이면 그냥 둔다).
                        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* 무시 */ }
                        setDirection(item.dir, true);
                    }}
                    onPointerUp={() => setDirection(item.dir, false)}
                    onPointerCancel={() => setDirection(item.dir, false)}
                    onLostPointerCapture={() => setDirection(item.dir, false)}
                >{item.mark}</button>)}
            </div>
            <button type="button" className="claw-stage__go" onClick={press} disabled={Boolean(loading || error) || spending || (!playing && hud.mode !== 'ready')}>
                {/* 원(120px, 폰 96px) 안에 들어가게 큰 글은 네 글자 안으로(2026-10-02 `집게가 움직여요` 가 원 밖으로 나갔다). */}
                {playing ? '뽑기!' : hud.mode === 'ready' ? '코인 넣기' : '잠깐만요'}
                <small>{playing ? 'DROP' : hud.mode === 'ready' ? `코인 ${coins}개` : '집게 이동 중'}</small>
            </button>
        </div>
    </div>;
};

export default ClawMachineStage;
