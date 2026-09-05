import { lazy } from 'react'

const ClassBoardPreview = lazy(() => import('./ClassBoardPreview.jsx'))
const ApprovePostFlowPreview = lazy(() => import('./ApprovePostFlowPreview.jsx'))
const ArrangementBoardWidgetPreview = lazy(() => import('./ArrangementBoardWidgetPreview.jsx'))
const ReadingMarathonStudentCardPreview = lazy(() => import('./ReadingMarathonStudentCardPreview.jsx'))
const FeedbackPhrasePreview = lazy(() => import('./FeedbackPhrasePreview.jsx'))
const ReadingMarathonStatusPreview = lazy(() => import('./ReadingMarathonStatusPreview.jsx'))
const ReadingMarathonCelebratePreview = lazy(() => import('./ReadingMarathonCelebratePreview.jsx'))
const NeighborAgitTeacherPreview = lazy(() => import('./NeighborAgitTeacherPreview.jsx'))
const ClassAgitSelectionPreview = lazy(() => import('./ClassAgitSelectionPreview.jsx'))
const ClassAgitReleasePreview = lazy(() => import('./ClassAgitReleasePreview.jsx'))
const ClassAgitPreview = lazy(() => import('./ClassAgitPreview.jsx'))
const ClassAgitPersistencePreview = lazy(() => import('./ClassAgitPersistencePreview.jsx'))
const ClassAgitStudentPreview = lazy(() => import('./ClassAgitStudentPreview.jsx'))

export const DEV_LAB_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'class-agit-selection', icon: '🏡', title: '우리반 아지트 작품 찾기', description: '66개 미션·1,040편 합성 글로 검색·일괄 담기·120편 순서를 점검한다', Component: ClassAgitSelectionPreview }),
  Object.freeze({ id: 'class-agit-release', icon: '🏡', title: '우리반 아지트 문집·외부 공유', description: '문집 확정판·100편 출력·학생 서가·공유 해지/만료와 시범 학급을 한 흐름으로 점검한다', Component: ClassAgitReleasePreview }),
  Object.freeze({
    id: 'class-agit-student',
    icon: '🏡',
    title: '우리반 아지트 학생 감상',
    description: '학생 홈→전시 목록→로비→전시실→전문과 브라우저 뒤로가기·철회·늦은 응답을 점검한다',
    Component: ClassAgitStudentPreview,
  }),
  Object.freeze({
    id: 'class-agit-persistence',
    icon: '🏡',
    title: '우리반 아지트 저장·공개',
    description: '초안 저장·학급 공개·충돌·원글 재확인·철회 흐름을 DB 없는 샘플로 점검한다',
    Component: ClassAgitPersistencePreview,
  }),
  Object.freeze({
    id: 'neighbor-agit-teacher',
    icon: '🤝',
    title: '이웃 아지트 교사 활동',
    description: '교사 직접 글 전시와 두 학급 1:1·1:2 글짝 매칭안 화면을 DB 없이 확인한다',
    Component: NeighborAgitTeacherPreview,
  }),
  Object.freeze({
    id: 'class-agit',
    icon: '🏡',
    title: '우리반 아지트 전시관',
    description: '작품 선정·자동 배치·2.5D 감상·외부 가림 이름을 샘플 글 0/1/12/60/120편으로 확인한다',
    Component: ClassAgitPreview,
  }),
  Object.freeze({
    id: 'arrangement-board-widget',
    icon: '🪑',
    title: '스크린 자리·역할 위젯',
    description: '자리표와 역할표가 교실 뒤에서도 읽히는 크기인지, 위젯 상자를 키웠다 줄이며 본다',
    Component: ArrangementBoardWidgetPreview,
  }),
  Object.freeze({
    id: 'reading-marathon-student-card',
    icon: '🏃',
    title: '학생 마라톤 카드',
    description: '개인전·모둠전·전체전이 각각 무엇을 목표와 견주는지, 모둠에 없는 아이는 어떻게 보이는지',
    Component: ReadingMarathonStudentCardPreview,
  }),
  Object.freeze({
    id: 'approve-post-flow',
    icon: '✅',
    title: '글 승인 흐름',
    description: '앱 안 확인 창 · 승인 중 표시 · 스스로 사라지는 알림 · 수정 모드로 잠겼을 때 안내',
    Component: ApprovePostFlowPreview,
  }),
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
