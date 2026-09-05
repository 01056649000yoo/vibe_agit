import { CLASS_AGIT_LIMITS } from '../policy.js';
export const MAX_SHARE_PERIOD_MS = CLASS_AGIT_LIMITS.externalExpiryDays * 24 * 60 * 60 * 1000;
export function localDateTime(value) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function buildSharePeriod(start, end) {
    const starts = new Date(start).getTime(); const expires = new Date(end).getTime();
    if (!Number.isFinite(starts) || !Number.isFinite(expires) || expires <= starts || expires - starts > MAX_SHARE_PERIOD_MS) {
        throw new Error('전시 종료는 시작 이후, 시작부터 최대 30일 이내로 정해 주세요.');
    }
    return { starts_at: new Date(starts).toISOString(), expires_at: new Date(expires).toISOString() };
}
