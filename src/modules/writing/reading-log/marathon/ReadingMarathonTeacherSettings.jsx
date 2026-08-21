import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../../components/common/Button';
import { supabase } from '../../../../lib/supabaseClient';
import ReadingMarathonCourse from './ReadingMarathonCourse';
import ReadingMarathonTeamAssignmentDialog from './ReadingMarathonTeamAssignmentDialog';
import {
    DEFAULT_TARGET_DISTANCE_M,
    buildMarathonTeamPayload,
    distributeMarathonRosterEvenly,
    distributeMarathonRosterRandomly,
    formatMarathonDistance,
    getCompetitionLabel,
    getMarathonTeamAssignmentSummary,
    getMedalRequirementLabel,
    normalizeMarathonSnapshot
} from './readingMarathon';
import './readingMarathon.css';

const TARGET_PRESETS = [10000, 42195, 100000];
const MEDALS = ['🥇', '🥈', '🥉'];
const TEAM_COLORS = ['#F97316', '#0EA5E9', '#8B5CF6', '#10B981', '#EC4899', '#EAB308'];

const makeDefaultTeams = (roster = []) => [0, 1].map((index) => ({
    key: `team-${index + 1}`,
    name: `${index + 1}모둠`,
    color: TEAM_COLORS.at(index),
    studentIds: roster.filter((_, studentIndex) => studentIndex % 2 === index).map((student) => student.student_id)
}));

const formatDate = (dateValue) => {
    if (!dateValue) return '정하지 않음';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
        ? new Date(`${dateValue}T00:00:00`)
        : new Date(dateValue);
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
};

const finishReasonLabel = (reason) => {
    if (reason === 'completed') return '🏁 목표 완주';
    if (reason === 'ended_early') return '⏹ 중간 종료';
    return '🔄 새 마라톤으로 교체';
};

const ReadingMarathonTeacherSettings = ({ classId, className }) => {
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [ending, setEnding] = useState(false);
    const [pageSavingId, setPageSavingId] = useState(null);
    const [pageValues, setPageValues] = useState({});
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [history, setHistory] = useState([]);
    const [teamAssignmentDialogOpen, setTeamAssignmentDialogOpen] = useState(false);
    const [form, setForm] = useState({
        title: `${className || '우리 반'} 독서마라톤`,
        targetDistanceM: DEFAULT_TARGET_DISTANCE_M,
        competitionType: 'class_team',
        medalRequirementType: 'books',
        medalRequirementValue: 1,
        teams: [],
        endsOn: ''
    });

    const applySnapshot = useCallback((data) => {
        const normalized = normalizeMarathonSnapshot(data);
        setSnapshot(normalized);
        if (normalized.campaign) {
            const teams = normalized.teams.map((team) => ({
                key: team.id,
                name: team.name,
                color: team.color,
                studentIds: normalized.roster.filter((student) => student.team_id === team.id).map((student) => student.student_id)
            }));
            setForm({
                title: normalized.campaign.title,
                targetDistanceM: Number(normalized.campaign.target_distance_m) || DEFAULT_TARGET_DISTANCE_M,
                competitionType: normalized.campaign.competition_type || 'class_team',
                medalRequirementType: normalized.campaign.medal_requirement_type || 'books',
                medalRequirementValue: Number(normalized.campaign.medal_requirement_value) || 0,
                teams: teams.length > 0 ? teams : makeDefaultTeams(normalized.roster),
                endsOn: normalized.campaign.ends_on || ''
            });
        } else {
            setForm({
                title: `${className || '우리 반'} 독서마라톤`,
                targetDistanceM: DEFAULT_TARGET_DISTANCE_M,
                competitionType: 'class_team',
                medalRequirementType: 'books',
                medalRequirementValue: 1,
                teams: makeDefaultTeams(normalized.roster),
                endsOn: ''
            });
        }
    }, [className]);

    useEffect(() => {
        if (!classId) return undefined;
        let active = true;
        const load = async () => {
            setLoading(true);
            setHistoryOpen(false);
            setHistory([]);
            setHistoryError('');
            const { data, error } = await supabase.rpc('get_reading_marathon_snapshot_v2', { p_class_id: classId });
            if (!active) return;
            setLoading(false);
            if (error) {
                console.error('교사 독서마라톤 설정 로드 실패:', error.message);
                return;
            }
            applySnapshot(data);
        };
        load();
        return () => { active = false; };
    }, [applySnapshot, classId]);

    const loadHistory = useCallback(async () => {
        if (!classId) return;
        setHistoryLoading(true);
        setHistoryError('');
        const { data, error } = await supabase.rpc('get_teacher_reading_marathon_history', {
            p_class_id: classId,
            p_limit: 20
        });
        setHistoryLoading(false);
        if (error) {
            console.error('지난 독서마라톤 기록 로드 실패:', error.message);
            setHistoryError('지난 마라톤 기록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
            return;
        }
        setHistory(Array.isArray(data?.campaigns) ? data.campaigns : []);
    }, [classId]);

    const toggleHistory = async () => {
        const nextOpen = !historyOpen;
        setHistoryOpen(nextOpen);
        if (nextOpen && history.length === 0) await loadHistory();
    };

    const leaderboard = useMemo(
        () => (snapshot?.leaderboard || []).filter((row) => row.distance_m > 0),
        [snapshot?.leaderboard]
    );

    const saveCampaign = async ({ startNew = false, enabledOverride, successMessage } = {}) => {
        if (!form.title.trim()) {
            alert('독서마라톤 이름을 입력해주세요.');
            return false;
        }
        setSaving(true);
        const { data, error } = await supabase.rpc('save_teacher_reading_marathon_v2', {
            p_class_id: classId,
            p_title: form.title.trim(),
            p_target_distance_m: Math.round(Number(form.targetDistanceM)),
            p_competition_type: form.competitionType,
            p_medal_requirement_type: form.competitionType === 'individual' ? 'none' : form.medalRequirementType,
            p_medal_requirement_value: form.competitionType === 'individual' ? 0 : Math.round(Number(form.medalRequirementValue)),
            p_teams: form.competitionType === 'group_team' ? buildMarathonTeamPayload(form.teams) : [],
            p_ends_on: form.endsOn || null,
            p_enabled: enabledOverride ?? Boolean(snapshot?.campaign?.started_at),
            p_start_new: startNew
        });
        setSaving(false);
        if (error) {
            console.error('독서마라톤 설정 저장 실패:', error.message);
            alert(error.message || '독서마라톤 설정을 저장하지 못했습니다.');
            return false;
        }
        applySnapshot(data);
        if (startNew) {
            setHistory([]);
            if (historyOpen) await loadHistory();
        }
        alert(successMessage || (startNew ? '새 독서마라톤을 시작했습니다! 🏃' : '독서마라톤 설정을 저장했습니다.'));
        return true;
    };

    const startCampaign = async () => {
        if (form.competitionType === 'group_team') {
            const assignment = getMarathonTeamAssignmentSummary(form.teams, snapshot?.roster || []);
            if (!assignment.complete) {
                alert(`모든 학생을 한 모둠에 배정해주세요. (${assignment.assignedCount}/${assignment.totalCount}명 배정)`);
                return;
            }
        }
        if (!window.confirm('모둠과 학생 배정을 확인했나요?\n\n마라톤을 시작하면 첫 독서 기록이 반영된 뒤에는 경기 방식과 학생 배정을 바꿀 수 없습니다.')) return;
        await saveCampaign({
            enabledOverride: true,
            successMessage: '학생 배정을 저장하고 독서마라톤을 시작했습니다! 🏃'
        });
    };

    const finishCampaign = async () => {
        if (!snapshot?.campaign || ending) return;
        const isCompletedCampaign = snapshot.campaign.status === 'completed';
        const shouldFinish = window.confirm(
            isCompletedCampaign
                ? `‘${snapshot.campaign.title}’의 완주 결과를 보관하고 새 마라톤을 준비할까요?\n\n최종 거리와 학생별 순위는 지난 마라톤 결과에 그대로 남습니다.`
                : `‘${snapshot.campaign.title}’을 지금 종료할까요?\n\n현재 거리와 학생별 순위는 지난 마라톤 결과에 그대로 보관되며, 학생 화면에서는 내려갑니다.`
        );
        if (!shouldFinish) return;

        setEnding(true);
        const { data, error } = await supabase.rpc('finish_teacher_reading_marathon', {
            p_class_id: classId
        });
        setEnding(false);
        if (error) {
            console.error('독서마라톤 중간 종료 실패:', error.message);
            alert(error.message || '독서마라톤을 종료하지 못했습니다.');
            return;
        }

        applySnapshot(data);
        setHistory([]);
        if (historyOpen) await loadHistory();
        alert(isCompletedCampaign
            ? '완주 결과를 보관했습니다. 아래에서 새 마라톤을 만들어주세요.'
            : '현재 독서마라톤을 종료했습니다. 아래에서 새 마라톤을 시작할 수 있습니다.');
    };

    const savePageCount = async (book) => {
        const pageCount = Number(pageValues[book.post_id]);
        if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 10000) {
            alert('페이지 수를 1~10,000쪽 사이로 입력해주세요.');
            return;
        }
        setPageSavingId(book.post_id);
        const { error } = await supabase.rpc('set_teacher_reading_book_page_count', {
            p_class_id: classId,
            p_post_id: book.post_id,
            p_page_count: pageCount
        });
        setPageSavingId(null);
        if (error) {
            console.error('책 페이지 수 저장 실패:', error.message);
            alert('페이지 수를 저장하지 못했습니다.');
            return;
        }
        setPageValues((current) => {
            const next = { ...current };
            delete next[book.post_id];
            return next;
        });
        const { data: refreshed, error: refreshError } = await supabase.rpc('get_reading_marathon_snapshot_v2', { p_class_id: classId });
        if (!refreshError) applySnapshot(refreshed);
    };

    if (loading) return <div className="reading-marathon-settings__loading">독서마라톤 코스를 준비하는 중... 🏃</div>;

    const completed = snapshot?.campaign?.status === 'completed';
    const campaign = snapshot?.campaign;
    const summary = snapshot?.summary;
    const podium = leaderboard.slice(0, 3);
    const competitionType = campaign?.competition_type || 'class_team';
    const teamPodium = (snapshot?.teamLeaderboard || []).filter((team) => team.total_distance_m > 0).slice(0, 3);
    const remainingDistanceM = Math.max(0, (summary?.targetDistanceM || 0) - (summary?.totalDistanceM || 0));
    const modeLocked = Boolean(campaign?.started_at);
    const teamAssignmentLocked = completed || (modeLocked && Number(summary?.bookCount || 0) > 0);
    const roster = snapshot?.roster || [];
    const assignmentSummary = getMarathonTeamAssignmentSummary(form.teams, roster);
    const maxTeamCount = Math.min(20, Math.max(2, roster.length));
    const balancedTeamSizeMin = form.teams.length > 0 ? Math.floor(roster.length / form.teams.length) : 0;
    const balancedTeamSizeMax = form.teams.length > 0 ? Math.ceil(roster.length / form.teams.length) : 0;

    const assignStudent = (studentId, teamKey) => {
        setForm((current) => ({
            ...current,
            teams: current.teams.map((team) => ({
                ...team,
                studentIds: team.key === teamKey
                    ? [...new Set([...team.studentIds, studentId])]
                    : team.studentIds.filter((id) => id !== studentId)
            }))
        }));
    };

    const addTeam = () => setForm((current) => {
        const index = current.teams.length;
        const nextTeams = [...current.teams, {
            key: `new-${Date.now()}-${index}`,
            name: `${index + 1}모둠`,
            color: TEAM_COLORS.at(index % TEAM_COLORS.length),
            studentIds: []
        }];
        return {
            ...current,
            teams: distributeMarathonRosterEvenly(nextTeams, roster)
        };
    });

    const removeTeam = (teamKey) => setForm((current) => {
        const nextTeams = current.teams.filter((team) => team.key !== teamKey);
        return {
            ...current,
            teams: distributeMarathonRosterEvenly(nextTeams, roster)
        };
    });

    const rebalanceTeams = () => setForm((current) => ({
        ...current,
        teams: distributeMarathonRosterEvenly(current.teams, roster)
    }));

    const randomizeTeams = () => setForm((current) => ({
        ...current,
        teams: distributeMarathonRosterRandomly(current.teams, roster)
    }));

    return (
        <section className="reading-marathon-settings" aria-labelledby="reading-marathon-settings-title">
            <header>
                <div>
                    <span>독서 동기부여</span>
                    <h3 id="reading-marathon-settings-title">🏃 독서마라톤</h3>
                    <p>개인전·학급 전체전·모둠전을 열고, 확인 완료한 독서록만 거리와 메달에 반영합니다.</p>
                </div>
                {!modeLocked && (
                    <div className="reading-marathon-prestart-note">
                        <strong>📝 시작 전 준비 중</strong>
                        <small>모둠과 학생을 배정한 뒤 아래 시작 버튼을 눌러 학생에게 공개합니다.</small>
                    </div>
                )}
            </header>

            {campaign ? (
                <>
                    <section className="reading-marathon-overview" aria-labelledby="reading-marathon-overview-title">
                        <div className="reading-marathon-section-heading">
                            <div>
                                <span>현재 운영 현황</span>
                                <h4 id="reading-marathon-overview-title">{campaign.title}</h4>
                                <p>{getCompetitionLabel(campaign.competition_type)} · {getMedalRequirementLabel(campaign)}</p>
                            </div>
                            <strong className={`reading-marathon-status reading-marathon-status--${campaign.status}`}>
                                {completed ? '공동 목표 완주' : campaign.is_enabled ? '학생에게 표시 중' : '학생에게 숨김'}
                            </strong>
                        </div>
                        <dl className="reading-marathon-overview__stats">
                            <div><dt>공동 달성 거리</dt><dd>{formatMarathonDistance(summary.totalDistanceM)}</dd></div>
                            <div><dt>목표 달성률</dt><dd>{Math.round(summary.progressPercent)}%</dd></div>
                            <div><dt>남은 거리</dt><dd>{formatMarathonDistance(remainingDistanceM)}</dd></div>
                            <div><dt>참여 학생</dt><dd>{summary.contributors}명</dd></div>
                            <div><dt>종료일</dt><dd>{formatDate(campaign.ends_on)}</dd></div>
                        </dl>
                    </section>

                    <section className="reading-marathon-student-preview" aria-labelledby="reading-marathon-preview-title">
                        <div className="reading-marathon-section-heading">
                            <div>
                                <span>학생 화면 확인</span>
                                <h4 id="reading-marathon-preview-title">학생에게 이렇게 보여요</h4>
                                <p>학생 대시보드에 표시되는 실제 공동 코스와 순위 구성입니다.</p>
                            </div>
                            <strong>{campaign.is_enabled ? '현재 표시 중' : '기능을 켜면 표시'}</strong>
                        </div>

                        <ReadingMarathonCourse title={campaign.title} summary={summary} completed={completed} />

                        <div className="reading-marathon-card__tracks">
                            <article className="reading-marathon-track reading-marathon-track--individual">
                                <header><span>🏅</span><div><strong>{competitionType === 'group_team' ? '모둠 순위' : '학생별 독서 거리 순위'}</strong><small>{competitionType === 'group_team' ? '모둠이 함께 달린 거리' : '확인 완료된 개인 독서 거리'}</small></div></header>
                                {(competitionType === 'group_team' ? teamPodium : podium).length > 0 ? (
                                    <ol className="reading-marathon-podium">
                                        {(competitionType === 'group_team' ? teamPodium : podium).map((row, index) => (
                                            <li key={row.student_id || row.id}>
                                                <span>{MEDALS.at(index)}</span>
                                                <strong>{row.name}</strong>
                                                <em>{formatMarathonDistance(row.distance_m ?? row.total_distance_m)}</em>
                                            </li>
                                        ))}
                                    </ol>
                                ) : <p className="reading-marathon-track__empty">첫 번째 독서 기록을 기다리고 있어요.</p>}
                                <div className="reading-marathon-my-race reading-marathon-my-race--guide">
                                    <span>학생마다 자신의 현재 순위가 보여요</span>
                                    <small>내가 읽은 거리 · 책 수 · 페이지 수를 함께 확인합니다.</small>
                                </div>
                            </article>

                            <article className="reading-marathon-track reading-marathon-track--class">
                                <header><span>🤝</span><div><strong>공동 목표 현황</strong><small>모두의 거리를 합쳐 완주</small></div></header>
                                <dl>
                                    <div><dt>참여 학생</dt><dd>{summary.contributors}명</dd></div>
                                    <div><dt>함께 읽은 책</dt><dd>{summary.bookCount}권</dd></div>
                                    <div><dt>함께 읽은 쪽</dt><dd>{summary.totalPages.toLocaleString('ko-KR')}쪽</dd></div>
                                </dl>
                                {summary.pendingBookCount > 0 && (
                                    <p className="reading-marathon-pending">📖 페이지 정보 확인 중인 책 {summary.pendingBookCount}권</p>
                                )}
                            </article>
                        </div>
                    </section>

                    <div className="reading-marathon-settings__tracks">
                        {competitionType === 'group_team' && (
                            <section>
                                <h4>🏁 모둠별 진행 결과</h4>
                                <p>모둠별 목표 달성과 구성원 수를 한눈에 확인합니다.</p>
                                <ol className="reading-marathon-teacher-ranking">
                                    {snapshot.teamLeaderboard.map((team) => (
                                        <li key={team.id}>
                                            <span>{team.rank}위</span>
                                            <strong>{team.name}{team.completed_at ? ' 🏅' : ''}</strong>
                                            <em>{team.member_count}명 · {formatMarathonDistance(team.total_distance_m)}</em>
                                        </li>
                                    ))}
                                </ol>
                            </section>
                        )}
                        <section>
                            <h4>🏅 학생별 참여도</h4>
                            <p>단체전에서도 학생마다 확인받은 책·쪽수·거리를 모두 확인할 수 있습니다.</p>
                            {leaderboard.length > 0 ? (
                                <ol className="reading-marathon-teacher-ranking">
                                    {leaderboard.map((row) => (
                                        <li key={row.student_id}><span>{row.rank}위</span><strong>{row.name}</strong><em>{row.book_count}권 · {formatMarathonDistance(row.distance_m)}</em></li>
                                    ))}
                                </ol>
                            ) : <p>아직 페이지가 반영된 학생이 없습니다.</p>}
                        </section>
                        <section>
                            <h4>📖 페이지 정보 확인이 필요한 책</h4>
                            <p>확인 완료했어도 페이지 수가 없으면 거리를 계산할 수 없습니다. 자동으로 찾지 못한 책만 직접 입력해주세요.</p>
                            {snapshot.pendingBooks.length > 0 ? (
                                <div className="reading-marathon-pending-list">
                                    {snapshot.pendingBooks.map((book) => (
                                        <div key={book.post_id}>
                                            <span><strong>{book.book_title}</strong><small>{book.student_name} · {book.isbn13 || book.isbn10 || 'ISBN 없음'}</small></span>
                                            <label><input type="number" min="1" max="10000" aria-label={`${book.book_title} 페이지 수`} placeholder="쪽수" value={pageValues[book.post_id] || ''} onChange={(event) => setPageValues((current) => ({ ...current, [book.post_id]: event.target.value }))} /><em>쪽</em></label>
                                            <Button type="button" size="sm" variant="outline" onClick={() => savePageCount(book)} disabled={pageSavingId === book.post_id}>{pageSavingId === book.post_id ? '저장 중' : '반영'}</Button>
                                        </div>
                                    ))}
                                </div>
                            ) : <p className="reading-marathon-settings__done">페이지 정보가 필요한 새 책이 없습니다. ✅</p>}
                        </section>
                    </div>
                </>
            ) : (
                <div className="reading-marathon-settings__empty">
                    <span>🏁</span>
                    <strong>아직 만든 독서마라톤이 없습니다.</strong>
                    <p>아래에서 이름과 공동 목표 거리를 정하면 학생 화면에 표시할 수 있습니다.</p>
                </div>
            )}

            <section className="reading-marathon-config" aria-labelledby="reading-marathon-config-title">
                <div className="reading-marathon-section-heading">
                    <div>
                        <span>운영 설정</span>
                        <h4 id="reading-marathon-config-title">{campaign ? '마라톤 설정 바꾸기' : '새 마라톤 시작하기'}</h4>
                    </div>
                </div>
                <form onSubmit={(event) => { event.preventDefault(); modeLocked ? saveCampaign() : startCampaign(); }} className="reading-marathon-settings__form">
                <label>
                    <span>마라톤 이름</span>
                    <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={60} />
                </label>
                <fieldset className="reading-marathon-mode-picker">
                    <legend>경기 방식</legend>
                    <div className="reading-marathon-mode-options">
                        {[
                            ['individual', '🏃 개인전', '학생마다 같은 목표 거리를 완주해요.'],
                            ['class_team', '🤝 우리 반 전체전', '학급 전체가 한 팀으로 거리를 합쳐요.'],
                            ['group_team', '🏁 모둠 대항전', '교사가 정한 모둠끼리 같은 목표로 달려요.']
                        ].map(([value, label, description]) => (
                            <label key={value} className={form.competitionType === value ? 'is-selected' : ''}>
                                <input
                                    type="radio"
                                    name="marathon-mode"
                                    value={value}
                                    checked={form.competitionType === value}
                                    disabled={modeLocked}
                                    onChange={() => setForm((current) => ({ ...current, competitionType: value }))}
                                />
                                <strong>{label}</strong><small>{description}</small>
                            </label>
                        ))}
                    </div>
                    {modeLocked && <p>시작한 경기 방식과 팀 명단은 결과가 흔들리지 않도록 고정됩니다.</p>}
                </fieldset>
                <fieldset>
                    <legend>{form.competitionType === 'individual' ? '학생 1명당 목표 거리' : form.competitionType === 'group_team' ? '모둠별 목표 거리' : '학급 공동 목표 거리'}</legend>
                    <div className="reading-marathon-presets">
                        {TARGET_PRESETS.map((meters) => (
                            <button key={meters} type="button" className={form.targetDistanceM === meters ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, targetDistanceM: meters }))}>
                                {meters === 42195 ? '정식 마라톤 42.195km' : formatMarathonDistance(meters)}
                            </button>
                        ))}
                    </div>
                    <label className="reading-marathon-custom-target">
                        <span>직접 입력</span>
                        <input type="number" min="1" max="10000" step="0.001" value={form.targetDistanceM / 1000} onChange={(event) => setForm((current) => ({ ...current, targetDistanceM: Number(event.target.value) * 1000 }))} />
                        <em>km</em>
                    </label>
                </fieldset>
                {form.competitionType !== 'individual' && (
                    <fieldset className="reading-marathon-requirement">
                        <legend>단체전 메달 최소 참여 조건</legend>
                        <div>
                            <select value={form.medalRequirementType} onChange={(event) => setForm((current) => ({ ...current, medalRequirementType: event.target.value }))}>
                                <option value="none">조건 없음</option>
                                <option value="books">확인 완료된 책 수</option>
                                <option value="pages">확인 완료된 페이지 수</option>
                            </select>
                            {form.medalRequirementType !== 'none' && (
                                <label>
                                    <input type="number" min="1" max="100000" value={form.medalRequirementValue} onChange={(event) => setForm((current) => ({ ...current, medalRequirementValue: event.target.value }))} />
                                    <span>{form.medalRequirementType === 'pages' ? '쪽 이상' : '권 이상'}</span>
                                </label>
                            )}
                        </div>
                        <p>팀이 목표를 완주해도 이 조건을 채운 학생에게만 단체전 메달이 지급됩니다.</p>
                    </fieldset>
                )}
                {form.competitionType === 'group_team' && (
                    <fieldset className="reading-marathon-team-editor">
                        <legend>모둠과 학생 배정</legend>
                        {modeLocked && (
                            <p className={`reading-marathon-team-editor__lock ${teamAssignmentLocked ? 'is-locked' : ''}`}>
                                {teamAssignmentLocked
                                    ? '첫 독서 기록이 이미 반영되어 모둠과 학생 배정이 고정되었습니다.'
                                    : '아직 반영된 독서 기록이 없어 배정을 수정할 수 있습니다. 첫 기록 반영 뒤에는 고정됩니다.'}
                            </p>
                        )}
                        <div className="reading-marathon-team-editor__summary">
                            <div>
                                <strong>{form.teams.length}개 모둠 · {assignmentSummary.assignedCount}/{assignmentSummary.totalCount}명 배정</strong>
                                <small>균등 배정 기준: 모둠당 {balancedTeamSizeMin === balancedTeamSizeMax ? `${balancedTeamSizeMin}명` : `${balancedTeamSizeMin}~${balancedTeamSizeMax}명`}</small>
                            </div>
                            <div className="reading-marathon-team-editor__assignment-buttons">
                                <button type="button" onClick={rebalanceTeams} disabled={teamAssignmentLocked}>↻ 균등 재배정</button>
                                <button type="button" onClick={randomizeTeams} disabled={teamAssignmentLocked}>🎲 랜덤 배정</button>
                                <button type="button" className="is-expand" onClick={() => setTeamAssignmentDialogOpen(true)}>⛶ 크게 보기</button>
                            </div>
                        </div>
                        <div className="reading-marathon-team-editor__board">
                            {form.teams.map((team, index) => {
                                const members = roster.filter((student) => team.studentIds.includes(student.student_id));
                                return (
                                    <article key={team.key} className="reading-marathon-team-card" style={{ '--team-color': team.color }}>
                                        <header>
                                            <span aria-hidden="true">{index + 1}</span>
                                            <input value={team.name} maxLength={30} disabled={teamAssignmentLocked} aria-label={`${index + 1}번째 모둠 이름`} onChange={(event) => setForm((current) => ({
                                                ...current,
                                                teams: current.teams.map((item) => item.key === team.key ? { ...item, name: event.target.value } : item)
                                            }))} />
                                            <strong>{members.length}명</strong>
                                            {form.teams.length > 2 && <button type="button" disabled={teamAssignmentLocked} onClick={() => removeTeam(team.key)} aria-label={`${team.name} 삭제`}>삭제</button>}
                                        </header>
                                        <div className="reading-marathon-team-card__members">
                                            {members.length > 0 ? members.map((student) => (
                                                <div key={student.student_id}>
                                                    <span aria-hidden="true">●</span>
                                                    <strong>{student.name}</strong>
                                                    <select value={team.key} disabled={teamAssignmentLocked} aria-label={`${student.name} 모둠 변경`} onChange={(event) => assignStudent(student.student_id, event.target.value)}>
                                                        {form.teams.map((optionTeam) => <option key={optionTeam.key} value={optionTeam.key}>{optionTeam.name}</option>)}
                                                    </select>
                                                </div>
                                            )) : <p>배정된 학생이 없습니다.</p>}
                                        </div>
                                    </article>
                                );
                            })}
                            {assignmentSummary.unassignedIds.length > 0 && (
                                <article className="reading-marathon-team-card is-unassigned">
                                    <header><span aria-hidden="true">!</span><strong>미배정 학생</strong><em>{assignmentSummary.unassignedIds.length}명</em></header>
                                    <div className="reading-marathon-team-card__members">
                                        {roster.filter((student) => assignmentSummary.unassignedIds.includes(student.student_id)).map((student) => (
                                            <div key={student.student_id}>
                                                <span aria-hidden="true">●</span>
                                                <strong>{student.name}</strong>
                                                <select value="" disabled={teamAssignmentLocked} aria-label={`${student.name} 모둠 선택`} onChange={(event) => assignStudent(student.student_id, event.target.value)}>
                                                    <option value="" disabled>모둠 선택</option>
                                                    {form.teams.map((team) => <option key={team.key} value={team.key}>{team.name}</option>)}
                                                </select>
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            )}
                        </div>
                        <div className="reading-marathon-team-editor__actions">
                            {form.teams.length < maxTeamCount ? <button type="button" disabled={teamAssignmentLocked} onClick={addTeam}>+ 모둠 추가</button> : <strong>현재 학생 수에서 만들 수 있는 최대 모둠입니다.</strong>}
                            <small>모둠을 추가하거나 삭제하면 학생 수에 맞춰 자동으로 균등 배정됩니다. 이후 학생별 선택 상자에서 자유롭게 옮길 수 있습니다.</small>
                        </div>
                    </fieldset>
                )}
                <ReadingMarathonTeamAssignmentDialog
                    isOpen={teamAssignmentDialogOpen}
                    onClose={() => setTeamAssignmentDialogOpen(false)}
                    teams={form.teams}
                    roster={roster}
                    locked={teamAssignmentLocked}
                    onTeamsChange={(teams) => setForm((current) => ({ ...current, teams }))}
                />
                <label>
                    <span>종료일(선택)</span>
                    <input type="date" value={form.endsOn} onChange={(event) => setForm((current) => ({ ...current, endsOn: event.target.value }))} />
                </label>
                <p className="reading-marathon-settings__rule">교사가 ‘확인 완료’한 독서록만 반영합니다. ‘보완 요청’은 제외됩니다. 한 페이지는 10m이며, 한 학생의 같은 책은 한 번만 인정됩니다.</p>
                {completed ? (
                    <Button type="button" onClick={finishCampaign} disabled={saving || ending}>
                        {ending ? '완주 기록 보관 중...' : '완주 기록 보관하고 새 마라톤 준비하기 🏁'}
                    </Button>
                ) : !modeLocked ? (
                    <div className="reading-marathon-start-actions">
                        <Button type="button" variant="outline" disabled={saving} onClick={() => saveCampaign({
                            enabledOverride: false,
                            successMessage: '모둠과 학생 배정을 초안으로 저장했습니다.'
                        })}>
                            {saving ? '저장 중...' : '초안 저장하기'}
                        </Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? '시작 중...' : '학생 배정 확인하고 시작하기 🏃'}
                        </Button>
                    </div>
                ) : (
                    <Button type="submit" disabled={saving}>{saving ? '저장 중...' : snapshot?.campaign ? '설정 저장하기' : '독서마라톤 만들기'}</Button>
                )}
                {campaign?.started_at && !completed && (
                    <Button
                        type="button"
                        variant="outline"
                        className="reading-marathon-finish-button"
                        style={{ borderColor: '#fca5a5', backgroundColor: '#fff', color: '#b91c1c' }}
                        onClick={finishCampaign}
                        disabled={saving || ending}
                    >
                        {ending ? '종료 처리 중...' : '현재 마라톤 중간 종료하기 ⏹'}
                    </Button>
                )}
                </form>
            </section>

            <section className="reading-marathon-history" aria-labelledby="reading-marathon-history-title">
                <button
                    type="button"
                    className="reading-marathon-history__toggle"
                    aria-expanded={historyOpen}
                    aria-controls="reading-marathon-history-list"
                    onClick={toggleHistory}
                >
                    <span>
                        <strong id="reading-marathon-history-title">🏅 지난 마라톤 결과 보기</strong>
                        <small>종료한 마라톤의 최종 거리와 학생별 순위를 다시 확인합니다.</small>
                    </span>
                    <em>{historyOpen ? '닫기 ▴' : '열기 ▾'}</em>
                </button>

                {historyOpen && (
                    <div id="reading-marathon-history-list" className="reading-marathon-history__list">
                        {historyLoading ? (
                            <p className="reading-marathon-history__message">지난 기록을 불러오는 중... 🏃</p>
                        ) : historyError ? (
                            <div className="reading-marathon-history__message is-error">
                                <p>{historyError}</p>
                                <Button type="button" size="sm" variant="ghost" onClick={loadHistory}>다시 불러오기</Button>
                            </div>
                        ) : history.length === 0 ? (
                            <p className="reading-marathon-history__message">아직 종료한 마라톤 기록이 없습니다.</p>
                        ) : history.map((pastCampaign) => {
                            const pastLeaderboard = Array.isArray(pastCampaign.leaderboard) ? pastCampaign.leaderboard : [];
                            return (
                                <details className="reading-marathon-history-card" key={pastCampaign.id}>
                                    <summary>
                                        <span>
                                            <small>{finishReasonLabel(pastCampaign.finish_reason)} · {getCompetitionLabel(pastCampaign.competition_type)}</small>
                                            <strong>{pastCampaign.title}</strong>
                                            <em>{formatDate(pastCampaign.started_at)} ~ {formatDate(pastCampaign.finished_at)}</em>
                                        </span>
                                        <span>
                                            <strong>{formatMarathonDistance(pastCampaign.total_distance_m)}</strong>
                                            <em>{Math.round(Number(pastCampaign.progress_percent) || 0)}% 달성 · 결과 펼치기 ▾</em>
                                        </span>
                                    </summary>
                                    <div className="reading-marathon-history-card__body">
                                        <dl>
                                            <div><dt>최종 거리</dt><dd>{formatMarathonDistance(pastCampaign.total_distance_m)}</dd></div>
                                            <div><dt>목표 거리</dt><dd>{formatMarathonDistance(pastCampaign.target_distance_m)}</dd></div>
                                            <div><dt>참여 학생</dt><dd>{Number(pastCampaign.contributors) || 0}명</dd></div>
                                            <div><dt>함께 읽은 책</dt><dd>{Number(pastCampaign.book_count) || 0}권</dd></div>
                                        </dl>
                                        <h5>학생별 최종 독서 기여 순위</h5>
                                        {pastLeaderboard.length > 0 ? (
                                            <ol className="reading-marathon-teacher-ranking">
                                                {pastLeaderboard.map((row) => (
                                                    <li key={row.student_id}>
                                                        <span>{Number(row.rank) || 0}위</span>
                                                        <strong>{row.name}</strong>
                                                        <em>{Number(row.book_count) || 0}권 · {formatMarathonDistance(row.distance_m)}</em>
                                                    </li>
                                                ))}
                                            </ol>
                                        ) : <p className="reading-marathon-history__message">반영된 학생 기록이 없습니다.</p>}
                                        {pastCampaign.competition_type === 'group_team' && Array.isArray(pastCampaign.teams) && (
                                            <>
                                                <h5>모둠별 최종 결과</h5>
                                                <ol className="reading-marathon-teacher-ranking">
                                                    {pastCampaign.teams.map((team, index) => (
                                                        <li key={team.id}>
                                                            <span>{index + 1}위</span>
                                                            <strong>{team.name}{team.completed_at ? ' 🏅' : ''}</strong>
                                                            <em>{Number(team.member_count) || 0}명 · {formatMarathonDistance(team.total_distance_m)}</em>
                                                        </li>
                                                    ))}
                                                </ol>
                                            </>
                                        )}
                                    </div>
                                </details>
                            );
                        })}
                    </div>
                )}
            </section>

        </section>
    );
};

export default ReadingMarathonTeacherSettings;
