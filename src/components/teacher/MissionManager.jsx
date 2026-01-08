import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 글쓰기 미션 등록 및 관리 (정교한 미션 마스터 시스템) ✨
 */
const MissionManager = ({ classId }) => {
    const [missions, setMissions] = useState([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // 미션 등록 폼 상태
    const [formData, setFormData] = useState({
        title: '',
        guide: '',
        genre: '수필',
        min_chars: 100,
        min_paragraphs: 2,
        base_reward: 50,
        bonus_threshold: 300,
        bonus_reward: 30
    });

    const genres = ['시', '수필', '일기', '논설문', '설명문'];

    useEffect(() => {
        if (classId) fetchMissions();
    }, [classId]);

    const fetchMissions = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', classId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setMissions(data);
        } catch (err) {
            console.error('미션 목록 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateMission = async (e) => {
        e.preventDefault();

        // [요구사항] 데이터 수집 확인용 console.log
        console.log("📝 수집된 미션 데이터:", formData);

        if (!formData.title.trim() || !formData.guide.trim()) {
            alert('주제와 안내 내용을 입력해주세요! ✍️');
            return;
        }

        if (!classId) {
            alert('먼저 클래스 탭에서 클래스를 생성하거나 선택해주세요! 🏫');
            return;
        }

        try {
            const { error } = await supabase
                .from('writing_missions')
                .insert({
                    ...formData,
                    class_id: classId
                });

            if (error) throw error;

            alert('새로운 미션이 등록되었습니다! 🚀');
            setIsFormOpen(false);
            setFormData({
                title: '',
                guide: '',
                genre: '수필',
                min_chars: 100,
                min_paragraphs: 2,
                base_reward: 50,
                bonus_threshold: 300,
                bonus_reward: 30
            });
            fetchMissions();
        } catch (error) {
            alert('미션 등록 실패: ' + error.message);
        }
    };

    return (
        <div style={{ marginTop: '4px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>✍️ 글쓰기 미션 관리</h3>
                <Button
                    onClick={() => setIsFormOpen(!isFormOpen)}
                    style={{
                        background: isFormOpen ? '#95A5A6' : 'var(--primary-color)',
                        color: 'white',
                        padding: '8px 16px',
                        fontSize: '0.9rem'
                    }}
                >
                    {isFormOpen ? '닫기' : '+ 새 미션 등록'}
                </Button>
            </div>

            <AnimatePresence>
                {isFormOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        style={{ overflow: 'hidden' }}
                    >
                        <Card style={{
                            maxWidth: '100%',
                            padding: '24px',
                            marginBottom: '24px',
                            border: '2px solid #E0F7FA',
                            boxShadow: '0 10px 25px rgba(0,0,0,0.05)'
                        }}>
                            <form onSubmit={handleCreateMission} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                {/* 1. 주제 정보 섹션 */}
                                <section>
                                    <h4 style={{ margin: '0 0 16px 0', color: '#1A237E', borderLeft: '4px solid #3F51B5', paddingLeft: '8px', fontSize: '1rem' }}>📌 주제 및 종류</h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                                        <div style={{ flex: 1, minWidth: '200px' }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#546E7A', marginBottom: '8px', fontWeight: 'bold' }}>주제</label>
                                            <input
                                                type="text"
                                                value={formData.title}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                placeholder="학생들에게 보여줄 글쓰기 주제"
                                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #CFD8DC', outlineColor: 'var(--primary-color)' }}
                                            />
                                        </div>
                                        <div style={{ width: '150px' }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#546E7A', marginBottom: '8px', fontWeight: 'bold' }}>글 종류</label>
                                            <select
                                                value={formData.genre}
                                                onChange={e => setFormData({ ...formData, genre: e.target.value })}
                                                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #CFD8DC', background: 'white' }}
                                            >
                                                {genres.map(g => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '16px' }}>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: '#546E7A', marginBottom: '8px', fontWeight: 'bold' }}>글쓰기 안내 (학생들에게 전하는 도움말)</label>
                                        <textarea
                                            value={formData.guide}
                                            onChange={e => setFormData({ ...formData, guide: e.target.value })}
                                            placeholder="학생들이 글을 쓸 때 참고할 수 있는 구체적인 가이드를 입력해주세요."
                                            style={{
                                                width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #CFD8DC',
                                                minHeight: '100px', resize: 'vertical', lineHeight: '1.6', outlineColor: 'var(--primary-color)'
                                            }}
                                        />
                                    </div>
                                </section>

                                {/* 2. 제한 조건 섹션 */}
                                <section style={{ background: '#F1F8E9', padding: '20px', borderRadius: '16px' }}>
                                    <h4 style={{ margin: '0 0 16px 0', color: '#2E7D32', borderLeft: '4px solid #4CAF50', paddingLeft: '8px', fontSize: '1rem' }}>📏 분량 제한 (필수 조건)</h4>
                                    <div style={{ display: 'flex', gap: '16px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#546E7A', marginBottom: '8px' }}>최소 글자 수</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={formData.min_chars}
                                                    onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })}
                                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #C8E6C9', textAlign: 'right' }}
                                                />
                                                <span style={{ fontSize: '0.9rem', color: '#2E7D32', fontWeight: 'bold' }}>자</span>
                                            </div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#546E7A', marginBottom: '8px' }}>최소 문단 수</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={formData.min_paragraphs}
                                                    onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })}
                                                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #C8E6C9', textAlign: 'right' }}
                                                />
                                                <span style={{ fontSize: '0.9rem', color: '#2E7D32', fontWeight: 'bold' }}>개</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* 3. 포인트 보상 섹션 */}
                                <section style={{ background: '#FFFDE7', padding: '20px', borderRadius: '16px', border: '1px solid #FFF59D' }}>
                                    <h4 style={{ margin: '0 0 16px 0', color: '#F57C00', borderLeft: '4px solid #FF9800', paddingLeft: '8px', fontSize: '1rem' }}>💎 포인트 보상 설정</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <label style={{ fontSize: '0.9rem', color: '#546E7A', minWidth: '110px' }}>기본 제출 포인트</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={formData.base_reward}
                                                    onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })}
                                                    style={{ width: '100px', padding: '10px', borderRadius: '10px', border: '1px solid #FFE082', textAlign: 'right' }}
                                                />
                                                <span style={{ fontSize: '0.9rem', color: '#F57C00', fontWeight: 'bold' }}>P 지급</span>
                                            </div>
                                        </div>

                                        <div style={{
                                            background: 'white',
                                            padding: '16px',
                                            borderRadius: '12px',
                                            border: '2px dashed #FFD54F',
                                            display: 'flex',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '10px'
                                        }}>
                                            <span style={{ fontWeight: 'bold', color: '#E65100', fontSize: '0.95rem' }}>🔥 동기부여 보너스</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>글자수가</span>
                                                <input
                                                    type="number"
                                                    value={formData.bonus_threshold}
                                                    onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })}
                                                    style={{ width: '80px', padding: '8px', borderRadius: '8px', border: '1px solid #FFD54F', textAlign: 'center', fontWeight: 'bold' }}
                                                />
                                                <span>자 이상일 때,</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <input
                                                    type="number"
                                                    value={formData.bonus_reward}
                                                    onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })}
                                                    style={{ width: '80px', padding: '8px', borderRadius: '8px', border: '1px solid #FFD54F', textAlign: 'center', fontWeight: 'bold', color: '#D84315' }}
                                                />
                                                <span style={{ color: '#D84315', fontWeight: 'bold' }}>포인트 추가 지급!</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <Button type="submit" style={{ height: '56px', fontSize: '1.2rem', fontWeight: 'bold', marginTop: '8px' }}>
                                    ✨ 미션 등록하기
                                </Button>
                            </form>
                        </Card>
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '24px',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: '#95A5A6', padding: '20px', gridColumn: '1 / -1' }}>미션을 불러오는 중... 🔍</p>
                ) : missions.length === 0 ? (
                    <div style={{
                        padding: '60px 40px', textAlign: 'center', background: '#F8F9F9',
                        borderRadius: '20px', border: '2px dashed #D5DBDB', gridColumn: '1 / -1'
                    }}>
                        <p style={{ color: '#7F8C8D', fontSize: '1.1rem', margin: 0 }}>등록된 미션이 없습니다.<br />새로운 미션을 등록해 아이들의 글쓰기를 독려해보세요! 🎈</p>
                    </div>
                ) : (
                    missions.map(mission => (
                        <motion.div
                            key={mission.id}
                            whileHover={{ y: -5 }}
                            style={{
                                background: 'white',
                                borderRadius: '24px',
                                border: '1px solid #ECEFF1',
                                boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column',
                                height: '100%',
                                boxSizing: 'border-box',
                                transition: 'box-shadow 0.3s'
                            }}
                        >
                            {/* 카드 상단: 헤더 및 삭제 버튼 */}
                            <div style={{ padding: '24px 24px 16px 24px', position: 'relative' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                    <span style={{
                                        padding: '4px 12px',
                                        background: '#E3F2FD',
                                        color: '#1976D2',
                                        borderRadius: '12px',
                                        fontSize: '0.75rem',
                                        fontWeight: '900',
                                        letterSpacing: '0.5px'
                                    }}>{mission.genre}</span>

                                    <button
                                        onClick={async () => {
                                            if (window.confirm('정말 이 미션을 삭제하시겠습니까?')) {
                                                const { error } = await supabase.from('writing_missions').delete().eq('id', mission.id);
                                                if (!error) fetchMissions();
                                                else alert('삭제 실패: ' + error.message);
                                            }
                                        }}
                                        style={{
                                            background: '#FFF5F5', border: 'none', color: '#FF5252',
                                            cursor: 'pointer', padding: '6px', borderRadius: '10px',
                                            fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            transition: 'background 0.2s'
                                        }}
                                        title="미션 삭제"
                                    >
                                        🗑️
                                    </button>
                                </div>
                                <h4 style={{
                                    margin: 0, fontSize: '1.25rem', color: '#263238',
                                    fontWeight: '900', lineHeight: '1.4',
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                }}>
                                    {mission.title}
                                </h4>
                            </div>

                            {/* 카드 중앙: 안내 문구 (말줄임표) */}
                            <div style={{ padding: '0 24px', flex: 1 }}>
                                <p style={{
                                    margin: 0, fontSize: '0.9rem', color: '#78909C', lineHeight: '1.6',
                                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden', minHeight: '2.8em'
                                }}>
                                    {mission.guide}
                                </p>
                            </div>

                            {/* 카드 하단: 수치 배지 섹션 */}
                            <div style={{
                                padding: '20px 24px 24px 24px',
                                background: '#FAFAFA',
                                borderTop: '1px solid #F5F5F5',
                                marginTop: '16px'
                            }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{
                                        background: 'white', padding: '6px 12px', borderRadius: '10px',
                                        color: '#546E7A', border: '1px solid #ECEFF1', fontSize: '0.8rem',
                                        fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px'
                                    }}>
                                        📏 {mission.min_chars}자 / {mission.min_paragraphs}문단
                                    </div>
                                    <div style={{
                                        background: '#FFF9C4', padding: '6px 12px', borderRadius: '10px',
                                        color: '#AFB42B', border: '1px solid #FFF176', fontSize: '0.8rem',
                                        fontWeight: '900', display: 'flex', alignItems: 'center', gap: '4px',
                                        boxShadow: '0 2px 4px rgba(255, 241, 118, 0.2)'
                                    }}>
                                        💰 {mission.base_reward}P 지급
                                    </div>
                                    {mission.bonus_reward > 0 && (
                                        <div style={{
                                            background: '#E8F5E9', padding: '6px 12px', borderRadius: '10px',
                                            color: '#2E7D32', border: '1px solid #C8E6C9', fontSize: '0.8rem',
                                            fontWeight: '900', display: 'flex', alignItems: 'center', gap: '4px'
                                        }}>
                                            🔥 보너스 +{mission.bonus_reward}P
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
};

export default MissionManager;
