import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 글쓰기 미션 등록 및 관리 (정교한 미션 마스터 시스템) ✨
 */
const MissionManager = ({ activeClass }) => {
    const [missions, setMissions] = useState([]);
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
        if (!activeClass?.id) {
            console.warn('학급 정보가 없어 미션을 불러올 수 없습니다.');
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', activeClass.id)
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

        if (!formData.title.trim() || !formData.guide.trim()) {
            alert('주제와 안내 내용을 입력해주세요! ✍️');
            return;
        }

        if (!activeClass?.id) {
            alert('먼저 클래스 탭에서 클래스를 생성하거나 선택해주세요! 🏫');
            return;
        }

        try {
            const { error } = await supabase
                .from('writing_missions')
                .insert({
                    ...formData,
                    class_id: activeClass.id
                });

            if (error) throw error;

            alert('새로운 미션이 공개되었습니다! 🚀');
            setIsFormOpen(false);
            setFormData({
                title: '',
                guide: '',
                genre: '일기',
                min_chars: 100,
                min_paragraphs: 2,
                base_reward: 100,
                bonus_threshold: 100,
                bonus_reward: 10
            });
            fetchMissions();
        } catch (error) {
            alert('미션 등록 실패: ' + error.message);
        }
    };

    return (
        <div style={{ marginTop: '4px', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, fontSize: '1.5rem', color: '#2C3E50', fontWeight: '900' }}>✍️ 글쓰기 미션 관리</h3>
                <Button
                    onClick={() => setIsFormOpen(!isFormOpen)}
                    style={{
                        background: isFormOpen ? '#FF5252' : 'var(--primary-color)',
                        color: 'white',
                        padding: '10px 20px',
                        fontSize: '0.95rem',
                        fontWeight: 'bold',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                    }}
                >
                    {isFormOpen ? '✖ 닫기' : '➕ 새 미션 등록'}
                </Button>
            </div>

            <AnimatePresence>
                {isFormOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0, scale: 0.95 }}
                        animate={{ height: 'auto', opacity: 1, scale: 1 }}
                        exit={{ height: 0, opacity: 0, scale: 0.95 }}
                        style={{ overflow: 'hidden', width: '100%' }}
                    >
                        <Card style={{
                            maxWidth: '100%',
                            width: '100%',
                            padding: '24px', // 가로 공간 확보를 위해 패딩 축소
                            marginBottom: '40px',
                            border: 'none',
                            background: '#FFFFFF',
                            boxShadow: '0 15px 40px rgba(0,0,0,0.12)',
                            borderRadius: '32px',
                            boxSizing: 'border-box'
                        }}>
                            <form onSubmit={handleCreateMission} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

                                <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                                    <h2 style={{ margin: 0, color: 'var(--primary-color)', fontSize: '1.8rem' }}>새로운 글쓰기 여행 🌏</h2>
                                    <p style={{ color: '#90A4AE', margin: '8px 0 0 0' }}>선생님의 따뜻한 가이드로 아이들의 생각을 깨워주세요.</p>
                                </div>

                                {/* 1. 주제 정보 섹션 */}
                                <section style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        background: '#E1F5FE', padding: '8px 16px', borderRadius: '12px', width: 'fit-content'
                                    }}>
                                        <span style={{ fontSize: '1.2rem' }}>📌</span>
                                        <h4 style={{ margin: 0, color: '#0277BD', fontWeight: '900' }}>주제 및 종류</h4>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                                        <div style={{ flex: 1, minWidth: '250px' }}>
                                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#455A64', marginBottom: '8px', fontWeight: 'bold' }}>글쓰기 미션 주제</label>
                                            <input
                                                type="text"
                                                value={formData.title}
                                                onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                placeholder="학생들에게 보여줄 흥미로운 주제 (예: 내가 만약 초능력자가 된다면?)"
                                                style={{
                                                    width: '100%', padding: '16px', borderRadius: '14px', border: '2px solid #ECEFF1',
                                                    background: '#FFFFFF', color: '#263238', fontSize: '1rem',
                                                    boxSizing: 'border-box', outlineColor: 'var(--primary-color)'
                                                }}
                                            />
                                        </div>
                                        <div style={{ width: '220px' }}>
                                            <label style={{ display: 'block', fontSize: '0.9rem', color: '#455A64', marginBottom: '8px', fontWeight: 'bold' }}>글 종류</label>
                                            <select
                                                value={formData.genre}
                                                onChange={e => setFormData({ ...formData, genre: e.target.value })}
                                                style={{
                                                    width: '100%', padding: '16px', borderRadius: '14px', border: '2px solid #ECEFF1',
                                                    background: '#FFFFFF', color: '#263238', fontSize: '1rem',
                                                    boxSizing: 'border-box', cursor: 'pointer'
                                                }}
                                            >
                                                {genreCategories.map(cat => (
                                                    <optgroup key={cat.label} label={cat.label}>
                                                        {cat.genres.map(g => <option key={g} value={g}>{g}</option>)}
                                                    </optgroup>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.9rem', color: '#455A64', marginBottom: '8px', fontWeight: 'bold' }}>글쓰기 가이드 (상세 안내)</label>
                                        <textarea
                                            value={formData.guide}
                                            onChange={e => setFormData({ ...formData, guide: e.target.value })}
                                            placeholder="아이들이 어떻게 글을 쓰면 좋을지 다정하게 설명해주세요.&#10;나의 경험을 넣으면 더 좋아요!"
                                            style={{
                                                width: '100%', padding: '16px', borderRadius: '14px', border: '2px solid #ECEFF1',
                                                background: '#FFFFFF', color: '#263238', fontSize: '1rem',
                                                minHeight: '140px', resize: 'vertical', lineHeight: '1.6', boxSizing: 'border-box',
                                                outlineColor: 'var(--primary-color)'
                                            }}
                                        />
                                    </div>
                                </section>

                                {/* 2. 제한 조건 섹션 */}
                                <section style={{ background: '#F9FBE7', padding: '24px', borderRadius: '24px', border: '1px solid #F0F4C3' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px'
                                    }}>
                                        <span style={{ fontSize: '1.2rem' }}>📏</span>
                                        <h4 style={{ margin: 0, color: '#33691E', fontWeight: '900' }}>분량 제한 (필수 조건)</h4>
                                    </div>

                                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: '140px' }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#558B2F', marginBottom: '8px', fontWeight: 'bold' }}>최소 글자 수</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={formData.min_chars}
                                                    step="100"
                                                    min="0"
                                                    onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })}
                                                    style={{
                                                        width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #DCEDC8',
                                                        background: '#FFFFFF', color: '#33691E', textAlign: 'right', fontWeight: 'bold', fontSize: '1rem'
                                                    }}
                                                />
                                                <span style={{ fontSize: '1rem', color: '#33691E', fontWeight: 'bold' }}>자</span>
                                            </div>
                                        </div>
                                        <div style={{ flex: 1, minWidth: '140px' }}>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: '#558B2F', marginBottom: '8px', fontWeight: 'bold' }}>최소 문단 수</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={formData.min_paragraphs}
                                                    min="1"
                                                    onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })}
                                                    style={{
                                                        width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #DCEDC8',
                                                        background: '#FFFFFF', color: '#33691E', textAlign: 'right', fontWeight: 'bold', fontSize: '1rem'
                                                    }}
                                                />
                                                <span style={{ fontSize: '1rem', color: '#33691E', fontWeight: 'bold' }}>개</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* 3. 포인트 보상 섹션 */}
                                <section style={{ background: '#FFFDE7', padding: '24px', borderRadius: '24px', border: '1px solid #FFF59D' }}>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px'
                                    }}>
                                        <span style={{ fontSize: '1.2rem' }}>💎</span>
                                        <h4 style={{ margin: 0, color: '#F57F17', fontWeight: '900' }}>포인트 보상 설정</h4>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <label style={{ fontSize: '0.95rem', color: '#795548', minWidth: '120px', fontWeight: 'bold' }}>기본 제출 포인트</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={formData.base_reward}
                                                    step="100"
                                                    min="0"
                                                    onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })}
                                                    style={{
                                                        width: '120px', padding: '12px', borderRadius: '12px', border: '2px solid #FFE082',
                                                        background: '#FFFFFF', color: '#F57F17', textAlign: 'right', fontWeight: 'bold', fontSize: '1rem'
                                                    }}
                                                />
                                                <span style={{ fontSize: '1rem', color: '#F57F17', fontWeight: 'bold' }}>P 지급</span>
                                            </div>
                                        </div>

                                        <div style={{
                                            background: '#FFFFFF',
                                            padding: '20px',
                                            borderRadius: '16px',
                                            border: '2px dashed #FFD54F',
                                            display: 'flex',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '12px',
                                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            <span style={{ fontWeight: '900', color: '#E65100', fontSize: '1rem' }}>🔥 동기부여 보너스</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.95rem', color: '#795548' }}>글자수가</span>
                                                <input
                                                    type="number"
                                                    value={formData.bonus_threshold}
                                                    step="100"
                                                    min="0"
                                                    onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })}
                                                    style={{
                                                        width: '100px', padding: '10px', borderRadius: '10px', border: '2px solid #FFD54F',
                                                        textAlign: 'center', fontWeight: '900', fontSize: '1rem', background: '#FFFFFF'
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.95rem', color: '#795548' }}>자 초과일 때,</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={formData.bonus_reward}
                                                    step="10"
                                                    min="0"
                                                    onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })}
                                                    style={{
                                                        width: '100px', padding: '10px', borderRadius: '10px', border: '2px solid #FFD54F',
                                                        textAlign: 'center', fontWeight: '900', fontSize: '1.1rem', color: '#D84315', background: '#FFFFFF'
                                                    }}
                                                />
                                                <span style={{ color: '#D84315', fontWeight: '900', fontSize: '1rem' }}>포인트 추가 지급!</span>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <Button type="submit" style={{
                                    height: '64px', fontSize: '1.3rem', fontWeight: '900', marginTop: '8px',
                                    background: 'var(--primary-color)', color: 'white', border: 'none',
                                    boxShadow: '0 10px 20px rgba(135, 206, 235, 0.3)'
                                }}>
                                    ✨ 멋진 미션 공개하기
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
