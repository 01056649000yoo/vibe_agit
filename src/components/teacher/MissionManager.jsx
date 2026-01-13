import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 글쓰기 미션 등록 및 관리 (정교한 글쓰기 미션 마스터 시스템) ✨
 */
const MissionManager = ({ activeClass, isDashboardMode = true }) => {
    const [missions, setMissions] = useState([]);
    const [submissionCounts, setSubmissionCounts] = useState({});
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    // 새롭게 추가된 상태들
    const [selectedMission, setSelectedMission] = useState(null); // 현재 확인 중인 미션
    const [posts, setPosts] = useState([]); // 해당 미션의 학생 글 목록
    const [selectedPost, setSelectedPost] = useState(null); // 상세보기용 선택된 글
    const [loadingPosts, setLoadingPosts] = useState(false);

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
            // 1. 글쓰기 미션 목록 가져오기
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
            console.error('글쓰기 미션 로드 실패:', err.message);
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

            alert('새로운 글쓰기 미션이 공개되었습니다! 🚀');
            setIsFormOpen(false);
            setFormData({ title: '', guide: '', genre: '일기', min_chars: 100, min_paragraphs: 2, base_reward: 100, bonus_threshold: 100, bonus_reward: 10 });
            fetchMissions();
        } catch (error) {
            alert('글쓰기 미션 등록 실패: ' + error.message);
        }
    };

    // 학생 글 목록 불러오기
    const fetchPostsForMission = async (mission) => {
        setLoadingPosts(true);
        setSelectedMission(mission);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    *,
                    students!inner(name, class_id)
                `)
                .eq('mission_id', mission.id)
                .eq('students.class_id', activeClass.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPosts(data || []);
        } catch (err) {
            console.error('학생 글 불러오기 실패:', err.message);
            alert('글을 불러오는 도중 오류가 발생했습니다.');
        } finally {
            setLoadingPosts(false);
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
                    {isDashboardMode ? '✍️ 글쓰기 미션 현황' : '✍️ 글쓰기 미션 관리'}
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
                        <Card style={{
                            padding: isMobile ? '16px' : '24px',
                            border: '2px solid #3498DB',
                            width: '100%',
                            maxWidth: 'none', // 너비 제한 해제
                            margin: '0 0 24px 0', // 리스트와 정렬 맞춤
                            boxSizing: 'border-box',
                            overflow: 'hidden'
                        }}>
                            <form onSubmit={handleCreateMission} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
                                    <input
                                        type="text"
                                        placeholder="글쓰기 주제"
                                        value={formData.title}
                                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                                        style={{
                                            flex: 2,
                                            padding: '14px',
                                            borderRadius: '12px',
                                            border: '1px solid #ddd',
                                            fontSize: '1rem',
                                            minHeight: '48px',
                                            width: '100%',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    <select value={formData.genre} onChange={e => setFormData({ ...formData, genre: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px', width: '100%', boxSizing: 'border-box' }}>
                                        {genreCategories.map(cat => (
                                            <optgroup key={cat.label} label={cat.label}>
                                                {cat.genres.map(g => <option key={g} value={g}>{g}</option>)}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                <textarea placeholder="안내 가이드" value={formData.guide} onChange={e => setFormData({ ...formData, guide: e.target.value })} style={{ padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '120px', fontSize: '1rem', width: '100%', boxSizing: 'border-box' }} />
                                {/* 설정 섹션: 좌우 5:5 균형 배치 */}
                                <div style={{
                                    display: 'flex',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gap: isMobile ? '12px' : '16px',
                                    alignItems: 'stretch', // 높이 균형 맞춤
                                    width: '100%',
                                    boxSizing: 'border-box'
                                }}>
                                    {/* (1) 분량 제한 섹션 (좌측 50%) */}
                                    <div style={{
                                        flex: 1,
                                        minWidth: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        background: '#F0F7FF', // 연한 파랑
                                        padding: '16px',
                                        borderRadius: '16px',
                                        border: '1px solid #D6EAF8',
                                        boxSizing: 'border-box'
                                    }}>
                                        <label style={{ fontSize: '0.8rem', color: '#2E86C1', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            📏 분량 제한 설정
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: '0.7rem', color: '#5499C7', display: 'block', marginBottom: '4px' }}>최소 글자</span>
                                                <input type="number" step="100" placeholder="글자" value={formData.min_chars} onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #AED6F1', fontSize: '0.9rem', textAlign: 'center', boxSizing: 'border-box' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: '0.7rem', color: '#5499C7', display: 'block', marginBottom: '4px' }}>최소 문단</span>
                                                <input type="number" placeholder="문단" value={formData.min_paragraphs} onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #AED6F1', fontSize: '0.9rem', textAlign: 'center', boxSizing: 'border-box' }} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* (2) 포인트 보상 섹션 (우측 50%) */}
                                    <div style={{
                                        flex: 1,
                                        minWidth: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        background: '#FFFDF0', // 연한 노랑
                                        padding: '16px',
                                        borderRadius: '16px',
                                        border: '1px solid #FCF3CF',
                                        boxSizing: 'border-box'
                                    }}>
                                        <label style={{ fontSize: '0.8rem', color: '#D4AC0D', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            💰 포인트 보상 설정
                                        </label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {/* 기본 보상 */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.5)', padding: '6px 10px', borderRadius: '10px' }}>
                                                <span style={{ fontSize: '0.75rem', color: '#B7950B', fontWeight: 'bold', whiteSpace: 'nowrap' }}>기본 보상:</span>
                                                <input type="number" step="100" value={formData.base_reward} onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })} style={{ width: '80px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.85rem', textAlign: 'center' }} />
                                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#B7950B' }}>P</span>
                                            </div>
                                            {/* 보너스 설정 */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', flexWrap: 'nowrap' }}>
                                                <span style={{ color: '#D35400', fontWeight: 'bold', whiteSpace: 'nowrap' }}>⚡ 보너스:</span>
                                                <input type="number" step="100" placeholder="글자수" value={formData.bonus_threshold} onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })} style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.8rem' }} />
                                                <span style={{ whiteSpace: 'nowrap' }}>자 ↑ 면</span>
                                                <span style={{ fontWeight: 'bold' }}>+</span>
                                                <input type="number" step="10" placeholder="점수" value={formData.bonus_reward} onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })} style={{ width: '50px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.8rem' }} />
                                                <span style={{ fontWeight: 'bold', color: '#D35400' }}>P</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Button type="submit" style={{ background: '#3498DB', color: 'white', fontWeight: 'bold', height: '54px', borderRadius: '14px' }}>글쓰기 미션 공개하기 🚀</Button>
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
                    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8F9FA', borderRadius: '24px', border: '2px dashed #E9ECEF', width: '100%', boxSizing: 'border-box' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📖</div>
                        <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>아직 등록된 글쓰기 미션이 없습니다.</p>
                        <p style={{ color: '#BDC3C7', fontSize: '0.9rem' }}>새로운 글쓰기 미션을 등록해 아이들과 소통해보세요! ✨</p>
                    </div>
                ) : missions.map(mission => (
                    <motion.div key={mission.id} whileHover={isMobile ? {} : { y: -4 }} style={{
                        background: 'white', padding: isMobile ? '16px' : '20px',
                        borderRadius: '20px', border: '1px solid #ECEFF1',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '12px',
                        width: '100%', boxSizing: 'border-box', // 상자 크기 고정
                        wordBreak: 'keep-all', overflowWrap: 'break-word' // 줄바꿈 정책
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <span style={{ padding: '4px 10px', background: '#E3F2FD', color: '#1976D2', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900' }}>{mission.genre}</span>
                            <button onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm('이 글쓰기 미션을 삭제하시겠습니까? 🗑️\n작성된 학생들의 글도 확인이 어려워질 수 있습니다.')) {
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
                        <Button
                            onClick={() => fetchPostsForMission(mission)}
                            variant="secondary"
                            style={{
                                width: '100%',
                                marginTop: '4px',
                                background: '#F8F9FA',
                                color: '#495057',
                                border: '1px solid #E9ECEF',
                                fontSize: '0.85rem'
                            }}
                        >
                            📝 학생 글 확인
                        </Button>
                    </motion.div>
                ))}
            </div>

            {/* 학생 제출 현황 모달 */}
            <AnimatePresence>
                {selectedMission && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            padding: '20px', boxSizing: 'border-box'
                        }}
                        onClick={() => setSelectedMission(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            style={{
                                background: 'white', borderRadius: '24px',
                                width: '100%', maxWidth: '600px', maxHeight: '80vh',
                                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ padding: '24px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontSize: '0.8rem', color: '#1976D2', background: '#E3F2FD', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{selectedMission.genre}</span>
                                    <h4 style={{ margin: '8px 0 0 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>{selectedMission.title}</h4>
                                </div>
                                <button onClick={() => setSelectedMission(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                                {loadingPosts ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>데이터를 불러오는 중...</div>
                                ) : posts.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>아직 제출한 학생이 없습니다. 🐥</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {posts.map(post => (
                                            <div
                                                key={post.id}
                                                onClick={() => setSelectedPost(post)}
                                                style={{
                                                    padding: '16px', borderRadius: '16px', background: '#F8F9FA',
                                                    border: '1px solid #E9ECEF', cursor: 'pointer',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#F1F3F5'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#F8F9FA'}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: '900', color: '#2C3E50', marginBottom: '4px' }}>{post.students?.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: '#95A5A6' }}>
                                                        {post.char_count}자 · {new Date(post.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                <div style={{ color: '#3498DB', fontWeight: 'bold', fontSize: '0.85rem' }}>읽어보기 ➔</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 글 상세보기 (Viewer) */}
            <AnimatePresence>
                {selectedPost && (
                    <motion.div
                        initial={{ opacity: 0, x: '100%' }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'white', zIndex: 1100,
                            display: 'flex', flexDirection: 'column',
                            boxSizing: 'border-box'
                        }}
                    >
                        <header style={{
                            padding: '16px 20px', borderBottom: '1px solid #F1F3F5',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            flexShrink: 0
                        }}>
                            <button
                                onClick={() => setSelectedPost(null)}
                                style={{
                                    background: '#F8F9FA', border: 'none', padding: '8px 16px',
                                    borderRadius: '12px', fontSize: '0.9rem', fontWeight: 'bold',
                                    color: '#495057', cursor: 'pointer'
                                }}
                            >
                                ← 뒤로가기
                            </button>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.8rem', color: '#95A5A6', fontWeight: 'bold' }}>{selectedMission?.title}</div>
                                <div style={{ fontSize: '1rem', color: '#2C3E50', fontWeight: '900' }}>{selectedPost.students?.name} 학생의 글</div>
                            </div>
                            <div style={{ width: '80px' }}></div> {/* 균형용 */}
                        </header>

                        <main style={{
                            flex: 1, overflowY: 'auto', padding: isMobile ? '24px 20px' : '40px',
                            maxWidth: '800px', margin: '0 auto', width: '100%', boxSizing: 'border-box'
                        }}>
                            <h2 style={{
                                fontSize: isMobile ? '1.5rem' : '2rem',
                                color: '#2C3E50', fontWeight: '900',
                                marginBottom: '24px', lineHeight: '1.4',
                                borderLeft: '6px solid #FBC02D', paddingLeft: '20px'
                            }}>
                                {selectedPost.title || '제목 없음'}
                            </h2>
                            <div style={{
                                fontSize: isMobile ? '1.1rem' : '1.25rem',
                                color: '#444', lineHeight: '1.8',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                paddingBottom: '100px'
                            }}>
                                {selectedPost.content}
                            </div>
                        </main>

                        <footer style={{
                            padding: '20px', borderTop: '1px solid #F1F3F5',
                            textAlign: 'center', color: '#95A5A6', fontSize: '0.85rem'
                        }}>
                            글자 수: {selectedPost.char_count}자 | 제출 시간: {new Date(selectedPost.created_at).toLocaleString()}
                        </footer>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MissionManager;
