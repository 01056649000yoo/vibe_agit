// 저장값은 이 목록의 ID만 허용한다. 화면과 인쇄가 같은 판형·디자인을 사용한다.
export const GALLERY_THEMES = Object.freeze([
    { id: 'garden', label: '햇살 정원', description: '따뜻한 나무 바닥과 초록 식물', wall: '#eeeee3', floor: '#cfb28b', accent: '#597553' },
    { id: 'museum', label: '하얀 미술관', description: '밝은 회벽과 돌 바닥의 차분한 공간', wall: '#fafafa', floor: '#d7dce2', accent: '#475569' },
    { id: 'library', label: '이야기 서재', description: '나무 패널과 책장, 깊은 초록 벽', wall: '#35594e', floor: '#98724e', accent: '#ddbd83' },
    { id: 'night', label: '별빛 전시실', description: '별이 빛나는 남색 벽과 은빛 액자', wall: '#202d4c', floor: '#44516b', accent: '#c7d5fc' },
]);
export const BOOK_PAPERS = Object.freeze([
    { id: 'A4', label: 'A4', width: 210, height: 297, marginX: 18, marginTop: 18, marginBottom: 20, description: '넉넉한 본문 · 학교 프린터' },
    { id: 'A5', label: 'A5', width: 148, height: 210, marginX: 13, marginTop: 13, marginBottom: 17, description: '작고 가벼운 책 · A4의 절반' },
    { id: 'B5', label: 'B5 (JIS)', width: 182, height: 257, marginX: 16, marginTop: 16, marginBottom: 19, description: '읽기 편한 중간 크기' },
]);
export const BOOK_DESIGNS = Object.freeze([
    { id: 'botanical', label: '초록 문집', description: '차분한 이중 테두리와 풀빛 표지', paper: '#f5f2e8', ink: '#304b3a', accent: '#476755', mark: '✦', border: 'double' },
    { id: 'editorial', label: '우리 반 매거진', description: '큰 제목과 선명한 주황 띠', paper: '#fff7ed', ink: '#2d343b', accent: '#b84920', mark: '—', border: 'solid' },
    { id: 'notebook', label: '이야기 노트', description: '푸른 줄과 손글씨 공책의 분위기', paper: '#f2f7fb', ink: '#29475e', accent: '#326481', mark: '〰', border: 'solid' },
    { id: 'constellation', label: '별을 모은 책', description: '짙은 남색 표지와 별빛 장식', paper: '#22304a', ink: '#fff8e8', accent: '#d6b577', mark: '✧', border: 'solid' },
]);
export const getGalleryTheme = (id) => GALLERY_THEMES.find((item) => item.id === id) || GALLERY_THEMES[0];
export const getBookPaper = (id) => BOOK_PAPERS.find((item) => item.id === id) || BOOK_PAPERS[0];
export const getBookDesign = (id) => BOOK_DESIGNS.find((item) => item.id === id) || BOOK_DESIGNS[0];
export function bookCoverStyle(designId, paperId) {
    const design = getBookDesign(designId), paper = getBookPaper(paperId);
    return { '--book-paper': design.paper, '--book-ink': design.ink, '--book-accent': design.accent,
        '--book-border': design.border, aspectRatio: `${paper.width} / ${paper.height}` };
}
// 전시관 표지도 문집 표지와 같은 자리·같은 종이 비율로 세운다. 어두운 벽 테마는 글자를 밝게 쓴다.
const GALLERY_COVER_INK = Object.freeze({ garden: '#2f4133', museum: '#334155', library: '#f5efe2', night: '#eef2ff' });
export function galleryCoverStyle(themeId) {
    const theme = getGalleryTheme(themeId);
    return { '--gallery-wall': theme.wall, '--gallery-floor': theme.floor, '--gallery-accent': theme.accent,
        '--gallery-ink': Reflect.get(GALLERY_COVER_INK, theme.id), aspectRatio: `${BOOK_PAPERS[0].width} / ${BOOK_PAPERS[0].height}` };
}
export function createBookPrintSettings(book = {}) {
    return { paper: getBookPaper(book.paper_format).id, design: getBookDesign(book.design_id).id, body_pt: 12, poem_pt: 14, version: 2 };
}
export function validBookPrintSettings(settings) {
    return settings?.body_pt === 12 && settings?.poem_pt === 14 && (settings.version === 1
        ? settings.paper === 'A4' && settings.design === undefined
        : settings.version === 2 && BOOK_PAPERS.some((paper) => paper.id === settings.paper) && BOOK_DESIGNS.some((design) => design.id === settings.design));
}

const ROOM_VARIANTS = Object.freeze({
    garden: [
        { label: '햇살 정원', wall: '#eeeee3', glow: '#fffef0', side: '#d4dec8', floor: '#cfb28b' },
        { label: '푸른 하늘 정원', wall: '#c8e3eb', glow: '#f0fbff', side: '#9dc6d1', floor: '#c6b99c' },
        { label: '살구꽃 정원', wall: '#f1d5c4', glow: '#fff3e6', side: '#d8b79e', floor: '#c79d79' },
        { label: '초록 잎 정원', wall: '#ccddc7', glow: '#f0f6da', side: '#a7bea0', floor: '#b2aa83' },
    ],
    museum: [
        { label: '하얀 전시장', wall: '#e8edf2', glow: '#ffffff', side: '#d3d9df', floor: '#d7dce2' },
        { label: '푸른 회랑', wall: '#cbdce7', glow: '#f5fcff', side: '#aebdce', floor: '#bdcbd5' },
        { label: '따뜻한 회랑', wall: '#e8dacb', glow: '#fff9ee', side: '#cfc0ae', floor: '#d9c7b1' },
        { label: '보랏빛 회랑', wall: '#dcd4e8', glow: '#fcf7ff', side: '#c0b5cf', floor: '#c9c4d4' },
    ],
    library: [
        { label: '초록 서재', wall: '#2b5145', glow: '#46695c', side: '#765137', floor: '#98724e' },
        { label: '푸른 서재', wall: '#294e66', glow: '#52758a', side: '#674a39', floor: '#a08061' },
        { label: '호박빛 서재', wall: '#69482e', glow: '#967347', side: '#573c28', floor: '#ad8455' },
        { label: '자줏빛 서재', wall: '#503956', glow: '#795a7f', side: '#684a49', floor: '#94745f' },
    ],
    night: [
        { label: '푸른 별밤', wall: '#3e5177', glow: '#17223e', side: '#192744', floor: '#44516b' },
        { label: '보랏빛 은하', wall: '#605185', glow: '#291e46', side: '#37294f', floor: '#696080' },
        { label: '새벽 바다', wall: '#386b7c', glow: '#142f45', side: '#1b3d50', floor: '#4e7180' },
        { label: '노을 별자리', wall: '#79516b', glow: '#381f3f', side: '#4b2d48', floor: '#806477' },
    ],
});
export const getRoomVariants = (theme) => Reflect.get(ROOM_VARIANTS, getGalleryTheme(theme).id);
export function roomVariantStyle(theme, index) {
    const variant = getRoomVariants(theme).at(Number.isInteger(index) && index >= 0 && index <= 3 ? index : 0);
    return { '--variant-wall': variant.wall, '--variant-glow': variant.glow, '--variant-side': variant.side, '--variant-floor': variant.floor };
}
