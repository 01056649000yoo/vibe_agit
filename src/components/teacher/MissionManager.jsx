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
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
    }, [activeClass?.id]);

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
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
            {/* Sticky Header 영역 */}
            <div style={{
                position: 'sticky',
                top: isMobile ? '88px' : '-24px', // 대시보드 헤더(48) + 탭(40) 고려
                zIndex: 10,
                background: 'white',
                padding: '8px 0 16px 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #F1F3F5',
                marginBottom: '16px'
            }}>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.3rem', color: '#2C3E50', fontWeight: '900' }}>
                    {isDashboardMode ? '✍️ 미션 현황' : '✍️ 미션 관리'}
                </h3>
                <Button
                    onClick={() => setIsFormOpen(!isFormOpen)}
                    style={{
                        background: isFormOpen ? '#FF5252' : '#3498DB',
                        color: 'white', padding: isMobile ? '8px 16px' : '10px 20px',
                        fontSize: '0.9rem',
                        minHeight: '44px',
                        fontWeight: 'bold'
                    }}
                >
                    {isFormOpen ? '✖ 닫기' : '➕ 등록'}
                </Button>
            </div>

            <AnimatePresence>
                {isFormOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '24px' }}>
                        <Card style={{ padding: isMobile ? '16px' : '24px', border: '2px solid #3498DB' }}>
                            <form onSubmit={handleCreateMission} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
                                    <input type="text" placeholder="미션 주제" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: '1px solid #ddd', fontSize: '1rem', minHeight: '48px' }} />
                                    <select value={formData.genre} onChange={e => setFormData({ ...formData, genre: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px' }}>
                                        {genreCategories.map(cat => (
                                            <optgroup key={cat.label} label={cat.label}>
                                                {cat.genres.map(g => <option key={g} value={g}>{g}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <textarea placeholder="안내 가이드" value={formData.guide} onChange={e => setFormData({ ...formData, guide: e.target.value })} style={{ padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '120px', fontSize: '1rem' }} />
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: isMobile ? '100%' : '150px' }}>
                                        <label style={{ fontSize: '0.8rem', color: '#7FB3D5', fontWeight: 'bold' }}>📏 최소 글자 / 최소 문단</label>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                            <input type="number" step="100" placeholder="최소 글자" value={formData.min_chars} onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px' }} />
                                            <input type="number" placeholder="최소 문단" value={formData.min_paragraphs} onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px' }} />
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, minWidth: isMobile ? '100%' : '150px' }}>
                                        <label style={{ fontSize: '0.8rem', color: '#F7DC6F', fontWeight: 'bold' }}>💰 기본 보상 포인트</label>
                                        <div style={{ marginTop: '4px' }}>
                                            <input type="number" step="100" value={formData.base_reward} onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px', boxSizing: 'border-box' }} />
                                        </div>
                                    </div>
                                    <div style={{ flex: 1.5, minWidth: isMobile ? '100%' : '200px', background: '#FDFCF0', padding: '12px', borderRadius: '16px', border: '1px dashed #F7DC6F' }}>
                                        <label style={{ fontSize: '0.8rem', color: '#B7950B', fontWeight: 'bold' }}>⚡ 보너스: [글자수 초과] 시 [추가 포인트]</label>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px', alignItems: 'center' }}>
                                            <input type="number" step="100" placeholder="글자수 초과 기준" value={formData.bonus_threshold} onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px' }} />
                                            <span style={{ fontWeight: 'bold' }}>→</span>
                                            <input type="number" step="10" placeholder="추가 포인트" value={formData.bonus_reward} onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px' }} />
                                        </div>
                                    </div>
                                </div>
                                <Button type="submit" style={{ background: '#3498DB', color: 'white', fontWeight: 'bold', height: '54px', borderRadius: '14px' }}>미션 공개하기 🚀</Button>
                            </form>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{
                display: 'grid',
                gridTemplateColumns: missions.length === 0 ? '1fr' : (isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))'),
                gap: '16px'
            }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>로딩 중...</div>
                ) : missions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8F9FA', borderRadius: '24px', border: '2px dashed #E9ECEF' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📖</div>
                        <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>아직 등록된 미션이 없습니다.</p>
                        <p style={{ color: '#BDC3C7', fontSize: '0.9rem' }}>새로운 미션을 등록해 아이들과 소통해보세요! ✨</p>
                    </div>
                ) : missions.map(mission => (
                    <motion.div key={mission.id} whileHover={isMobile ? {} : { y: -4 }} style={{
                        background: 'white', padding: isMobile ? '16px' : '20px',
                        borderRadius: '20px', border: '1px solid #ECEFF1',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '12px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ padding: '4px 10px', background: '#E3F2FD', color: '#1976D2', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900' }}>{mission.genre}</span>
                            <button onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm('이 미션을 삭제하시겠습니까? 🗑️\n작성된 학생들의 글도 확인이 어려워질 수 있습니다.')) {
                                    const { error } = await supabase.from('writing_missions').delete().eq('id', mission.id);
                                    if (!error) fetchMissions();
                                    else alert('삭제 실패: ' + error.message);
                                }
                            }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5252', fontSize: '1.2rem', padding: '8px' }}>
                                🗑️
                            </button>
                        </div>
                        <h4 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.1rem', color: '#2C3E50', fontWeight: '900' }}>{mission.title}</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, height: '8px', background: '#F8F9F9', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min((submissionCounts[mission.id] || 0) * 10, 100)}%`, height: '100%', background: '#2E7D32', borderRadius: '4px' }} />
                            </div>
                            <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                ✍️ {submissionCounts[mission.id] || 0}명 완료
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default MissionManager;
