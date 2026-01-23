import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';

const GameManager = ({ activeClass, isMobile }) => {
    const [config, setConfig] = useState({
        dragon_feed_points: 50,
        dragon_degen_days: 7
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (activeClass?.id) {
            fetchGameConfig();
        }
    }, [activeClass?.id]);

    const fetchGameConfig = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('classes')
                .select('dragon_feed_points, dragon_degen_days')
                .eq('id', activeClass.id)
                .single();

            if (error) throw error;

            if (data) {
                console.log('🎮 게임 설정 로드 성공:', data);
                setConfig({
                    dragon_feed_points: data.dragon_feed_points || 50,
                    dragon_degen_days: data.dragon_degen_days || 7
                });
            }
        } catch (err) {
            console.error('게임 설정 로드 실패:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updates = {
                dragon_feed_points: Number(config.dragon_feed_points),
                dragon_degen_days: Number(config.dragon_degen_days)
            };
            console.log('💾 게임 설정 저장 시도:', updates);

            const { error } = await supabase
                .from('classes')
                .update(updates)
                .eq('id', activeClass.id);

            if (error) throw error;

            console.log('✅ 게임 설정 저장 완료!');
            alert('설정이 저장되었습니다! 학생들의 아지트에 즉시 반영됩니다. ⚡');
        } catch (err) {
            console.error('게임 설정 저장 실패:', err);
            alert('설정 저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setConfig(prev => ({ ...prev, [name]: value }));
    };

    if (!activeClass) return <div style={{ padding: '20px', textAlign: 'center' }}>학급을 먼저 선택해주세요.</div>;

    return (
        <div style={{ maxWidth: '100%', margin: '0 auto', width: '100%' }}>

            {/* 헤더 섹션 */}
            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', color: '#2C3E50', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '2rem' }}>🎢</span> 아지트 놀이터 관리
                    </h1>
                    <p style={{ color: '#7F8C8D', margin: 0, fontSize: '0.95rem' }}>
                        학생들이 즐길 수 있는 미니게임과 활동들을 관리합니다.
                    </p>
                </div>
            </div>

            {/* 게임 목록 그리드 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: '24px',
                alignItems: 'start'
            }}>

                {/* 1. 드래곤 키우기 카드 */}
                <Card style={{
                    padding: '0',
                    borderRadius: '20px',
                    border: '1px solid #E0E0E0',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {/* 카드 헤더 */}
                    <div style={{
                        padding: '20px 24px',
                        background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
                        borderBottom: '1px solid #FFE0B2',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '48px', height: '48px',
                                background: 'white', borderRadius: '14px',
                                display: 'flex', justifyContent: 'center', alignItems: 'center',
                                fontSize: '1.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                            }}>
                                🐉
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#5D4037', fontWeight: 'bold' }}>드래곤 키우기</h3>
                                <span style={{ fontSize: '0.8rem', color: '#8D6E63', fontWeight: '500' }}>현재 운영 중</span>
                            </div>
                        </div>
                    </div>

                    {/* 카드 내용 (설정) */}
                    <div style={{ padding: '24px', flex: 1 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* 설정 1: 먹이 비용 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 'bold', color: '#333' }}>🥩 먹이 주기 비용</label>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#999' }}>1회당 차감 포인트</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="number"
                                        name="dragon_feed_points"
                                        value={config.dragon_feed_points}
                                        onChange={handleChange}
                                        style={{
                                            width: '80px', padding: '8px', borderRadius: '8px', border: '1px solid #DDD',
                                            fontSize: '1rem', fontWeight: 'bold', textAlign: 'center', outline: 'none',
                                            color: '#F57F17', background: '#FFFDE7'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.9rem', color: '#777', fontWeight: 'bold' }}>P</span>
                                </div>
                            </div>

                            <div style={{ height: '1px', background: '#F5F5F5' }}></div>

                            {/* 설정 2: 퇴화 기간 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.95rem', fontWeight: 'bold', color: '#333' }}>📉 퇴화 기준 기간</label>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#999' }}>미접속 시 레벨 감소</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input
                                        type="number"
                                        name="dragon_degen_days"
                                        value={config.dragon_degen_days}
                                        onChange={handleChange}
                                        style={{
                                            width: '80px', padding: '8px', borderRadius: '8px', border: '1px solid #DDD',
                                            fontSize: '1rem', fontWeight: 'bold', textAlign: 'center', outline: 'none',
                                            color: '#E53935', background: '#FFEBEE'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.9rem', color: '#777', fontWeight: 'bold' }}>일</span>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* 카드 푸터 (액션) */}
                    <div style={{
                        padding: '16px 24px',
                        background: '#FAFAFA',
                        borderTop: '1px solid #F0F0F0',
                        textAlign: 'right'
                    }}>
                        <Button
                            onClick={handleSave}
                            disabled={saving}
                            size="sm"
                            style={{
                                background: '#2C3E50', color: 'white', borderRadius: '10px',
                                padding: '8px 20px', fontWeight: 'bold', fontSize: '0.9rem'
                            }}
                        >
                            {saving ? '저장...' : '설정 저장'}
                        </Button>
                    </div>
                </Card>

                {/* 2. 미래 게임용 자리 표시 (예시: 끝말잇기) */}
                <Card style={{
                    padding: '0',
                    borderRadius: '20px',
                    border: '2px dashed #E0E0E0',
                    background: '#FAFAFA',
                    minHeight: '280px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexDirection: 'column',
                    opacity: 0.7
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '10px', filter: 'grayscale(1)' }}>🧩</div>
                    <h3 style={{ margin: 0, color: '#9E9E9E', fontSize: '1.1rem' }}>새 게임 준비 중</h3>
                    <p style={{ margin: '8px 0 0 0', color: '#BDBDBD', fontSize: '0.85rem' }}>다음에 어떤 놀이가 추가될까요?</p>
                </Card>

            </div>
        </div>
    );
};

export default GameManager;
