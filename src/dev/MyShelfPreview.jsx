import { useMemo } from 'react'
import ShelfBook, { SHELF_SECTIONS } from '../components/common/bookshelf/ShelfBook'
import Bookshelf, { BookshelfNotice } from '../components/common/bookshelf/Bookshelf'

/*
 * 책장·책등 미리보기. `?dev-lab=my-shelf`
 *
 * 책등 모양을 다듬을 때 진짜 부품으로 띄워 본다(2026-09-15).
 * 짧은 제목·긴 제목·나만 보는 글을 갈래마다 섞어, 제목이 잘리는지·색이 갈리는지를 한눈에 본다.
 * 책장(Bookshelf)·책(ShelfBook)은 학생 내 서재·선생님의 학생 아지트 보기·친구 공개 서재가
 * 함께 쓰는 공용 부품이라, 여기서 본 모습이 세 화면 그대로다.
 */

/*
 * 보통 제목에 더해 **극단**을 섞는다. 어떤 제목이 와도 책 크기가 흔들리지 않아야 한다.
 * 운영 데이터: 제목의 40% 가 11자 이상, 가장 긴 것은 200자(2026-09-15).
 */
const SAMPLE_TITLES = [
  '봄 소풍',
  '우리 가족 이야기',
  '내가 좋아하는 계절과 그 이유',
  '할머니 댁에 다녀와서 느낀 점을 자세히 적어 본 글',
  '비 오는 날',
  '친구와 다툰 날의 일기',
  '나의 꿈',
  '도서관에서 읽은 책 이야기와 그 뒤에 생각한 것들',
  // 아래는 극단 — 200자, 영어, 이모지, 빈 제목, 빈칸만
  '오늘은 정말 특별한 날이었다 왜냐하면 아침부터 저녁까지 있었던 일을 하나도 빠짐없이 전부 다 적어 보려고 마음먹었기 때문이다 그래서 이 글은 아주 아주 길어질 것이고 제목도 그만큼 길게 지어 보았다 이렇게 길게 써도 책장에서 책이 커지면 안 된다',
  'My Summer Vacation Story',
  '🌈 무지개를 본 날 🌈',
  '',
  '   ',
]

const EDGE_START = 8

const samplePosts = (sectionId, count) => Array.from({ length: count }, (_, index) => ({
  id: `${sectionId}-${index}`,
  title: SAMPLE_TITLES[index % SAMPLE_TITLES.length],
  isEdge: (index % SAMPLE_TITLES.length) >= EDGE_START,
  visibility: index % 3 === 2 ? 'private' : 'class',
  writing_context: sectionId === 'assignment' ? 'assignment' : 'self',
  self_writing_type: sectionId === 'assignment' ? null : sectionId === 'reading' ? 'reading_log' : sectionId,
  char_count: 120 + index * 137,
  post_reactions: Array.from({ length: index % 5 }, (_, i) => ({ id: i })),
}))

/* 친구 서재: 갈래를 섞어 꽂고, 안건 의견(보라)도 한 권 넣는다. 쪽지는 반응 수. */
const friendPosts = () => [
  ...samplePosts('assignment', 3),
  { id: 'meeting-1', title: '급식 순서를 바꾸자는 안건에 대한 내 생각', visibility: 'class', writing_context: 'assignment', self_writing_type: null, writing_missions: { mission_type: 'meeting' }, post_reactions: [{ id: 1 }, { id: 2 }] },
  ...samplePosts('reading', 3),
  ...samplePosts('diary', 2),
].map((post) => ({ ...post, visibility: 'class' }))

const Heading = ({ children }) => (
  <h3 style={{ margin: '0 0 8px', fontSize: 'var(--ui-text-md)', fontWeight: 900, color: '#3E2E23' }}>{children}</h3>
)

export default function MyShelfPreview() {
  // 책들의 정체가 그대로여야 넘긴 칸이 유지된다(Bookshelf 는 items 가 바뀌면 첫 칸으로 간다).
  const sectionPosts = useMemo(() => SHELF_SECTIONS.map((section) => samplePosts(section.id, 13)), [])
  const manyPosts = useMemo(() => samplePosts('assignment', 30), [])
  const teacherPosts = useMemo(() => samplePosts('assignment', 6), [])
  const friendShelf = useMemo(() => friendPosts(), [])
  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px 60px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--ui-text-xl)', fontWeight: 900 }}>📖 책장과 책등</h2>
      <p style={{ margin: '0 0 22px', color: '#8D7B6C', fontSize: 'var(--ui-text-sm)' }}>
        앞 8권은 보통 제목, 뒤 5권은 극단(200자·영어·이모지·빈 제목·빈칸만)이다.
        어떤 제목이 와도 책 크기가 흔들리지 않는지, 제목이 순서대로 읽히는지 본다. 다음 책장으로 넘겨 끝까지 확인한다.
      </p>

      {SHELF_SECTIONS.map((section, index) => {
        const posts = sectionPosts[index]
        return (
          <section key={section.id} style={{ marginBottom: '28px' }}>
            <Heading>{section.icon} {section.tabLabel} <span style={{ opacity: .6 }}>{posts.length}권</span></Heading>
            <Bookshelf
              ariaLabel={`${section.tabLabel} 미리보기`}
              items={posts}
              renderItem={(post) => <ShelfBook key={post.id} post={post} section={section} onOpen={() => {}} />}
            />
          </section>
        )
      })}

      <section style={{ marginBottom: '28px' }}>
        <Heading>📚 30권 <span style={{ opacity: .6 }}>한 칸 최대 12권 · 넘치면 다음 책장으로 미끄러진다 · 손가락으로 밀어도 된다</span></Heading>
        <Bookshelf
          ariaLabel="30권 미리보기"
          items={manyPosts}
          renderItem={(post) => <ShelfBook key={post.id} post={post} section={SHELF_SECTIONS[0]} onOpen={() => {}} />}
        />
      </section>

      <section style={{ marginBottom: '28px' }}>
        <Heading>👀 선생님이 보는 학생 아지트 <span style={{ opacity: .6 }}>쪽지에 글자 수</span></Heading>
        <Bookshelf
          ariaLabel="선생님 보기 미리보기"
          items={teacherPosts}
          renderItem={(post) => (
            <ShelfBook key={post.id} post={post} section={SHELF_SECTIONS[0]} note={`${post.char_count.toLocaleString('ko-KR')}자`} onOpen={() => {}} />
          )}
        />
      </section>

      <section style={{ marginBottom: '28px' }}>
        <Heading>🤝 친구 공개 서재 <span style={{ opacity: .6 }}>갈래 섞임 · 쪽지에 반응 수 · 안건 의견은 보라</span></Heading>
        <Bookshelf
          ariaLabel="친구 서재 미리보기"
          items={friendShelf}
          renderItem={(post, index) => (
            <ShelfBook
              key={post.id}
              post={post}
              note={`♡ ${post.post_reactions.length}`}
              opening={index === 1}
              onOpen={() => {}}
            />
          )}
          style={{ borderRadius: '15px 15px 0 0' }}
        />
      </section>

      <section>
        <Heading>🪵 빈 책장</Heading>
        <Bookshelf ariaLabel="빈 책장 미리보기">
          <BookshelfNotice icon="🪵">완성한 과제가 아직 없어요.</BookshelfNotice>
        </Bookshelf>
      </section>
    </main>
  )
}
