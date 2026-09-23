import { useState } from 'react'
import StudentBooksPanel from '../modules/community/neighbor-agit/books/StudentBooksPanel'

// 📚 문집 나눔 학생 칸을 DB 없이 본다. 방문록 보내기 → "선생님 확인 중" 상태까지 메모리로 흉내 낸다.
const works = [
  { id: 'chapter-1', title: '느티나무 그늘', author: '김햇살', group: '우리 동네', format: 'prose', kindLabel: '글', excerpt: '우리 동네에는', blocks: ['우리 동네에는 커다란 느티나무가 있어요.', '여름이면 그늘 아래에서 친구들과 놀아요.'] },
  { id: 'chapter-2', title: '골목 시장', author: '이구름', group: '우리 동네', format: 'prose', kindLabel: '글', excerpt: '시장에 가면', blocks: ['시장에 가면 떡볶이 냄새가 나요.'] },
]
const bookInfo = {
  title: '햇살반 동네 이야기', subtitle: '우리가 사는 곳', cover_kicker: '우리 반의 이야기', introduction: '우리 동네 자랑을 모았어요.',
  class_label: '햇살반', term: '2학기', issue_date: '2026-09-23', grouping: 'custom', design: 'storybook', paper: 'A4', book_type: 'class', page_breaks: [],
}

function createApi() {
  let mine = null
  const entries = [{ entry_id: 'e1', student_name: '박바다', class_name: '바다반', content: '느티나무 이야기가 제일 좋았어요!', is_mine: false }]
  return {
    async getSpaceBooks() {
      return [
        { shared_book_id: 'sb-1', class_name: '햇살반', is_own_class: false, title: '햇살반 동네 이야기', subtitle: '우리가 사는 곳', design: 'storybook', paper: 'A4', number: 2, guestbook_count: 1, my_entry_status: mine?.status || null },
        { shared_book_id: 'sb-2', class_name: '바다반', is_own_class: true, title: '바다반 여름 일기', subtitle: '', design: 'ocean', paper: 'A5', number: 1, guestbook_count: 4, my_entry_status: null },
        { shared_book_id: 'sb-3', class_name: '별빛반', is_own_class: false, title: '별빛반 가을 시 모음', subtitle: '열두 편의 시', design: 'constellation', paper: 'A4', number: 1, guestbook_count: 0, my_entry_status: null },
      ]
    },
    async getSharedBook({ workId }) {
      if (workId) return { version: 1, id: 'ed-1', number: 2, book: bookInfo, works: null, work: works.find((item) => item.id === workId), guestbook: null }
      return {
        version: 1, id: 'ed-1', number: 2, book: bookInfo, work: null,
        works: works.map(({ id, title, author, group }) => ({ id, title, author, group })),
        guestbook: { entries, mine, owner_class_name: '햇살반' },
      }
    },
    async saveGuestbook({ content, action }) {
      mine = action === 'delete' ? null : { entry_id: 'mine', content, status: 'pending' }
      return { success: true }
    },
  }
}

export default function NeighborBooksStudentPreview() {
  const [api] = useState(createApi)
  return (
    <div style={{ padding: 20, maxWidth: 980 }}>
      <StudentBooksPanel spaceId="preview-space" api={api} />
    </div>
  )
}
