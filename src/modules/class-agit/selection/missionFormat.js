/**
 * 미션 목록(작품 찾기·한꺼번에 담기)에 보여 줄 글 종류 이름. 서버(`class_agit_mission_format_v1`)가 주는 `format` 을 그대로 읽는다.
 * 담을 수 있는 종류의 기준은 서버 `class_agit_exhibitable_format_v1` 하나이고, 화면은 `mission.supported` 를 따른다.
 */
const FORMAT_LABELS = Object.freeze({ poem: '시', prose: '글', letter: '편지', report: '보고서' });

export const missionFormatLabel = (format) => Reflect.get(FORMAT_LABELS, format) || '기타 장르';

/** 보고서는 사진이 든 글을 아직 담을 수 없다(사진 지원은 학생 동의를 기록하는 다음 단계) — 목록에서 미리 알려 준다. */
export const missionFormatNote = (format) => (format === 'report' ? ' · 사진이 든 글은 제외' : '');
