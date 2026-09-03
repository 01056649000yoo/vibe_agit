import { lazy } from 'react'

const ClassBoardPreview = lazy(() => import('./ClassBoardPreview.jsx'))
const FeedbackPhrasePreview = lazy(() => import('./FeedbackPhrasePreview.jsx'))
const ReadingMarathonStatusPreview = lazy(() => import('./ReadingMarathonStatusPreview.jsx'))
const ReadingMarathonCelebratePreview = lazy(() => import('./ReadingMarathonCelebratePreview.jsx'))

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
  Object.freeze({
    id: 'reading-marathon-status',
    icon: '🏃',
    title: '우리 반 마라톤 현황 창',
    description: '점이 몰렸을 때 겹치지 않는지, 긴 이름이 잘리지 않는지, 기록이 없을 때 무엇이 보이는지',
    Component: ReadingMarathonStatusPreview,
  }),
  Object.freeze({
    id: 'reading-marathon-celebrate',
    icon: '🏅',
    title: '마라톤 완주 축하',
    description: '완주 축하 창과 결승선 반짝임을 실제 카드로 확인한다',
    Component: ReadingMarathonCelebratePreview,
  }),
])

export const getDevLabScenario = (scenarioId) => (
  DEV_LAB_SCENARIOS.find((scenario) => scenario.id === scenarioId)
  || DEV_LAB_SCENARIOS[0]
)
