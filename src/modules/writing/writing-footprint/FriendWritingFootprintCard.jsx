import React, { memo, useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import WritingFootprintSummary, { EMPTY_FOOTPRINT, formatSnapshotDate } from './WritingFootprintSummary';

const FriendWritingFootprintCard = ({ friendId, friendName }) => {
    const [footprint, setFootprint] = useState(EMPTY_FOOTPRINT);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const loadFootprint = useCallback(async () => {
        if (!friendId) return;
        setLoading(true);
        setErrorMessage('');
        const { data, error } = await supabase.rpc('get_friend_writing_footprint', {
            p_student_id: friendId
        });
        if (error) {
            console.error('친구 글쓰기 발자국 로드 실패:', error.message);
            setErrorMessage('발자국을 잠시 불러오지 못했어요.');
        } else {
            setFootprint({ ...EMPTY_FOOTPRINT, ...(data || {}) });
        }
        setLoading(false);
    }, [friendId]);

    useEffect(() => {
        const timerId = window.setTimeout(loadFootprint, 0);
        return () => window.clearTimeout(timerId);
    }, [loadFootprint]);

    return (
        <section style={{ marginTop: '32px', padding: '22px', borderRadius: '24px', border: '1px solid #FFE0B2', background: 'linear-gradient(145deg,#FFF8E1,#FFFFFF)', textAlign: 'left' }} aria-label={`${friendName || '친구'}의 글쓰기 발자국`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                <div>
                    <span style={{ color: '#EF6C00', fontSize: '.72rem', fontWeight: 950 }}>글쓰기 발자국</span>
                    <h3 style={{ margin: '5px 0 3px', color: '#263238', fontSize: '1.08rem' }}>👣 {friendName}의 쓰고 나눈 기록</h3>
                    <small style={{ color: '#8D6E63' }}>{formatSnapshotDate(footprint.snapshot_date)}</small>
                </div>
                <button type="button" onClick={loadFootprint} disabled={loading} style={{ border: 0, borderRadius: '9px', padding: '6px 9px', background: '#FFF3E0', color: '#E65100', cursor: 'pointer', fontWeight: 850 }}>새로고침</button>
            </div>

            {loading ? (
                <div style={{ padding: '34px 12px', textAlign: 'center', color: '#A1887F', fontWeight: 800 }}>발자국을 모으는 중... 👣</div>
            ) : errorMessage ? (
                <div style={{ padding: '28px 12px', textAlign: 'center', color: '#C62828', fontSize: '.84rem' }}>{errorMessage}</div>
            ) : (
                <WritingFootprintSummary data={footprint} compact />
            )}
        </section>
    );
};

export default memo(FriendWritingFootprintCard);
