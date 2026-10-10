import LabActivitiesPage from '../modules/writing/lab-activities/LabActivitiesPage'
import { labActivitiesApi } from '../modules/writing/lab-activities/api'

/*
 * 학생 연구소 활동 목록 미리보기(2026-10-11) — 진행 중·완료·**종료됐지만 친구 개요 모음이 열린** 카드를
 * 로그인 없이 눈으로 본다. 목록은 이 화면의 가짜 자료로만 그린다(supabase 를 부르지 않는다, README 원칙).
 */
const DAY = 86400000
const now = Date.now()
const ITEMS = [
  { id: 'p1', activityType: 'outline_builder', title: '가을 운동회 이야기', topic: '운동회 날 가장 기억에 남는 순간', createdAt: new Date(now - DAY).toISOString(), expiresAt: null, sessionId: 's1', status: 'in_progress', hasMore: false, roomActive: true, peerBoardUntil: null },
  { id: 'p2', activityType: 'question_voting', title: '좋은 질문 고르기', topic: '학예회', createdAt: new Date(now - 2 * DAY).toISOString(), expiresAt: null, sessionId: 's2', status: 'done', hasMore: false, roomActive: true, peerBoardUntil: null },
  { id: 'p3', activityType: 'outline_builder', title: '학예회 활동을 제안하는 글의 개요를 짜보자', topic: '학예회 활동을 제안하는 글의 개요를 짜보자', createdAt: new Date(now - 5 * DAY).toISOString(), expiresAt: null, sessionId: 's3', status: 'done', hasMore: false, roomActive: false, peerBoardUntil: new Date(now + 5 * DAY).toISOString() },
]
labActivitiesApi.list = async () => ({ items: ITEMS, hasMore: false, nextCursor: null })

export default function LabActivitiesPreview() {
  return <LabActivitiesPage onBack={() => {}} />
}
