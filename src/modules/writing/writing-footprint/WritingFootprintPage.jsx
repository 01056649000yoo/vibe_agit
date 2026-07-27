import React, { useCallback, useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import Card from '../../../components/common/Card';
import { supabase } from '../../../lib/supabaseClient';
import WritingFootprintSummary, { EMPTY_FOOTPRINT, formatSnapshotDate } from './WritingFootprintSummary';

const WritingFootprintPage = ({ onBack }) => {
    const [footprint, setFootprint] = useState(EMPTY_FOOTPRINT);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const loadFootprint = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        const { data, error } = await supabase.rpc('get_my_writing_footprint');
        if (error) {
            console.error('내 글쓰기 발자국 로드 실패:', error.message);
            setErrorMessage('글쓰기 발자국을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        } else {
            setFootprint({ ...EMPTY_FOOTPRINT, ...(data || {}) });
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timerId = window.setTimeout(loadFootprint, 0);
        return () => window.clearTimeout(timerId);
    }, [loadFootprint]);

    return (
        <div style={{ width: 'min(1040px, calc(100% - 32px))', margin: '24px auto 90px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '24px' }}>
                <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 홈으로</Button>
                <div>
                    <span style={{ color: '#5C6BC0', fontSize: '.78rem', fontWeight: 950 }}>업데이트 이후부터 차곡차곡</span>
                    <h1 style={{ margin: '6px 0 5px', color: '#263238', fontSize: 'clamp(1.6rem,4vw,2.2rem)' }}>👣 나의 글쓰기 발자국</h1>
                    <p style={{ margin: 0, color: '#78909C', lineHeight: 1.55 }}>점수보다 내가 얼마나 쓰고, 고치고, 친구와 나눴는지 돌아보는 기록이에요.</p>
                </div>
            </div>

            <Card style={{ padding: 'clamp(20px,4vw,34px)', border: '1px solid #E3E8EF', borderRadius: '28px', boxShadow: '0 14px 34px rgba(38,50,56,.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '22px', flexWrap: 'wrap' }}>
                    <div>
                        <strong style={{ display: 'block', color: '#263238', fontSize: '1.15rem' }}>내가 남긴 활동 기록</strong>
                        <small style={{ display: 'block', marginTop: '4px', color: '#78909C' }}>{formatSnapshotDate(footprint.snapshot_date)} · 매일 한 번 갱신</small>
                    </div>
                    <Button variant="ghost" size="sm" onClick={loadFootprint} disabled={loading}>새로고침</Button>
                </div>

                {loading ? (
                    <div style={{ padding: '70px 20px', textAlign: 'center', color: '#90A4AE', fontWeight: 850 }}>발자국을 모아보는 중... 👣</div>
                ) : errorMessage ? (
                    <div style={{ padding: '50px 20px', textAlign: 'center', color: '#C62828' }}>{errorMessage}</div>
                ) : (
                    <WritingFootprintSummary data={footprint} />
                )}
            </Card>

            <div style={{ marginTop: '18px', padding: '18px 20px', borderRadius: '18px', background: '#FFFDE7', border: '1px solid #FFF59D', color: '#6D4C41', lineHeight: 1.6, fontSize: '.86rem' }}>
                <strong>통계를 보는 방법</strong><br />
                고쳐 쓴 횟수는 같은 글을 같은 날 여러 번 저장해도 한 번으로 세어요. 평가 점수나 글 내용은 이 통계에 저장하지 않아요.
            </div>
        </div>
    );
};

export default WritingFootprintPage;
