import { useState } from 'react'
import ReadingMarathonDashboardCard from '../modules/writing/reading-log/marathon/ReadingMarathonDashboardCard'

/*
 * 완주 축하 창 미리보기.
 *
 * 왜 필요한가: 완주는 실제로 만들기 어려운 상태다(확인받은 독서록을 목표 거리만큼 쌓아야 한다).
 * 그래서 축하 창과 결승선 반짝임을 눈으로 보려면 자료를 손으로 만들어 넣어야 한다.
 * `initialSnapshot` 을 주면 카드가 DB 를 부르지 않으므로 실험실에서 그대로 띄울 수 있다.
 *
 * ⚠️ 창은 기기마다 한 번만 뜬다(localStorage). 다시 보려면 아래 `본 기록 지우기` 를 누른다.
 */
const CAMPAIGN = {
    id: 'preview-campaign',
    title: '가을 독서마라톤',
    competition_type: 'individual',
    target_distance_m: 20000,
    medal_requirement_type: 'none',
    medal_requirement_value: 0,
    is_enabled: true,
    status: 'running',
    started_at: '2026-09-01T00:00:00Z'
}

const SCENARIOS = [
    {
        id: 'individual',
        label: '개인전 완주',
        snapshot: {
            campaign: CAMPAIGN,
            summary: { totalPages: 1420, totalDistanceM: 21300, bookCount: 17, progressPercent: 107, contributors: 1 },
            my: { distance_m: 21300, total_pages: 1420, book_count: 17, completed_at: '2026-09-03T02:00:00Z' },
            leaderboard: [],
            teams: [],
            teamLeaderboard: [],
            myTeam: null
        }
    },
    {
        id: 'running',
        label: '아직 달리는 중 (창이 뜨지 않아야 함)',
        snapshot: {
            campaign: CAMPAIGN,
            summary: { totalPages: 400, totalDistanceM: 6000, bookCount: 5, progressPercent: 30, contributors: 1 },
            my: { distance_m: 6000, total_pages: 400, book_count: 5, completed_at: null },
            leaderboard: [],
            teams: [],
            teamLeaderboard: [],
            myTeam: null
        }
    }
]

const ReadingMarathonCelebratePreview = () => {
    const [scenarioId, setScenarioId] = useState('individual')
    const [seed, setSeed] = useState(0)
    const scenario = SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[0]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {SCENARIOS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => { setScenarioId(item.id); setSeed((n) => n + 1) }}
                        style={{
                            padding: '8px 14px', borderRadius: 'var(--ui-radius-pill)', cursor: 'pointer',
                            border: `1px solid ${scenarioId === item.id ? 'var(--ui-primary)' : 'var(--ui-border-strong)'}`,
                            background: scenarioId === item.id ? 'var(--ui-primary-soft)' : 'var(--ui-surface)',
                            color: 'var(--ui-ink)', fontSize: 'var(--ui-text-sm)', fontWeight: 700
                        }}
                    >{item.label}</button>
                ))}
                <button
                    type="button"
                    onClick={() => {
                        try { window.localStorage.removeItem('agit.marathon.celebrated') } catch { /* 저장이 막힌 브라우저 */ }
                        setSeed((n) => n + 1)
                    }}
                    style={{
                        padding: '8px 14px', borderRadius: 'var(--ui-radius-pill)', cursor: 'pointer',
                        border: '1px solid var(--ui-border-strong)', background: 'var(--ui-surface)',
                        color: 'var(--ui-ink)', fontSize: 'var(--ui-text-sm)', fontWeight: 700
                    }}
                >🔄 본 기록 지우기</button>
            </div>

            <div style={{ maxWidth: '760px' }}>
                <ReadingMarathonDashboardCard key={`${scenarioId}-${seed}`} initialSnapshot={scenario.snapshot} />
            </div>
        </div>
    )
}

export default ReadingMarathonCelebratePreview
