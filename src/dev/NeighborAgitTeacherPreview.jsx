import { useState } from 'react'
import NeighborAgitTeacherEntry from '../modules/community/neighbor-agit/TeacherEntry'

const classOne = '11111111-1111-4111-8111-111111111111'
const classTwo = '22222222-2222-4222-8222-222222222222'
const spaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const activityId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const proposalId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const classThree = '33333333-3333-4333-8333-333333333333'
const inDays = (days) => new Date(Date.now() + days * 86400000).toISOString()

const initialWorkspace = {
  version: 1,
  rollout_mode: 'limited_beta',
  class: { id: classOne, name: '햇살반', module_enabled: true },
  space: {
    id: spaceId,
    name: '햇살·바다 글마을',
    description: '두 반이 글로 만나 서로의 생각을 발견하는 공간',
    my_role: 'host',
    my_status: 'active',
    host_class_id: classOne,
    student_access_enabled: true,
  },
  memberships: [
    { class_id: classOne, class_name: '햇살반', matchable_student_count: 4, role: 'host', status: 'active', student_access_enabled: true },
    { class_id: classTwo, class_name: '바다반', matchable_student_count: 3, role: 'guest', status: 'active', student_access_enabled: true },
    { class_id: classThree, class_name: '별빛반', matchable_student_count: 0, role: 'guest', status: 'pending', student_access_enabled: false },
  ],
  notifications: { pending_approvals: 1, pending_joins: 1, blocked_comments: 0, new_posts: 0, new_comments: 0, pending_guestbook: 1, new_topic_submissions: 2 },
  blocked_comments: [],
  pending_guestbook: [
    { entry_id: 'gb-1', shared_book_id: 'sb-1', book_title: '햇살반 동네 이야기', student_name: '박바다', class_name: '바다반', content: '느티나무 이야기가 제일 좋았어요! 우리 동네에도 큰 나무가 있어요.', created_at: new Date().toISOString() },
  ],
  activities: [{
    id: activityId,
    type: 'topic',
    title: '내가 좋아하는 장소를 소개하는 편지',
    prompt: '장소의 모습과 그곳에서 느낀 마음이 잘 드러나게 써 봅시다.',
    status: 'open',
    writing_close_at: inDays(3),
    comments_close_at: inDays(10),
    can_manage: true,
    can_review: false,
    approvals: [
      { class_id: classOne, class_name: '햇살반', status: 'approved', is_proposer: true },
      { class_id: classTwo, class_name: '바다반', status: 'approved', is_proposer: false },
    ],
    // 우리 반 제출 글 카드(20261342): 번호 순, 새로 낸 글 2편, 공개 중 1편.
    my_submissions: Array.from({ length: 20 }, (_, index) => ({
      post_id: `sub-${index + 1}`,
      title: ['할머니 댁 앞 작은 개울', '도서관 창가 자리', '우리 집 옥상에서 본 노을이 정말 예뻐서 매일 올라가요', '학교 뒤 산책길', '놀이터 미끄럼틀'][index % 5] + (index >= 5 ? ` ${index + 1}` : ''),
      student_name: ['김도윤', '이서연', '박하준', '최지우', '정민재', '한수아', '윤지호', '강예은', '조은우', '임하린'][index % 10],
      share_status: index === 0 ? 'published' : null,
      is_new: index >= 18,
    })),
    class_stats: [
      { class_id: classOne, class_name: '햇살반', submitted_count: 20, review_count: 0, published_count: 1 },
      { class_id: classTwo, class_name: '바다반', submitted_count: 0, review_count: 0, published_count: 0 },
    ],
    match_pairs: [],
  }, {
    id: proposalId,
    type: 'topic',
    title: '가을 운동회에서 가장 기억에 남는 순간',
    prompt: '그때의 소리·표정·마음을 떠올려 한 장면을 자세히 써 봅시다.',
    status: 'pending_approval',
    writing_close_at: inDays(7),
    comments_close_at: null,
    can_manage: true,
    can_review: true,
    approvals: [
      { class_id: classTwo, class_name: '바다반', status: 'approved', is_proposer: true },
      { class_id: classOne, class_name: '햇살반', status: 'pending', is_proposer: false },
    ],
    class_stats: [],
    match_pairs: [],
  }],
  review_total: 1,
  review_posts: [
    { shared_post_id: 'review-1', student_name: '김도윤', title: '우리 동네 작은 숲', excerpt: '학교 뒤 산책길에서 발견한 작은 숲을 소개합니다.', status: 'pending' },
  ],
  public_posts: [],
}

function createPreviewApi() {
  let workspace = structuredClone(initialWorkspace)
  return {
  async getWorkspace() {
    return workspace
  },
  async getEngagement({ kind }) {
    const post = (id, title, topic, c, r) => ({ shared_post_id: id, title, author_name: '김햇살', class_name: '햇살반', topic, published_at: new Date().toISOString(), comment_count: c, reaction_count: r })
    return [
      { class_key: 'k-sun', class_name: '햇살반', is_own_class: true, post_count: 3, comment_total: 4, reaction_total: 6,
        posts: kind === 'topic' ? [] : [post('e1', '느티나무 그늘', '우리 동네 자랑', 2, 3), post('e2', '골목 시장', '우리 동네 자랑', 1, 2), post('e3', '이어달리기', '가을 운동회', 1, 1)] },
      { class_key: 'k-sea', class_name: '바다반', is_own_class: false, post_count: 2, comment_total: 1, reaction_total: 5,
        posts: kind === 'topic' ? [] : [post('e4', '조개 줍기', '여름 방학', 1, 3), post('e5', '파도 소리', '여름 방학', 0, 2)] },
    ]
  },
  async markSeen() {
    return { success: true }
  },
  // 진행 현황을 보면 서버가 새 제출 기준선을 옮긴다 — 다음 작업 공간 응답부터 NEW·숫자가 빠진다.
  async getActivityCandidates({ activityId: id }) {
    const activity = workspace.activities.find((item) => item.id === id)
    return (activity?.my_submissions || []).map((submission) => ({
      post_id: submission.post_id, student_name: submission.student_name, title: submission.title || '제목 없음',
      excerpt: '제출한 글의 앞부분이 여기에 보여요.', updated_at: new Date().toISOString(),
      shared_post_id: submission.share_status ? `shared-${submission.post_id}` : null, share_status: submission.share_status,
    }))
  },
  async deleteActivity({ activityId: id }) {
    workspace = { ...workspace, activities: workspace.activities.filter((activity) => activity.id !== id) }
    return { success: true, activity_id: id }
  },
  async markTopicSeen() {
    workspace = {
      ...workspace,
      notifications: { ...workspace.notifications, new_topic_submissions: 0 },
      activities: workspace.activities.map((activity) => ({
        ...activity,
        my_submissions: (activity.my_submissions || []).map((submission) => ({ ...submission, is_new: false })),
      })),
    }
    return { success: true }
  },
  async setActivitySchedule({ activityId: id, changes }) {
    workspace = { ...workspace, activities: workspace.activities.map((activity) => activity.id === id ? { ...activity, ...changes } : activity) }
    return { success: true, activity_id: id }
  },
  async runAction(_classId, action, payload) {
    if (action === 'review_post') {
      workspace = { ...workspace, review_total: 0, review_posts: [] }
    }
    if (action === 'publish_gallery_post' || (action === 'review_post' && payload.decision === 'publish')) {
      workspace = { ...workspace, public_posts: [{ shared_post_id: 'review-1', title: '우리 동네 작은 숲', author_name: '김도윤', class_name: '햇살반', status: 'published', is_own_class: true, excerpt: '학교 뒤 작은 숲을 소개합니다.' }] }
    }
    return {
      result: action === 'publish_gallery_post'
        ? { shared_post_id: 'preview-shared', status: 'published' }
        : { success: true },
      workspace,
    }
  },
  async getShareCandidates() {
    return [
      { post_id: 'post-1', mission_id: 'mission-town', mission_title: '우리 동네의 숨은 보물', student_name: '김도윤', title: '우리 동네 작은 숲', excerpt: '학교 뒤 산책길에서 발견한 작은 숲을 소개합니다.', share_status: null },
      { post_id: 'post-2', mission_id: 'mission-letter', mission_title: '마음을 전하는 편지', student_name: '이서윤', title: '할머니의 손편지', excerpt: '할머니가 보내 주신 편지를 읽으며 떠올린 마음을 썼습니다.', share_status: 'pending' },
      { post_id: 'post-3', mission_id: 'mission-town', mission_title: '우리 동네의 숨은 보물', student_name: '박하준', title: '비 오는 운동장', excerpt: '창문 너머 운동장을 바라보며 소리와 냄새를 기록했습니다.', share_status: 'published' },
    ]
  },
  async getSourcePost({ postId }) {
    const detail = await this.getPostDetail()
    return { ...detail, post_id: postId, student_name: '김도윤' }
  },
  async getPostDetail() {
    return { version: 1, shared_post_id: 'review-1', title: '우리 동네 작은 숲', author_name: '김도윤', content: '학교 뒤 산책길에서 작은 숲을 발견했습니다.\n\n나무 아래에 앉으니 바람 소리와 새소리가 들렸습니다. 친구들과 이곳에서 쉬고 싶습니다.\n\n다음에는 떨어진 나뭇잎을 관찰해 보기로 했습니다.', source_revision: 'preview-revision', comments: [] }
  },
  }
}

function createBooksPreviewApi() {
  let data = {
    version: 1,
    my_books: [
      { book_id: 'book-1', title: '햇살반 동네 이야기', latest_edition_id: 'ed-2', latest_number: 2, any_edition_number: 2, work_count: 24, shared_book_id: 'sb-1', shared_status: 'published', shared_number: 1, guestbook_min_chars: 100, design: 'storybook', paper: 'A4' },
      { book_id: 'book-2', title: '가을 시 모음', latest_edition_id: 'ed-3', latest_number: 1, any_edition_number: 2, work_count: 12, shared_book_id: null, shared_status: null, shared_number: null, design: 'constellation', paper: 'A5' },
      { book_id: 'book-3', title: '우리들의 문집', latest_edition_id: null, latest_number: null, any_edition_number: null, work_count: 0, shared_book_id: null, shared_status: null, shared_number: null, design: 'botanical', paper: 'A4' },
      { book_id: 'book-4', title: '여름 방학 이야기', latest_edition_id: null, latest_number: null, any_edition_number: 1, work_count: 0, shared_book_id: null, shared_status: null, shared_number: null, design: 'ocean', paper: 'A4' },
    ],
    shared_books: [
      { shared_book_id: 'sb-1', class_name: '햇살반', is_own_class: true, title: '햇살반 동네 이야기', number: 1, approved_count: 3, pending_count: 1 },
      { shared_book_id: 'sb-2', class_name: '바다반', is_own_class: false, title: '바다반 여름 일기', number: 2, approved_count: 5, pending_count: 0 },
    ],
    approved_entries: [
      { entry_id: 'gb-0', shared_book_id: 'sb-1', book_title: '햇살반 동네 이야기', student_name: '김별빛', class_name: '별빛반', content: '표지가 정말 예뻐요.' },
    ],
  }
  return {
    async getTeacherBooks() { return data },
    async shareBook({ bookId }) {
      data = { ...data, my_books: data.my_books.map((book) => book.book_id === bookId ? { ...book, shared_book_id: book.shared_book_id || 'sb-new', shared_status: 'published', shared_number: book.latest_number } : book) }
      return { success: true }
    },
    async withdrawBook({ sharedBookId }) {
      data = { ...data, my_books: data.my_books.map((book) => book.shared_book_id === sharedBookId ? { ...book, shared_status: 'withdrawn' } : book) }
      return { success: true }
    },
    async setSharedUntil({ sharedBookId, sharedUntil }) {
      data = { ...data, my_books: data.my_books.map((book) => book.shared_book_id === sharedBookId ? { ...book, shared_until: sharedUntil } : book) }
      return { success: true, shared_book_id: sharedBookId, shared_until: sharedUntil }
    },
    async setGuestbookMinChars({ sharedBookId, minChars }) {
      data = { ...data, my_books: data.my_books.map((book) => book.shared_book_id === sharedBookId ? { ...book, guestbook_min_chars: minChars } : book) }
      return { success: true, shared_book_id: sharedBookId, guestbook_min_chars: minChars }
    },
    async reviewGuestbook({ entryId }) { return { success: true, entry_id: entryId } },
  }
}

export default function NeighborAgitTeacherPreview() {
  const [previewApi] = useState(createPreviewApi)
  const [booksApi] = useState(createBooksPreviewApi)
  return (
    <div style={{ padding: 20 }}>
      <NeighborAgitTeacherEntry
        activeClass={{ id: classOne, name: '햇살반' }}
        api={previewApi}
        booksApi={booksApi}
        onNavigateTab={(tab) => window.alert(`교사 메뉴 이동: ${tab}`)}
      />
    </div>
  )
}
