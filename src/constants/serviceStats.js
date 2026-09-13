/*
 * 로그인 화면 현황 줄의 이름표 — 단일 원본.
 *
 * DB 가 세는 기준(20261282 마이그레이션)과 여기 문구가 어긋나면 숫자가 거짓말이 된다.
 * 예를 들어 "낸 글" 이라고 적어 놓고 쓰다 만 초안까지 세면 안 된다.
 * `tests/serviceStats.test.mjs` 가 두 곳을 한꺼번에 본다.
 *
 * supabase 를 부르지 않는 순수 모듈로 떼어 둔다 — 검사가 브라우저 설정 없이 읽는다.
 */
export const SERVICE_STAT_ITEMS = Object.freeze([
    Object.freeze({ key: 'teachers', icon: '🧑‍🏫', label: '함께하는 선생님', unit: '명' }),
    Object.freeze({ key: 'classes', icon: '🏫', label: '만들어진 학급', unit: '개' }),
    Object.freeze({ key: 'students', icon: '🎒', label: '글 쓰는 학생', unit: '명' }),
    Object.freeze({ key: 'posts', icon: '✍️', label: '아이들이 낸 글', unit: '편' })
]);
