// 시간표 위젯 설정 선택지 — 설정 화면과 검사가 같이 쓴다.
export const TIMETABLE_WIDGET_VIEWS = Object.freeze([
  Object.freeze({ id: 'auto', label: '자동', note: '정한 시각 전에는 오늘, 뒤에는 다음 수업일' }),
  Object.freeze({ id: 'today', label: '오늘', note: '오늘 시간표' }),
  Object.freeze({ id: 'tomorrow', label: '내일', note: '다음 수업일(금요일이면 월요일)' }),
  Object.freeze({ id: 'week', label: '이번 주', note: '한 주 전체' }),
]);
// 서버 validate_class_board_payload_v1(20261357)과 같은 값.
export const TIMETABLE_SWITCH_HOURS = Object.freeze([11, 12, 13, 14, 15, 16, 17]);
export const TIMETABLE_WIDGET_TONES = Object.freeze([
  Object.freeze({ id: 'sky', label: '하늘' }),
  Object.freeze({ id: 'mint', label: '민트' }),
  Object.freeze({ id: 'yellow', label: '햇살' }),
  Object.freeze({ id: 'paper', label: '종이' }),
]);
