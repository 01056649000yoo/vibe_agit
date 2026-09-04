import React, { useMemo } from 'react';
import Modal from '../../../../components/common/Modal';
import { formatMarathonDistance, getMarathonDashboardStats, getProgressPercent } from './readingMarathon';
import './readingMarathon.css';

/*
 * 우리 반 마라톤 현황 — 교사가 눌러서 여는 창.
 *
 * 운영 현황 탭에 트랙을 늘 펼쳐 두면 자리를 먹고, 아이들 위치가 화면에 상시 떠 있게 된다.
 * 필요할 때만 열어 보는 창으로 옮긴다.
 *
 * ⚠️ 여기는 **교사 확인용**이다. 학생 화면과 교실 화면에는 나오지 않는다.
 * ⚠️ 이름 차례는 **가나다순**이다. 거리순으로 줄을 세우면 창을 열 때마다 맨 아래 아이가
 *    "꼴찌 자리"로 굳는다. 누가 얼마나 왔는지는 각 줄에 그대로 적히므로 표만으로 충분히 알 수 있다.
 *
 * 2026-09-03: 트랙 위에 아이들을 점으로 흩어 놓던 그림을 걷어냈다(사용자 요청).
 * 점은 자리를 크게 먹으면서 정작 "누가 얼마나 왔는지"는 표보다 읽기 어려웠다. 숫자를 바로 보여 준다.
 * ⚠️ 새로 읽는 자료는 없다 — 이미 받아 둔 순위표를 다시 쓸 뿐이라 창을 열어도 요청이 늘지 않는다.
 */

export default function ReadingMarathonStatusModal({
    isOpen,
    onClose,
    leaderboard = [],
    targetDistanceM = 0,
    summary = null,
    // 위쪽 숫자칸은 경기 방식마다 다르다. 설정 화면과 **같은 계산**을 쓴다.
    campaign = null,
    teams = []
}) {
    const roster = useMemo(() => (Array.isArray(leaderboard) ? leaderboard : [])
        .filter((row) => row?.name)
        .map((row) => ({
            key: row.student_id || row.name,
            name: row.name,
            bookCount: Number(row.book_count) || 0,
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
                        {getMarathonDashboardStats({ campaign, summary, leaderboard, teams }).map((stat) => (
                            <div key={stat.key}>
                                <dt>{stat.label}</dt>
                                <dd>{stat.value}</dd>
                            </div>
                        ))}
                    </dl>
                ) : null}

                {roster.length > 0 ? (
                    <div className="reading-marathon-status-modal__tablewrap">
                        <table className="reading-marathon-status-modal__table">
                            <thead>
                                <tr>
                                    <th scope="col">이름</th>
                                    <th scope="col">읽은 책</th>
                                    <th scope="col">달린 거리</th>
                                    <th scope="col">달성률</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roster.map((student) => (
                                    <tr key={student.key}>
                                        <th scope="row">{student.name}</th>
                                        <td>{student.bookCount}권</td>
                                        <td>{formatMarathonDistance(student.distanceM)}</td>
                                        <td>{Math.round(student.percent)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="reading-marathon-status-modal__note">아직 거리가 반영된 학생이 없습니다.</p>}

                <p className="reading-marathon-status-modal__note">
                    교사 확인용 화면입니다. 학생 화면과 교실 화면에는 나오지 않습니다.
                </p>
            </div>
        </Modal>
    );
}
