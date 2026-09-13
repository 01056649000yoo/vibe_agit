/*
 * 글을 양쪽 정렬해도 되는 갈래인지 가린다 — 단일 원본.
 *
 * **시는 정렬을 건드리지 않는다.** 줄의 시작과 끝이 작품 그 자체라, 양쪽으로 늘리면
 * 글쓴이가 고른 자리가 무너진다(우리반 아지트 전시관에서 같은 결론을 냈다).
 * 산문만 양쪽 정렬해 오른쪽 끝을 가지런히 맞춘다.
 *
 * 갈래는 두 곳에 적혀 있다 — `mission_type`(영문 id, 예: `poem`)과 `genre`(교사가 보는 이름,
 * 예: `시`). 어느 쪽이 비어 있어도 판단이 서도록 둘 다 본다.
 */

const POEM_TYPES = new Set(['poem']);
const POEM_GENRES = new Set(['시', '동시']);

export const WRITING_FORMAT = Object.freeze({ prose: 'prose', poem: 'poem' });

export const getWritingFormat = (mission) => {
    const type = String(mission?.mission_type || '').trim().toLowerCase();
    const genre = String(mission?.genre || '').trim();
    return POEM_TYPES.has(type) || POEM_GENRES.has(genre) ? WRITING_FORMAT.poem : WRITING_FORMAT.prose;
};
