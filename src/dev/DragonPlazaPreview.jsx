import DragonPlazaEntry from '../modules/game/dragon-plaza/DragonPlazaEntry.jsx'

// 우리반 수호룡 아지트 — 서로 다른 단계·종류·공방 장식의 반 친구 12명을 DB 없이 보여 준다(2026-10-24).
const SPECIES = ['star', 'forest', 'ember', 'moon']
const FRAMES = ['default', 'sunny-garden', 'wave-harbor', 'sky', 'forest', 'volcano', 'moon', 'crystal', 'rune', 'galaxy', 'storm', 'dreamlight-library']
const PLATES = ['nameplate-sunny-garden', 'nameplate-brass', 'nameplate-ember', '', 'nameplate-crystal', '', 'nameplate-celestial', '', '', 'nameplate-sunny-garden', '', '']
const NAMES = ['김도윤', '이서연', '박하준', '최지우', '정민재', '한수아', '윤지호', '강예은', '조은우', '임하린', '송다온', '오세아']
const CHARS = [0, 600, 1500, 3200, 6000, 12000, 22000, 35000, 52000, 80000, 120000, 200000]

// `&plaza=40` — 네 종류 × 10단계 40마리가 모두 앉은 교실(그림이 전부 뜨는지 시험)
const FULL = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('plaza') === '40'
const SPECIES_ORDER = ['star', 'forest', 'ember', 'moon']
const FULL_CLASSMATES = SPECIES_ORDER.flatMap((species, row) => Array.from({ length: 10 }, (_, index) => ({
  id: `full-${species}-${index + 1}`, name: `${['별', '숲', '노', '달'].at(row)}${index + 1}`,
  pet_data: { species, level: index + 1, _testWriterLevel: index + 1, equippedDecor: { wallpaper: FRAMES.at((row * 10 + index) % FRAMES.length), nameplate: PLATES.at((row * 10 + index) % PLATES.length) || undefined } },
  writer_total_chars: [0, 600, 1500, 3200, 6000, 12000, 22000, 35000, 52000, 80000].at(index) * 1, writer_completed_posts: index * 4
})))
const classmates = FULL ? FULL_CLASSMATES : NAMES.map((name, index) => ({
  id: `friend-${index + 1}`, name,
  pet_data: { species: SPECIES.at(index % 4), level: index + 1, equippedDecor: { wallpaper: FRAMES.at(index), nameplate: PLATES.at(index) || undefined } },
  writer_total_chars: CHARS.at(index), writer_completed_posts: index * 2
}))
const me = { id: 'me', name: '나나', pet_data: { species: 'star', level: 4, equippedDecor: { wallpaper: 'sunny-garden', nameplate: 'nameplate-sunny-garden' } }, writer_total_chars: 3600, writer_completed_posts: 7 }
const now = Date.now()
const api = {
  loadClassmates: async () => classmates,
  loadMe: async () => me,
  loadFeed: async () => FULL ? [{ id: 'post-full', student_id: 'full-ember-7', title: '새 글 시험', feed_published_at: new Date(now - 3600000).toISOString() }] : [
    { id: 'post-1', student_id: 'friend-3', title: '비 오는 날의 운동장', feed_published_at: new Date(now - 3600000).toISOString() },
    { id: 'post-2', student_id: 'friend-7', title: '우리 동네 작은 숲', feed_published_at: new Date(now - 86400000).toISOString() },
    { id: 'post-3', student_id: 'friend-9', title: '아주 오래된 글', feed_published_at: new Date(now - 30 * 86400000).toISOString() }
  ],
  loadConquests: async () => [{ student_id: 'friend-3', decks: [1, 2, 3] }, { student_id: 'friend-4', decks: [1] }],
  loadVisitors: async () => [{ name: '이서연' }, { name: '박하준' }, { name: '윤지호' }]
}

export default function DragonPlazaPreview() {
  return <DragonPlazaEntry studentSession={{ id: 'me', class_id: 'class-1' }} onBack={() => {}} onNavigate={(page, params) => window.alert(`이동: ${page} ${JSON.stringify(params)}`)} api={api} />
}
