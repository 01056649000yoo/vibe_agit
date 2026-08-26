import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CenteredDialog from '../common/CenteredDialog';
import './TeacherSubmissionBoard.css';

const STUDENT_STATUS_COLUMNS = Object.freeze([
    Object.freeze({ key: 'confirmed_count', status: 'confirmed', label: '승인', className: 'is-confirmed' }),
    Object.freeze({ key: 'pending_count', status: 'pending', label: '확인 대기', className: 'is-pending' }),
    Object.freeze({ key: 'rewriting_count', status: 'rewriting', label: '다시쓰기', className: 'is-rewriting' }),
    Object.freeze({ key: 'not_submitted_count', status: 'not_submitted', label: '미제출', className: 'is-waiting' })
]);
const STATUS_COLUMN_BY_VALUE = new Map(STUDENT_STATUS_COLUMNS.map((column) => [column.status, column]));
const EMPTY_HIGHLIGHTS = Object.freeze({ studentIds: new Set(), eventIds: new Set() });
const EMPTY_SCOPE_SUMMARY = Object.freeze({});

const getStudentSnapshotSignature = (student, isMissionScope) => isMissionScope
    ? student.status || 'not_submitted'
    : STUDENT_STATUS_COLUMNS.map((column) => Number(Reflect.get(student, column.key) || 0)).join(':');

const formatClock = (value) => {
    if (!value) return '준비 중';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '방금';
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatRecentTime = (value, includeDate = false) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    if (includeDate) {
        return date.toLocaleString('ko-KR', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
};

const getSubmissionAttempt = (submission) => {
    const suppliedNumber = Number(submission?.submission_number || 0);
    if (suppliedNumber > 0) return Math.floor(suppliedNumber);
    return submission?.event_type === 'post_resubmitted' ? 2 : 1;
};

const getSubmissionAttemptLabel = (attempt) => {
    if (attempt <= 1) return '첫 제출';
    if (attempt === 2) return '다시 제출';
    return `${attempt}회 제출`;
};

/*
 * 제출을 과제별로 묶는다.
 *
 * ⚠️ 묶는 기준은 **과제 id** 다. 같은 제목의 과제를 두 번 내면(예: 매주 같은 제목의 일기 과제)
 *    묶음이 둘로 나뉘는데, 머리말에는 제목만 있어 **똑같은 이름 두 개**로 보인다(2026-08-25 지적).
 *    그래서 제목이 겹칠 때만 만든 날짜를 덧붙여 가른다. 안 겹치면 붙이지 않는다 — 늘 붙이면
 *    대부분의 경우에 쓸데없는 글자가 늘어난다.
 */
const groupSubmissionsByMission = (submissions, missionsById) => {
    const groups = [];
    const groupByMission = new Map();

    submissions.forEach((submission) => {
        const missionId = submission.mission_id;
        let group = groupByMission.get(missionId);
        if (!group) {
            const mission = missionsById.get(missionId) || null;
            group = {
                missionId,
                mission,
                title: mission?.title || submission.mission_title || '선생님 과제',
                createdAt: mission?.created_at || null,
                submissions: []
            };
            groupByMission.set(missionId, group);
            groups.push(group);
        }
        group.submissions.push(submission);
    });

    // 같은 제목이 둘 이상일 때만 날짜를 붙인다.
    const titleCounts = new Map();
    groups.forEach((group) => titleCounts.set(group.title, (titleCounts.get(group.title) || 0) + 1));
    groups.forEach((group) => {
        if (titleCounts.get(group.title) > 1 && group.createdAt) {
            group.subtitle = `${new Date(group.createdAt).getMonth() + 1}/${new Date(group.createdAt).getDate()} 낸 과제`;
        }
    });

    return groups;
};

const SubmissionEventGroups = memo(({
    groups, includeDate = false, openingPostId, onOpenPost, highlightedEventIds = EMPTY_HIGHLIGHTS.eventIds
}) => (
    <div className="teacher-submission-board__submission-groups">
        {groups.map((group) => (
            <section className="teacher-submission-board__submission-group" key={group.missionId}>
                <header>
                    <strong>{group.title}</strong>
                    {group.subtitle && (
                        <em className="teacher-submission-board__group-subtitle">{group.subtitle}</em>
                    )}
                    <span>{group.submissions.length}건</span>
                </header>
                <ol>
                    {group.submissions.map((item) => {
                        const submissionAttempt = getSubmissionAttempt(item);
                        const submissionLabel = getSubmissionAttemptLabel(submissionAttempt);
                        const submissionStatusClass = submissionAttempt <= 1
                            ? 'is-first'
                            : submissionAttempt === 2 ? 'is-resubmitted' : 'is-repeated';
                        const isOpening = openingPostId === item.post_id;
                        return (
                            <li
                                key={item.event_id}
                                className={highlightedEventIds.has(item.event_id) ? 'is-new-submission' : undefined}
                            >
                                <button
                                    type="button"
                                    disabled={!group.mission || Boolean(openingPostId)}
                                    onClick={() => onOpenPost(item)}
                                    aria-label={`${item.student_name || '학생'}의 ${group.title} ${submissionLabel} 글 바로 열기`}
                                    aria-busy={isOpening || undefined}
                                >
                                    <time dateTime={item.occurred_at}>{formatRecentTime(item.occurred_at, includeDate)}</time>
                                    <strong>{item.student_name || '학생'}</strong>
                                    <span className="teacher-submission-board__row-spacer" aria-hidden="true" />
                                    <span className={`teacher-submission-board__recent-status ${submissionStatusClass}`}>
                                        {isOpening ? '여는 중' : submissionLabel}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            </section>
        ))}
    </div>
));

SubmissionEventGroups.displayName = 'SubmissionEventGroups';

const StudentStatusTable = memo(({ students, highlightedStudentIds }) => (
    <div className="teacher-submission-board__status-table-scroll" tabIndex={0} role="region" aria-label="학생별 제출 상태표">
        <table className="teacher-submission-board__status-table">
            <thead>
                <tr>
                    <th scope="col">학생</th>
                    {STUDENT_STATUS_COLUMNS.map((column) => (
                        <th key={column.key} scope="col" className={column.className}>
                            <span aria-hidden="true" />
                            {column.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {students.map((student) => (
                    <tr
                        key={student.student_id}
                        className={highlightedStudentIds.has(student.student_id) ? 'is-status-changed' : undefined}
                    >
                        <th scope="row">
                            <strong>{student.student_name || '학생'}</strong>
                            <small>{Number(student.assignment_count || 0)}개 과제</small>
                        </th>
                        {STUDENT_STATUS_COLUMNS.map((column) => {
                            const value = Number(Reflect.get(student, column.key) || 0);
                            return (
                                <td key={column.key} className={column.className}>
                                    <span
                                        className={`teacher-submission-board__status-count${value === 0 ? ' is-zero' : ''}`}
                                        aria-label={`${student.student_name || '학생'} ${column.label} ${value}개`}
                                    >
                                        {value}
                                    </span>
                                </td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
));

StudentStatusTable.displayName = 'StudentStatusTable';

const MissionStatusFilters = memo(({ summary, statusFilter, onChange, expanded = false }) => (
    <div
        className={`teacher-submission-board__status-filters${expanded ? ' is-expanded' : ''}`}
        role="group"
        aria-label="학생 상태 필터"
    >
        <button
            type="button"
            className={statusFilter === 'all' ? 'is-active' : undefined}
            aria-pressed={statusFilter === 'all'}
            onClick={() => onChange('all')}
        >
            전체 <strong>{Number(summary.total_students || 0)}</strong>
        </button>
        {STUDENT_STATUS_COLUMNS.map((column) => (
            <button
                type="button"
                key={column.status}
                className={`${column.className}${statusFilter === column.status ? ' is-active' : ''}`}
                aria-pressed={statusFilter === column.status}
                onClick={() => onChange(column.status)}
            >
                {column.label} <strong>{Number(Reflect.get(summary, column.key) || 0)}</strong>
            </button>
        ))}
    </div>
));

MissionStatusFilters.displayName = 'MissionStatusFilters';

const MissionStudentStatusCards = memo(({
    students, highlightedStudentIds, expanded = false
}) => (
    <ul
        className={`teacher-submission-board__mission-card-grid${expanded ? ' is-expanded' : ''}`}
        aria-label={expanded ? '확대된 선택 미션 학생별 상태 카드' : '선택 미션 학생별 상태 카드'}
    >
        {students.map((student) => {
            const column = STATUS_COLUMN_BY_VALUE.get(student.status)
                || STATUS_COLUMN_BY_VALUE.get('not_submitted');
            const studentName = student.student_name || '학생';
            return (
                <li
                    key={student.student_id}
                    className={`teacher-submission-board__mission-card ${column.className}${
                        highlightedStudentIds.has(student.student_id) ? ' is-status-changed' : ''
                    }`}
                    aria-label={`${studentName}, 현재 상태 ${column.label}`}
                >
                    <strong title={studentName}>{studentName}</strong>
                    <span><i aria-hidden="true" />{column.label}</span>
                </li>
            );
        })}
    </ul>
));

MissionStudentStatusCards.displayName = 'MissionStudentStatusCards';

const TeacherSubmissionBoard = ({
    classId, missions, board, pollError, selectedMissionId, isScopeLoading,
    onSelectMission, onOpenPost, onLoadHistory
}) => {
    const [openingPostId, setOpeningPostId] = useState(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [isStatusExpanded, setIsStatusExpanded] = useState(false);
    const [highlights, setHighlights] = useState(EMPTY_HIGHLIGHTS);
    const [liveMessage, setLiveMessage] = useState('');
    const [historyState, setHistoryState] = useState({
        isOpen: false,
        loading: false,
        error: false,
        submissions: [],
        hasMore: false
    });
    const historyRequestIdRef = useRef(0);
    const previousSnapshotRef = useRef(null);
    const missionsById = useMemo(
        () => new Map(missions.map((mission) => [mission.id, mission])),
        [missions]
    );
    const eligibleMissions = useMemo(
        () => missions.filter((mission) => mission.is_archived !== true && mission.mission_type !== 'meeting'),
        [missions]
    );
    const selectedMission = selectedMissionId ? missionsById.get(selectedMissionId) || null : null;
    const isMissionScope = Boolean(selectedMissionId);
    const scopeKey = `${classId || 'none'}:${selectedMissionId || 'all'}`;
    const scopeMatches = isMissionScope
        ? board?.scope === 'mission' && board?.selected_mission_id === selectedMissionId
        : board?.scope !== 'mission';
    const studentStatuses = useMemo(
        () => (board?.student_statuses || []).slice(0, 100),
        [board?.student_statuses]
    );
    const recentSubmissions = useMemo(
        () => (board?.recent_submissions || []).slice(0, 8),
        [board?.recent_submissions]
    );
    const recentGroups = useMemo(
        () => groupSubmissionsByMission(recentSubmissions, missionsById),
        [missionsById, recentSubmissions]
    );
    const historyGroups = useMemo(
        () => groupSubmissionsByMission(historyState.submissions, missionsById),
        [historyState.submissions, missionsById]
    );
    const filteredStudentStatuses = useMemo(() => {
        if (!isMissionScope || statusFilter === 'all') return studentStatuses;
        return studentStatuses.filter((student) => student.status === statusFilter);
    }, [isMissionScope, statusFilter, studentStatuses]);
    const scopeSummary = board?.scope_summary || EMPTY_SCOPE_SUMMARY;

    useEffect(() => {
        setStatusFilter('all');
        setIsStatusExpanded(false);
    }, [selectedMissionId]);

    useEffect(() => {
        if (!scopeMatches || !board?.generated_at) return undefined;
        const studentSignatures = new Map(studentStatuses.map((student) => [
            student.student_id,
            getStudentSnapshotSignature(student, isMissionScope)
        ]));
        const eventIds = new Set(recentSubmissions.map((submission) => submission.event_id));
        const previous = previousSnapshotRef.current;
        const changedStudentIds = new Set();
        const newEventIds = new Set();

        if (previous?.scopeKey === scopeKey && previous.version === 2 && Number(board?.version) === 2) {
            studentSignatures.forEach((signature, studentId) => {
                if (previous.studentSignatures.has(studentId)
                    && previous.studentSignatures.get(studentId) !== signature) {
                    changedStudentIds.add(studentId);
                }
            });
            eventIds.forEach((eventId) => {
                if (!previous.eventIds.has(eventId)) newEventIds.add(eventId);
            });
        }

        previousSnapshotRef.current = {
            scopeKey,
            version: Number(board?.version || 0),
            studentSignatures,
            eventIds
        };
        if (changedStudentIds.size === 0 && newEventIds.size === 0) {
            setHighlights(EMPTY_HIGHLIGHTS);
            setLiveMessage('');
            return undefined;
        }

        setHighlights({ studentIds: changedStudentIds, eventIds: newEventIds });
        setLiveMessage(changedStudentIds.size > 0
            ? `제출 현황이 갱신되었습니다. 학생 ${changedStudentIds.size}명의 상태가 바뀌었습니다.`
            : `새 제출 ${newEventIds.size}건이 도착했습니다.`);
        const timerId = window.setTimeout(() => {
            setHighlights(EMPTY_HIGHLIGHTS);
            setLiveMessage('');
        }, 2200);
        return () => window.clearTimeout(timerId);
    }, [board?.generated_at, board?.version, isMissionScope, recentSubmissions, scopeKey, scopeMatches, studentStatuses]);

    const handleOpenPost = useCallback(async (submission) => {
        if (!submission?.post_id || openingPostId) return;
        setOpeningPostId(submission.post_id);
        try {
            const opened = await onOpenPost(submission);
            if (opened !== false) {
                setHistoryState((current) => ({ ...current, isOpen: false }));
            }
        } finally {
            setOpeningPostId(null);
        }
    }, [onOpenPost, openingPostId]);

    const handleOpenHistory = useCallback(async () => {
        const requestId = historyRequestIdRef.current + 1;
        historyRequestIdRef.current = requestId;
        setHistoryState((current) => ({
            ...current,
            isOpen: true,
            loading: true,
            error: false,
            submissions: [],
            hasMore: false
        }));
        try {
            const history = await onLoadHistory();
            if (requestId !== historyRequestIdRef.current) return;
            setHistoryState({
                isOpen: true,
                loading: false,
                error: false,
                submissions: history.submissions,
                hasMore: Boolean(history.has_more)
            });
        } catch {
            if (requestId !== historyRequestIdRef.current) return;
            setHistoryState((current) => ({ ...current, loading: false, error: true }));
        }
    }, [onLoadHistory]);

    const handleCloseHistory = useCallback(() => {
        historyRequestIdRef.current += 1;
        setHistoryState((current) => ({ ...current, isOpen: false }));
    }, []);

    const handleOpenStatusExpanded = useCallback(() => setIsStatusExpanded(true), []);
    const handleCloseStatusExpanded = useCallback(() => setIsStatusExpanded(false), []);

    const handleSelectMission = useCallback((event) => {
        setStatusFilter('all');
        onSelectMission(event.target.value || null);
    }, [onSelectMission]);

    return (
        <aside className="teacher-submission-board" aria-labelledby="teacher-submission-board-title">
            <header className="teacher-submission-board__header">
                <div>
                    <h4 id="teacher-submission-board-title"><span aria-hidden="true">📡</span> 실시간 제출 전광판</h4>
                    <p>과제별 제출 상황을 12초 이내로 자동 갱신합니다.</p>
                </div>
                <div className={`teacher-submission-board__live${pollError ? ' has-error' : ''}`}>
                    <span className="teacher-submission-board__live-dot" aria-hidden="true" />
                    <strong>{isScopeLoading ? '불러오는 중' : pollError ? '재연결 중' : '자동 갱신'}</strong>
                    <time dateTime={board?.generated_at || undefined}>{formatClock(board?.generated_at)}</time>
                </div>
            </header>

            <div className="teacher-submission-board__scope-toolbar">
                <label htmlFor="teacher-submission-board-scope">
                    <span>현황 범위</span>
                    <select
                        id="teacher-submission-board-scope"
                        value={selectedMissionId || ''}
                        onChange={handleSelectMission}
                        disabled={eligibleMissions.length === 0}
                    >
                        <option value="">전체 활성 글 과제 ({eligibleMissions.length})</option>
                        {eligibleMissions.map((mission) => (
                            <option key={mission.id} value={mission.id}>{mission.title || '제목 없는 과제'}</option>
                        ))}
                    </select>
                </label>
                <p>{isMissionScope
                    ? `‘${selectedMission?.title || board?.selected_mission_title || '선택 과제'}’만 보고 있습니다.`
                    : '전체 과제를 합산해서 보고 있습니다.'}</p>
            </div>
            <p className="teacher-submission-board__sr-only" aria-live="polite">{liveMessage}</p>

            <div className="teacher-submission-board__content">
                <section className="teacher-submission-board__recent" aria-labelledby="teacher-submission-recent-title">
                    <div className="teacher-submission-board__section-title">
                        <div>
                            <h5 id="teacher-submission-recent-title">
                                {isMissionScope ? '선택 미션 최근 제출' : '최근 제출 학생'}
                            </h5>
                            {isMissionScope && <p>{selectedMission?.title || board?.selected_mission_title}</p>}
                        </div>
                        <div className="teacher-submission-board__recent-actions">
                            <span>최신 8건</span>
                            <button type="button" onClick={handleOpenHistory}>
                                {isMissionScope ? '전체 기록 모아보기' : '제출 기록 모아보기'}
                            </button>
                        </div>
                    </div>
                    {isScopeLoading ? (
                        <p className="teacher-submission-board__empty is-loading">선택한 현황을 불러오는 중입니다.</p>
                    ) : !scopeMatches ? (
                        <p className="teacher-submission-board__empty is-error">선택한 현황을 불러오지 못했습니다. 자동으로 다시 확인합니다.</p>
                    ) : recentSubmissions.length > 0 ? (
                        <SubmissionEventGroups
                            groups={recentGroups}
                            openingPostId={openingPostId}
                            onOpenPost={handleOpenPost}
                            highlightedEventIds={highlights.eventIds}
                        />
                    ) : (
                        <p className="teacher-submission-board__empty">아직 표시할 최근 제출이 없습니다.</p>
                    )}
                </section>

                <section className="teacher-submission-board__student-statuses" aria-labelledby="teacher-submission-students-title">
                    <div className="teacher-submission-board__section-title">
                        <div>
                            <h5 id="teacher-submission-students-title">학생별 제출 현황</h5>
                            <p>{isMissionScope
                                ? selectedMission?.title || board?.selected_mission_title
                                : '활성 글 과제를 학생별로 합산했습니다.'}</p>
                        </div>
                        {isMissionScope && scopeMatches && !isScopeLoading && studentStatuses.length > 0 ? (
                            <button
                                type="button"
                                className="teacher-submission-board__expand-button"
                                onClick={handleOpenStatusExpanded}
                            >
                                실시간 크게 보기
                            </button>
                        ) : !isMissionScope ? (
                            <div className="teacher-submission-board__legend" aria-label="진행 상태 색상 안내">
                                <span className="is-confirmed">승인</span>
                                <span className="is-pending">확인 대기</span>
                                <span className="is-rewriting">다시쓰기</span>
                                <span className="is-waiting">미제출</span>
                            </div>
                        ) : null}
                    </div>
                    {isMissionScope && scopeMatches && !isScopeLoading && (
                        <MissionStatusFilters
                            summary={scopeSummary}
                            statusFilter={statusFilter}
                            onChange={setStatusFilter}
                        />
                    )}
                    {isScopeLoading ? (
                        <p className="teacher-submission-board__empty is-loading">학생별 상태를 불러오는 중입니다.</p>
                    ) : !scopeMatches ? (
                        <p className="teacher-submission-board__empty is-error">선택한 미션의 학생 상태를 불러오지 못했습니다.</p>
                    ) : filteredStudentStatuses.length > 0 ? isMissionScope ? (
                        <MissionStudentStatusCards
                            students={filteredStudentStatuses}
                            highlightedStudentIds={highlights.studentIds}
                        />
                    ) : (
                        <StudentStatusTable
                            students={filteredStudentStatuses}
                            highlightedStudentIds={highlights.studentIds}
                        />
                    ) : isMissionScope && studentStatuses.length > 0 ? (
                        <p className="teacher-submission-board__empty">이 상태에 해당하는 학생이 없습니다.</p>
                    ) : (
                        <p className="teacher-submission-board__empty">활성 글 과제를 만들면 학생별 현황이 여기에 표시됩니다.</p>
                    )}
                </section>
            </div>

            <CenteredDialog
                isOpen={isStatusExpanded && isMissionScope}
                onClose={handleCloseStatusExpanded}
                eyebrow="실시간 제출 전광판"
                title={`${selectedMission?.title || board?.selected_mission_title || '선택 미션'} 제출 현황`}
                description="24명 기준 카드 배치로 현재 상태를 크게 봅니다. 이 창을 열어 둔 동안에도 12초 이내로 자동 갱신됩니다."
                maxWidth="1440px"
                maxHeight="calc(100dvh - 40px)"
                bodyPadding="14px"
            >
                <div className="teacher-submission-board__expanded-summary">
                    <div>
                        <strong>{filteredStudentStatuses.length}명 표시</strong>
                        <span>전체 {Number(scopeSummary.total_students || 0)}명</span>
                    </div>
                    <div className={`teacher-submission-board__live${pollError ? ' has-error' : ''}`}>
                        <span className="teacher-submission-board__live-dot" aria-hidden="true" />
                        <strong>{isScopeLoading ? '불러오는 중' : pollError ? '재연결 중' : '자동 갱신'}</strong>
                        <time dateTime={board?.generated_at || undefined}>{formatClock(board?.generated_at)}</time>
                    </div>
                </div>
                <MissionStatusFilters
                    summary={scopeSummary}
                    statusFilter={statusFilter}
                    onChange={setStatusFilter}
                    expanded
                />
                {isScopeLoading ? (
                    <p className="teacher-submission-board__empty is-loading">학생별 상태를 불러오는 중입니다.</p>
                ) : !scopeMatches ? (
                    <p className="teacher-submission-board__empty is-error">선택한 미션의 학생 상태를 불러오지 못했습니다.</p>
                ) : filteredStudentStatuses.length > 0 ? (
                    <MissionStudentStatusCards
                        students={filteredStudentStatuses}
                        highlightedStudentIds={highlights.studentIds}
                        expanded
                    />
                ) : studentStatuses.length > 0 ? (
                    <p className="teacher-submission-board__empty">이 상태에 해당하는 학생이 없습니다.</p>
                ) : (
                    <p className="teacher-submission-board__empty">표시할 학생이 없습니다.</p>
                )}
            </CenteredDialog>

            <CenteredDialog
                isOpen={historyState.isOpen}
                onClose={handleCloseHistory}
                eyebrow="실시간 제출 전광판"
                title="제출 기록 모아보기"
                description="활성 과제의 제출·재제출 기록을 과제별로 묶었습니다. 학생을 누르면 해당 글이 바로 열립니다."
                maxWidth="860px"
                bodyPadding="16px"
            >
                <div className="teacher-submission-board__history-summary">
                    <strong>{historyState.submissions.length}건</strong>
                    <span>최신 제출 기록 · 최대 100건</span>
                </div>
                {historyState.loading ? (
                    <p className="teacher-submission-board__history-message">제출 기록을 불러오는 중입니다...</p>
                ) : historyState.error ? (
                    <div className="teacher-submission-board__history-message is-error">
                        <p>제출 기록을 불러오지 못했습니다.</p>
                        <button type="button" onClick={handleOpenHistory}>다시 불러오기</button>
                    </div>
                ) : historyGroups.length > 0 ? (
                    <SubmissionEventGroups
                        groups={historyGroups}
                        includeDate
                        openingPostId={openingPostId}
                        onOpenPost={handleOpenPost}
                    />
                ) : (
                    <p className="teacher-submission-board__history-message">아직 제출 기록이 없습니다.</p>
                )}
                {historyState.hasMore && !historyState.loading && !historyState.error && (
                    <p className="teacher-submission-board__history-limit">
                        최근 100건까지만 표시했습니다. 이전 기록은 과제별 글 확인에서 볼 수 있습니다.
                    </p>
                )}
            </CenteredDialog>
        </aside>
    );
};

export default memo(TeacherSubmissionBoard);
