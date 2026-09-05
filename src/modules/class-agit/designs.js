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
export function createBookPrintSettings(book = {}) {
    return { paper: getBookPaper(book.paper_format).id, design: getBookDesign(book.design_id).id, body_pt: 12, poem_pt: 14, version: 2 };
}
export function validBookPrintSettings(settings) {
    return settings?.body_pt === 12 && settings?.poem_pt === 14 && (settings.version === 1
        ? settings.paper === 'A4' && settings.design === undefined
        : settings.version === 2 && BOOK_PAPERS.some((paper) => paper.id === settings.paper) && BOOK_DESIGNS.some((design) => design.id === settings.design));
}
