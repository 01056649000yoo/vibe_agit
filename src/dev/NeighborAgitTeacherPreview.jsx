import { useState } from 'react'
import NeighborAgitTeacherEntry from '../modules/community/neighbor-agit/TeacherEntry'

const classOne = '11111111-1111-4111-8111-111111111111'
const classTwo = '22222222-2222-4222-8222-222222222222'
const spaceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const activityId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

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
  ],
  activities: [{
    id: activityId,
    type: 'exchange',
    title: '내가 좋아하는 장소를 소개하는 편지',
    prompt: '장소의 모습과 그곳에서 느낀 마음이 잘 드러나게 써 봅시다.',
    status: 'open',
    exchange_share_scope: 'partners',
    can_manage: true,
    can_review: false,
    can_propose_match: true,
    can_review_match: false,
    approvals: [
      { class_id: classOne, class_name: '햇살반', status: 'approved', is_proposer: true },
      { class_id: classTwo, class_name: '바다반', status: 'approved', is_proposer: false },
    ],
    class_stats: [
      { class_id: classOne, class_name: '햇살반', submitted_count: 0, review_count: 0, published_count: 0 },
      { class_id: classTwo, class_name: '바다반', submitted_count: 0, review_count: 0, published_count: 0 },
    ],
    match_pairs: [],
  }],
  review_total: 1,
  review_posts: [
    { shared_post_id: 'review-1', student_name: '김도윤', title: '우리 동네 작은 숲', excerpt: '학교 뒤 산책길에서 발견한 작은 숲을 소개합니다.', status: 'pending' },
  ],
  public_posts: [],
}

const students = (prefix, names) => names.map((name, index) => ({
  student_key: `${prefix}${String(index).padStart(63, '0')}`.slice(0, 64),
  name,
}))

function createPreviewApi() {
  let workspace = structuredClone(initialWorkspace)
  return {
  async getWorkspace() {
    return workspace
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
      { post_id: 'post-1', student_name: '김도윤', title: '우리 동네 작은 숲', excerpt: '학교 뒤 산책길에서 발견한 작은 숲을 소개합니다.', share_status: null },
      { post_id: 'post-2', student_name: '이서윤', title: '할머니의 손편지', excerpt: '할머니가 보내 주신 편지를 읽으며 떠올린 마음을 썼습니다.', share_status: 'pending' },
      { post_id: 'post-3', student_name: '박하준', title: '비 오는 운동장', excerpt: '창문 너머 운동장을 바라보며 소리와 냄새를 기록했습니다.', share_status: 'published' },
    ]
  },
  async getExchangeRoster() {
    return {
      version: 1,
      activity_id: activityId,
      status: 'open',
      exchange_share_scope: 'partners',
      max_students_per_class: 100,
      max_partners_per_student: 2,
      classes: [
        { class_id: classOne, class_name: '햇살반', is_host: true, students: students('a', ['김도윤', '이서윤', '박하준', '최지아']) },
        { class_id: classTwo, class_name: '바다반', is_host: false, students: students('b', ['정현우', '강수아', '조지호']) },
      ],
    }
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

export default function NeighborAgitTeacherPreview() {
  const [previewApi] = useState(createPreviewApi)
  return (
    <div style={{ padding: 20 }}>
      <NeighborAgitTeacherEntry
        activeClass={{ id: classOne, name: '햇살반' }}
        api={previewApi}
      />
    </div>
  )
}
