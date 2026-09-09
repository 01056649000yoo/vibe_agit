/*
 * 타이머·스톱워치가 **화면이 바뀌어도 이어지게** 하는 보관함.
 *
 * 왜 필요한가 (2026-09-09 제보):
 *   시간 상태가 위젯 부품 안(useState)에만 있었다. 그런데 위젯은 여러 이유로 다시 만들어진다.
 *     - 위젯을 옮기거나 크기를 바꾸면 `BoardCanvas` 의 React key 에 배치값이 들어 있어 새로 만든다
 *     - 스크린 탭을 바꾸면 그 탭의 위젯이 새로 만들어진다
 *     - `전체 화면`은 **새 브라우저 탭**(`/class-board/<id>`)이라 아예 다른 화면이다
 *   그래서 한 번 시작한 타이머가 화면을 오갈 때마다 처음으로 돌아갔다. 수업 중에 가장 곤란한 순간이다.
 *
 * 어떻게 이어지게 하나:
 *   **흐른 시간이 아니라 시각을 저장한다.** 타이머는 끝나는 시각(endAt), 스톱워치는 시작한 시각을
 *   적어 두므로, 화면이 없는 동안에도 시간은 그대로 흐른다. 다시 그릴 때 지금 시각과 견주기만 하면 된다.
 *   같은 브라우저의 다른 탭(전체 화면)에서도 같은 값을 읽으므로 이어서 보인다.
 *
 *   위젯마다 따로 적는다(`instanceId`). 한 스크린에 타이머가 둘 있어도 섞이지 않는다.
 *
 * 왜 서버에 저장하지 않나:
 *   교실 화면 한 대의 진행 상태일 뿐 학급 자료가 아니다. 서버에 두면 저장할 때마다 쓰기가 생기고
 *   교사가 여러 기기를 켜면 서로 시간을 덮어쓴다. 브라우저에만 남긴다.
 */

import { readLocalStorageJson, writeLocalStorageJson } from '../../../../../lib/browserStorage.js';

const STORAGE_PREFIX = 'class_board_clock:';

/**
 * 지난 수업의 기록이 오늘 되살아나지 않도록 한도를 둔다.
 * 하루를 넘기면 이어 쓸 일이 없고, 켜 둔 줄 모르는 타이머가 울리는 편이 더 곤란하다.
 */
export const CLOCK_RUN_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const storageKey = (instanceId) => `${STORAGE_PREFIX}${instanceId}`;

/**
 * 저장된 진행 상태를 읽는다. 없거나·오래됐거나·모양이 다르면 `null` 을 준다.
 * `expected` 로 종류와 설정을 함께 본다 — 교사가 타이머 시간을 바꾸면 옛 진행은 버린다.
 */
export function readClockRun(instanceId, expected, now = Date.now()) {
    if (!instanceId) return null;
    const saved = readLocalStorageJson(storageKey(instanceId), null);
    if (!saved || typeof saved !== 'object') return null;
    if (saved.kind !== expected?.kind) return null;
    if (!Number.isFinite(saved.savedAt) || now - saved.savedAt > CLOCK_RUN_MAX_AGE_MS) return null;
    // 타이머 설정을 바꾸면 이어 쓰지 않는다. 5분짜리로 바꿨는데 10분이 남아 있으면 안 된다.
    if (expected?.kind === 'timer' && saved.durationMs !== expected.durationMs) return null;
    return saved;
}

/** 진행 상태를 적는다. 시각(절대값)만 담아 화면이 없는 동안에도 시간이 흐르게 한다. */
export function writeClockRun(instanceId, run, now = Date.now()) {
    if (!instanceId) return;
    writeLocalStorageJson(storageKey(instanceId), { ...run, savedAt: now });
}

/** `초기화` 를 누르면 지운다. 남겨 두면 다음에 열 때 되살아난다. */
export function clearClockRun(instanceId) {
    if (!instanceId) return;
    writeLocalStorageJson(storageKey(instanceId), null);
}

/** 저장된 타이머 상태를 화면이 쓰는 값으로 되돌린다. */
export function resumeTimer(saved, durationMs, now = Date.now()) {
    if (!saved) return { endAt: null, remainingMs: null };
    if (Number.isFinite(saved.endAt)) {
        // 화면이 꺼져 있는 동안 끝났을 수 있다. 그때는 멈춘 채 0 으로 보여 준다.
        return saved.endAt > now ? { endAt: saved.endAt, remainingMs: null } : { endAt: null, remainingMs: 0 };
    }
    if (Number.isFinite(saved.remainingMs)) {
        return { endAt: null, remainingMs: Math.min(Math.max(0, saved.remainingMs), durationMs) };
    }
    return { endAt: null, remainingMs: null };
}

/** 저장된 스톱워치 상태를 화면이 쓰는 값으로 되돌린다. */
export function resumeStopwatch(saved) {
    if (!saved) return { startedAt: null, elapsedMs: 0 };
    const elapsedMs = Number.isFinite(saved.elapsedMs) ? Math.max(0, saved.elapsedMs) : 0;
    return { startedAt: Number.isFinite(saved.startedAt) ? saved.startedAt : null, elapsedMs };
}
