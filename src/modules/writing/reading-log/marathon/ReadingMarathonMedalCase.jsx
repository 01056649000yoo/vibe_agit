import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { formatMarathonDistance } from './readingMarathon';
import './readingMarathon.css';

const formatAwardedAt = (value) => new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'short', day: 'numeric'
}).format(new Date(value));

const ReadingMarathonMedalCase = () => {
    const [state, setState] = useState({ loading: true, medals: [], count: 0, failed: false });

    useEffect(() => {
        let active = true;
        const load = async () => {
            const { data, error } = await supabase.rpc('get_my_reading_marathon_medals_v1', { p_limit: 50 });
            if (!active) return;
            setState({
                loading: false,
                medals: error || !Array.isArray(data?.medals) ? [] : data.medals,
                count: error ? 0 : Number(data?.count) || 0,
                failed: Boolean(error)
            });
        };
        void load();
        return () => { active = false; };
    }, []);

    if (state.loading) return <section className="reading-marathon-medal-case is-loading">완주 메달을 꺼내는 중…</section>;
    if (state.failed) return <section className="reading-marathon-medal-case is-empty">완주 메달을 잠시 불러오지 못했어요.</section>;

    return (
        <section className="reading-marathon-medal-case" aria-labelledby="reading-marathon-medal-case-title">
            <header>
                <div><span>나의 독서 기록</span><h3 id="reading-marathon-medal-case-title">🏅 독서마라톤 메달함</h3></div>
                <strong>{state.count}개</strong>
            </header>
            {state.medals.length === 0 ? (
                <p className="reading-marathon-medal-case__empty">아직 완주 메달이 없어요. 확인받은 독서록으로 첫 메달에 도전해 보세요!</p>
            ) : (
                <div className="reading-marathon-medal-case__grid">
                    {state.medals.map((medal) => {
                        const teamMedal = medal.medal_kind === 'team';
                        return (
                            <article key={medal.id} className={`reading-marathon-medal is-${teamMedal ? 'team' : 'individual'}`}>
                                <div className="reading-marathon-medal__emblem" aria-hidden="true">
                                    <span>{teamMedal ? '🤝' : '🏃'}</span>
                                </div>
                                <div>
                                    <small>{teamMedal ? `${medal.team_name || '우리 반'} 단체전 완주` : '개인전 완주'}</small>
                                    <strong>{medal.campaign_title}</strong>
                                    <span>{Number(medal.book_count) || 0}권 · {formatMarathonDistance(medal.total_distance_m)}</span>
                                    <em>{formatAwardedAt(medal.awarded_at)}</em>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export default ReadingMarathonMedalCase;
