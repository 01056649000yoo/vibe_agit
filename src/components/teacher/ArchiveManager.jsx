import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 선생님 - 보관된 미션 관리 및 글 모아보기 📂
 */
const ArchiveManager = ({ activeClass, isMobile }) => {
    const [archivedMissions, setArchivedMissions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedMission, setSelectedMission] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(false);

    useEffect(() => {
        if (activeClass?.id) {
            fetchArchivedMissions();
        }
    }, [activeClass?.id]);

    const fetchArchivedMissions = async () => {
        setLoading(true);
        try {
            // 미션 정보와 함께, 전체 학생 수와 제출된 글 수를 계산하기 위해 데이터 조회
            const { data: missions, error: missionError } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', activeClass.id)
                .eq('is_archived', true)
                .order('archived_at', { ascending: false });

            if (missionError) throw missionError;

            // 추가 정보(제출 수, 전체 학생 수) 구하기
            const { count: totalStudents } = await supabase
                .from('students')
                .select('*', { count: 'exact', head: true })
                .eq('class_id', activeClass.id);

            // 각 미션별 제출된 글 수 조회
            const missionsWithStats = await Promise.all(missions.map(async (m) => {
                const { count: submittedCount } = await supabase
                    .from('student_posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('mission_id', m.id)
                    .eq('is_submitted', true);

                return {
                    ...m,
                    totalStudents: totalStudents || 0,
                    submittedCount: submittedCount || 0
                };
            }));

            setArchivedMissions(missionsWithStats || []);
        } catch (err) {
            console.error('보관된 미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchPostsForMission = async (mission) => {
        setSelectedMission(mission);
        setLoadingPosts(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    *,
                    students(name)
                `)
                .eq('mission_id', mission.id)
                .eq('is_submitted', true)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setPosts(data || []);
        } catch (err) {
            console.error('글 불러오기 실패:', err.message);
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleRestoreMission = async (missionId) => {
        if (!confirm('이 미션을 다시 활성화하시겠습니까? 학생들에게 다시 보이게 됩니다.')) return;
        try {
            const { error } = await supabase
                .from('writing_missions')
                .update({ is_archived: false, archived_at: null })
                .eq('id', missionId);
            if (error) throw error;
            alert('미션이 복구되었습니다! ✨');
            fetchArchivedMissions();
        } catch (err) {
            alert('복구 실패: ' + err.message);
        }
    };

    return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', color: '#2C3E50', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📂 글 보관함 <span style={{ fontSize: '1rem', fontWeight: 'normal', color: '#95A5A6' }}>지난 미션과 아이들의 글을 소중히 보관합니다.</span>
            </h3>

            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#ADB5BD' }}>데이터를 불러오는 중입니다...</div>
            ) : archivedMissions.length === 0 ? (
                <Card style={{ padding: '60px', textAlign: 'center', color: '#ADB5BD', border: '2px dashed #E9ECEF' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '20px' }}>📭</div>
                    <p style={{ fontSize: '1.1rem' }}>아직 보관된 미션이 없습니다.</p>
                </Card>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {archivedMissions.map((mission) => (
                        <Card key={mission.id} style={{
                            padding: '20px 24px',
                            border: '1px solid #E9ECEF',
                            borderRadius: '20px',
                            display: 'flex',
                            flexDirection: isMobile ? 'column' : 'row',
                            alignItems: isMobile ? 'flex-start' : 'center',
                            justifyContent: 'space-between',
                            gap: '20px',
                            transition: 'all 0.2s',
                            background: 'white',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                        }}>
                            {/* 좌측: 미션 정보 */}
                            <div style={{ flex: 1, width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>{mission.title}</h4>
                                    <span style={{
                                        padding: '4px 8px',
                                        background: '#F1F3F5',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        color: '#495057',
                                        fontWeight: 'bold'
                                    }}>
                                        {mission.genre}
                                    </span>
                                    <span style={{ fontSize: '0.8rem', color: '#95A5A6' }}>
                                        {mission.archived_at ? `(${new Date(mission.archived_at).toLocaleDateString()} 보관됨)` : ''}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                                    {/* 제출 현황 */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.85rem', color: '#7F8C8D' }}>제출 현황</span>
                                        <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#2196F3' }}>
                                            {mission.submittedCount} <span style={{ color: '#B0BEC5', fontWeight: 'normal' }}>/ {mission.totalStudents}</span>
                                        </span>
                                    </div>

                                    <div style={{ width: '1px', height: '12px', background: '#DEE2E6' }}></div>

                                    {/* 기본 포인트 */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.85rem', color: '#7F8C8D' }}>기본 포인트</span>
                                        <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#FF9800' }}>
                                            {mission.final_points?.toLocaleString() || 0} P
                                        </span>
                                    </div>

                                    {!isMobile && <div style={{ width: '1px', height: '12px', background: '#DEE2E6' }}></div>}

                                    {/* 설정 정보 (분량 + 댓글) */}
                                    <div style={{ fontSize: '0.85rem', color: '#546E7A', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span>📏 {mission.min_chars}자~{mission.max_chars}자</span>
                                        <span>{mission.allow_comments ? '💬 댓글 허용' : '🔒 댓글 금지'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 우측: 액션 버튼 */}
                            <div style={{ display: 'flex', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
                                <Button
                                    size="md"
                                    onClick={() => fetchPostsForMission(mission)}
                                    style={{
                                        flex: 1,
                                        background: '#E3F2FD',
                                        color: '#1976D2',
                                        border: '1px solid #BBDEFB',
                                        fontWeight: 'bold',
                                        whiteSpace: 'nowrap',
                                        padding: '8px 16px'
                                    }}
                                >
                                    📖 글 모아보기
                                </Button>
                                <Button
                                    size="md"
                                    variant="ghost"
                                    onClick={() => handleRestoreMission(mission.id)}
                                    style={{
                                        flex: 1,
                                        color: '#7F8C8D',
                                        border: '1px solid #ECEFF1',
                                        whiteSpace: 'nowrap',
                                        padding: '8px 16px'
                                    }}
                                >
                                    ↩️ 복구
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* 글 모아보기 모달 */}
            <AnimatePresence>
                {selectedMission && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.6)', zIndex: 3000,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '20px'
                    }} onClick={() => setSelectedMission(null)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            style={{
                                background: 'white', borderRadius: '28px', width: '100%', maxWidth: '900px',
                                maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                            }} onClick={e => e.stopPropagation()}>
                            <header style={{ padding: '24px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, color: '#2C3E50', fontWeight: '900' }}>📂 {selectedMission.title} - 모든 글</h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#7F8C8D' }}>제출된 모든 학생의 글을 한꺼번에 확인합니다.</p>
                                </div>
                                <button onClick={() => setSelectedMission(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                            </header>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', background: '#FAFAFA' }}>
                                {loadingPosts ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>글을 불러오고 있어요...</div>
                                ) : posts.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '60px', color: '#95A5A6' }}>제출된 글이 없습니다.</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                        {posts.map((post, idx) => (
                                            <div key={post.id} style={{
                                                background: 'white', padding: '32px', borderRadius: '24px',
                                                border: '1px solid #E9ECEF', boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #F8F9FA', paddingBottom: '12px' }}>
                                                    <span style={{ fontWeight: '900', fontSize: '1.1rem', color: '#3498DB' }}>{idx + 1}. {post.students?.name} 학생</span>
                                                    <span style={{ fontSize: '0.85rem', color: '#ADB5BD' }}>{new Date(post.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <h4 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>{post.title}</h4>
                                                <div style={{ lineHeight: '1.8', color: '#444', whiteSpace: 'pre-wrap', fontSize: '1.05rem' }}>{post.content}</div>
                                                {post.ai_feedback && (
                                                    <div style={{ marginTop: '24px', padding: '20px', background: '#F0F7FF', borderRadius: '16px', border: '1px solid #E3F2FD' }}>
                                                        <div style={{ fontWeight: 'bold', color: '#1976D2', marginBottom: '8px', fontSize: '0.9rem' }}>🤖 AI 피드백</div>
                                                        <div style={{ fontSize: '0.95rem', color: '#2C3E50', lineHeight: '1.6' }}>{post.ai_feedback}</div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ArchiveManager;
