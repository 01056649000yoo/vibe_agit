/*
 * 알림장 위젯이 지난 알림을 앞뒤로 넘길 때 쓰는 날짜 계산.
 *
 * 화면을 열 때 받은 최근 목록(알림이 있는 날짜)에 오늘을 더해 최신순으로 세운다.
 * 오늘은 알림이 없어도 목록에 있어야 지난 알림을 보다가 `오늘`로 돌아올 수 있다.
 * 위젯이 이 목록 안에서만 움직이므로, 넘기는 동안 날짜 목록을 다시 조회하지 않는다.
 */

export const buildNoticeDates = (today, entries = []) => {
  const dates = new Set();
  if (today) dates.add(today);
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const date = typeof entry === 'string' ? entry : entry?.date;
    if (typeof date === 'string' && date) dates.add(date);
  });
  // 날짜는 `YYYY-MM-DD` 라 글자 비교만으로 최신순이 된다.
  return [...dates].sort((left, right) => right.localeCompare(left));
};

// 목록이 최신순이므로 뒤로 한 칸이 지난 알림, 앞으로 한 칸이 다음 알림이다.
export const getNeighborNoticeDate = (dates, date, direction) => {
  const list = Array.isArray(dates) ? dates : [];
  const index = list.indexOf(date);
  if (index < 0) return null;
  return list[index + (direction === 'older' ? 1 : -1)] || null;
};
