import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion } from 'framer-motion';

/**
 * 역할: 학생 - 글쓰기 미션 목록 확인
 */
const MissionList = ({ studentSession, onBack, onNavigate }) => {
    const [missions, setMissions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchMissions();
    }, []);

    const fetchMissions = async () => {
        setLoading(true);
        console.log("🔍 글쓰기 미션 목록 불러오기 시작...");

        try {
            // [주의] 현재 DB의 writing_missions 테이블에 class_id 컬럼이 없어 필터링 없이 전체를 가져옵니다.
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Supabase 쿼리 에러:', error.message, error.details);
                throw error;
            }

            console.log("✅ 글쓰기 미션 데이터 로드 성공:", data?.length, "개");
            setMissions(data || []);
        } catch (err) {
            console.error('❌ 글쓰기 미션 로드 실패 전역 에러:', err.message);
            alert('글쓰기 미션을 불러오는 중 문제가 발생했습니다. 관리자에게 문의해 주세요.');
        } finally {
            setLoading(false);
        }
    };

    const handleMissionClick = (missionId) => {
        onNavigate('writing', { missionId });
    };

    return (
        <Card style={{ maxWidth: '650px', padding: '32px', background: '#FFFDF7', border: '2px solid #FFE082' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
                <Button variant="ghost" size="sm" onClick={onBack} style={{ marginRight: '16px' }} disabled={loading}>
                    ⬅️ 뒤로가기
                </Button>
                <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#5D4037', fontWeight: '900' }}>📝 오늘은 어떤 글을 쓸까?</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            style={{ fontSize: '3rem', marginBottom: '16px' }}
                        >
                            🔍
                        </motion.div>
                        <p style={{ color: '#8D6E63', fontWeight: 'bold', fontSize: '1.1rem' }}>선생님이 준비한 주제를 불러오는 중이야...</p>
                    </div>
                ) : missions.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 40px',
                        background: 'white',
                        borderRadius: '24px',
                        border: '2px dashed #FFE082',
                        boxShadow: '0 4px 12px rgba(255, 224, 130, 0.1)'
                    }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🎈</div>
                        <h3 style={{ margin: '0 0 8px 0', color: '#5D4037' }}>아직 등록된 글쓰기 미션이 없어요!</h3>
                        <p style={{ color: '#9E9E9E', fontSize: '0.95rem' }}>선생님이 새로운 주제를 주실 때까지 조금만 기다려볼까요?</p>
                    </div>
                ) : (
                    missions.map(mission => (
                        <motion.div
                            key={mission.id}
                            whileHover={{ y: -5, boxShadow: '0 12px 24px rgba(255, 213, 79, 0.2)' }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                                cursor: 'pointer',
                                background: 'white',
                                padding: '24px',
                                borderRadius: '24px',
                                border: '2px solid #FFECB3',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
                                transition: 'all 0.2s ease'
                            }}
                            onClick={() => handleMissionClick(mission.id)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div style={{
                                    display: 'inline-block',
                                    padding: '4px 12px',
                                    background: '#E1F5FE',
                                    color: '#0288D1',
                                    borderRadius: '12px',
                                    fontSize: '0.75rem',
                                    fontWeight: '900'
                                }}>
                                    {mission.genre}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    background: '#FFFDE7',
                                    padding: '4px 10px',
                                    borderRadius: '10px',
                                    border: '1px solid #FFF59D',
                                    fontSize: '0.8rem',
                                    fontWeight: '900',
                                    color: '#F57F17'
                                }}>
                                    ✨ {mission.base_reward}P
                                </div>
                            </div>
                            <h4 style={{ margin: '0 0 10px 0', color: '#2C3E50', fontSize: '1.2rem', fontWeight: '900' }}>
                                {mission.title}
                            </h4>
                            <p style={{ fontSize: '0.95rem', color: '#607D8B', margin: 0, lineHeight: '1.6', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {mission.guide}
                            </p>
                        </motion.div>
                    ))
                )}
            </div>
        </Card>
    );
};

export default MissionList;
