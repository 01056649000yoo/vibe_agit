/*
 * 글꽃 책방 — 선생님이 만든 표지 그림(2026-10-06, docs/CLASS_AGIT_COVER_UPLOAD_PLAN.md).
 *
 * 규격(종이별 비율 ±1%, 최소 150dpi, JPG·PNG, 5MB)을 여기 한 곳에서 정한다. 서버
 * `class_agit_set_cover_image_v1` 이 같은 규칙을 다시 본다(브라우저 검사만 믿지 않는다).
 * 표지를 그리는 곳(선생님 화면·학생 서가·모두의 아지트 도서관·인쇄·구글 문서)은 모두 `coverSource` 로
 * "그림 표지인지·디자인 표지인지" 를 정한다 — 한 곳만 그림을 보여 주는 일이 없게.
 */
import { BOOK_PAPERS, getBookPaper } from '../designs.js';

export const COVER_BUCKET = 'class-agit-covers';
export const COVER_MAX_BYTES = 5 * 1024 * 1024;
export const COVER_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png']);
export const COVER_RATIO_TOLERANCE = 0.01;
const MIN_DPI = 150;
const RECOMMENDED_DPI = 300;
export const COVER_SAFE_MARGIN_MM = 5;

const px = (mm, dpi) => Math.round((mm / 25.4) * dpi);

/** 종이별 규격: 권장(300dpi)·최소(150dpi) 픽셀. */
export function coverSpec(paperId) {
    const paper = getBookPaper(paperId);
    return Object.freeze({
        paper: paper.id,
        label: paper.label,
        widthMm: paper.width,
        heightMm: paper.height,
        recommended: { width: px(paper.width, RECOMMENDED_DPI), height: px(paper.height, RECOMMENDED_DPI) },
        minimum: { width: px(paper.width, MIN_DPI), height: px(paper.height, MIN_DPI) },
        safeMarginPx: px(COVER_SAFE_MARGIN_MM, RECOMMENDED_DPI),
    });
}

export const COVER_SPECS = Object.freeze(BOOK_PAPERS.map((paper) => coverSpec(paper.id)));

/*
 * 그림 표지일 때 목차·여는 글·간지·작품 쪽 모양(선생님 결정: 세 가지). 바탕은 모두 흰 종이 —
 * 속지 바탕색은 쪽마다 잉크가 들고 학교 프린터에서 얼룩진다. 차이는 제목 색·선·쪽 번호로만.
 */
export const BOOK_INNER_STYLES = Object.freeze([
    Object.freeze({ id: 'plain', label: '단정한', description: '검정 제목 · 회색 가는 선', heading: '#1f2937', rule: '#cbd5e1', ruleStyle: 'solid', ruleWidth: 0.2, pageNumber: 'plain' }),
    Object.freeze({ id: 'warm', label: '따뜻한', description: '진갈색 제목 · 주황빛 점선', heading: '#6b3e1f', rule: '#e8a066', ruleStyle: 'dashed', ruleWidth: 0.3, pageNumber: 'dashes' }),
    Object.freeze({ id: 'fresh', label: '산뜻한', description: '남색 제목 · 하늘색 굵은 선', heading: '#1e3a8a', rule: '#7cc4f2', ruleStyle: 'solid', ruleWidth: 0.6, pageNumber: 'bold' }),
]);

export const getInnerStyle = (id) => BOOK_INNER_STYLES.find((style) => style.id === id) || BOOK_INNER_STYLES[0];

/**
 * 고른 그림 파일을 검사한다. `{ ok, error, warning }`.
 * file: { type, size }, size: { width, height } (그림을 읽어 얻은 픽셀 크기)
 */
export function checkCoverImage(file, size, paperId) {
    const spec = coverSpec(paperId);
    if (!file) return { ok: false, error: '표지 그림을 골라 주세요.' };
    if (!COVER_MIME_TYPES.includes(file.type)) {
        return { ok: false, error: 'JPG 또는 PNG 그림만 쓸 수 있어요. (캔바에서는 내려받기 → PNG 또는 JPG)' };
    }
    if (!(file.size > 0) || file.size > COVER_MAX_BYTES) {
        return { ok: false, error: `그림 용량은 5MB 이하여야 해요. 지금 그림은 ${(file.size / 1024 / 1024).toFixed(1)}MB예요.` };
    }
    const width = Number(size?.width), height = Number(size?.height);
    if (!(width > 0 && height > 0)) return { ok: false, error: '그림 크기를 읽지 못했어요. 다른 그림으로 해 보세요.' };
    const ratio = (width / height) / (spec.widthMm / spec.heightMm);
    if (Math.abs(ratio - 1) > COVER_RATIO_TOLERANCE) {
        return {
            ok: false,
            error: `${spec.label} 표지는 가로:세로가 ${spec.widthMm}:${spec.heightMm} 비율이어야 해요. 지금 그림은 ${width}×${height}px라 비율이 맞지 않아요. (${spec.label} 권장 ${spec.recommended.width}×${spec.recommended.height}px)`,
        };
    }
    if (width < spec.minimum.width) {
        return {
            ok: false,
            error: `그림이 너무 작아요. ${spec.label} 표지는 가로 ${spec.minimum.width}px 이상이어야 해요(권장 ${spec.recommended.width}×${spec.recommended.height}px).`,
        };
    }
    const warning = width < spec.recommended.width
        ? `인쇄하면 조금 흐릿할 수 있어요. 선명하게 인쇄하려면 ${spec.recommended.width}×${spec.recommended.height}px로 만들어 주세요.`
        : '';
    return { ok: true, error: '', warning };
}

/** 이 문집(또는 확정판 기록)의 표지가 그림인지 디자인인지. 그림이면 경로와 속지 스타일. */
export function coverSource(book) {
    const image = book?.cover_image;
    const paper = book?.print?.paper || book?.paper_format || book?.paper;
    if (image && typeof image.path === 'string' && image.path && (!paper || !image.paper || image.paper === paper)) {
        return { kind: 'image', path: image.path, width: image.width, height: image.height, innerStyle: getInnerStyle(image.inner_style) };
    }
    return { kind: 'design', innerStyle: null };
}

/** 저장소 파일 이름: `<학급>/<문집>/<무작위>.jpg|png` — 덮어쓰지 않는다(옛 확정판이 옛 파일을 가리킨다). */
export function coverObjectPath(classId, bookId, mime, random = globalThis.crypto?.randomUUID?.() || String(Date.now())) {
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const token = String(random).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'cover';
    return `${classId}/${bookId}/${Date.now()}-${token}.${ext}`;
}
