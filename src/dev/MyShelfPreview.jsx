import ShelfBook, { SHELF_SECTIONS } from '../components/student/ShelfBook'

/*
 * 내 서재 책등 미리보기. `?dev-lab=my-shelf`
 *
 * 책등 모양을 다듬을 때 진짜 부품으로 띄워 본다(2026-09-15).
 * 짧은 제목·긴 제목·나만 보는 글을 갈래마다 섞어, 제목이 잘리는지·색이 갈리는지를 한눈에 본다.
 * 책장 판자·선반은 MyAgitPanel 의 것과 같은 값이다 — 그 안에 꽂힌 모습으로 봐야 한다.
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
}))

const Shelf = ({ section, posts }) => (
  <section style={{ marginBottom: '28px' }}>
    <h3 style={{ margin: '0 0 8px', fontSize: 'var(--ui-text-md)', fontWeight: 900, color: '#3E2E23' }}>
      {section.icon} {section.tabLabel} <span style={{ opacity: .6 }}>{posts.length}권</span>
    </h3>
    <div style={{
      borderRadius: '8px 8px 0 0', background: 'linear-gradient(180deg,#E8CFAC 0%,#D9B582 100%)',
      boxShadow: 'inset 0 8px 16px rgba(67,37,18,.2), inset 5px 0 6px rgba(67,37,18,.12), inset -5px 0 6px rgba(67,37,18,.12)',
    }}>
      <div style={{
        minHeight: '200px', display: 'flex', alignItems: 'flex-end', gap: '5px',
        padding: '14px 12px 0', overflowX: 'auto', boxSizing: 'border-box',
      }}>
        {posts.map((post) => (
          <ShelfBook key={post.id} post={post} section={section} onOpen={() => {}} />
        ))}
      </div>
      <div aria-hidden="true" style={{
        height: '17px', borderTop: '2px solid #B97943', borderBottom: '4px solid #552C18',
        background: 'linear-gradient(180deg,#A96838 0%,#7E4525 58%,#60331C 100%)',
        boxShadow: '0 -3px 6px rgba(57,29,14,.2), 0 5px 8px rgba(57,29,14,.28)',
      }} />
    </div>
  </section>
)

export default function MyShelfPreview() {
  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 16px 60px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--ui-text-xl)', fontWeight: 900 }}>📖 내 서재 책등</h2>
      <p style={{ margin: '0 0 22px', color: '#8D7B6C', fontSize: 'var(--ui-text-sm)' }}>
        앞 8권은 보통 제목, 뒤 5권은 극단(200자·영어·이모지·빈 제목·빈칸만)이다.
        어떤 제목이 와도 책 크기가 흔들리지 않는지, 제목이 순서대로 읽히는지 본다. 옆으로 넘겨 끝까지 확인한다.
      </p>
      {SHELF_SECTIONS.map((section) => (
        <Shelf key={section.id} section={section} posts={samplePosts(section.id, 13)} />
      ))}
    </main>
  )
}
