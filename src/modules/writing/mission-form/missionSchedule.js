/*
 * 과제 예약 공개의 계산 규칙을 한 곳에 모은 곳.
 *
 * 왜 화면(.jsx) 밖에 두나: 여기서 틀리면 **아침 9시 과제가 밤 9시에 열린다.** 눈으로는
 * 알아채기 어렵고, 알아챘을 때는 이미 수업이 지나 있다. `node --test` 가 직접 부를 수 있게
 * 꺼내 두고 시각 계산을 값으로 검사한다.
 *
 * 저장은 `TIMESTAMPTZ`(UTC 순간)이고, 선생님이 고르는 것은 **한국 시간의 벽시계 값**이다.
 * 브라우저가 해외에 있거나 기기 시간대가 어긋나 있어도 선생님이 고른 한국 시간 그대로여야 한다.
 * 그래서 `<input type="datetime-local">` 의 값을 기기 시간대로 해석하지 않고 **항상 서울 기준**으로
 * 주고받는다.
 */

const SEOUL_TIME_ZONE = 'Asia/Seoul';

/** 지금 당장으로 잡으면 시계가 돌기 전에 지나가 버린다. 최소 이만큼은 뒤여야 한다. */
export const MISSION_SCHEDULE_MIN_LEAD_MINUTES = 2;

/** 너무 먼 미래는 실수(연도 오타)일 가능성이 높다. */
export const MISSION_SCHEDULE_MAX_LEAD_DAYS = 365;

/** 시계가 1분마다 돌므로 실제 공개는 고른 시각에서 이만큼 늦을 수 있다. 화면에 그대로 알린다. */
export const MISSION_SCHEDULE_TICK_SECONDS = 60;

/** 어떤 순간(Date)을 서울 기준 벽시계 조각으로 쪼갠다. */
const seoulParts = (date) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SEOUL_TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    // Intl 은 자정을 '24' 로 줄 때가 있다.
    const hour = value.hour === '24' ? '00' : value.hour;
    return { year: value.year, month: value.month, day: value.day, hour, minute: value.minute };
};

/** 서울이 UTC 보다 몇 분 앞서는지. 한국은 서머타임이 없지만 값을 박아 두지 않고 물어본다. */
const seoulOffsetMinutes = (date) => {
    const part = new Intl.DateTimeFormat('en-US', {
        timeZone: SEOUL_TIME_ZONE, timeZoneName: 'longOffset'
    }).formatToParts(date).find((item) => item.type === 'timeZoneName');
    const matched = /GMT([+-])(\d{2}):(\d{2})/.exec(part?.value || '');
    if (!matched) return 9 * 60;
    const sign = matched[1] === '-' ? -1 : 1;
    return sign * (Number(matched[2]) * 60 + Number(matched[3]));
};

/** 저장된 순간(ISO) → `<input type="datetime-local">` 이 쓰는 서울 벽시계 문자열. */
export const toMissionScheduleInput = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const part = seoulParts(date);
    return `${part.year}-${part.month}-${part.day}T${part.hour}:${part.minute}`;
};

/**
 * 선생님이 고른 서울 벽시계 문자열 → 저장할 순간(ISO).
 * 기기 시간대를 쓰지 않는다. 미국에서 접속해도 "9월 15일 09:00" 은 한국 시간 9시다.
 */
export const fromMissionScheduleInput = (value) => {
    const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || '').trim());
    if (!matched) return null;
    const [, year, month, day, hour, minute] = matched.map(Number);
    // 서울을 UTC 로 옮긴 뒤, 그 시점의 실제 차이로 한 번 더 바로잡는다.
    const guess = Date.UTC(year, month - 1, day, hour, minute) - 9 * 60 * 60 * 1000;
    const exact = Date.UTC(year, month - 1, day, hour, minute) - seoulOffsetMinutes(new Date(guess)) * 60 * 1000;
    const date = new Date(exact);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** 예약 시각이 쓸 만한 값인지. 문제가 없으면 빈 문자열을 준다. */
export const getMissionScheduleError = (value, now = new Date()) => {
    if (!value) return '';
    const iso = fromMissionScheduleInput(value);
    if (!iso) return '예약 시각을 날짜와 시간까지 골라 주세요.';
    const gapMinutes = (new Date(iso).getTime() - now.getTime()) / 60000;
    if (gapMinutes < MISSION_SCHEDULE_MIN_LEAD_MINUTES) {
        return `예약은 지금부터 ${MISSION_SCHEDULE_MIN_LEAD_MINUTES}분 뒤부터 고를 수 있어요. 지금 열려면 예약을 끄세요.`;
    }
    if (gapMinutes > MISSION_SCHEDULE_MAX_LEAD_DAYS * 24 * 60) {
        return `예약은 ${MISSION_SCHEDULE_MAX_LEAD_DAYS}일 뒤까지만 잡을 수 있어요. 연도를 확인해 주세요.`;
    }
    return '';
};

/** 지금 고를 수 있는 가장 이른 시각(입력칸의 min 값). */
export const getMissionScheduleInputMin = (now = new Date()) => toMissionScheduleInput(
    new Date(now.getTime() + MISSION_SCHEDULE_MIN_LEAD_MINUTES * 60000).toISOString()
);

/**
 * 과제 한 건이 어떤 상태인지. 화면 세 곳(목록·카드·보관함)이 같은 판정을 써야 한다.
 *  - 'scheduled' 예약됨(아직 안 열림)  - 'archived' 보관됨  - 'open' 진행 중
 */
export const getMissionScheduleState = (mission) => {
    if (mission?.open_at) return 'scheduled';
    if (mission?.is_archived) return 'archived';
    return 'open';
};

export const isMissionScheduled = (mission) => getMissionScheduleState(mission) === 'scheduled';

/** `9월 15일 (월) 오전 9:00` 처럼 선생님이 읽는 표기. */
export const formatMissionOpenAt = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('ko-KR', {
        timeZone: SEOUL_TIME_ZONE,
        month: 'long', day: 'numeric', weekday: 'short',
        hour: 'numeric', minute: '2-digit'
    }).format(date);
};

/**
 * 저장할 때 쓰는 값 묶음. 예약을 켰는지에 따라 세 칸이 함께 움직여야 하므로 한 곳에서 만든다.
 * (DB 제약이 `open_at` 이 있으면 반드시 숨김·비보관이어야 한다고 막는다. 여기서 어기면 저장이 거절된다.)
 */
export const buildMissionSchedulePatch = (scheduleInput) => {
    const iso = scheduleInput ? fromMissionScheduleInput(scheduleInput) : null;
    if (!iso) return { open_at: null, is_archived: false, archived_at: null };
    return { open_at: iso, is_archived: true, archived_at: null };
};

/**
 * 고칠 때 실제로 바꿔야 하는 값만 고른다. 바꿀 것이 없으면 `null` 을 준다.
 *
 * 왜 필요한가: 예약을 안 쓴 과제를 고칠 때마다 위 묶음을 그대로 보내면 `is_archived: false` 가
 * 함께 가서, **보관해 둔 과제를 고치기만 해도 학생에게 다시 열린다.** 겉으로는 아무 일도
 * 없어 보이는 실수라 눈으로 못 잡는다.
 */
export const resolveMissionSchedulePatch = ({ scheduleInput, current = null, isEditing = false }) => {
    const patch = buildMissionSchedulePatch(scheduleInput);
    if (!isEditing) return patch;

    const currentIso = current?.open_at || null;
    const nextIso = patch.open_at;
    if (currentIso === nextIso) return null;
    if (currentIso && nextIso && new Date(currentIso).getTime() === new Date(nextIso).getTime()) return null;

    // 예약을 끄는 경우에만 "지금 열기" 로 해석한다. 예약이 아니었던 과제는 건드리지 않는다.
    if (!nextIso && !currentIso) return null;
    return patch;
};
