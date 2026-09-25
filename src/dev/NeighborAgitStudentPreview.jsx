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

// 댓글 상태 흉내: g1 은 선생님 확인 중(blocked), 새로 남긴 댓글은 한 번 다시 볼 때 보이게 된다.
function createDetailMock() {
  const mine = new Map([['g1', { status: 'blocked', content: '이 부분 진짜 웃겼어 ㅋㅋ' }]])
  const detail = (id) => {
    const my = mine.get(id)
    const others = [{ comment_id: `${id}-c1`, content: '느티나무 그늘에 가 보고 싶어요!', author_name: '이구름', class_name: '햇살반', is_mine: false, created_at: new Date(now - 1800e3).toISOString() }]
    const visibleMine = my?.status === 'visible'
      ? [{ comment_id: `${id}-mine`, content: my.content, author_name: '박바다', class_name: '바다반', is_mine: true, created_at: new Date().toISOString() }]
      : []
    return {
      version: 1, shared_post_id: id, title: '우리 동네 느티나무', content: '우리 동네에는 커다란 느티나무가 있어요. 여름이면 그늘 아래에서 친구들과 놀아요.',
      author_name: id === 'p2' ? '박바다' : '김햇살', class_name: id === 'p2' ? '바다반' : '햇살반', published_at: new Date(now - 3600e3).toISOString(), is_mine: id === 'p2',
      comments: [...others, ...visibleMine], comment_count: 1 + visibleMine.length, comments_truncated: false,
      reaction_count: 2, my_reaction: false, my_saved: false,
      my_comment: my && my.status !== 'visible' ? { comment_id: `${id}-mine`, status: my.status, content: my.content } : null,
    }
  }
  return {
    async getDetail({ sharedPostId }) {
      const my = mine.get(sharedPostId)
      if (my?.status === 'pending') {
        if (my.checked) my.status = 'visible'
        else my.checked = true
      }
      return detail(sharedPostId)
    },
    async saveComment({ sharedPostId, content, action }) {
      if (action === 'delete') { mine.delete(sharedPostId); return { success: true, status: 'deleted', comment_id: 'x', comment_count: 1, pending_review: false, comment: null } }
      mine.set(sharedPostId, { status: 'pending', content, checked: true })
      return { success: true, status: 'pending', comment_id: `${sharedPostId}-mine`, comment_count: 1, pending_review: true, comment: null }
    },
    async toggleReaction() { return { reacted: true, reaction_count: 3 } },
  }
}

function createFeedApi() {
  return {
    ...createDetailMock(),
    async getFeed() {
      return { version: 1, max_rows: 50, space: { id: 'space', name: '햇살·바다·별빛 글마을', active_class_count: 3 }, activities, items, has_more: false }
    },
    async getActivityFeed() {
      return { version: 1, max_rows: 50, activity: activities[0], items, has_more: false }
    },
    async getGalleryClasses() {
      return [
        { class_key: 'k-sea', class_name: '바다반', is_own_class: true, post_count: 12, new_count: 0 },
        { class_key: 'k-sun', class_name: '햇살반', is_own_class: false, post_count: 18, new_count: 3 },
        { class_key: 'k-star', class_name: '별빛반', is_own_class: false, post_count: 9, new_count: 0 },
        { class_key: 'k-moon', class_name: '달님반', is_own_class: false, post_count: 0, new_count: 0 },
      ]
    },
    async getClassGallery({ classKey }) {
      const topics = ['우리 동네 자랑', '가을 운동회', '자율 글']
      const items = Array.from({ length: 18 }, (_, index) => ({
        shared_post_id: `g${index}`, title: `${['느티나무', '시장 골목', '달리기', '줄다리기', '가을 하늘', '내 동생'][index % 6]} 이야기 ${index + 1}`,
        excerpt: '짧은 미리보기 문장이 여기에 들어가요. 글을 눌러 끝까지 읽어 보세요.', author_name: ['김햇살', '이구름', '박노을'][index % 3],
        class_name: '햇살반', topic: topics[index % 3], published_at: new Date(now - index * 3600e3).toISOString(),
        is_mine: false, comment_count: index % 4, reaction_count: index % 5,
      }))
      return { version: 1, class_key: classKey, class_name: '햇살반', is_own_class: false, total: items.length, max_rows: 300, items }
    },
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
