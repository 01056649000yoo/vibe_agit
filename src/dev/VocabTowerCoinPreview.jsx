import TowerCoinNotice from '../modules/game/vocab-tower/TowerCoinNotice.jsx'
import '../modules/game/vocab-tower/vocabularyTowerGame.css'

// 어휘의 탑 연습 결과 창의 코인 칸 — 서버가 줄 수 있는 모든 상태를 DB 없이 한눈에 본다.
const CASES = [
  ['코인을 받음', { tower_coin_reason: 'earned', tower_coin_earned: true, tower_coins_today: 2, tower_coin_cap: 3 }],
  ['정답률이 모자람', { tower_coin_reason: 'accuracy', tower_coin_earned: false, tower_coins_today: 1, tower_coin_cap: 3 }],
  ['8문제 미만', { tower_coin_reason: 'too_few', tower_coin_earned: false, tower_coins_today: 0, tower_coin_cap: 3 }],
  ['중간에 나감', { tower_coin_reason: 'not_completed', tower_coin_earned: false, tower_coins_today: 0, tower_coin_cap: 3 }],
  ['오늘 한도를 다 채움', { tower_coin_reason: 'daily_limit', tower_coin_earned: false, tower_coins_today: 3, tower_coin_cap: 3 }],
  ['한도 5개 학급에서 받음', { tower_coin_reason: 'earned', tower_coin_earned: true, tower_coins_today: 5, tower_coin_cap: 5 }],
  ['코인 끔(아무것도 안 보임)', { tower_coin_reason: 'off', tower_coin_earned: false, tower_coins_today: 0, tower_coin_cap: 0 }]
]

export default function VocabTowerCoinPreview() {
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 460, margin: '0 auto', padding: 16 }}>
      {CASES.map(([label, summary]) => (
        <section key={label} className="vocab-summary-card" style={{ padding: 14 }}>
          <p className="vocab-intro-card__eyebrow">{label}</p>
          <TowerCoinNotice summary={summary} />
        </section>
      ))}
    </div>
  )
}
