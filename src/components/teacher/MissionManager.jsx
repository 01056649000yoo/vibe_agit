import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 글쓰기 미션 등록 및 관리 (정교한 미션 마스터 시스템) ✨
 */
const MissionManager = ({ activeClass, isDashboardMode = true }) => {
    const [missions, setMissions] = useState([]);
    const [submissionCounts, setSubmissionCounts] = useState({});
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // 미션 등록 폼 상태
    const [formData, setFormData] = useState({
        title: '',
        guide: '',
        genre: '일기',
        min_chars: 100,
        min_paragraphs: 2,
        base_reward: 100,
        bonus_threshold: 100,
        bonus_reward: 10
    });

    const genreCategories = [
        { label: '❤️ 마음을 표현하는 글', genres: ['일기', '생활문', '편지'] },
        { label: '🔍 사실을 전달하는 글', genres: ['설명문', '보고서(관찰 기록문)', '기사문'] },
        { label: '💡 생각을 주장하는 글', genres: ['논설문', '제안하는 글', '독후감(서평)'] },
        { label: '🌈 상상을 담은 글', genres: ['동시', '동화(소설)'] }
    ];

    useEffect(() => {
        if (activeClass?.id) {
            fetchMissions();
        }
    }, [activeClass]);

    const fetchMissions = async () => {
        if (!activeClass?.id) return;
        setLoading(true);
        try {
            // 1. 미션 목록 가져오기
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', activeClass.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMissions(data || []);

            // 2. 제출 현황 요약 (통계) 가져오기
            if (data && data.length > 0) {
                const missionIds = data.map(m => m.id);
                const { data: counts, error: countError } = await supabase
                    .from('student_posts')
                    .select('mission_id')
                    .in('mission_id', missionIds);

                if (!countError && counts) {
                    const stats = counts.reduce((acc, curr) => {
                        acc[curr.mission_id] = (acc[curr.mission_id] || 0) + 1;
                        return acc;
                    }, {});
                    setSubmissionCounts(stats);
                }
            }
        } catch (err) {
            console.error('미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateMission = async (e) => {
        e.preventDefault();
        if (!formData.title.trim() || !formData.guide.trim()) {
            alert('주제와 안내 내용을 입력해주세요! ✍️');
            return;
        }

        try {
            const { error } = await supabase.from('writing_missions').insert({ ...formData, class_id: activeClass.id });
            if (error) throw error;

            alert('새로운 미션이 공개되었습니다! 🚀');
            setIsFormOpen(false);
            setFormData({ title: '', guide: '', genre: '일기', min_chars: 100, min_paragraphs: 2, base_reward: 100, bonus_threshold: 100, bonus_reward: 10 });
            fetchMissions();
        } catch (error) {
            alert('미션 등록 실패: ' + error.message);
        }
    };

    return (
        <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>
                    {isDashboardMode ? '✍️ 진행 중인 미션' : '✍️ 미션 목록 관리'}
                </h3>
                <Button
                    onClick={() => setIsFormOpen(!isFormOpen)}
                    style={{ background: isFormOpen ? '#FF5252' : 'var(--primary-color)', color: 'white', padding: '8px 16px', fontSize: '0.85rem' }}
                >
                    {isFormOpen ? '✖ 닫기' : '➕ 새 미션 등록'}
                </Button>
            </div>

            <AnimatePresence>
                {isFormOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '24px' }}>
                        <Card style={{ padding: '24px', border: '2px solid var(--primary-color)' }}>
                            <form onSubmit={handleCreateMission} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <input type="text" placeholder="미션 주제" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} style={{ flex: 2, padding: '12px', borderRadius: '10px', border: '1px solid #ddd' }} />
                                    <select value={formData.genre} onChange={e => setFormData({ ...formData, genre: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #ddd' }}>
                                        {genreCategories.map(cat => (
                                            <optgroup key={cat.label} label={cat.label}>
                                                {cat.genres.map(g => <option key={g} value={g}>{g}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <textarea placeholder="안내 가이드" value={formData.guide} onChange={e => setFormData({ ...formData, guide: e.target.value })} style={{ padding: '12px', borderRadius: '10px', border: '1px solid #ddd', minHeight: '100px' }} />
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.8rem', color: '#7FB3D5' }}>최소 글자수 / 문단수</label>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <input type="number" step="100" value={formData.min_chars} onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })} style={{ width: '70px', padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }} />
                                            <input type="number" value={formData.min_paragraphs} onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })} style={{ width: '50px', padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }} />
                                        </div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.8rem', color: '#F7DC6F' }}>보상(기본/보너스)</label>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <input type="number" step="100" value={formData.base_reward} onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })} style={{ width: '70px', padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }} />
                                            <input type="number" step="10" value={formData.bonus_reward} onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })} style={{ width: '60px', padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }} />
                                        </div>
                                    </div>
                                </div>
                                <Button type="submit" style={{ background: 'var(--primary-color)', color: 'white', fontWeight: 'bold' }}>미션 공개하기 🚀</Button>
                            </form>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {missions.map(mission => (
                    <motion.div key={mission.id} whileHover={{ y: -4 }} style={{
                        background: 'white', padding: '20px', borderRadius: '20px', border: '1px solid #ECEFF1',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '12px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ padding: '4px 10px', background: '#E3F2FD', color: '#1976D2', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900' }}>{mission.genre}</span>
                            {!isDashboardMode && (
                                <button onClick={async () => {
                                    if (confirm('삭제하시겠습니까?')) {
                                        await supabase.from('writing_missions').delete().eq('id', mission.id);
                                        fetchMissions();
                                    }
                                }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5252' }}>🗑️</button>
                            )}
                        </div>
                        <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>{mission.title}</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, height: '6px', background: '#F8F9F9', borderRadius: '3px' }}>
                                {/* 전체 학생 수 대비 제출 수 프로그레스 바는 학급 인원수 연동이 필요함. 여기서는 간단히 카운트만 표시 */}
                            </div>
                            <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: '4px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                ✍️ {submissionCounts[mission.id] || 0}명 제출 완료
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default MissionManager;
