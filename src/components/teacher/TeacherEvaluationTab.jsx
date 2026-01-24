import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import EvaluationReport from './EvaluationReport';

const TeacherEvaluationTab = ({ activeClass, isMobile }) => {
    const [missions, setMissions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMission, setSelectedMission] = useState(null);

    useEffect(() => {
        if (activeClass?.id) {
            fetchMissions();
        }
    }, [activeClass?.id]);

    const fetchMissions = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', activeClass.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            // 루브릭을 사용하는 미션만 필터링하거나, 전체를 보여줌
            setMissions(data || []);
        } catch (err) {
            console.error('미션 로드 실패:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div style={{ textAlign: 'center', padding: '100px', color: '#94A3B8' }}>평가 데이터를 구성 중입니다... ✨</div>;

    const evaluationMissions = missions.filter(m => m.evaluation_rubric?.use_rubric);

    return (
        <div style={{ width: '100%' }}>
            <div style={{ marginBottom: '32px' }}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#2C3E50', marginBottom: '8px' }}>📈 학생 평가 관리</h2>
                <p style={{ color: '#7F8C8D', fontSize: '1rem' }}>미션별 학생들의 성장도와 분석 리포트를 한눈에 확인하세요.</p>
            </div>

            {evaluationMissions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '100px 20px', background: 'white', borderRadius: '32px', border: '2px dashed #E2E8F0' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🔍</div>
                    <h3 style={{ color: '#64748B', marginBottom: '10px' }}>아직 성취도 평가가 설정된 미션이 없습니다.</h3>
                    <p style={{ color: '#94A3B8' }}>미션 등록 시 '성취도 평가 루브릭'을 활성화하면 리포트를 볼 수 있습니다.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                    {evaluationMissions.map((mission) => (
                        <motion.div
                            key={mission.id}
                            whileHover={{ y: -5 }}
                            style={{
                                background: 'white', padding: '28px', borderRadius: '24px',
                                border: '1px solid #E2E8F0', boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                                display: 'flex', flexDirection: 'column', gap: '16px'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ padding: '4px 12px', background: '#F0F9FF', color: '#0369A1', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900' }}>
                                    {mission.genre || '미분류'}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                                    {new Date(mission.created_at).toLocaleDateString()}
                                </span>
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#1E293B', fontWeight: '900', lineHeight: '1.4' }}>{mission.title}</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', padding: '12px', borderRadius: '16px' }}>
                                <span style={{ fontSize: '1.2rem' }}>📊</span>
                                <div style={{ fontSize: '0.9rem' }}>
                                    <span style={{ color: '#64748B', fontWeight: 'bold' }}>평가 단계:</span>{' '}
                                    <span style={{ color: '#0369A1', fontWeight: '900' }}>{mission.evaluation_rubric?.levels?.length || 0}단계</span>
                                </div>
                            </div>
                            <Button
                                onClick={() => setSelectedMission(mission)}
                                style={{
                                    width: '100%', marginTop: '10px', background: 'linear-gradient(135deg, #3498DB 0%, #2980B9 100%)',
                                    color: 'white', fontWeight: '900', borderRadius: '16px', padding: '14px'
                                }}
                            >
                                분석 리포트 열기 ✨
                            </Button>
                        </motion.div>
                    ))}
                </div>
            )}

            <AnimatePresence>
                {selectedMission && (
                    <EvaluationReport
                        mission={selectedMission}
                        onClose={() => setSelectedMission(null)}
                        isMobile={isMobile}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default TeacherEvaluationTab;
