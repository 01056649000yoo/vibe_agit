// 저장값은 이 목록의 ID만 허용한다. 화면과 인쇄가 같은 판형·디자인을 사용한다.
export const GALLERY_THEMES = Object.freeze([
    { id: 'garden', label: '세이지 갤러리', description: '옅은 세이지와 자연광', wall: '#e9eee8', floor: '#cbd5c9', accent: '#3e6657', ink: '#234439' },
    { id: 'museum', label: '화이트 큐브', description: '백색 벽과 석재 톤', wall: '#f5f5f2', floor: '#dce0e1', accent: '#344352', ink: '#263442' },
    { id: 'library', label: '딥 그린', description: '짙은 녹색과 황동 포인트', wall: '#29483d', floor: '#577064', accent: '#e2c999', ink: '#f4f3e9' },
    { id: 'night', label: '미드나잇 블루', description: '남색 벽과 은은한 조명', wall: '#1d2941', floor: '#35425b', accent: '#bdccef', ink: '#f4f6ff' },
    { id: 'atelier', label: '크림 아틀리에', description: '따뜻한 크림과 잉크 블루', wall: '#f4efe5', floor: '#d9d2c3', accent: '#395e79', ink: '#273f50' },
    { id: 'terracotta', label: '테라코타', description: '흙빛 벽과 부드러운 대비', wall: '#dcb8a4', floor: '#b88b79', accent: '#623d38', ink: '#4a2e2c' },
    { id: 'ink', label: '차콜 스튜디오', description: '먹빛 공간과 또렷한 액자', wall: '#303538', floor: '#505659', accent: '#e6dfd0', ink: '#f5f1e9' },
    { id: 'lilac', label: '라일락 룸', description: '옅은 보랏빛과 차분한 회색', wall: '#eeebf2', floor: '#d6d0df', accent: '#6c5d84', ink: '#453954' },
]);
export const BOOK_PAPERS = Object.freeze([
    { id: 'A4', label: 'A4', width: 210, height: 297, marginX: 18, marginTop: 18, marginBottom: 20, description: '넉넉한 본문 · 학교 프린터' },
    { id: 'A5', label: 'A5', width: 148, height: 210, marginX: 13, marginTop: 13, marginBottom: 17, description: '작고 가벼운 책 · A4의 절반' },
    { id: 'B5', label: 'B5 (JIS)', width: 182, height: 257, marginX: 16, marginTop: 16, marginBottom: 19, description: '읽기 편한 중간 크기' },
]);
export const BOOK_DESIGNS = Object.freeze([
    { id: 'botanical', label: '세이지 에디션', description: '여백이 넉넉한 세이지 그린', paper: '#edf1e9', ink: '#20392f', accent: '#467160', mark: '01', border: 'solid' },
    { id: 'editorial', label: '에디토리얼', description: '오프화이트와 버밀리언 타이포', paper: '#f7f4ed', ink: '#25282a', accent: '#bd503f', mark: '02', border: 'solid' },
    { id: 'notebook', label: '블루 그리드', description: '코발트 선과 정돈된 격자', paper: '#ecf2f8', ink: '#1f354c', accent: '#456f9a', mark: '03', border: 'solid' },
    { id: 'constellation', label: '미드나잇', description: '깊은 남색과 절제된 은빛', paper: '#202c40', ink: '#f6f4ec', accent: '#c7d3e9', mark: '04', border: 'solid' },
    { id: 'storybook', label: '소프트 코랄', description: '살구빛과 부드러운 곡선', paper: '#f8e9e2', ink: '#573b3e', accent: '#c97168', mark: '05', border: 'solid' },
    { id: 'ocean', label: '딥 티얼', description: '짙은 청록과 수평선', paper: '#dfece9', ink: '#163b43', accent: '#327985', mark: '06', border: 'solid' },
    { id: 'modern', label: '모노 블록', description: '대담한 검정과 시트러스', paper: '#f1f0e9', ink: '#202224', accent: '#a3aa43', mark: '07', border: 'solid' },
    { id: 'hanji', label: '뉴트럴 페이퍼', description: '따뜻한 종이색과 붉은 인장', paper: '#efe8db', ink: '#3d3831', accent: '#a45949', mark: '08', border: 'solid' },
]);
export const getGalleryTheme = (id) => GALLERY_THEMES.find((item) => item.id === id) || GALLERY_THEMES[0];
export const getBookPaper = (id) => BOOK_PAPERS.find((item) => item.id === id) || BOOK_PAPERS[0];
export const getBookDesign = (id) => BOOK_DESIGNS.find((item) => item.id === id) || BOOK_DESIGNS[0];
export function bookCoverStyle(designId, paperId) {
    const design = getBookDesign(designId), paper = getBookPaper(paperId);
    return { '--book-paper': design.paper, '--book-ink': design.ink, '--book-accent': design.accent,
        '--book-border': design.border, aspectRatio: `${paper.width} / ${paper.height}` };
}
// 전시관 표지도 문집 표지와 같은 자리·같은 종이 비율로 세운다.
export function galleryCoverStyle(themeId) {
    const theme = getGalleryTheme(themeId);
    return { '--gallery-wall': theme.wall, '--gallery-floor': theme.floor, '--gallery-accent': theme.accent,
        '--gallery-ink': theme.ink, aspectRatio: `${BOOK_PAPERS[0].width} / ${BOOK_PAPERS[0].height}` };
}
/*
 * 쪽 배치 — `work-per-page` 는 작품마다 새 쪽에서 시작(지금까지의 모양),
 * `continuous` 는 앞 작품이 끝난 자리에서 이어 붙인다.
 * **기본은 work-per-page** 다. 예전에 만든 문집의 모양이 바뀌면 안 된다.
 */
export const BOOK_PAGE_LAYOUTS = Object.freeze([
    Object.freeze({ id: 'work-per-page', label: '작품마다 새 쪽', hint: '각 작품을 새 쪽에서 시작해 여백을 넉넉히 둡니다.' }),
    Object.freeze({ id: 'continuous', label: '그대로 이어붙이기', hint: '앞 작품이 끝난 자리부터 다음 작품을 이어서 종이를 아낍니다.' })
]);

export const getBookPageLayout = (id) => BOOK_PAGE_LAYOUTS.find((layout) => layout.id === id) || BOOK_PAGE_LAYOUTS[0];

export function createBookPrintSettings(book = {}) {
    return { paper: getBookPaper(book.paper_format).id, design: getBookDesign(book.design_id).id,
        layout: getBookPageLayout(book.page_layout).id, body_pt: 12, poem_pt: 14, version: 2 };
}
export function validBookPrintSettings(settings) {
    return settings?.body_pt === 12 && settings?.poem_pt === 14 && (settings.version === 1
        ? settings.paper === 'A4' && settings.design === undefined
        /*
         * `layout` 은 없어도 된다 — 이 설정이 생기기 전에 만든 확정판이 있다.
         * 없으면 예전 모양(작품마다 새 쪽)으로 읽는다. 다만 **아는 값이어야** 한다.
         */
        : settings.version === 2 && BOOK_PAPERS.some((paper) => paper.id === settings.paper)
            && BOOK_DESIGNS.some((design) => design.id === settings.design)
            && (settings.layout === undefined || BOOK_PAGE_LAYOUTS.some((layout) => layout.id === settings.layout)));
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
    atelier: [
        { label: '크림', wall: '#f4efe5', glow: '#fffdf8', side: '#ded6c7', floor: '#d9d2c3' },
        { label: '오트', wall: '#e7dece', glow: '#faf5eb', side: '#cfc4b1', floor: '#c9bda9' },
        { label: '아이스 블루', wall: '#dde8ec', glow: '#f5fbfc', side: '#c5d5d9', floor: '#cbd8db' },
        { label: '웜 그레이', wall: '#e3e0da', glow: '#f8f7f2', side: '#cecbc5', floor: '#d0ccc5' },
    ],
    terracotta: [
        { label: '테라코타', wall: '#dcb8a4', glow: '#f4ddd0', side: '#c59b88', floor: '#b88b79' },
        { label: '코랄', wall: '#e8c5b6', glow: '#fff0e8', side: '#d5a99c', floor: '#c49d90' },
        { label: '로즈 브라운', wall: '#bc948c', glow: '#e1c1b8', side: '#a97f78', floor: '#9e776f' },
        { label: '클레이', wall: '#d6bda9', glow: '#f0e1d1', side: '#bea38f', floor: '#b29683' },
    ],
    ink: [
        { label: '차콜', wall: '#303538', glow: '#555c5e', side: '#252b2e', floor: '#505659' },
        { label: '슬레이트', wall: '#39464d', glow: '#5c6970', side: '#2d383e', floor: '#59656b' },
        { label: '잉크 블루', wall: '#2c3847', glow: '#4c5b6c', side: '#222d3a', floor: '#4b5867' },
        { label: '흑갈색', wall: '#443d38', glow: '#635a54', side: '#342f2b', floor: '#5d554f' },
    ],
    lilac: [
        { label: '라일락', wall: '#eeebf2', glow: '#fcfaff', side: '#d9d4e2', floor: '#d6d0df' },
        { label: '페일 블루', wall: '#e7ecf6', glow: '#f9fbff', side: '#d3dbea', floor: '#d1dbe9' },
        { label: '쿨 핑크', wall: '#f3e9ed', glow: '#fffafb', side: '#e2d2d9', floor: '#ded0d7' },
        { label: '모브', wall: '#ddd4e2', glow: '#f4edf6', side: '#c7bbcd', floor: '#c5bbc9' },
    ],
});
export const getRoomVariants = (theme) => Reflect.get(ROOM_VARIANTS, getGalleryTheme(theme).id);
export function roomVariantStyle(theme, index) {
    const selectedTheme = getGalleryTheme(theme);
    const variant = getRoomVariants(selectedTheme.id).at(Number.isInteger(index) && index >= 0 && index <= 3 ? index : 0);
    return { '--variant-wall': variant.wall, '--variant-glow': variant.glow, '--variant-side': variant.side,
        '--variant-floor': variant.floor, '--variant-accent': selectedTheme.accent, '--variant-ink': selectedTheme.ink };
}
