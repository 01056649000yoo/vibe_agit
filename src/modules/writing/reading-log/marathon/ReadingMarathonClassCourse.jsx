import React, { useMemo } from 'react';
import {
    DOT_RADIUS,
    LABEL_LEFT,
    LABEL_RIGHT,
    TRACK_LEFT,
    TRACK_RIGHT,
    TRACK_Y,
    VIEW_BOX,
    buildRunners
} from './classCourseLayout';
import { formatMarathonDistance } from './readingMarathon';
import './readingMarathon.css';

/*
 * 교사만 보는 우리 반 전체 트랙.
 *
 * 학생 화면은 달리는 사람이 하나뿐이다(개인전이면 자기, 모둠전이면 우리 모둠, 전체전이면 반 전체).
 * 교사는 반이 어디쯤 와 있는지를 알아야 하는데 지금은 이름과 거리 목록을 훑어야만 보였다.
 * 한 줄 위에 아이들을 점으로 찍으면 몰린 곳과 벌어진 곳이 한눈에 들어온다.
 *
 * ⚠️ 특정 아이를 짚어 부르지 않는다(2026-09-03). 예전에는 가장 느린 아이를 빨간 점과
 *    "가장 뒤처진 친구 ○○○" 한 줄로 따로 불렀는데, 아이를 이름으로 지목하는 말이라 뺐다.
 *    점의 흩어짐만 보여 주고, 누구를 어떻게 도울지는 교사가 정한다.
 *
 * 학생 화면의 굽은 코스를 그대로 쓰지 않고 곧은 트랙으로 그린다. 굽은 길은 위아래로 크게 자리를
 * 먹는 데다(실측 261px), 위치를 서로 견주기도 어렵다. 여기서 필요한 것은 풍경이 아니라 거리 비교다.
 *
 * ⚠️ 이 그림은 모든 아이의 진도를 나란히 드러낸다. 교사 확인용이며 교실 화면에 띄우지 않는다.
 *    새로 읽는 자료는 없다 — 이미 받아 둔 순위표를 트랙 위 자리로 옮겨 그릴 뿐이다.
 */

export default function ReadingMarathonClassCourse({ leaderboard = [], targetDistanceM = 0 }) {
    const runners = useMemo(
        () => buildRunners(leaderboard, targetDistanceM),
        [leaderboard, targetDistanceM]
    );
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
                <text className="reading-marathon-class-course__end" x={LABEL_LEFT} y={TRACK_Y + 6}>출발</text>
                <text className="reading-marathon-class-course__end is-goal" x={LABEL_RIGHT} y={TRACK_Y + 6}>목표 🏁</text>
                {runners.map((runner) => (
                    <g
                        key={keyOf(runner)}
                        className="reading-marathon-class-course__runner"
                        transform={`translate(${runner.x} ${runner.y})`}
                    >
                        <title>{`${runner.name} · ${formatMarathonDistance(runner.distance_m)} · ${Math.round(runner.percent)}%`}</title>
                        <circle r={DOT_RADIUS} />
                    </g>
                ))}
            </svg>
            <p className="reading-marathon-class-course__hint">
                점 하나가 아이 한 명입니다. 점에 마우스를 올리면 이름과 거리가 보입니다.
            </p>
        </div>
    );
}
