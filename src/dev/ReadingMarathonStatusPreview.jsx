import { useState } from 'react'
import ReadingMarathonStatusModal from '../modules/writing/reading-log/marathon/ReadingMarathonStatusModal'

/*
 * 우리 반 마라톤 현황 창 미리보기.
 *
 * 왜 필요한가: 이 창은 교사가 마라톤을 **시작한 뒤에만** 열 수 있어서, 실제 학급 자료 없이는
 * 눈으로 볼 수가 없었다. 그래서 손으로 만든 HTML 로 재다가 마크업을 잘못 잘라 잘못된 수치를
 * 두 번 읽었다(2026-09-03). 진짜 부품과 진짜 CSS 로 띄워 놓고 본다.
 *
 * 보는 것:
 *  - 아이가 몰렸을 때 점이 위아래로 어긋나 서로 가리지 않는지
 *  - 이름이 긴 아이가 명단에서 잘리지 않는지
 *  - 아무도 기록이 없을 때 빈 화면 문구가 나오는지
 *
 * ⚠️ 특정 아이를 "가장 뒤처진" 식으로 부르지 않는다. 명단은 가나다순이다.
 * 저장은 하지 않는다. `supabase` 나 훅을 부르지 않는다(README 원칙).
 */

const NAMES = [
  '강나래', '구본솔', '김하늘', '노을찬', '류시원', '문해든',
  '박구름', '배도담', '서다온', '손누리', '신보람', '안여울',
  '오한별', '윤소리', '이바다', '임가온', '장미소', '정슬기',
  '조아람', '최다솜', '한여름', '허재이', '홍모아', '황윤슬',
]

const TARGET_M = 20000

const buildRow = (name, index, distanceM) => ({
  student_id: `s${index}`,
  name,
  // 실제 순위표에는 확인 완료한 책 수가 함께 온다(2026-09-03에 표로 바꾸며 열을 더했다).
  // 거리 1km 남짓에 한 권꼴로 어림해 둔다 — 미리보기가 0권만 보여 주면 그 열을 못 본다.
  book_count: Math.max(0, Math.round(distanceM / 1200)),
  distance_m: distanceM,
})

const SCENARIOS = [
  {
    id: 'spread',
    label: '고루 퍼진 24명',
    leaderboard: NAMES.map((name, index) => buildRow(name, index, 300 + index * 750)),
  },
  {
    id: 'crowded',
    label: '한곳에 몰린 24명',
    // 거의 같은 자리에 몰리면 점이 위아래 네 줄까지 어긋나야 한다.
    leaderboard: NAMES.map((name, index) => buildRow(name, index, 9000 + (index % 3) * 60)),
  },
  {
    id: 'long-names',
    label: '이름이 긴 학급',
    leaderboard: NAMES.slice(0, 8).map((name, index) => (
      buildRow(`${name}${'하늘보리'.slice(0, index % 4)}`, index, 500 + index * 2200)
    )),
  },
  {
    id: 'empty',
    label: '아직 기록 없음',
    leaderboard: [],
  },
]

const summaryOf = (leaderboard) => {
  const totalDistanceM = leaderboard.reduce((sum, row) => sum + row.distance_m, 0)
  return {
    totalDistanceM,
    targetDistanceM: TARGET_M,
    progressPercent: TARGET_M > 0 ? Math.min(100, (totalDistanceM / TARGET_M) * 100) : 0,
    contributors: leaderboard.length,
  }
}

const ReadingMarathonStatusPreview = () => {
  const [scenarioId, setScenarioId] = useState('spread')
  const [open, setOpen] = useState(false)
  const scenario = SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[0]

  return (
    <div style={{ display: 'grid', gap: 'var(--ui-space-4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)' }}>
        {SCENARIOS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setScenarioId(item.id); setOpen(true) }}
            style={{
              padding: '8px 14px',
              border: '1px solid var(--ui-border)',
              borderRadius: 'var(--ui-radius-md)',
              background: item.id === scenarioId ? '#fff7ed' : 'var(--ui-surface)',
              fontSize: 'var(--ui-text-sm)',
              fontWeight: 800,
              color: 'var(--ui-ink)',
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          justifySelf: 'start',
          padding: '10px 18px',
          border: '1px solid #fed7aa',
          borderRadius: 'var(--ui-radius-md)',
          background: '#fff7ed',
          fontSize: 'var(--ui-text-md)',
          fontWeight: 900,
          cursor: 'pointer',
        }}
      >
        🏃 우리 반 마라톤 현황 보기
      </button>

      <ReadingMarathonStatusModal
        isOpen={open}
        onClose={() => setOpen(false)}
        leaderboard={scenario.leaderboard}
        targetDistanceM={TARGET_M}
        summary={summaryOf(scenario.leaderboard)}
      />
    </div>
  )
}

export default ReadingMarathonStatusPreview
