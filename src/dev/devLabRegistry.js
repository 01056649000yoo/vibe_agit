import { lazy } from 'react'

const ClassBoardPreview = lazy(() => import('./ClassBoardPreview.jsx'))
const FeedbackPhrasePreview = lazy(() => import('./FeedbackPhrasePreview.jsx'))

export const DEV_LAB_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'class-board',
    icon: '🖥️',
    title: '우리 반 스크린',
    description: '탭 순서·기본 화면·전체 화면 바로가기와 위젯 크기 조절',
    Component: ClassBoardPreview,
  }),
  Object.freeze({
    id: 'feedback-phrases',
    icon: '📌',
    title: '자주 쓰는 피드백 문장',
    description: '380px 사이드바와 넓은 폭에서 문장 목록·순서 바꾸기·편집이 읽히는지 본다',
    Component: FeedbackPhrasePreview,
  }),
])

export const getDevLabScenario = (scenarioId) => (
  DEV_LAB_SCENARIOS.find((scenario) => scenario.id === scenarioId)
  || DEV_LAB_SCENARIOS[0]
)
