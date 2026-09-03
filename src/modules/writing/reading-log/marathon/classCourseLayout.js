import { getProgressPercent } from './readingMarathon.js';

/*
 * 교사용 반 전체 트랙에서 아이 하나하나를 어디에 찍을지 계산한다.
 *
 * 그리는 일(JSX)과 떼어 놓은 이유: 점이 겹치는지는 **눈이 아니라 좌표로** 확인해야 하는데,
 * `.jsx` 는 검사에서 부를 수 없다. 여기에 두면 `tests/readingMarathon.test.mjs` 가 직접 부른다.
 *
 * ⚠️ 특정 아이를 짚어 부르지 않는다(2026-09-03). 예전에는 가장 느린 아이를 빨간 점과
 *    "가장 뒤처진 친구 ○○○" 한 줄로 따로 불렀는데, 아이를 이름으로 지목하는 말이라 뺐다.
 */

// 출발·목표 글자를 선 위가 아니라 선 양옆에 둔다. 위에 두면 위로 뜬 점과 글자가 겹쳤다.
export const LABEL_LEFT = 42;
export const LABEL_RIGHT = 776;
export const TRACK_LEFT = 52;
export const TRACK_RIGHT = 768;
export const TRACK_Y = 32;
export const DOT_RADIUS = 8;
// 점이 서로 가리지 않게 이만큼 가까우면 위아래로 어긋나게 놓는다.
const CROWDED_GAP = 24;
const ROW_OFFSET = 17;
// 한 무리가 아무리 몰려도 이만큼 줄까지만 쌓는다. 더 쌓으면 트랙 밖으로 나간다.
const MAX_ROWS = 4;
/*
 * ⚠️ 줄만 나눠서는 모자란다(2026-09-03 실측). 학기 초처럼 스물넷이 **같은 자리**에 서면
 *    네 줄에 여섯씩 겹쳐 앉아 점 60쌍이 서로 가렸다. 그래서 줄을 나누고도 남으면
 *    무리의 한가운데를 기준으로 좌우로도 벌린다. 벌리는 폭은 점 지름보다 조금 넓게 잡는다.
 */
const COLUMN_STEP = 20;
// 위아래로 어긋난 점과 점 반지름만 들어가면 된다. 그만큼만 남긴다.
const LANE_LIFT = ((MAX_ROWS - 1) / 2) * ROW_OFFSET;
export const VIEW_BOX = `0 0 900 ${TRACK_Y + LANE_LIFT + 12}`;

export const buildRunners = (leaderboard, targetDistanceM) => {
    const rows = (Array.isArray(leaderboard) ? leaderboard : [])
        .filter((row) => row?.name)
        .map((row) => {
            const percent = getProgressPercent(row.distance_m, targetDistanceM);
            return { ...row, percent, x: TRACK_LEFT + (TRACK_RIGHT - TRACK_LEFT) * (percent / 100) };
        })
        .sort((left, right) => left.x - right.x);

    let run = [];
    const placed = [];
    const flush = () => {
        // ⚠️ 마지막에 한 번 더 부르므로 빈 무리로 들어올 수 있다. 막지 않으면 run[0] 에서 터진다.
        if (run.length === 0) return;
        const lanes = Math.min(run.length, MAX_ROWS);
        const columns = Math.ceil(run.length / lanes);
        // 무리의 한가운데. 여기를 기준으로 좌우로 벌려야 실제 거리에서 한쪽으로 쏠리지 않는다.
        const center = (run[0].x + run.at(-1).x) / 2;
        /*
         * ⚠️ 점 하나하나를 따로 트랙 안으로 밀어 넣으면 **끝에서 다시 겹친다**(2026-09-03 검사가 잡음).
         *    학기 초처럼 모두 출발선에 서면 왼쪽으로 벌린 칸들이 전부 출발선에 눌려 한 점이 됐다.
         *    그래서 무리를 통째로 옮긴다 — 폭을 먼저 정하고, 그 폭이 트랙 안에 들어오게 시작점을 민다.
         */
        const span = (columns - 1) * COLUMN_STEP;
        const start = Math.max(TRACK_LEFT, Math.min(center - span / 2, TRACK_RIGHT - span));
        run.forEach((runner, index) => {
            const lift = run.length > 1 ? ((index % lanes) - (lanes - 1) / 2) * ROW_OFFSET : 0;
            const column = Math.floor(index / lanes);
            placed.push({ ...runner, x: start + column * COLUMN_STEP, y: TRACK_Y + lift });
        });
        run = [];
    };
    rows.forEach((runner) => {
        if (run.length > 0 && runner.x - run.at(-1).x > CROWDED_GAP) flush();
        run.push(runner);
    });
    flush();
    return placed;
};
