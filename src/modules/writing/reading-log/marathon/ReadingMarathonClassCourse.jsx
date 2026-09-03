import React, { useMemo } from 'react';
import { formatMarathonDistance, getProgressPercent } from './readingMarathon';
import './readingMarathon.css';

/*
 * 교사만 보는 우리 반 전체 트랙.
 *
 * 학생 화면은 달리는 사람이 하나뿐이다(개인전이면 자기, 모둠전이면 우리 모둠, 전체전이면 반 전체).
 * 교사는 "누가 뒤처졌나"를 알아야 하는데 지금은 이름과 거리 목록을 훑어야만 보였다.
 * 한 줄 위에 아이들을 점으로 찍으면 몰린 곳과 처진 아이가 한눈에 들어온다.
 *
 * 학생 화면의 굽은 코스를 그대로 쓰지 않고 곧은 트랙으로 그린다. 굽은 길은 위아래로 크게 자리를
 * 먹는 데다(실측 261px), 위치를 서로 견주기도 어렵다. 여기서 필요한 것은 풍경이 아니라 거리 비교다.
 *
 * ⚠️ 이 그림은 모든 아이의 진도를 나란히 드러낸다. 교사 확인용이며 교실 화면에 띄우지 않는다.
 *    새로 읽는 자료는 없다 — 이미 받아 둔 순위표를 트랙 위 자리로 옮겨 그릴 뿐이다.
 */

const TRACK_LEFT = 30;
const TRACK_RIGHT = 870;
const TRACK_Y = 62;
// 점이 서로 가리지 않게 이만큼 가까우면 위아래로 어긋나게 놓는다.
const CROWDED_GAP = 24;
const ROW_OFFSET = 17;
// 한 무리가 아무리 몰려도 이만큼 줄까지만 쌓는다. 더 쌓으면 트랙 밖으로 나간다.
const MAX_ROWS = 4;
const VIEW_BOX = `0 0 900 ${TRACK_Y + ((MAX_ROWS - 1) / 2) * ROW_OFFSET + 14}`;

const buildRunners = (leaderboard, targetDistanceM) => {
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
        const lanes = Math.min(run.length, MAX_ROWS);
        run.forEach((runner, index) => {
            const lift = run.length > 1 ? ((index % lanes) - (lanes - 1) / 2) * ROW_OFFSET : 0;
            placed.push({ ...runner, y: TRACK_Y + lift });
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

export default function ReadingMarathonClassCourse({ leaderboard = [], targetDistanceM = 0 }) {
    const runners = useMemo(
        () => buildRunners(leaderboard, targetDistanceM),
        [leaderboard, targetDistanceM]
    );
    // 가장 처진 아이 하나만 이름을 붙인다. 여럿 붙이면 몰린 곳에서 서로 겹쳐 못 읽는다.
    const lastRunner = useMemo(() => runners.reduce((slowest, runner) => (
        !slowest || runner.percent < slowest.percent ? runner : slowest
    ), null), [runners]);
    const keyOf = (runner) => runner.student_id || runner.name;

    if (runners.length === 0) {
        return (
            <p className="reading-marathon-class-course__empty">
                아직 기록이 없어요. 첫 독서록을 확인하면 아이들이 트랙에 나타납니다.
            </p>
        );
    }

    return (
        <div className="reading-marathon-class-course">
            <div className="reading-marathon-class-course__heading">
                <strong>우리 반 아이들 위치</strong>
                <span>교사 확인용 · 학생 화면에는 나오지 않습니다</span>
            </div>
            <svg viewBox={VIEW_BOX} role="img" aria-label={`우리 반 ${runners.length}명의 진도 위치`}>
                <line
                    className="reading-marathon-class-course__track"
                    x1={TRACK_LEFT} y1={TRACK_Y} x2={TRACK_RIGHT} y2={TRACK_Y}
                />
                <text className="reading-marathon-class-course__end" x={TRACK_LEFT} y={TRACK_Y - 28}>출발</text>
                <text className="reading-marathon-class-course__end is-goal" x={TRACK_RIGHT} y={TRACK_Y - 28}>목표 🏁</text>
                {runners.map((runner) => {
                    const isLast = lastRunner && keyOf(runner) === keyOf(lastRunner);
                    return (
                        <g
                            key={keyOf(runner)}
                            className={`reading-marathon-class-course__runner${isLast ? ' is-behind' : ''}`}
                            transform={`translate(${runner.x} ${runner.y})`}
                        >
                            <title>{`${runner.name} · ${formatMarathonDistance(runner.distance_m)} · ${Math.round(runner.percent)}%`}</title>
                            <circle r="8" />
                        </g>
                    );
                })}
            </svg>
            {lastRunner ? (
                <p className="reading-marathon-class-course__behind">
                    가장 뒤처진 친구 <strong>{lastRunner.name}</strong>
                    <span>{formatMarathonDistance(lastRunner.distance_m)} · {Math.round(lastRunner.percent)}%</span>
                </p>
            ) : null}
            <p className="reading-marathon-class-course__hint">
                점 하나가 아이 한 명입니다. 점에 마우스를 올리면 이름과 거리가 보입니다.
            </p>
        </div>
    );
}
