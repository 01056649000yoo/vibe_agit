import { CLAW_DECOR_RARITIES, CLAW_DEFAULT_PRIZE_SETTINGS, CLAW_PRIZE_KINDS, CLAW_PRIZE_LIMITS } from './prizeTable';

/**
 * 교사 상품 설정 판 — 기본값에서 시작해 상품 종류별 비중, 포인트 금액, 선생님 선물 목록, 수호룡 아이템 등급 비중을 바꾼다.
 * 칸마다 옆에 **실제로 나올 확률**을 바로 보여 준다(`describeClawOdds` — 추첨과 같은 계산).
 * `draft` 는 입력 중인 그대로(이름 끝 띄어쓰기 등)이고, 검증은 부모가 `normalizeClawPrizeSettings` 로 한다.
 */
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const findPercent = (rows, id) => rows.find((row) => row.id === id)?.percent ?? 0;

const WeightInput = ({ value, onChange, label }) => <input
    type="number" inputMode="numeric" min={0} max={CLAW_PRIZE_LIMITS.weightMax} step={1}
    value={value} aria-label={label} onChange={(e) => onChange(e.target.value)}
/>;

const ClawPrizeSettings = ({ draft, odds, onChange }) => {
    const set = (patch) => onChange({ ...draft, ...patch });
    const kindPercent = {
        points: odds.points.reduce((sum, row) => sum + row.percent, 0),
        gift: odds.gift,
        decor: odds.decor.reduce((sum, row) => sum + row.percent, 0)
    };
    const round = (value) => Math.round(value * 10) / 10;

    return <div className="claw-prize-settings">
        <p className="claw-prize-settings__help">
            숫자는 <b>비중</b>이에요. 같은 칸끼리 나눠 가지며, 오른쪽이 실제로 나올 확률이에요. 0으로 두면 그 상품은 나오지 않아요.
            줄 수 있는 것이 없으면 그 몫은 포인트가 돼요(꽝 없음).
        </p>

        <fieldset>
            <legend>상품 종류</legend>
            {CLAW_PRIZE_KINDS.map(({ kind, label }) => <div key={kind} className="claw-prize-settings__row">
                <span>{label}</span>
                <WeightInput label={`${label} 비중`} value={Reflect.get(draft.kinds, kind)}
                    onChange={(value) => set({ kinds: { ...draft.kinds, [kind]: value } })} />
                <b>{round(Reflect.get(kindPercent, kind))}%</b>
            </div>)}
        </fieldset>

        <fieldset>
            <legend>포인트 상품</legend>
            {draft.points.map((row) => <div key={row.id} className="claw-prize-settings__row">
                <label className="claw-prize-settings__amount">
                    <input type="number" inputMode="numeric" min={CLAW_PRIZE_LIMITS.pointMin} max={CLAW_PRIZE_LIMITS.pointMax} step={1}
                        value={row.points} aria-label="포인트"
                        onChange={(e) => set({ points: draft.points.map((item) => item.id === row.id ? { ...item, points: e.target.value } : item) })} />P
                </label>
                <WeightInput label={`${row.points}P 비중`} value={row.weight}
                    onChange={(value) => set({ points: draft.points.map((item) => item.id === row.id ? { ...item, weight: value } : item) })} />
                <b>{findPercent(odds.points, row.id)}%</b>
                <button type="button" aria-label={`${row.points}P 빼기`} disabled={draft.points.length <= 1}
                    onClick={() => set({ points: draft.points.filter((item) => item.id !== row.id) })}>✕</button>
            </div>)}
            {draft.points.length < CLAW_PRIZE_LIMITS.pointRows && <button type="button" className="claw-prize-settings__add"
                onClick={() => set({ points: [...draft.points, { id: newId('p'), points: 10, weight: 10 }] })}>+ 포인트 금액 추가</button>}
            <small>한 번에 {CLAW_PRIZE_LIMITS.pointMin}~{CLAW_PRIZE_LIMITS.pointMax}P. 게임 공용 상한(하루 80P·주 250P) 안에서 지급돼요.</small>
        </fieldset>

        <fieldset>
            <legend>선생님 선물</legend>
            {draft.gifts.length === 0 && <small>선물이 없으면 선물 몫은 포인트가 돼요.</small>}
            {draft.gifts.map((row) => <div key={row.id} className="claw-prize-settings__row">
                <input type="text" value={row.name} maxLength={CLAW_PRIZE_LIMITS.giftName} placeholder="예: 자리 고르기권" aria-label="선물 이름"
                    onChange={(e) => set({ gifts: draft.gifts.map((item) => item.id === row.id ? { ...item, name: e.target.value } : item) })} />
                <WeightInput label={`${row.name || '선물'} 비중`} value={row.weight}
                    onChange={(value) => set({ gifts: draft.gifts.map((item) => item.id === row.id ? { ...item, weight: value } : item) })} />
                <b>{findPercent(odds.gifts, row.id)}%</b>
                <button type="button" aria-label={`${row.name || '선물'} 빼기`}
                    onClick={() => set({ gifts: draft.gifts.filter((item) => item.id !== row.id) })}>✕</button>
            </div>)}
            {draft.gifts.length < CLAW_PRIZE_LIMITS.gifts && <button type="button" className="claw-prize-settings__add"
                onClick={() => set({ gifts: [...draft.gifts, { id: newId('g'), name: '', weight: 1 }] })}>+ 선물 추가</button>}
        </fieldset>

        <fieldset>
            <legend>수호룡 아이템 등급</legend>
            {CLAW_DECOR_RARITIES.map(({ rarity, label }) => <div key={rarity} className="claw-prize-settings__row">
                <span>{label}</span>
                <WeightInput label={`${label} 등급 비중`} value={Reflect.get(draft.decorRarities, rarity)}
                    onChange={(value) => set({ decorRarities: { ...draft.decorRarities, [rarity]: value } })} />
                <b>{findPercent(odds.decor, rarity)}%</b>
            </div>)}
            <small>학생이 지금 단계에서 상점에서 살 수 있고 아직 없는 아이템만 나와요. 그런 아이템이 없는 등급은 0%로 보여요.</small>
        </fieldset>

        <button type="button" className="claw-prize-settings__reset" onClick={() => onChange(structuredClone(CLAW_DEFAULT_PRIZE_SETTINGS))}>
            기본값으로 되돌리기
        </button>
    </div>;
};

export default ClawPrizeSettings;
