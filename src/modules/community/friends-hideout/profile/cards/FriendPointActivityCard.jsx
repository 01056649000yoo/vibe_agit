import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { dataCache } from '../../../../../lib/cache';
import { supabase } from '../../../../../lib/supabaseClient';

const EMPTY_SUMMARY = {
    writing_reward_count: 0,
    meeting_activity_count: 0,
    vocab_reward_count: 0,
    dragon_care_count: 0,
    hideout_purchase_count: 0,
    last_public_activity_at: null
};

const ACTIVITY_CACHE_MS = 300000;

const ACTIVITIES = [
    { key: 'writing_reward_count', icon: '✍️', label: '글쓰기 보상', color: '#5C6BC0', background: '#EEF2FF' },
    { key: 'meeting_activity_count', icon: '🏛️', label: '회의 참여', color: '#7E22CE', background: '#FAF5FF' },
    { key: 'vocab_reward_count', icon: '🏰', label: '어휘탑 도전', color: '#2E7D32', background: '#F1F8E9' },
    { key: 'dragon_care_count', icon: '🍖', label: '드래곤 돌봄', color: '#E65100', background: '#FFF3E0' },
    { key: 'hideout_purchase_count', icon: '🏡', label: '아지트 꾸미기', color: '#00695C', background: '#E0F2F1' }
];

const formatLastActivity = (value) => {
    if (!value) return '아직 공개할 활동이 없어요.';
    return `${new Date(value).toLocaleDateString('ko-KR')}까지의 활동`;
};

const FriendPointActivityCard = ({ friendId, friendName, viewerId }) => {
    const [summary, setSummary] = useState(EMPTY_SUMMARY);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const loadSummary = useCallback(async (forceRefresh = false) => {
        if (!friendId || !viewerId) return;

        setLoading(true);
        setErrorMessage('');
        const cacheKey = `friend_point_activity_${viewerId}_${friendId}`;
        if (forceRefresh) dataCache.invalidate(cacheKey);

        try {
            const data = await dataCache.get(cacheKey, async () => {
                const { data: activityData, error } = await supabase.rpc('get_friend_point_activity_summary', {
                    p_student_id: friendId
                });
                if (error) throw error;
                return activityData || {};
            }, ACTIVITY_CACHE_MS);

            setSummary({ ...EMPTY_SUMMARY, ...(data || {}) });
        } catch (error) {
            console.error('친구 포인트 활동 요약 로드 실패:', error.message);
            setErrorMessage('포인트 활동을 잠시 불러오지 못했어요.');
        } finally {
            setLoading(false);
        }
    }, [friendId, viewerId]);

    useEffect(() => {
        const timerId = window.setTimeout(loadSummary, 0);
        return () => window.clearTimeout(timerId);
    }, [loadSummary]);

    const totalActivities = useMemo(() => (
        ACTIVITIES.reduce((total, activity) => total + Number(summary[activity.key] || 0), 0)
    ), [summary]);

    return (
        <section style={{ marginTop: '32px', padding: '22px', borderRadius: '24px', border: '1px solid #D1C4E9', background: 'linear-gradient(145deg,#F7F4FF,#FFFFFF)', textAlign: 'left' }} aria-label={`${friendName || '친구'}의 포인트 활동`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <span style={{ color: '#673AB7', fontSize: '.72rem', fontWeight: 950 }}>포인트 활동 발자국</span>
                    <h3 style={{ margin: '5px 0 3px', color: '#263238', fontSize: '1.08rem' }}>🎒 {friendName}이 즐긴 활동</h3>
                    <small style={{ color: '#7E57C2' }}>{formatLastActivity(summary.last_public_activity_at)}</small>
                </div>
                <button type="button" onClick={() => loadSummary(true)} disabled={loading} style={{ border: 0, borderRadius: '9px', padding: '6px 9px', background: '#EDE7F6', color: '#5E35B1', cursor: 'pointer', fontWeight: 850 }}>새로고침</button>
            </div>

            {loading ? (
                <div style={{ padding: '34px 12px', textAlign: 'center', color: '#9575CD', fontWeight: 800 }}>활동 가방을 살펴보는 중... 🎒</div>
            ) : errorMessage ? (
                <div style={{ padding: '28px 12px', textAlign: 'center', color: '#C62828', fontSize: '.84rem' }}>{errorMessage}</div>
            ) : totalActivities === 0 ? (
                <div style={{ padding: '30px 12px', border: '2px dashed #D1C4E9', borderRadius: '18px', textAlign: 'center', color: '#9575CD', fontWeight: 800 }}>아직 소개할 포인트 활동이 없어요. 🌱</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '9px' }}>
                    {ACTIVITIES.filter((activity) => Number(summary[activity.key] || 0) > 0).map((activity) => (
                        <div key={activity.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderRadius: '16px', background: activity.background, color: activity.color }}>
                            <span style={{ fontSize: '1.35rem' }}>{activity.icon}</span>
                            <span style={{ minWidth: 0 }}>
                                <strong style={{ display: 'block', fontSize: '.82rem' }}>{activity.label}</strong>
                                <small style={{ fontWeight: 900 }}>{Number(summary[activity.key] || 0).toLocaleString()}회</small>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <p style={{ margin: '15px 0 0', paddingTop: '13px', borderTop: '1px solid #EDE7F6', color: '#7E57C2', fontSize: '.72rem', lineHeight: 1.5 }}>
                🔒 포인트 잔액과 선생님이 조정한 내역·사유는 친구에게 공개하지 않아요.
            </p>
        </section>
    );
};

export default memo(FriendPointActivityCard);
