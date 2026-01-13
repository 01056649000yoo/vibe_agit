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
        if (studentSession?.classId || studentSession?.class_id) {
            fetchMissions();
        }
    }, [studentSession]);

    const fetchMissions = async () => {
        setLoading(true);
        const targetClassId = studentSession?.classId || studentSession?.class_id;
        if (!targetClassId) {
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', targetClassId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMissions(data || []);
        } catch (err) {
            console.error('미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMissionClick = (missionId) => {
        console.log("🚀 글쓰기 페이지로 이동, 미션 ID:", missionId);
        onNavigate('writing', { missionId });
    };

    return (
        <Card style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
                <Button variant="ghost" size="sm" onClick={onBack} style={{ marginRight: '12px' }}>
                    ⬅️ 뒤로가기
                </Button>
                <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-primary)' }}>📝 글쓰기 미션</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: '#999' }}>주제를 불러오는 중... 🔍</p>
                ) : missions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', background: 'var(--bg-secondary)', borderRadius: '20px' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>아직 등록된 글쓰기 주제가 없어요! ✨</p>
                    </div>
                ) : (
                    missions.map(mission => (
                        <motion.div
                            key={mission.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                                cursor: 'pointer',
                                background: 'white',
                                padding: '20px',
                                borderRadius: '16px',
                                border: '1px solid #eee',
                                boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                                transition: 'border-color 0.2s'
                            }}
                            onClick={() => handleMissionClick(mission.id)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <span style={{ padding: '2px 8px', background: '#E3F2FD', color: '#1976D2', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    {mission.genre}
                                </span>
                                <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>{mission.title}</h4>
                            </div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '0 0 16px 0', lineHeight: '1.6' }}>
                                {mission.guide.length > 80 ? mission.guide.substring(0, 80) + '...' : mission.guide}
                            </p>
                            <div style={{
                                display: 'inline-block',
                                background: '#FFF9C4',
                                padding: '4px 12px',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                color: '#F57F17'
                            }}>
                                💰 제출 시 {mission.base_reward}P 지급
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </Card>
    );
};

export default MissionList;
