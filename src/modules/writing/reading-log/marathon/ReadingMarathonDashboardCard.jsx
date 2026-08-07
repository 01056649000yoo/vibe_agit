import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import ReadingMarathonCourse from './ReadingMarathonCourse';
import { formatMarathonDistance, normalizeMarathonSnapshot } from './readingMarathon';
import './readingMarathon.css';

const MEDALS = ['🥇', '🥈', '🥉'];

const ReadingMarathonDashboardCard = ({ studentSession }) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const [snapshot, setSnapshot] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!classId) return undefined;
        let active = true;
        const load = async () => {
            const { data, error } = await supabase.rpc('get_reading_marathon_snapshot', { p_class_id: classId });
            if (!active) return;
            if (error) {
                console.error('독서마라톤 현황 로드 실패:', error.message);
                setFailed(true);
                return;
            }
            setSnapshot(normalizeMarathonSnapshot(data));
        };
        load();
        return () => { active = false; };
    }, [classId]);

    if (failed || !snapshot?.campaign?.is_enabled) return null;

    const podium = snapshot.leaderboard.filter((row) => row.distance_m > 0).slice(0, 3);
    const my = snapshot.my;
    const completed = snapshot.campaign.status === 'completed';

    return (
        <section className="reading-marathon-card" aria-labelledby="reading-marathon-dashboard-title">
            <header className="reading-marathon-card__header">
                <div>
                    <span>📚 읽은 만큼 앞으로!</span>
                    <h2 id="reading-marathon-dashboard-title">{snapshot.campaign.title}</h2>
                </div>
                <strong>{completed ? '🎉 우리 반 완주!' : `${Math.round(snapshot.summary.progressPercent)}%`}</strong>
            </header>

            <ReadingMarathonCourse title={snapshot.campaign.title} summary={snapshot.summary} completed={completed} />

            <div className="reading-marathon-card__tracks">
                <article className="reading-marathon-track reading-marathon-track--individual">
                    <header><span>🏅</span><div><strong>우리 반 독서 기여 순위</strong><small>공동 목표에 보탠 독서 거리</small></div></header>
                    {podium.length > 0 ? (
                        <ol className="reading-marathon-podium">
                            {podium.map((row, index) => (
                                <li key={row.student_id}>
                                    <span>{MEDALS.at(index)}</span>
                                    <strong>{row.name}</strong>
                                    <em>{formatMarathonDistance(row.distance_m)}</em>
                                </li>
                            ))}
                        </ol>
                    ) : <p className="reading-marathon-track__empty">첫 번째 주자를 기다리고 있어요.</p>}
                    <div className="reading-marathon-my-race">
                        <span>{my?.distance_m > 0 ? `현재 ${my.rank}위` : '아직 출발 전'}</span>
                        <strong>{formatMarathonDistance(my?.distance_m || 0)}</strong>
                        <small>{my?.book_count || 0}권 · {(my?.total_pages || 0).toLocaleString('ko-KR')}쪽</small>
                    </div>
                </article>

                <article className="reading-marathon-track reading-marathon-track--class">
                    <header><span>🤝</span><div><strong>공동 목표 현황</strong><small>모두의 거리를 합쳐 완주</small></div></header>
                    <dl>
                        <div><dt>참여 주자</dt><dd>{snapshot.summary.contributors}명</dd></div>
                        <div><dt>함께 읽은 책</dt><dd>{snapshot.summary.bookCount}권</dd></div>
                        <div><dt>함께 읽은 쪽</dt><dd>{snapshot.summary.totalPages.toLocaleString('ko-KR')}쪽</dd></div>
                    </dl>
                    {snapshot.summary.pendingBookCount > 0 && (
                        <p className="reading-marathon-pending">📖 페이지 정보 확인 중인 책 {snapshot.summary.pendingBookCount}권</p>
                    )}
                </article>
            </div>
        </section>
    );
};

export default ReadingMarathonDashboardCard;
