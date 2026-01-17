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
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', activeClass.id)
                .eq('is_archived', true)
                .order('archived_at', { ascending: false });

            if (error) throw error;
            setArchivedMissions(data || []);
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
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3rem', color: '#2C3E50', fontWeight: '900' }}>
                📂 글 보관함
            </h3>

            <Card style={{ padding: 0, overflow: 'hidden', border: '1px solid #E9ECEF', borderRadius: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ background: '#F8F9FA' }}>
                        <tr>
                            <th style={{ padding: '16px', fontSize: '0.85rem', color: '#7F8C8D' }}>미션 제목</th>
                            <th style={{ padding: '16px', fontSize: '0.85rem', color: '#7F8C8D' }}>유형</th>
                            {!isMobile && <th style={{ padding: '16px', fontSize: '0.85rem', color: '#7F8C8D' }}>보관일</th>}
                            <th style={{ padding: '16px', fontSize: '0.85rem', color: '#7F8C8D', textAlign: 'center' }}>작업</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: '#ADB5BD' }}>로딩 중...</td></tr>
                        ) : archivedMissions.length === 0 ? (
                            <tr><td colSpan="4" style={{ padding: '60px', textAlign: 'center', color: '#ADB5BD' }}>보관된 미션이 없습니다. 📭</td></tr>
                        ) : (
                            archivedMissions.map((mission) => (
                                <tr key={mission.id} style={{ borderTop: '1px solid #F1F3F5' }}>
                                    <td style={{ padding: '16px', fontWeight: 'bold', color: '#2C3E50' }}>{mission.title}</td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{ padding: '4px 8px', background: '#F1F3F5', borderRadius: '6px', fontSize: '0.75rem', color: '#7F8C8D' }}>{mission.genre}</span>
                                    </td>
                                    {!isMobile && (
                                        <td style={{ padding: '16px', fontSize: '0.85rem', color: '#95A5A6' }}>
                                            {mission.archived_at ? new Date(mission.archived_at).toLocaleDateString() : '-'}
                                        </td>
                                    )}
                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <Button size="sm" variant="secondary" onClick={() => fetchPostsForMission(mission)} style={{ fontSize: '0.8rem' }}>
                                                글 모아보기
                                            </Button>
                                            <Button size="sm" variant="ghost" onClick={() => handleRestoreMission(mission.id)} style={{ fontSize: '0.8rem', color: '#3498DB' }}>
                                                복구
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </Card>

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
