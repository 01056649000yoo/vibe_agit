import { useState } from 'react';
import {
    CLAW_DECOR_RARITIES, CLAW_DEFAULT_PRIZE_SETTINGS, CLAW_PRIZE_KINDS, CLAW_PRIZE_LIMITS, scaleClawGroup, sumClawPrizeSettings
} from './prizeTable';

/**
 * 교사 상품 설정 판 — 상품마다 **나올 확률(%)** 을 직접 넣는다(포인트 금액별·선생님 선물별·수호룡 아이템 등급별).
 * 모두 더하면 100% 가 되어야 하고, 합계는 늘 보인다. 100% 가 아니면 `100%로 맞추기` 가 차이를 가장 큰 포인트 줄에 더한다.
 * 맨 위 막대는 묶음별 합(포인트·선물·아이템)을 한눈에 보여 준다 — 학생마다 달라지지 않는, 교사가 넣은 값 그대로다.
 * 묶음마다 `전체` 칸으로 묶음 합을 바로 바꾼다(예: 선생님 선물 5% → 1%). 안의 줄은 원래 비율대로 늘거나 준다.
 * `draft` 는 입력 중인 그대로(이름 끝 띄어쓰기 등)이고, 추첨·학생 공개 확률은 부모가 `normalizeClawPrizeSettings` 로 검증한 값을 쓴다.
 */
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const round1 = (value) => Math.round(value * 10) / 10;

/** 묶음 전체 % 칸. 칠 때마다 다시 나누면 끝수 때문에 비율이 틀어지므로, Enter 를 누르거나 칸을 떠날 때 적용한다. */
const GroupInput = ({ label, value, disabled, onCommit }) => {
    const [text, setText] = useState(null);
    const commit = () => {
        if (text !== null && text.trim() !== '' && round1(Number(text)) !== value) onCommit(text);
        setText(null);
    };
    return <label className="claw-prize-settings__group">
        <span>{label} 전체</span>
        <input type="number" inputMode="decimal" min={0} max={100} step={0.1} disabled={disabled}
            value={text ?? value} aria-label={`${label} 전체 확률(%)`}
            onChange={(e) => setText(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setText(null); }} />
        <span aria-hidden="true">%</span>
    </label>;
};

const PercentInput = ({ value, onChange, label }) => <label className="claw-prize-settings__percent">
    <input type="number" inputMode="decimal" min={0} max={100} step={0.1}
        value={value} aria-label={`${label} 확률(%)`} onChange={(e) => onChange(e.target.value)} />
    <span aria-hidden="true">%</span>
</label>;

const ClawPrizeSettings = ({ draft, onChange }) => {
    const set = (patch) => onChange({ ...draft, ...patch });
    const { total, kinds } = sumClawPrizeSettings(draft);
    const isComplete = Math.abs(total - 100) < 0.05;
    const kindLabel = (kind) => CLAW_PRIZE_KINDS.find((item) => item.kind === kind)?.label;
    // 포인트가 나왔을 때의 평균(포인트 줄끼리의 비율로).
    const pointRows = draft.points.filter((row) => Number(row.points) > 0 && Number(row.percent) > 0);
    const pointTotal = pointRows.reduce((sum, row) => sum + Number(row.percent), 0);
    const averagePoints = pointTotal > 0
        ? Math.round(pointRows.reduce((sum, row) => sum + Number(row.percent) * Number(row.points), 0) / pointTotal)
        : 0;

    // 차이를 가장 큰 포인트 줄에 더한다(0 아래로는 내리지 않는다). 포인트 줄이 없으면 맞추지 않는다.
    const fillTo100 = () => {
        const target = draft.points.reduce((best, row) => (Number(row.percent) > Number(best?.percent ?? -1) ? row : best), null);
        if (!target) return;
        const next = Math.max(0, round1(Number(target.percent || 0) + (100 - total)));
        set({ points: draft.points.map((row) => row.id === target.id ? { ...row, percent: next } : row) });
    };
    const scaleList = (key, target) => {
        const rows = Reflect.get(draft, key);
        const next = scaleClawGroup(rows.map((row) => row.percent), target);
        set({ [key]: rows.map((row, index) => ({ ...row, percent: next.at(index) })) });
    };
    const scaleDecor = (target) => {
        const next = scaleClawGroup(CLAW_DECOR_RARITIES.map(({ rarity }) => Reflect.get(draft.decor, rarity)), target);
        set({ decor: Object.fromEntries(CLAW_DECOR_RARITIES.map(({ rarity }, index) => [rarity, next.at(index)])) });
    };
    const updateRow = (key, id, patch) => set({ [key]: Reflect.get(draft, key).map((row) => row.id === id ? { ...row, ...patch } : row) });

    return <div className="claw-prize-settings">
        {/* 한눈에 보기: 묶음별 합. 색만으로 구분하지 않게 범례에 이름·확률을 함께 쓴다. */}
        <div className="claw-prize-settings__glance">
            <div className="claw-prize-settings__bar" role="img"
                aria-label={CLAW_PRIZE_KINDS.map(({ kind, label }) => `${label} ${Reflect.get(kinds, kind)}%`).join(', ')}>
                {CLAW_PRIZE_KINDS.filter(({ kind }) => Reflect.get(kinds, kind) > 0).map(({ kind, label }) => <span key={kind}
                    className={`is-${kind}`} style={{ flexGrow: Reflect.get(kinds, kind) }}
                    title={`${label} ${Reflect.get(kinds, kind)}%`} />)}
            </div>
            <ul className="claw-prize-settings__legend">
                {CLAW_PRIZE_KINDS.map(({ kind, label }) => <li key={kind}>
                    <i className={`is-${kind}`} aria-hidden="true" />{label}<b>{Reflect.get(kinds, kind)}%</b>
                </li>)}
                <li className="claw-prize-settings__avg">포인트가 나오면 평균 <b>{averagePoints}P</b></li>
            </ul>
            <div className={`claw-prize-settings__total${isComplete ? ' is-ok' : ' is-off'}`} role="status">
                <span aria-hidden="true">{isComplete ? '✓' : '⚠'}</span>
                <b>합계 {total}%</b>
                {isComplete ? <span>모든 상품의 확률을 더해 100%예요.</span> : <>
                    <span>{total < 100 ? `${round1(100 - total)}%가 모자라요.` : `${round1(total - 100)}%가 넘쳐요.`} 100%가 되어야 해요.</span>
                    <button type="button" onClick={fillTo100} disabled={!draft.points.length}>100%로 맞추기</button>
                </>}
            </div>
        </div>

        <div className="claw-prize-settings__columns">
            <div className="claw-prize-settings__col">
                <fieldset>
                    <legend>포인트</legend>
                    <GroupInput label="포인트" value={kinds.points} disabled={!draft.points.length} onCommit={(value) => scaleList('points', value)} />
                    {draft.points.map((row) => <div key={row.id} className="claw-prize-settings__row claw-prize-settings__row--points">
                        <label className="claw-prize-settings__amount">
                            <input type="number" inputMode="numeric" min={CLAW_PRIZE_LIMITS.pointMin} max={CLAW_PRIZE_LIMITS.pointMax} step={1}
                                value={row.points} aria-label="포인트"
                                onChange={(e) => updateRow('points', row.id, { points: e.target.value })} />P
                        </label>
                        <PercentInput label={`${row.points}P`} value={row.percent} onChange={(value) => updateRow('points', row.id, { percent: value })} />
                        <button type="button" aria-label={`${row.points}P 빼기`} disabled={draft.points.length <= 1}
                            onClick={() => set({ points: draft.points.filter((item) => item.id !== row.id) })}>✕</button>
                    </div>)}
                    {draft.points.length < CLAW_PRIZE_LIMITS.pointRows && <button type="button" className="claw-prize-settings__add"
                        onClick={() => set({ points: [...draft.points, { id: newId('p'), points: 10, percent: 0 }] })}>+ 포인트 금액 추가</button>}
                    <small>한 번에 {CLAW_PRIZE_LIMITS.pointMin}~{CLAW_PRIZE_LIMITS.pointMax}P. 게임 공용 상한(하루 80P·주 250P) 안에서 지급돼요.</small>
                </fieldset>
            </div>
            <div className="claw-prize-settings__col">
                <fieldset>
                    <legend>{kindLabel('decor')}</legend>
                    <GroupInput label={kindLabel('decor')} value={kinds.decor} onCommit={scaleDecor} />
                    {CLAW_DECOR_RARITIES.map(({ rarity, label }) => <div key={rarity} className="claw-prize-settings__row">
                        <span>{label}</span>
                        <PercentInput label={`${label} 등급`} value={Reflect.get(draft.decor, rarity)}
                            onChange={(value) => set({ decor: { ...draft.decor, [rarity]: value } })} />
                    </div>)}
                    <small>학생이 지금 단계에서 상점에서 살 수 있고 아직 없는 아이템만 나와요. 그런 아이템이 없는 등급의 확률은 포인트로 가요.</small>
                </fieldset>
            </div>
            <div className="claw-prize-settings__col claw-prize-settings__col--gifts">
                <fieldset>
                    <legend>{kindLabel('gift')}</legend>
                    <GroupInput label={kindLabel('gift')} value={kinds.gift} disabled={!draft.gifts.length} onCommit={(value) => scaleList('gifts', value)} />
                    {draft.gifts.length === 0 && <small>선물이 없으면 선물 몫은 없어요. 합계를 100%로 맞춰 주세요.</small>}
                    {draft.gifts.map((row) => <div key={row.id} className="claw-prize-settings__row claw-prize-settings__row--gift">
                        <input type="text" value={row.name} maxLength={CLAW_PRIZE_LIMITS.giftName} placeholder="예: 자리 고르기권" aria-label="선물 이름"
                            onChange={(e) => updateRow('gifts', row.id, { name: e.target.value })} />
                        <PercentInput label={row.name || '선물'} value={row.percent} onChange={(value) => updateRow('gifts', row.id, { percent: value })} />
                        <button type="button" aria-label={`${row.name || '선물'} 빼기`}
                            onClick={() => set({ gifts: draft.gifts.filter((item) => item.id !== row.id) })}>✕</button>
                    </div>)}
                    {draft.gifts.length < CLAW_PRIZE_LIMITS.gifts && <button type="button" className="claw-prize-settings__add"
                        onClick={() => set({ gifts: [...draft.gifts, { id: newId('g'), name: '', percent: 0 }] })}>+ 선물 추가</button>}
                </fieldset>
            </div>
        </div>

        <footer className="claw-prize-settings__footer">
            <p>
                숫자는 <b>인형 하나를 뽑았을 때 그 상품이 나올 확률</b>이에요. 0%로 두면 나오지 않아요. 묶음 <b>전체</b> 칸을 바꾸면 안의 상품이 원래 비율대로 함께 바뀌어요.
                줄 수 없는 상품(그 학생이 받을 아이템이 없는 등급)의 확률은 포인트로 가요(꽝 없음).
            </p>
            <button type="button" className="claw-prize-settings__reset" onClick={() => onChange(structuredClone(CLAW_DEFAULT_PRIZE_SETTINGS))}>
                기본값으로 되돌리기
            </button>
        </footer>
    </div>;
};

export default ClawPrizeSettings;
