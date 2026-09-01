import { Suspense, useMemo, useState } from 'react'
import { DEV_LAB_SCENARIOS, getDevLabScenario } from './devLabRegistry'
import './DevLab.css'

const VIEWPORTS = Object.freeze([
  { id: 'desktop', label: 'PC', width: '100%' },
  { id: 'tablet', label: '태블릿', width: '900px' },
  { id: 'mobile', label: '모바일', width: '390px' },
])

const readScenarioId = () => new URLSearchParams(window.location.search).get('dev-lab')

export default function DevLab() {
  const [scenarioId, setScenarioId] = useState(readScenarioId)
  const [viewportId, setViewportId] = useState('desktop')
  const [resetKey, setResetKey] = useState(0)
  const scenario = useMemo(() => getDevLabScenario(scenarioId), [scenarioId])
  const viewport = VIEWPORTS.find((item) => item.id === viewportId) || VIEWPORTS[0]
  const Scenario = scenario.Component

  const selectScenario = (nextId) => {
    const url = new URL(window.location.href)
    url.searchParams.set('dev-lab', nextId)
    url.searchParams.delete('class-board-preview')
    window.history.replaceState(null, '', url)
    setScenarioId(nextId)
    setResetKey((current) => current + 1)
  }

  return (
    <main className="dev-lab">
      <aside className="dev-lab__sidebar">
        <header>
          <span>개발 전용 · DB 없음</span>
          <h1>아지트 실험실</h1>
          <p>운영 컴포넌트와 같은 코드를 샘플 데이터로 반복 확인합니다.</p>
        </header>
        <nav aria-label="개발 실험 시나리오">
          {DEV_LAB_SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === scenario.id ? 'is-active' : ''}
              aria-pressed={item.id === scenario.id}
              onClick={() => selectScenario(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              <strong>{item.title}</strong>
              <small>{item.description}</small>
            </button>
          ))}
        </nav>
        <footer>
          실제 저장·권한·RPC는 별도의 롤백 마이그레이션 검사에서 확인합니다.
        </footer>
      </aside>

      <section className="dev-lab__workspace">
        <header className="dev-lab__toolbar">
          <div>
            <strong>{scenario.icon} {scenario.title}</strong>
            <span>{scenario.description}</span>
          </div>
          <div className="dev-lab__controls">
            <div role="group" aria-label="미리보기 화면 너비">
              {VIEWPORTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === viewport.id ? 'is-active' : ''}
                  aria-pressed={item.id === viewport.id}
                  onClick={() => setViewportId(item.id)}
                >{item.label}</button>
              ))}
            </div>
            <button type="button" onClick={() => setResetKey((current) => current + 1)}>처음부터</button>
            <a href={`/?dev-lab=${scenario.id}`} target="_blank" rel="noreferrer">새 탭 ↗</a>
          </div>
        </header>

        <div className="dev-lab__viewport-shell">
          <div className="dev-lab__viewport" style={{ width: viewport.width }}>
            <Suspense fallback={<div className="dev-lab__loading">실험 화면을 준비하는 중…</div>}>
              <Scenario key={`${scenario.id}-${resetKey}`} embedded />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  )
}
