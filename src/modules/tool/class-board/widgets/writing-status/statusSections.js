/*
 * 오늘 현황이 보여 줄 수 있는 항목과 배경색을 한 곳에서 정한다.
 *
 * 화면(설정창·위젯), 서버가 계산할 항목 목록, 저장 payload 검증이 같은 이름을 써야 하므로
 * 여기를 원본으로 둔다. 이름을 바꾸면 `20261225_class_board_status_sections.sql`의
 * 허용 목록도 함께 바꾼다(회귀 검사가 두 곳을 대조한다).
 */

export const STATUS_SECTIONS = Object.freeze([
  Object.freeze({
    id: 'mission',
    label: '과제 제출 명단',
    hint: '지금 과제를 낸 친구와 아직 안 낸 친구 이름',
  }),
  Object.freeze({
    id: 'daily',
    label: '오늘의 자율 글 진행',
    hint: '일기·독서록을 몇 명이 마쳤는지 막대로',
  }),
  Object.freeze({
    id: 'dailyNames',
    label: '오늘 자율 글 쓴 친구',
    hint: '오늘 일기나 독서록을 쓴 친구와 아직 안 쓴 친구 이름',
  }),
  Object.freeze({
    id: 'titles',
    label: '오늘 새 칭호를 받은 친구',
    hint: '칭호를 새로 받은 친구를 축하하듯 보여 줍니다',
  }),
  Object.freeze({
    id: 'reactions',
    label: '서로 읽어 준 정도',
    hint: '오늘 우리 반이 남긴 댓글과 공감 수',
  }),
]);

export const STATUS_SECTION_IDS = Object.freeze(STATUS_SECTIONS.map((section) => section.id));
export const DEFAULT_STATUS_SECTIONS = Object.freeze(['mission', 'daily']);

export const STATUS_TONES = Object.freeze([
  Object.freeze({ id: 'navy', label: '남색' }),
  Object.freeze({ id: 'forest', label: '숲색' }),
  Object.freeze({ id: 'plum', label: '자주빛' }),
  Object.freeze({ id: 'graphite', label: '먹색' }),
  Object.freeze({ id: 'paper', label: '종이색 (밝게)' }),
]);

export const STATUS_TONE_IDS = Object.freeze(STATUS_TONES.map((tone) => tone.id));

export const normalizeStatusTone = (tone) => STATUS_TONE_IDS.includes(tone) ? tone : 'navy';

/** 저장된 값이 무엇이든 화면과 서버가 같은 순서·같은 이름만 보게 다듬는다. */
export const normalizeStatusSections = (sections) => {
  if (!Array.isArray(sections)) return [...DEFAULT_STATUS_SECTIONS];
  return STATUS_SECTION_IDS.filter((id) => sections.includes(id));
};
