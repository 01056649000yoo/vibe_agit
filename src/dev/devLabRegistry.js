import { lazy } from 'react'

const ClassBoardPreview = lazy(() => import('./ClassBoardPreview.jsx'))

export const DEV_LAB_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'class-board',
    icon: '🖥️',
    title: '우리 반 스크린',
    description: '탭 순서·기본 화면·전체 화면 바로가기와 위젯 크기 조절',
    Component: ClassBoardPreview,
  }),
])

export const getDevLabScenario = (scenarioId) => (
  DEV_LAB_SCENARIOS.find((scenario) => scenario.id === scenarioId)
  || DEV_LAB_SCENARIOS[0]
)
