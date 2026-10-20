/*
 * 문단 목록(blocks) 속 사진 자리표(2026-10-20, 서버 20261401 `class_agit_photo_marker_v1` 과 같은 모양).
 *
 * 전시·책·공개판이 모두 blocks(문자열 배열)를 그대로 고정해 옮기므로, 보고서 사진은 `제어문자 0x1f + "photo:" + 사진ID`
 * 한 줄로 그 자리에 들어 있다. 학생 글 속 0x1f 는 서버 정본이 먼저 지우므로 글로는 흉내 낼 수 없다.
 * 읽는 화면·인쇄·내보내기는 이 파일의 도우미로만 자리표를 알아본다(문자열을 여기저기서 직접 비교하지 않는다).
 */
export const PHOTO_BLOCK_PREFIX = '\u001fphoto:';
const PHOTO_BLOCK = /^\u001fphoto:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** 자리표면 사진ID, 아니면 null. */
export const photoIdOfBlock = (block) => (typeof block === 'string' ? PHOTO_BLOCK.exec(block)?.[1] ?? null : null);
export const isPhotoBlock = (block) => photoIdOfBlock(block) !== null;
/** 글 문단만(사진 자리표를 뺀 것) — 글자만 다루는 곳(발췌·글자 수·텍스트 내보내기)이 쓴다. */
export const textBlocks = (blocks) => (Array.isArray(blocks) ? blocks.filter((block) => !isPhotoBlock(block)) : []);
/** blocks 에 든 사진ID 들(순서대로, 중복 없이). */
export const photoIdsOfBlocks = (blocks) => [...new Set((Array.isArray(blocks) ? blocks : []).map(photoIdOfBlock).filter(Boolean))];

/** 사진 바로 뒤에 오는 `▲ 설명` 한 줄(서버 20261403 이 양식 보고서에서 넣음). 사진 아래 설명으로 붙인다. */
export const PHOTO_CAPTION_PREFIX = '\u25b2 ';
export const photoCaptionOf = (block) => (typeof block === 'string' && block.startsWith(PHOTO_CAPTION_PREFIX) ? block.slice(PHOTO_CAPTION_PREFIX.length).trim() : '');
