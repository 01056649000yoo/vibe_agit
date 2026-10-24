import V2DeckMap from '../modules/game/vocab-tower/V2DeckMap.jsx'
import '../modules/game/vocab-tower/vocabularyTowerGame.css'

// 어휘의 탑 지도 — 정복 완료 = 덱마스터 도전 자격(서버 master_eligible), 만점은 따로 ⭐ (2026-10-24).
const deck = (number, extra) => ({
  deck_number: number, item_count: 40, seen_count: 20, mastered_count: 10, practice_runs: 3, completed_runs: 3,
  best_accuracy: 75, deck_reward_points: 100, earned_reward_points: 20, floor_unlocked: true,
  next_milestone_percent: 50, next_milestone_points: 20, next_milestone_remaining: 10,
  master_eligible: false, master_required_mastered: 32, master_missing_mastered: 22, ...extra
})
const DECKS = [
  deck(1, { mastered_count: 34, seen_count: 40, best_accuracy: 100, master_eligible: true, master_missing_mastered: 0, earned_reward_points: 80 }),
  deck(2, { mastered_count: 20, seen_count: 40, best_accuracy: 100, master_missing_mastered: 12 }),
  deck(3, { mastered_count: 8, seen_count: 18, best_accuracy: 83, master_missing_mastered: 24 }),
  ...Array.from({ length: 7 }, (_, i) => deck(i + 4, { practice_runs: 0, completed_runs: 0, seen_count: 0, mastered_count: 0, best_accuracy: 0, floor_unlocked: false, master_missing_mastered: 32 }))
]

export default function VocabTowerDeckMapPreview() {
  return (
    <V2DeckMap
      grade={4} decks={DECKS} activeRun={null} practicePolicyVersion={2} submitting={false} notice=""
      onStart={() => {}} onOpenCardBox={() => {}} onOpenDeckMaster={() => {}} onOpenSummit={() => {}}
      summit={null} masterSettings={null} summitSettings={null} onBack={() => {}}
    />
  )
}
