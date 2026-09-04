import { useState } from 'react'
import ArrangementBoardWidget from '../modules/tool/class-board/widgets/arrangement-board/ArrangementBoardWidget'

/*
 * 우리 반 스크린의 자리·역할 배치 위젯 미리보기.
 *
 * 왜 필요한가(2026-09-03): 이 위젯은 실제 학급에 **저장된 배치 결과**가 있어야만 무언가 나온다.
 * 교실 프로젝터에서 뒤에 앉은 아이도 읽어야 하므로 크기가 중요한데, 그걸 보려면 위젯 상자를
 * 실제 스크린처럼 키웠다 줄였다 해 봐야 한다. `initialResult` 를 주면 DB 를 부르지 않는다.
 *
 * ⚠️ 위젯 틀은 `container-type: size` 다 — 글씨가 **상자 크기를 따라** 커진다.
 *    그래서 아래 상자 크기 단추로 바꿔 가며 봐야 실제와 같다.
 *
 * 서버에 붙지 않는다(README 원칙).
 */

const NAMES = [
    '강나래', '구본솔', '김하늘', '노을찬', '류시원', '문해든',
    '박구름', '배도담', '서다온', '손누리', '신보람', '안여울',
    '오한별', '윤소리', '이바다', '임가온', '장미소', '정슬기',
    '조아람', '최다솜', '한여름', '허재이', '홍모아', '황윤슬'
]

const seatPayloadOf = (count, cols) => ({
    layout: { rows: Math.ceil(count / cols), cols },
    assignments: NAMES.slice(0, count).map((name, index) => ({
        seatKey: `${Math.floor(index / cols)},${index % cols}`,
        studentName: name,
        studentId: `s${index}`
    }))
})

const SEAT_PAYLOAD = seatPayloadOf(24, 6)

const ROLE_PAYLOAD = {
    roleGroups: [
        { id: 'r1', name: '칠판 지우기', count: 2 },
        { id: 'r2', name: '우유 당번', count: 3 },
        { id: 'r3', name: '책상 줄 맞추기', count: 2 },
        { id: 'r4', name: '재활용 정리', count: 3 }
    ],
    assignments: [
        ...['강나래', '구본솔'].map((studentName, i) => ({ roleId: 'r1', studentName, slotNumber: i + 1 })),
        ...['김하늘', '노을찬', '류시원'].map((studentName, i) => ({ roleId: 'r2', studentName, slotNumber: i + 1 })),
        ...['문해든', '박구름'].map((studentName, i) => ({ roleId: 'r3', studentName, slotNumber: i + 1 })),
        ...['배도담', '서다온', '손누리'].map((studentName, i) => ({ roleId: 'r4', studentName, slotNumber: i + 1 }))
    ]
}

const SCENARIOS = [
    {
        id: 'seat',
        label: '자리 배치 (24명)',
        config: { heading: '오늘의 자리', kind: 'seat' },
        result: { id: 'p1', kind: 'seat', title: '9월 자리', payload: SEAT_PAYLOAD, createdAt: '2026-09-01T00:00:00Z' }
    },
    {
        id: 'role',
        label: '역할 배치',
        config: { heading: '오늘의 역할', kind: 'role' },
        result: { id: 'p2', kind: 'role', title: '9월 역할', payload: ROLE_PAYLOAD, createdAt: '2026-09-02T00:00:00Z' }
    },
    {
        id: 'seat-small',
        label: '자리 배치 (8명)',
        config: { heading: '오늘의 자리', kind: 'seat' },
        result: { id: 'p3', kind: 'seat', title: '작은 반', payload: seatPayloadOf(8, 4), createdAt: '2026-09-01T00:00:00Z' }
    },
    {
        id: 'seat-big',
        label: '자리 배치 (30명·6열)',
        config: { heading: '오늘의 자리', kind: 'seat' },
        result: { id: 'p4', kind: 'seat', title: '큰 반', payload: seatPayloadOf(NAMES.length, 6), createdAt: '2026-09-01T00:00:00Z' }
    },
    {
        id: 'empty',
        label: '아직 뽑은 적 없음',
        config: { heading: '오늘의 자리', kind: 'seat' },
        // 서버가 결과 없이 종류만 준 경우.
        result: { kind: 'seat' }
    }
]

// 스크린은 1600×900 을 기준으로 그린다. 위젯이 그 안에서 차지하는 비율로 크기를 잡는다.
const SIZES = [
    { id: 'half', label: '스크린의 절반', width: 800, height: 540 },
    { id: 'wide', label: '넓게', width: 1180, height: 540 },
    { id: 'small', label: '작게', width: 420, height: 320 }
]

const ArrangementBoardWidgetPreview = () => {
    const [scenarioId, setScenarioId] = useState('seat')
    const [sizeId, setSizeId] = useState('half')
    const scenario = SCENARIOS.find((item) => item.id === scenarioId) || SCENARIOS[0]
    const size = SIZES.find((item) => item.id === sizeId) || SIZES[0]

    const pill = (active) => ({
        padding: '8px 14px',
        border: '1px solid var(--ui-border)',
        borderRadius: 'var(--ui-radius-md)',
        background: active ? '#fff7ed' : 'var(--ui-surface)',
        fontSize: 'var(--ui-text-sm)',
        fontWeight: 800,
        cursor: 'pointer'
    })

    return (
        <div style={{ display: 'grid', gap: 'var(--ui-space-4)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)' }}>
                {SCENARIOS.map((item) => (
                    <button key={item.id} type="button" onClick={() => setScenarioId(item.id)} style={pill(item.id === scenarioId)}>
                        {item.label}
                    </button>
                ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-2)' }}>
                {SIZES.map((item) => (
                    <button key={item.id} type="button" onClick={() => setSizeId(item.id)} style={pill(item.id === sizeId)}>
                        {item.label} · {item.width}×{item.height}
                    </button>
                ))}
            </div>

            {/*
              * 실제 스크린의 위젯 틀과 같은 조건을 만든다 — `container-type: size` 가 있어야
              * cqmin 이 상자 크기를 따라간다. 이게 없으면 글씨 크기가 거짓말이 된다.
              */}
            <div
                style={{
                    width: size.width,
                    height: size.height,
                    maxWidth: '100%',
                    containerType: 'size',
                    display: 'flex',
                    border: '1px solid var(--ui-border)',
                    borderRadius: 'var(--ui-radius-lg)',
                    background: '#fff',
                    overflow: 'hidden'
                }}
            >
                <ArrangementBoardWidget
                    key={`${scenario.id}-${size.id}`}
                    config={scenario.config}
                    classId="preview-class"
                    initialResult={scenario.result}
                />
            </div>
        </div>
    )
}

export default ArrangementBoardWidgetPreview
