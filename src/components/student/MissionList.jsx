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
    const [posts, setPosts] = useState({}); // missionId -> post 객체
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        fetchData();

        // [실시간 연동] 미션 목록 변경 감지 (추가/수정/삭제)
        const getSessionClassId = () => {
            const s = studentSession || JSON.parse(localStorage.getItem('student_session'));
            return s?.classId || s?.class_id;
        };
        const classId = getSessionClassId();

        if (classId) {
            const channel = supabase
                .channel(`mission_list_changes_${classId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'writing_missions',
                    filter: `class_id=eq.${classId}`
                }, (payload) => {
                    console.log('📢 미션 목록 변경 감지:', payload);
                    fetchData();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, []);

    const fetchData = async () => {
        setLoading(true);
        console.log("🔍 [MissionList] 데이터 로딩 시작...");

        // 1. 세션 정보 확인 (prop 우선, 없으면 localStorage)
        let currentStudent = studentSession;
        if (!currentStudent) {
            const saved = localStorage.getItem('student_session');
            if (saved) {
                currentStudent = JSON.parse(saved);
            }
        }

        console.log("👤 [MissionList] 현재 학생 정보:", currentStudent);

        if (!currentStudent || (!currentStudent.classId && !currentStudent.class_id)) {
            console.error("❌ [MissionList] 유효한 학생 세션이 없습니다.");
            alert('로그인 정보가 올바르지 않습니다. 다시 로그인해 주세요! 🎒');
            if (onBack) onBack();
            setLoading(false); // Ensure loading state is reset even on early exit
            return;
        }

        const classId = currentStudent.classId || currentStudent.class_id;
        const studentId = currentStudent.id;

        try {
            // 2. 미션 목록 가져오기 (학생 소속 반 기준)
            console.log(`📡 [MissionList] 미션 조회 중... (반 ID: ${classId})`);
            const { data: mData, error: mError } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', classId)
                .eq('is_archived', false)
                .neq('mission_type', 'meeting')
                .order('created_at', { ascending: false });

            if (mError) throw mError;
            console.log(`✅ [MissionList] 미션 로드 성공: ${mData?.length || 0}건`);
            setMissions(mData || []);

            // 3. 학생의 해당 미션들에 대한 제출물 현황 가져오기
            console.log(`📡 [MissionList] 학생 제출물 조회 중... (학생 ID: ${studentId})`);
            const { data: pData, error: pError } = await supabase
                .from('student_posts')
                .select('*')
                .eq('student_id', studentId);

            if (pError) throw pError;

            // mission_id를 키로 하는 맵 생성
            const postMap = {};
            if (pData) {
                pData.forEach(p => postMap[p.mission_id] = p);
            }
            setPosts(postMap);
            console.log(`✅ [MissionList] 제출 현황 로드 성공`);

        } catch (err) {
            console.error('❌ [MissionList] 데이터 로드 중 치명적 오류:', err.message);
            alert('데이터를 불러오는데 실패했습니다. 😢');
        } finally {
            setLoading(false);
            console.log("🏁 [MissionList] 데이터 로딩 종료");
        }
    };

    const handleMissionClick = (missionId) => {
        onNavigate('writing', { missionId });
    };

    return (
        <Card style={isMobile ? {
            width: '100%',
            maxWidth: '800px', // 태블릿 최적화
            margin: '0 auto',
            minHeight: '100vh',
            padding: '20px 20px 100px 20px', // 하단 탭바 고려
            background: '#FFFDF7',
            border: 'none',
            borderRadius: 0,
            boxSizing: 'border-box'
        } : {
            maxWidth: '650px',
            padding: '32px',
            background: '#FFFDF7',
            border: '2px solid #FFE082'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
                <Button variant="ghost" size="sm" onClick={onBack} style={{ marginRight: '16px' }} disabled={loading}>
                    ⬅️ 뒤로가기
                </Button>
                <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#5D4037', fontWeight: '900' }}>📝 오늘은 어떤 글을 쓸까?</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            style={{ fontSize: '3rem', marginBottom: '16px' }}
                        >
                            🔍
                        </motion.div>
                        <p style={{ color: '#8D6E63', fontWeight: 'bold', fontSize: '1.1rem' }}>선생님이 준비한 주제를 불러오는 중이야...</p>
                    </div>
                ) : missions.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 40px',
                        background: 'white',
                        borderRadius: '24px',
                        border: '2px dashed #FFE082',
                        boxShadow: '0 4px 12px rgba(255, 224, 130, 0.1)'
                    }}>
                        <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>🎈</div>
                        <h3 style={{ margin: '0 0 8px 0', color: '#5D4037' }}>아직 등록된 글쓰기 미션이 없어요!</h3>
                        <p style={{ color: '#9E9E9E', fontSize: '0.95rem' }}>선생님이 새로운 주제를 주실 때까지 조금만 기다려볼까요?</p>
                    </div>
                ) : (
                    missions.map(mission => {
                        const post = posts[mission.id];
                        let statusBadge = null;
                        let borderColor = '#FFECB3';
                        let buttonText = '글쓰기 ✍️';

                        if (post?.is_returned) {
                            statusBadge = (
                                <div style={{ background: '#FFEBEE', color: '#D32F2F', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', border: '1px solid #FFCDD2' }}>
                                    ♻️ 다시 쓰기 필요
                                </div>
                            );
                            borderColor = '#FFCDD2';
                            buttonText = '다시 쓰기 ✍️';
                        } else if (post?.is_submitted) {
                            statusBadge = (
                                <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', border: '1px solid #C8E6C9' }}>
                                    ✅ 제출 완료
                                </div>
                            );
                            borderColor = '#C8E6C9';
                            buttonText = '내 글 보기 📖';
                        } else if (post) {
                            statusBadge = (
                                <div style={{ background: '#FFF3E0', color: '#EF6C00', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', border: '1px solid #FFE0B2' }}>
                                    📝 작성 중
                                </div>
                            );
                            borderColor = '#FFE0B2';
                            buttonText = '계속 쓰기 ✍️';
                        } else {
                            statusBadge = (
                                <div style={{ background: '#F5F5F5', color: '#9E9E9E', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', border: '1px solid #E0E0E0' }}>
                                    작성 전
                                </div>
                            );
                        }

                        return (
                            <motion.div
                                key={mission.id}
                                whileHover={{ y: -5, boxShadow: '0 12px 24px rgba(0,0,0,0.05)' }}
                                whileTap={{ scale: 0.98 }}
                                style={{
                                    cursor: 'pointer',
                                    background: 'white',
                                    padding: '24px',
                                    borderRadius: '24px',
                                    border: `2px solid ${borderColor}`,
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                                onClick={() => handleMissionClick(mission.id)}
                            >
                                {/* [신규] 새 미션 뱃지 (24시간 이내 && 제출 전) */}
                                {(!post?.is_submitted && new Date(mission.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)) && (
                                    <div style={{
                                        position: 'absolute', top: '12px', right: '12px',
                                        background: '#FF5252', color: 'white', fontSize: '0.7rem',
                                        padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold',
                                        boxShadow: '0 2px 4px rgba(255, 82, 82, 0.2)',
                                        zIndex: 2
                                    }}>NEW</div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <div style={{
                                            padding: '4px 12px',
                                            background: '#E1F5FE',
                                            color: '#0288D1',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: '900'
                                        }}>
                                            {mission.genre}
                                        </div>
                                        {statusBadge}
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: '#FFFDE7',
                                        padding: '4px 10px',
                                        borderRadius: '10px',
                                        border: '1px solid #FFF59D',
                                        fontSize: '0.8rem',
                                        fontWeight: '900',
                                        color: '#F57F17'
                                    }}>
                                        ✨ {mission.base_reward}P
                                    </div>
                                </div>
                                <h4 style={{ margin: '0 0 10px 0', color: '#2C3E50', fontSize: '1.2rem', fontWeight: '900' }}>
                                    {mission.title}
                                </h4>
                                <p style={{ fontSize: '0.95rem', color: '#607D8B', margin: '0 0 20px 0', lineHeight: '1.6', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {mission.guide}
                                </p>
                                <Button
                                    variant={post?.is_submitted && !post?.is_returned ? "secondary" : "primary"}
                                    style={{ width: '100%', borderRadius: '14px', fontWeight: '900' }}
                                >
                                    {buttonText}
                                </Button>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </Card>
    );
};

export default MissionList;
