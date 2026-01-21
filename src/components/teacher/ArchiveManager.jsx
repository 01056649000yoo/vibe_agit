import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataExport } from '../../hooks/useDataExport';
import ExportSelectModal from '../common/ExportSelectModal';

/**
 * 역할: 선생님 - 보관된 미션 관리 및 글 모아보기 📂
 */
const ArchiveManager = ({ activeClass, isMobile }) => {
    const [archivedMissions, setArchivedMissions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedMission, setSelectedMission] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(false);

    // 엑셀 추출 훅
    const { fetchExportData, exportToExcel, exportToGoogleDoc, isGapiLoaded } = useDataExport();

    // 내보내기 모달 상태
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportTarget, setExportTarget] = useState(null);

    const handleExportClick = (mission) => {
        setExportTarget({ type: 'mission', id: mission.id, title: mission.title });
        setExportModalOpen(true);
    };

    const handleExportConfirm = async (format, options) => {
        if (!exportTarget) return;

        const data = await fetchExportData(exportTarget.type, exportTarget.id);
        if (!data || data.length === 0) {
            alert('제출된 글이 없습니다.');
            return;
        }

        const fileName = `${exportTarget.title}_글모음`;

        if (format === 'excel') {
            exportToExcel(data, fileName);
        } else if (format === 'googleDoc') {
            await exportToGoogleDoc(data, fileName, options.usePageBreak);
        }
    };

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
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '20px'
                }}>
                    {archivedMissions.map((mission) => (
                        <motion.div
                            key={mission.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -4, borderColor: '#3498DB', boxShadow: '0 8px 16px rgba(0,0,0,0.08)' }}
                            style={{
                                background: 'white',
                                border: '1px solid #E9ECEF',
                                borderRadius: '20px',
                                padding: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s ease',
                                height: '100%',
                                boxSizing: 'border-box',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}
                        >
                            {/* 헤더: 제목 및 날짜 */}
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <h4 style={{
                                        margin: 0,
                                        fontSize: '1.15rem',
                                        color: '#2C3E50',
                                        fontWeight: '800',
                                        lineHeight: '1.4',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 1,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        flex: 1,
                                        marginRight: '12px'
                                    }} title={mission.title}>
                                        {mission.title}
                                    </h4>
                                    <span style={{ fontSize: '0.75rem', color: '#BDC3C7', whiteSpace: 'nowrap', paddingTop: '4px' }}>
                                        {mission.archived_at ? new Date(mission.archived_at).toLocaleDateString() : '-'}
                                    </span>
                                </div>

                                {/* 뱃지 그룹 */}
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <span style={{
                                        padding: '4px 8px',
                                        background: '#E3F2FD',
                                        color: '#1976D2',
                                        borderRadius: '8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold'
                                    }}>
                                        {mission.genre}
                                    </span>
                                    <span style={{
                                        padding: '4px 8px',
                                        background: mission.allow_comments ? '#E8F5E9' : '#FFEBEE',
                                        color: mission.allow_comments ? '#2E7D32' : '#C62828',
                                        borderRadius: '8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold'
                                    }}>
                                        {mission.allow_comments ? '💬 댓글 ON' : '🔒 댓글 OFF'}
                                    </span>
                                </div>
                            </div>

                            {/* 바디: 통계 정보 */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                background: '#F8F9FA',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                marginBottom: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>👥</span>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#95A5A6' }}>제출</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#2C3E50' }}>
                                            {mission.submittedCount}<span style={{ color: '#ADB5BD', fontWeight: 'normal' }}>/{mission.totalStudents}</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ width: '1px', background: '#E9ECEF' }}></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>✍️</span>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#95A5A6' }}>분량</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#2C3E50' }}>{mission.min_chars}~{mission.max_chars}</div>
                                    </div>
                                </div>
                            </div>

                            {/* 푸터: 액션 버튼 */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <Button
                                    size="sm"
                                    onClick={() => fetchPostsForMission(mission)}
                                    style={{
                                        width: '100%',
                                        background: '#F1F3F5',
                                        color: '#495057',
                                        border: 'none'
                                    }}
                                >
                                    📖 보기
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => handleRestoreMission(mission.id)}
                                    style={{
                                        width: '100%',
                                        background: '#E8F5E9',
                                        color: '#2E7D32',
                                        border: 'none'
                                    }}
                                >
                                    ♻️ 복구
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => handleExportClick(mission)}
                                    style={{
                                        width: '100%',
                                        background: '#E0F7FA',
                                        color: '#006064',
                                        border: 'none',
                                        gridColumn: 'span 2' // 하단에 꽉 차게 배치
                                    }}
                                >
                                    📤 데이터 내보내기
                                </Button>
                            </div>
                        </motion.div>
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
            {/* 내보내기 모달 */}
            <ExportSelectModal
                isOpen={exportModalOpen}
                onClose={() => setExportModalOpen(false)}
                title={exportTarget?.title}
                onConfirm={handleExportConfirm}
                isGapiLoaded={isGapiLoaded}
            />
        </div>
    );
};

export default ArchiveManager;
