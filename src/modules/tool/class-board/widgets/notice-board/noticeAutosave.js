/*
 * 알림장 자동 저장의 규칙 (2026-09-29 선생님 요청 — 치는 대로 저장, 어제 알림을 가져와 고치기).
 *
 * 화면(NoticeComposer)과 검사가 같은 규칙을 보도록 여기 한 곳에 둔다.
 */

/* 입력을 멈추고 이만큼 지나면 저장한다. 치는 동안 매 글자 저장하지 않는다. */
export const NOTICE_AUTOSAVE_DELAY_MS = 1200;

/**
 * 지금 입력칸을 저장할지.
 * - `unchanged`: 저장된 것과 같다(서버는 앞뒤 빈칸을 잘라 저장하므로 잘라서 견준다).
 * - `empty`: 비었다. **저장하지 않는다** — 서버는 빈 내용을 "그날 알림 지우기"로 받는다. 새로 쓰려고
 *   전부 지운 순간 교실 화면의 알림이 사라지면 안 된다. 지우기는 `삭제` 단추로만 한다.
 * - `save`: 저장한다.
 */
export const shouldAutoSaveNotice = (body, savedBody) => {
  const trimmed = String(body ?? '').trim();
  if (trimmed === String(savedBody ?? '').trim()) return 'unchanged';
  if (!trimmed) return 'empty';
  return 'save';
};

/**
 * 서식·지난 알림으로 채운 뒤 아직 한 글자도 고치지 않았는지. 그동안은 저장하지 않는다 —
 * 불러온 즉시 저장하면 채우지 않은 빈 틀이 교실 화면에 그대로 걸린다.
 */
export const isHeldNotice = (body, held) => held !== null && held !== undefined && body === held;

/**
 * 가져올 지난 알림의 날짜 — 보고 있는 날짜보다 앞선 날 중 가장 최근. "어제"가 아니라
 * "마지막으로 쓴 날"이라 주말·방학을 건너도 찾는다. 날짜는 `YYYY-MM-DD` 라 글자 비교로 견준다.
 */
export const findPreviousNoticeDate = (recent, date) => {
  if (!date) return null;
  const earlier = (Array.isArray(recent) ? recent : [])
    .map((item) => (typeof item === 'string' ? item : item?.date))
    .filter((value) => typeof value === 'string' && value && value < date)
    .sort((left, right) => right.localeCompare(left));
  return earlier[0] || null;
};
