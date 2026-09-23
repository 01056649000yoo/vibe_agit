import { useState } from 'react'
import NeighborAgitStudentEntry from '../modules/community/neighbor-agit/StudentEntry'
import { createNeighborBooksPreviewApi } from './NeighborBooksStudentPreview.jsx'

// 모두의 아지트 학생 화면 전체(로비 → 세 공간)를 DB 없이 본다.
const now = Date.now()
const items = [
  { shared_post_id: 'p1', author_name: '김햇살', class_name: '햇살반', is_mine: false, title: '우리 동네 느티나무', excerpt: '우리 동네에는 커다란 느티나무가 있어요.', published_at: new Date(now - 3600e3).toISOString(), reaction_count: 3, comment_count: 2 },
  { shared_post_id: 'p2', author_name: '박바다', class_name: '바다반', is_mine: true, title: '바다에서 주운 조개', excerpt: '여름 방학에 바닷가에서 조개를 주웠어요.', published_at: new Date(now - 7200e3).toISOString(), reaction_count: 5, comment_count: 1 },
]
const activities = [
  { id: 'a1', type: 'topic', title: '가을 운동회에서 기억에 남는 순간', prompt: '한 장면을 자세히 써 봐요.', status: 'open', is_submitted: false, published_count: 4, writing_close_at: new Date(now + 3 * 86400e3).toISOString(), comments_close_at: new Date(now + 5 * 86400e3).toISOString() },
]

function createFeedApi() {
  return {
    async getFeed() {
      return { version: 1, max_rows: 50, space: { id: 'space', name: '햇살·바다·별빛 글마을', active_class_count: 3 }, activities, items, has_more: false }
    },
    async getActivityFeed() {
      return { version: 1, max_rows: 50, activity: activities[0], items, has_more: false }
    },
    async getDetail() { throw new Error('미리보기에서는 상세를 열지 않아요.') },
  }
}

export default function NeighborAgitStudentPreview() {
  const [api] = useState(createFeedApi)
  const [booksApi] = useState(createNeighborBooksPreviewApi)
  return (
    <div style={{ maxWidth: 1040 }}>
      <NeighborAgitStudentEntry spaceId="space" api={api} booksApi={booksApi} onBack={() => {}} onNavigate={() => {}} />
    </div>
  )
}
