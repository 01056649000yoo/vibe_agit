import React, { memo, useMemo } from 'react';
import { resolveGenreMissionTypeId } from '../../modules/writing/mission-types/registry';
import './TeacherSubmissionBoard.css';

const EMPTY_STATUS = Object.freeze({
    totalStudents: 0,
    submittedCount: 0,
    confirmedCount: 0,
    pendingCount: 0,
    rewritingCount: 0,
    notSubmittedCount: 0
});

const percent = (count, total) => total > 0 ? Math.min(100, Math.max(0, count / total * 100)) : 0;

const formatClock = (value) => {
    if (!value) return '준비 중';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '방금';
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatRecentTime = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

const MissionStatusRow = memo(({ mission, status, onOpen }) => {
    const isMeeting = resolveGenreMissionTypeId(mission) === 'meeting';
    const total = Number(status.totalStudents || 0);
    const submitted = Number(status.submittedCount || 0);
    const confirmed = Number(status.confirmedCount || 0);
    const pending = Number(status.pendingCount || 0);
    const rewriting = Number(status.rewritingCount || 0);

    return (
        <article className={`teacher-submission-board__mission${pending > 0 ? ' has-pending' : ''}`}>
            <div className="teacher-submission-board__mission-heading">
                <div>
                    <strong>{mission.title || '제목 없는 과제'}</strong>
                    <span>{isMeeting ? `제안 ${submitted}건` : `제출 ${submitted}/${total}`}</span>
                </div>
                <button type="button" onClick={() => onOpen(mission)}>
                    {isMeeting ? '제안 보기' : '글 확인'}
                </button>
            </div>

            <div
                className="teacher-submission-board__progress"
                role="img"
                aria-label={isMeeting
                    ? `${mission.title}, 제안 ${submitted}건`
                    : `${mission.title}, 전체 ${total}명 중 제출 ${submitted}명, 승인 ${confirmed}명, 확인 대기 ${pending}명, 다시쓰기 ${rewriting}명`}
            >
                {isMeeting ? (
                    <span className="is-meeting" style={{ width: `${percent(submitted, total)}%` }} />
                ) : (
                    <>
                        <span className="is-confirmed" style={{ width: `${percent(confirmed, total)}%` }} />
                        <span className="is-pending" style={{ width: `${percent(pending, total)}%` }} />
                        <span className="is-rewriting" style={{ width: `${percent(rewriting, total)}%` }} />
                    </>
                )}
            </div>

            {isMeeting ? (
                <div className="teacher-submission-board__counts is-meeting-count">
                    <span>💡 학생 제안 {submitted}건</span>
                    <span>전체 {total}명</span>
                </div>
            ) : (
                <div className="teacher-submission-board__counts">
                    <span className="is-confirmed">승인 {confirmed}</span>
                    <span className="is-pending">확인 대기 {pending}</span>
                    <span className="is-rewriting">다시쓰기 {rewriting}</span>
                    <span className="is-waiting">미제출 {status.notSubmittedCount || 0}</span>
                </div>
            )}
        </article>
    );
});

MissionStatusRow.displayName = 'MissionStatusRow';

const TeacherSubmissionBoard = ({ missions, board, pollError, onOpenMission }) => {
    const statuses = useMemo(() => board?.mission_statuses || {}, [board?.mission_statuses]);
    const orderedMissions = useMemo(() => {
        return [...missions].sort((left, right) => {
            const leftPending = Number(statuses[left.id]?.pendingCount || 0);
            const rightPending = Number(statuses[right.id]?.pendingCount || 0);
            if (leftPending !== rightPending) return rightPending - leftPending;
            return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
        });
    }, [missions, statuses]);
    const recentSubmissions = (board?.recent_submissions || []).slice(0, 4);

    return (
        <aside className="teacher-submission-board" aria-labelledby="teacher-submission-board-title">
            <header className="teacher-submission-board__header">
                <div>
                    <h4 id="teacher-submission-board-title"><span aria-hidden="true">📡</span> 실시간 제출 전광판</h4>
                    <p>과제별 제출 상황을 12초 이내로 자동 갱신합니다.</p>
                </div>
                <div className={`teacher-submission-board__live${pollError ? ' has-error' : ''}`}>
                    <span className="teacher-submission-board__live-dot" aria-hidden="true" />
                    <strong>{pollError ? '재연결 중' : '자동 갱신'}</strong>
                    <time dateTime={board?.generated_at || undefined}>{formatClock(board?.generated_at)}</time>
                </div>
            </header>

            <section className="teacher-submission-board__summary" aria-label="현재 제출 요약">
                <div>
                    <span>확인할 글</span>
                    <strong>{Number(board?.pending_total || 0)}<small>건</small></strong>
                </div>
                <div>
                    <span>활성 과제</span>
                    <strong>{missions.length}<small>개</small></strong>
                </div>
                <div>
                    <span>학생</span>
                    <strong>{Number(board?.total_students || 0)}<small>명</small></strong>
                </div>
            </section>

            <div className="teacher-submission-board__content">
                <section className="teacher-submission-board__recent" aria-labelledby="teacher-submission-recent-title">
                    <div className="teacher-submission-board__section-title">
                        <h5 id="teacher-submission-recent-title">최근 제출</h5>
                        <span>최신 4건</span>
                    </div>
                    {recentSubmissions.length > 0 ? (
                        <ol>
                            {recentSubmissions.map((item) => (
                                <li key={item.event_id}>
                                    <time dateTime={item.occurred_at}>{formatRecentTime(item.occurred_at)}</time>
                                    <div>
                                        <strong>{item.student_name || '학생'}</strong>
                                        <span>{item.mission_title || '선생님 과제'} · {item.event_type === 'post_resubmitted' ? '다시 제출' : '제출'}</span>
                                    </div>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="teacher-submission-board__empty">아직 표시할 최근 제출이 없습니다.</p>
                    )}
                </section>

                <section className="teacher-submission-board__missions" aria-labelledby="teacher-submission-missions-title">
                    <div className="teacher-submission-board__section-title">
                        <h5 id="teacher-submission-missions-title">과제별 진행 현황</h5>
                        <div className="teacher-submission-board__legend" aria-label="진행 상태 색상 안내">
                            <span className="is-confirmed">승인</span>
                            <span className="is-pending">대기</span>
                            <span className="is-rewriting">다시쓰기</span>
                        </div>
                    </div>
                    {orderedMissions.length > 0 ? (
                        <div className="teacher-submission-board__mission-list">
                            {orderedMissions.map((mission) => (
                                <MissionStatusRow
                                    key={mission.id}
                                    mission={mission}
                                    status={statuses[mission.id] || { ...EMPTY_STATUS, totalStudents: board?.total_students || 0 }}
                                    onOpen={onOpenMission}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="teacher-submission-board__empty">활성 과제를 만들면 진행 현황이 여기에 표시됩니다.</p>
                    )}
                </section>
            </div>
        </aside>
    );
};

export default memo(TeacherSubmissionBoard);
