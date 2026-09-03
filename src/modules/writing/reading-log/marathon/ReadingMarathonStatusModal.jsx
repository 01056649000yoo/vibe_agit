import React, { useMemo } from 'react';
import Modal from '../../../../components/common/Modal';
import ReadingMarathonClassCourse from './ReadingMarathonClassCourse';
import { formatMarathonDistance, getProgressPercent } from './readingMarathon';
import './readingMarathon.css';

/*
 * 우리 반 마라톤 현황 — 교사가 눌러서 여는 창.
 *
 * 운영 현황 탭에 트랙을 늘 펼쳐 두면 자리를 먹고, 아이들 위치가 화면에 상시 떠 있게 된다.
 * 필요할 때만 열어 보는 창으로 옮긴다.
 *
 * ⚠️ 여기는 **교사 확인용**이다. 학생 화면과 교실 화면에는 나오지 않는다.
 * ⚠️ 이름 차례는 **가나다순**이다. 거리순으로 줄을 세우면 창을 열 때마다 맨 아래 아이가
 *    "꼴찌 자리"로 굳는다. 누가 얼마나 왔는지는 각 줄에 그대로 적히므로 알 수 있고,
 *    벌어진 정도는 위 트랙의 점 흩어짐으로 본다.
 * ⚠️ 새로 읽는 자료는 없다 — 이미 받아 둔 순위표를 다시 쓸 뿐이라 창을 열어도 요청이 늘지 않는다.
 */

export default function ReadingMarathonStatusModal({
    isOpen,
    onClose,
    leaderboard = [],
    targetDistanceM = 0,
    summary = null
}) {
    const roster = useMemo(() => (Array.isArray(leaderboard) ? leaderboard : [])
        .filter((row) => row?.name)
        .map((row) => ({
            key: row.student_id || row.name,
            name: row.name,
            distanceM: row.distance_m,
            percent: getProgressPercent(row.distance_m, targetDistanceM)
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'ko')),
    [leaderboard, targetDistanceM]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="🏃 우리 반 마라톤 현황" maxWidth="900px">
            <div className="reading-marathon-status-modal">
                {summary ? (
                    <dl className="reading-marathon-status-modal__summary">
                        <div>
                            <dt>공동 달성 거리</dt>
                            <dd>{formatMarathonDistance(summary.totalDistanceM)}</dd>
                        </div>
                        <div>
                            <dt>목표 달성률</dt>
                            <dd>{Math.round(summary.progressPercent)}%</dd>
                        </div>
                        <div>
                            <dt>참여 학생</dt>
                            <dd>{summary.contributors}명</dd>
                        </div>
                    </dl>
                ) : null}

                <ReadingMarathonClassCourse leaderboard={leaderboard} targetDistanceM={targetDistanceM} />

                {roster.length > 0 ? (
                    <ul className="reading-marathon-status-modal__roster">
                        {roster.map((student) => (
                            <li key={student.key}>
                                <strong>{student.name}</strong>
                                <span>{formatMarathonDistance(student.distanceM)}</span>
                                <em>{Math.round(student.percent)}%</em>
                            </li>
                        ))}
                    </ul>
                ) : null}

                <p className="reading-marathon-status-modal__note">
                    교사 확인용 화면입니다. 학생 화면과 교실 화면에는 나오지 않습니다.
                </p>
            </div>
        </Modal>
    );
}
