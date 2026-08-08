import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import { isPendingRewrite } from '../../lib/writingStatus';

const MISSION_LIST_LIMIT = 100;
// AGENTS.md 학생 폴링 하한(60초)과 다른 화면 재조회 간격에 맞춘다.
const MISSION_LIST_STALE_MS = 60000;

/**
 * 역할: 학생 - 글쓰기 미션 목록 확인
 */
const MissionList = ({ studentSession, onBack, onNavigate }) => {
    const [missions, setMissions] = useState([]);
    const [posts, setPosts] = useState({});
    const [loading, setLoading] = useState(true);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);
    const loadedAtRef = useRef(0);

    const getCurrentStudent = useCallback(() => {
        let currentStudent = studentSession;
        if (!currentStudent) {
            const saved = localStorage.getItem('student_session');
            if (saved) {
                currentStudent = JSON.parse(saved);
            }
        }
        return currentStudent;
    }, [studentSession]);

    const fetchData = useCallback(async () => {
        setLoading(true);

        const currentStudent = getCurrentStudent();
        if (!currentStudent || (!currentStudent.classId && !currentStudent.class_id)) {
            alert('로그인 정보가 올바르지 않습니다. 다시 로그인해 주세요.');
            if (onBack) onBack();
            setLoading(false);
            return;
        }

        try {
            const { data: overview, error: overviewError } = await supabase.rpc('get_student_mission_list_v1', {
                p_limit: MISSION_LIST_LIMIT
            });
            if (overviewError) throw overviewError;
            if (Number(overview?.version) !== 1) throw new Error('지원하지 않는 과제 목록 응답입니다.');
            setMissions(overview.missions || []);
            setPosts(Object.fromEntries((overview.posts || []).map((post) => [post.mission_id, post])));
        } catch (err) {
            console.error('[MissionList] 데이터 로드 실패:', err.message);
            alert('데이터를 불러오는 데 실패했습니다.');
        } finally {
            loadedAtRef.current = Date.now();
            setLoading(false);
        }
    }, [getCurrentStudent, onBack]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        void fetchData();
        const refreshIfStale = () => {
            if (document.visibilityState !== 'visible' || Date.now() - loadedAtRef.current < MISSION_LIST_STALE_MS) return;
            void fetchData();
        };
        window.addEventListener('focus', refreshIfStale);
        document.addEventListener('visibilitychange', refreshIfStale);
        return () => {
            window.removeEventListener('focus', refreshIfStale);
            document.removeEventListener('visibilitychange', refreshIfStale);
        };
    }, [fetchData]);

    const handleMissionClick = (mission) => {
        onNavigate('writing', { missionId: mission.id });
    };

    const handleFriendPostsClick = (event, mission) => {
        event.stopPropagation();
        onNavigate('friends_hideout', {
            missionId: mission.id,
            returnTo: 'mission_list'
        });
    };

    return (
        <Card style={isMobile ? {
            width: '100%',
            maxWidth: '800px',
            margin: '0 auto',
            minHeight: '100vh',
            padding: '20px 20px 100px 20px',
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
                    뒤로 가기
                </Button>
                <h2 style={{ margin: 0, fontSize: '1.8rem', color: '#5D4037', fontWeight: '900' }}>오늘은 어떤 글을 써볼까?</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                            style={{ fontSize: '3rem', marginBottom: '16px' }}
                        >
                            📚
                        </motion.div>
                        <p style={{ color: '#8D6E63', fontWeight: 'bold', fontSize: '1.1rem' }}>선생님이 준비한 주제를 불러오는 중이에요..</p>
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
                        <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>📝</div>
                        <h3 style={{ margin: '0 0 8px 0', color: '#5D4037' }}>아직 등록된 글쓰기 미션이 없어요</h3>
                        <p style={{ color: '#9E9E9E', fontSize: '0.95rem' }}>선생님이 새로운 주제를 주실 때까지 조금만 기다려볼까요?</p>
                    </div>
                ) : (
                    missions.map((mission) => {
                        const post = posts[mission.id];
                        const isMeetingMission = mission.mission_type === 'meeting';
                        const isPoemMission = mission.input_template === 'poem';
                        let statusBadge = null;
                        let borderColor = '#FFECB3';
                        let buttonText = isMeetingMission ? '안건 작성하기' : '글쓰기 시작';

                        if (post?.recalled_at) {
                            // 다시쓰기 기한이 지나 선생님이 걷어간 글 — 학생이 이유를 알 수 있게 표시
                            statusBadge = (
                                <div style={{ background: '#EDE7F6', color: '#5E35B1', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', border: '1px solid #D1C4E9' }}>
                                    선생님이 걷어감
                                </div>
                            );
                            borderColor = '#D1C4E9';
                            buttonText = '내 글 보기';
                        } else if (isPendingRewrite(post)) {
                            statusBadge = (
                                <div style={{ background: '#FFEBEE', color: '#D32F2F', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', border: '1px solid #FFCDD2' }}>
                                    다시 쓰기 필요
                                </div>
                            );
                            borderColor = '#FFCDD2';
                            buttonText = '다시 쓰기 시작';
                        } else if (post?.is_submitted || post?.is_confirmed) {
                            statusBadge = (
                                <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', border: '1px solid #C8E6C9' }}>
                                    제출 완료
                                </div>
                            );
                            borderColor = '#C8E6C9';
                            buttonText = '내 글 보기';
                        } else if (post) {
                            statusBadge = (
                                <div style={{ background: '#FFF3E0', color: '#EF6C00', padding: '4px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', border: '1px solid #FFE0B2' }}>
                                    작성 중
                                </div>
                            );
                            borderColor = '#FFE0B2';
                            buttonText = '계속 쓰기';
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
                                onClick={() => handleMissionClick(mission)}
                            >
                                {(!post?.is_submitted && !post?.is_confirmed && new Date(mission.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)) && (
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
                                            {isMeetingMission ? '🏛️ 회의 안건 미션' : isPoemMission ? '🌿 시 쓰기' : mission.genre}
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
                                        ⭐ {mission.base_reward}P
                                    </div>
                                </div>
                                <h4 style={{ margin: '0 0 10px 0', color: '#2C3E50', fontSize: '1.2rem', fontWeight: '900' }}>
                                    {mission.title}
                                </h4>
                                <p style={{ fontSize: '0.95rem', color: '#607D8B', margin: '0 0 20px 0', lineHeight: '1.6', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {mission.guide}
                                </p>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                                    <Button
                                        variant={(post?.is_submitted || post?.is_confirmed) && !isPendingRewrite(post) ? 'secondary' : 'primary'}
                                        style={{ flex: 1, minWidth: '160px', borderRadius: '14px', fontWeight: '900' }}
                                    >
                                        {buttonText}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={(event) => handleFriendPostsClick(event, mission)}
                                        style={{
                                            flex: isMobile ? '1 1 100%' : '0 0 auto',
                                            borderRadius: '14px', fontWeight: '900',
                                            background: isMeetingMission ? '#FAF5FF' : '#F0F9FF',
                                            color: isMeetingMission ? '#7E22CE' : '#0369A1',
                                            border: `1px solid ${isMeetingMission ? '#D8B4FE' : '#BAE6FD'}`
                                        }}
                                    >
                                        {isMeetingMission ? '친구 안건 보기 🏛️' : '친구 글 보기 👀'}
                                    </Button>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </Card>
    );
};

export default MissionList;
