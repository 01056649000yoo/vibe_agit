/** 연습 결과 창의 어휘의 탑 코인 안내(2026-10-24). 서버(`finish_my_vocab_tower_v2_practice_v1`)가 준 값만 쓴다. 코인이 없는 학급은 null. */
export const towerCoinNotice = (summary) => {
    const reason = summary?.tower_coin_reason;
    if (!reason || ['off', 'claw_off', 'none'].includes(reason)) return null;
    const today = Number(summary.tower_coins_today) || 0;
    const cap = Number(summary.tower_coin_cap) || 3;
    const count = `오늘 ${today}/${cap}개`;
    if (reason === 'earned') return { title: '🪙 어휘의 탑 코인을 받았어요! +1', count, hint: '인형뽑기에서 써요. 날이 지나도 남아요.' };
    if (reason === 'daily_limit') return { title: '🪙 오늘 받을 코인을 다 받았어요', count, hint: '모아 둔 코인은 내일도 쓸 수 있어요.' };
    if (reason === 'not_completed') return { title: '🪙 어휘의 탑 코인', count, hint: '끝까지 풀고 70% 이상 맞히면 받아요.' };
    if (reason === 'too_few') return { title: '🪙 어휘의 탑 코인', count, hint: '8문제 이상 풀고 70% 이상 맞히면 받아요.' };
    return { title: '🪙 어휘의 탑 코인', count, hint: '70% 이상 맞히면 코인 1개를 받아요.' };
};

/** 연습 결과 창에 붙는 코인 칸. 안내할 것이 없으면 아무것도 그리지 않는다. */
export default function TowerCoinNotice({ summary }) {
    const notice = towerCoinNotice(summary);
    if (!notice) return null;
    return (
        <div className={`vocab-summary-card__coin${summary.tower_coin_earned ? ' is-earned' : ''}`} role="status">
            <span>{notice.title}</span>
            <strong>{notice.count}</strong>
            <small>{notice.hint}</small>
        </div>
    );
}
