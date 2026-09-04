import { useState } from 'react'
import ReadingMarathonDashboardCard from '../modules/writing/reading-log/marathon/ReadingMarathonDashboardCard'

/*
 * 학생 독서마라톤 카드 — 경기 방식별로 무엇을 견주는지 본다.
 *
 * 왜 필요한가(2026-09-03): 교사 화면에서 "개인전인데 공동 거리가 보인다"는 문제를 고친 뒤
 * 학생 화면도 확인해야 했는데, 방식을 바꿔 가며 보려면 실제 학급과 확인받은 독서록이 필요하다.
 * `initialSnapshot` 을 주면 카드가 DB 를 부르지 않으므로 여기서 그대로 띄운다.
 *
 * 보는 것 — 목표가 가리키는 대상이 방식마다 다르다:
 *  - 개인전   : 목표는 **나 한 명**    → 내 거리를 견준다
 *  - 모둠 대항전: 목표는 **우리 모둠**  → 모둠 거리를 견준다
 *  - 우리 반 전체전: 목표는 **반 전체** → 반 합계를 견준다
 *  - ⚠️ 모둠 대항전인데 **아직 모둠에 없는 아이**(시작 뒤 전학) → 0에서 시작한다고 알려야 한다.
 *    예전에는 반 전체 합계가 모둠 목표와 견줘져 아무것도 안 읽은 아이에게 100%가 떴다.
 *
 * 서버에 붙지 않는다. 저장도 하지 않는다(README 원칙).
 */

// 카드는 학급 아이디를 세션에서 읽는다. 스냅샷을 함께 주므로 실제로 부르지는 않는다.
const SESSION = { class_id: 'preview-class' }
const TARGET_M = 20000

const campaignOf = (competitionType) => ({
    id: `preview-${competitionType}`,
    title: '가을 독서마라톤',
    competition_type: competitionType,
    target_distance_m: TARGET_M,
    medal_requirement_type: 'none',
    medal_requirement_value: 0,
    is_enabled: true,
    status: 'active',
    started_at: '2026-09-01T00:00:00Z'
})

// 반 전체는 목표를 훌쩍 넘겨 둔다 — 잘못 견주면 100%가 되어 문제가 바로 눈에 띈다.
const CLASS_SUMMARY = {
    total_pages: 42000, total_distance_m: 42000, contributors: 24, book_count: 60,
    target_distance_m: TARGET_M, pending_book_count: 1
}

const ME = { student_id: 'me', name: '김하늘', rank: 7, total_pages: 4200, distance_m: 4200, book_count: 6 }
const MY_TEAM = { id: 't1', name: '햇살 모둠', rank: 2, total_pages: 9000, total_distance_m: 9000, book_count: 12, member_count: 6 }

const SCENARIOS = [
    {
        id: 'individual',
        label: '개인전',
        expect: '내 거리 4.2km / 목표 20km → 21%',
        snapshot: { campaign: campaignOf('individual'), summary: CLASS_SUMMARY, leaderboard: [ME], my: ME }
    },
    {
        id: 'group',
        label: '모둠 대항전',
        expect: '우리 모둠 9km / 목표 20km → 45%',
        snapshot: {
            campaign: campaignOf('group_team'), summary: CLASS_SUMMARY, leaderboard: [ME], my: ME,
            teams: [MY_TEAM], team_leaderboard: [MY_TEAM], my_team: MY_TEAM
        }
    },
    {
        id: 'class',
        label: '우리 반 전체전',
        expect: '반 합계 42km / 목표 20km → 100%',
        snapshot: { campaign: campaignOf('class_team'), summary: CLASS_SUMMARY, leaderboard: [ME], my: ME }
    },
    {
        id: 'no-team',
        label: '모둠 대항전 · 아직 모둠 없음',
        expect: '0% 이어야 한다 (예전에는 100%가 떴다)',
        snapshot: {
            campaign: campaignOf('group_team'), summary: CLASS_SUMMARY,
            leaderboard: [], my: null, teams: [MY_TEAM], team_leaderboard: [MY_TEAM], my_team: null
        }
    }
]

const ReadingMarathonStudentCardPreview = () => {
    const [scenarioId, setScenarioId] = useState('individual')
    const scenario = SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[0]

    return (
        <div style={{ display: 'grid', gap: 'var(--ui-space-4)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)' }}>
                {SCENARIOS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => setScenarioId(item.id)}
                        style={{
                            padding: '8px 14px',
                            border: '1px solid var(--ui-border)',
                            borderRadius: 'var(--ui-radius-md)',
                            background: item.id === scenarioId ? '#fff7ed' : 'var(--ui-surface)',
                            fontSize: 'var(--ui-text-sm)',
                            fontWeight: 800,
                            cursor: 'pointer'
                        }}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <p style={{ margin: 0, color: 'var(--ui-ink-muted)', fontSize: 'var(--ui-text-sm)', fontWeight: 700 }}>
                이래야 맞습니다 — {scenario.expect}
            </p>

            {/* 스냅샷을 주므로 카드가 DB 를 부르지 않는다. 시나리오마다 새로 그리게 key 를 준다. */}
            <ReadingMarathonDashboardCard key={scenario.id} studentSession={SESSION} initialSnapshot={scenario.snapshot} />
        </div>
    )
}

export default ReadingMarathonStudentCardPreview
