/*
 * 화면에 오늘 날짜를 보여 주는 곳들이 쓰는 한 곳.
 *
 * 급식판과 우리 반 스크린 알림장이 같은 "서울 기준 오늘"과 같은 `9월 2일 화요일` 표기를 쓴다.
 * 두 곳이 각자 계산하면 자정 무렵이나 해외 접속에서 하루가 어긋나므로 여기만 고친다.
 */

const SEOUL_TIME_ZONE = 'Asia/Seoul';

export function getSeoulDateString(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SEOUL_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
}

export function formatSeoulDate(dateString) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) return '';
    const [year, month, day] = dateString.split('-').map(Number);
    // 정오(UTC 03시)를 기준으로 만들어 시간대가 달라도 날짜가 밀리지 않게 한다.
    return new Intl.DateTimeFormat('ko-KR', {
        timeZone: SEOUL_TIME_ZONE,
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    }).format(new Date(Date.UTC(year, month - 1, day, 3)));
}
