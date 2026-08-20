import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import ReadingMarathonCourse from './ReadingMarathonCourse';
import {
    formatMarathonDistance,
    getCompetitionLabel,
    getMedalRequirementLabel,
    getProgressPercent,
    normalizeMarathonSnapshot
} from './readingMarathon';
import './readingMarathon.css';

const MEDALS = ['🥇', '🥈', '🥉'];

const ReadingMarathonDashboardCard = ({ studentSession, initialSnapshot = null }) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const [snapshot, setSnapshot] = useState(() => initialSnapshot ? normalizeMarathonSnapshot(initialSnapshot) : null);
    const [fullLoaded, setFullLoaded] = useState(Boolean(initialSnapshot?.leaderboard));
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const loadedCampaignIdRef = useRef(initialSnapshot?.leaderboard ? initialSnapshot?.campaign?.id : null);

    useEffect(() => {
        if (!classId || initialSnapshot) return undefined;
        let active = true;
        const load = async () => {
            const { data, error } = await supabase.rpc('get_reading_marathon_snapshot_v2', { p_class_id: classId });
            if (!active) return;
            if (error) {
                console.error('독서마라톤 현황 로드 실패:', error.message);
                setFailed(true);
                return;
            }
            setSnapshot(normalizeMarathonSnapshot(data));
            setFullLoaded(true);
            loadedCampaignIdRef.current = data?.campaign?.id || null;
        };
        load();
        return () => { active = false; };
    }, [classId, initialSnapshot]);

    useEffect(() => {
        if (!initialSnapshot) return;
        const timerId = window.setTimeout(() => {
            const compact = normalizeMarathonSnapshot(initialSnapshot);
            setSnapshot((current) => loadedCampaignIdRef.current === compact.campaign?.id && current
                ? {
                    ...compact,
                    leaderboard: current.leaderboard,
                    teams: current.teams,
                    teamLeaderboard: current.teamLeaderboard,
                    my: current.my,
                    myTeam: current.myTeam
                }
                : compact);
            setFullLoaded(loadedCampaignIdRef.current === compact.campaign?.id || Boolean(initialSnapshot.leaderboard));
            setFailed(false);
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [initialSnapshot]);

    useEffect(() => {
        if (!expanded || fullLoaded || !classId) return undefined;
        let active = true;
        const loadDetails = async () => {
            setDetailsLoading(true);
            const { data, error } = await supabase.rpc('get_reading_marathon_snapshot_v2', { p_class_id: classId });
            if (!active) return;
            if (error) {
                console.error('독서마라톤 상세 로드 실패:', error.message);
            } else {
                setSnapshot(normalizeMarathonSnapshot(data));
                setFullLoaded(true);
                loadedCampaignIdRef.current = data?.campaign?.id || null;
            }
            setDetailsLoading(false);
        };
        void loadDetails();
        return () => { active = false; };
    }, [classId, expanded, fullLoaded]);

    if (failed || !snapshot?.campaign?.is_enabled) return null;

    const competitionType = snapshot.campaign.competition_type || 'class_team';
    const isIndividual = competitionType === 'individual';
    const isGroup = competitionType === 'group_team';
    const podium = snapshot.leaderboard.filter((row) => row.distance_m > 0 && row.rank <= 3).slice(0, 3);
    const teamPodium = snapshot.teamLeaderboard.filter((row) => row.total_distance_m > 0).slice(0, 3);
    const my = snapshot.my;
    const myTeam = snapshot.myTeam;
    const raceSummary = isIndividual ? {
        ...snapshot.summary,
        totalPages: my?.total_pages || 0,
        totalDistanceM: my?.distance_m || 0,
        bookCount: my?.book_count || 0,
        progressPercent: getProgressPercent(my?.distance_m, snapshot.campaign.target_distance_m)
    } : isGroup && myTeam ? {
        ...snapshot.summary,
        totalPages: myTeam.total_pages,
        totalDistanceM: myTeam.total_distance_m,
        bookCount: myTeam.book_count,
        contributors: myTeam.member_count,
        progressPercent: getProgressPercent(myTeam.total_distance_m, snapshot.campaign.target_distance_m)
    } : snapshot.summary;
    const completed = isIndividual
        ? Boolean(my?.completed_at)
        : isGroup ? Boolean(myTeam?.completed_at) : snapshot.campaign.status === 'completed';
    const detailsId = `reading-marathon-details-${snapshot.campaign.id}`;

    return (
        <section className={`reading-marathon-card ${expanded ? 'is-expanded' : 'is-collapsed'}`} aria-labelledby="reading-marathon-dashboard-title">
            <button
                type="button"
                className="reading-marathon-card__header"
                aria-expanded={expanded}
                aria-controls={detailsId}
                onClick={() => setExpanded((current) => !current)}
            >
                <div>
                    <span>📚 {getCompetitionLabel(competitionType)} · 읽은 만큼 앞으로!</span>
                    <h2 id="reading-marathon-dashboard-title">{snapshot.campaign.title}</h2>
                </div>
                <div className="reading-marathon-card__summary">
                    <strong>{completed ? '🎉 완주!' : `${Math.round(raceSummary.progressPercent)}% 달성`}</strong>
                    <span>{isGroup ? `우리 모둠 ${formatMarathonDistance(myTeam?.total_distance_m || 0)}` : `내 거리 ${formatMarathonDistance(my?.distance_m || 0)}`}</span>
                    <em>{expanded ? '접기 ▴' : '자세히 보기 ▾'}</em>
                </div>
                <div className="reading-marathon-card__compact-progress" aria-hidden="true">
                    <span style={{ width: `${raceSummary.progressPercent}%` }} />
                </div>
            </button>

            {expanded && (
                <div id={detailsId} className="reading-marathon-card__details">
                    {detailsLoading && <p role="status">순위와 상세 기록을 불러오고 있어요…</p>}
                    <ReadingMarathonCourse title={snapshot.campaign.title} summary={raceSummary} completed={completed} />

                    <p className="reading-marathon-medal-rule">🏅 {getMedalRequirementLabel(snapshot.campaign)}</p>

                    <div className="reading-marathon-card__tracks">
                        <article className="reading-marathon-track reading-marathon-track--individual">
                            <header><span>🏅</span><div><strong>{isGroup ? '모둠 순위' : '독서 거리 순위'}</strong><small>{isGroup ? '모둠이 함께 달린 거리' : '내가 읽고 확인받은 거리'}</small></div></header>
                            {(isGroup ? teamPodium : podium).length > 0 ? (
                                <ol className="reading-marathon-podium">
                                    {(isGroup ? teamPodium : podium).map((row, index) => (
                                        <li key={row.student_id || row.id}>
                                            <span>{MEDALS.at(index)}</span>
                                            <strong>{row.name}</strong>
                                            <em>{formatMarathonDistance(row.distance_m ?? row.total_distance_m)}</em>
                                        </li>
                                    ))}
                                </ol>
                            ) : <p className="reading-marathon-track__empty">첫 번째 주자를 기다리고 있어요.</p>}
                            <div className="reading-marathon-my-race">
                                <span>{isGroup
                                    ? (myTeam?.total_distance_m > 0 ? `${myTeam.name} · 현재 ${myTeam.rank}위` : `${myTeam?.name || '우리 모둠'} · 아직 출발 전`)
                                    : (my?.distance_m > 0 ? `현재 ${my.rank}위` : '아직 출발 전')}</span>
                                <strong>{formatMarathonDistance(isGroup ? myTeam?.total_distance_m || 0 : my?.distance_m || 0)}</strong>
                                <small>{isGroup
                                    ? `모둠 합계 ${myTeam?.book_count || 0}권 · ${(myTeam?.total_pages || 0).toLocaleString('ko-KR')}쪽 · 내 기여 ${formatMarathonDistance(my?.distance_m || 0)}`
                                    : `${my?.book_count || 0}권 · ${(my?.total_pages || 0).toLocaleString('ko-KR')}쪽`}</small>
                            </div>
                        </article>

                        <article className="reading-marathon-track reading-marathon-track--class">
                            <header><span>{isIndividual ? '🏃' : '🤝'}</span><div><strong>{isIndividual ? '나의 완주 기록' : isGroup ? '우리 모둠 현황' : '우리 반 공동 목표'}</strong><small>{isIndividual ? '내 목표 거리까지 차근차근' : '함께 읽은 거리를 합쳐 완주'}</small></div></header>
                            <dl>
                                <div><dt>{isIndividual ? '내 순위' : isGroup ? '모둠 인원' : '참여 주자'}</dt><dd>{isIndividual ? `${my?.rank || '-'}위` : `${raceSummary.contributors}명`}</dd></div>
                                <div><dt>{isIndividual ? '읽은 책' : '함께 읽은 책'}</dt><dd>{raceSummary.bookCount}권</dd></div>
                                <div><dt>{isIndividual ? '읽은 쪽' : '함께 읽은 쪽'}</dt><dd>{raceSummary.totalPages.toLocaleString('ko-KR')}쪽</dd></div>
                            </dl>
                            {snapshot.summary.pendingBookCount > 0 && (
                                <p className="reading-marathon-pending">📖 페이지 정보 확인 중인 책 {snapshot.summary.pendingBookCount}권</p>
                            )}
                        </article>
                    </div>
                </div>
            )}
        </section>
    );
};

export default ReadingMarathonDashboardCard;
