import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import StudentGuideModal from './StudentGuideModal';
import StudentFeedbackModal from './StudentFeedbackModal';

/**
 * 역할: 학생 메인 대시보드 - 포인트 표시 및 활동 메뉴
 * props:
 *  - studentSession: 학생 세션 정보 (id, name, className 등)
 *  - onLogout: 로그아웃 처리 함수
 */
const StudentDashboard = ({ studentSession, onLogout, onNavigate }) => {
    const [points, setPoints] = useState(0);
    const [hasActivity, setHasActivity] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbacks, setFeedbacks] = useState([]);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [feedbackInitialTab, setFeedbackInitialTab] = useState(0); // [추가] 피드백 모달 초기 탭
    const [returnedCount, setReturnedCount] = useState(0);
    const [stats, setStats] = useState({ totalChars: 0, completedMissions: 0, monthlyPosts: 0 }); // [추가] 성장 통계
    const [levelInfo, setLevelInfo] = useState({ level: 1, name: '새싹 작가', icon: '🌱', nextGoal: 1000 }); // [추가] 레벨 정보
    const [isLoading, setIsLoading] = useState(true); // [긴급 점검] 데이터 로딩 상태 관리 추가
    const [petData, setPetData] = useState({
        name: '나의 드래곤',
        level: 1,
        exp: 0,
        lastFed: new Date().toISOString().split('T')[0],
        ownedItems: [],
        background: 'default' // [신규] 아지트 배경
    });
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isEvolving, setIsEvolving] = useState(false); // [추가] 진화 애니메이션 상태
    const [isFlashing, setIsFlashing] = useState(false); // [추가] 박스 내 섬광 상태
    const [isDragonModalOpen, setIsDragonModalOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // [신규] 드래곤 아지트 배경 목록
    const HIDEOUT_BACKGROUNDS = {
        default: { id: 'default', name: '기본 초원', color: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)', border: '#FFF176', textColor: '#5D4037', subColor: '#8D6E63', glow: 'rgba(255, 241, 118, 0.3)' },
        volcano: { id: 'volcano', name: '🌋 화산 동굴', color: 'linear-gradient(135deg, #4A0000 0%, #8B0000 100%)', border: '#FF5722', textColor: 'white', subColor: '#FFCCBC', price: 300, glow: 'rgba(255, 87, 34, 0.4)' },
        sky: { id: 'sky', name: '☁️ 천상 전당', color: 'linear-gradient(135deg, #B3E5FC 0%, #E1F5FE 100%)', border: '#4FC3F7', textColor: '#01579B', subColor: '#0288D1', price: 500, glow: 'rgba(79, 195, 247, 0.3)' },
        crystal: { id: 'crystal', name: '💎 수정 궁전', color: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)', border: '#BA68C8', textColor: 'white', subColor: '#E1BEE7', price: 1000, glow: 'rgba(186, 104, 200, 0.4)' },
        storm: { id: 'storm', name: '🌩️ 번개 폭풍', color: 'linear-gradient(135deg, #1A237E 0%, #000000 100%)', border: '#7986CB', textColor: 'white', subColor: '#C5CAE9', price: 700, glow: 'rgba(121, 134, 203, 0.5)' },
        galaxy: { id: 'galaxy', name: '🌌 달빛 은하수', color: 'linear-gradient(135deg, #0D47A1 0%, #000000 100%)', border: '#90CAF9', textColor: 'white', subColor: '#E3F2FD', price: 500, glow: 'rgba(144, 202, 249, 0.4)' }
    };

    useEffect(() => {
        if (studentSession?.id) {
            loadInitialData();
            checkActivity();
            fetchStats();

            // [알림 시스템 단일화] 필터 없이 모든 로그를 수신하여 클라이언트에서 정밀 필터링 ⚡🔔
            const notificationChannel = supabase
                .channel(`student_realtime_v3_${studentSession.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'point_logs'
                    },
                    (payload) => {
                        const newLog = payload.new;

                        // 1. 내 알림인지 즉시 확인 (UUID 비교)
                        if (newLog.student_id !== studentSession.id) return;

                        console.log('⚡ 실시간 알림 포착!', newLog);

                        // 2. 즉시 포인트 정보 갱신 (화면 상단 숫자)
                        fetchMyPoints().catch(err => console.error('포인트 갱신 실패:', err));

                        // 3. 다시 쓰기 여부 판별
                        const isRewrite = newLog.reason?.includes('다시 쓰기') || newLog.reason?.includes('♻️');

                        // 4. 소식함 리스트 즉시 강제 삽입 (새로고침 없이)
                        setFeedbacks(prev => {
                            // 중복 방지
                            if (prev.some(f => f.id === newLog.id)) return prev;

                            const formattedNotif = {
                                ...newLog,
                                type: isRewrite ? 'rewrite' : 'point', // 타입 확실히 지정
                                content: newLog.reason,
                                title: isRewrite ? '선생님의 보완 요청' : '포인트 선물 🎁',
                                created_at: newLog.created_at || new Date().toISOString()
                            };
                            return [formattedNotif, ...prev];
                        });

                        // 5. 활동 배지 활성화 및 상태 동기화
                        setHasActivity(true);
                        if (isRewrite) {
                            checkActivity().catch(err => console.error('활동 상태 갱신 실패:', err));
                        }
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(notificationChannel);
            };
        }
    }, [studentSession?.id]);

    const loadInitialData = async () => {
        try {
            await fetchMyPoints();
        } catch (err) {
            console.error('초기 데이터 로드 실패:', err);
        } finally {
            // 어떤 경우에도 로딩은 해제
            setIsLoading(false);
            checkPetDegeneration();
        }
    };

    // [추가] 드래곤 퇴화 로직 (30일 미접속/미관리 시)
    const checkPetDegeneration = () => {
        const lastFedDate = new Date(petData.lastFed);
        const today = new Date();
        const diffTime = Math.abs(today - lastFedDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 30 && petData.level > 1) {
            setPetData(prev => ({
                ...prev,
                level: Math.max(1, prev.level - 1),
                exp: 0,
                lastFed: today.toISOString().split('T')[0]
            }));
            alert('드래곤을 너무 오래 돌보지 않아 레벨이 떨어졌어요! 다시 열심히 키워봐요! 😢');
        }
    };

    // [추가] 단계별 드래곤 정보 (이미지 기반)
    const getDragonStage = (level) => {
        const basePath = '/assets/dragons';
        if (level >= 5) return { name: '전설의 수호신룡', image: `${basePath}/dragon_stage_5.png`, isPlaceholder: false };
        if (level === 4) return { name: '불을 내뿜는 성장한 용', image: `${basePath}/dragon_stage_4.png`, isPlaceholder: false };
        if (level === 3) return { name: '푸른 빛의 어린 용', image: `${basePath}/dragon_stage_3.png`, isPlaceholder: false };
        if (level === 2) return { name: '갓 태어난 용', image: `${basePath}/dragon_stage_2.png`, isPlaceholder: false };
        return { name: '신비로운 알', image: `${basePath}/dragon_stage_1.png`, isPlaceholder: false };
    };

    const dragonInfo = getDragonStage(petData.level);

    // [추가] 먹이 주기 기능
    const handleFeed = async () => {
        // [점검] 로딩 중이거나 포인트 정보가 유효하지 않으면 실행 방지
        if (isLoading) {
            alert('데이터를 불러오는 중입니다. 잠시만 기다려 주세요! ⏳');
            return;
        }

        // [안전장치] 포인트 정보가 undefined거나 null이면 중단
        if (points === undefined || points === null) return;

        if (points < 50) {
            alert('포인트가 부족해요! 글을 써서 포인트를 모아보세요. ✍️');
            return;
        }

        const newPoints = points - 50;
        if (newPoints < 0) {
            alert('작업을 완료할 수 없습니다. 포인트가 유효하지 않습니다.');
            return;
        }
        let newExp = petData.exp + 20;
        let newLevel = petData.level;

        if (newExp >= 100) {
            if (newLevel < 5) {
                newLevel += 1;
                newExp = newExp % 100;
            } else {
                newExp = 100;
            }
        }

        const today = new Date().toISOString().split('T')[0];

        const isLevelUp = newLevel > petData.level;

        try {
            // [진화 연출 시작]
            if (isLevelUp) {
                setIsEvolving(true);
                // 진화 사운드 (구조 제공)
                playEvolutionSound();
            }

            const { error } = await supabase
                .from('students')
                .update({
                    total_points: newPoints,
                    pet_data: {
                        ...petData,
                        level: newLevel,
                        exp: newExp,
                        lastFed: today
                    }
                })
                .eq('id', studentSession.id);

            if (error) throw error;

            if (isLevelUp) {
                // [연출 1단계] 진동 및 빛 새어 나옴 (1.5초)
                setTimeout(() => {
                    // [연출 2단계] 섬광 및 이미지 교체
                    setIsFlashing(true);

                    setPetData(prev => ({
                        ...prev,
                        level: newLevel,
                        exp: newExp,
                        lastFed: today
                    }));

                    // 파티클 폭발 효과
                    confetti({
                        particleCount: 150,
                        spread: 70,
                        origin: { y: 0.6 },
                        colors: ['#FFD700', '#FFA500', '#FF4500']
                    });

                    // [연출 3단계] 섬광 해제 및 종료
                    setTimeout(() => {
                        setIsFlashing(false);
                        setIsEvolving(false);
                    }, 500);
                }, 1500);

                // 포인트는 즉시 반영
                setPoints(newPoints);
            } else {
                // 일반 업데이트
                setPoints(newPoints);
                setPetData(prev => ({
                    ...prev,
                    level: newLevel,
                    exp: newExp,
                    lastFed: today
                }));
            }
        } catch (err) {
            console.error('포인트 업데이트 실패:', err.message);
            alert('포인트 사용에 실패했습니다. 다시 시도해 주세요!');
        }
    };

    // [신규] 아지트 배경 구매/적용 로직
    const handleBuyItem = async (item) => {
        if (isLoading) {
            alert('데이터를 불러오는 중입니다. 잠시만 기다려 주세요! ⏳');
            return;
        }

        if (points === undefined || points === null) return;

        if (points < item.price) {
            alert('포인트가 부족해요! 꾸준히 글을 써 보세요. ✍️');
            return;
        }

        if (petData.ownedItems.includes(item.id)) return;

        const newPoints = points - item.price;
        const newOwned = [...petData.ownedItems, item.id];
        const newPetData = { ...petData, ownedItems: newOwned };

        try {
            const { error } = await supabase
                .from('students')
                .update({
                    total_points: newPoints,
                    pet_data: newPetData
                })
                .eq('id', studentSession.id);

            if (error) throw error;

            setPoints(newPoints);
            setPetData(newPetData);
            alert(`[${item.name}] 구매 성공! 리스트에서 '적용하기'를 눌러보세요. ✨`);
        } catch (err) {
            console.error('배경 구매 실패:', err.message);
        }
    };

    const handleToggleEquip = async (bgId) => {
        if (isLoading) return;
        const newPetData = { ...petData, background: bgId };

        try {
            const { error } = await supabase
                .from('students')
                .update({ pet_data: newPetData })
                .eq('id', studentSession.id);

            if (error) throw error;
            setPetData(newPetData);
        } catch (err) {
            console.error('배경 변경 실패:', err.message);
        }
    };

    // [신규] 진화 효과음 플레이어 (샘플 구조)
    const playEvolutionSound = () => {
        // const audio = new Audio('/assets/sounds/evolution_success.mp3');
        // audio.play().catch(e => console.log('사운드 재생 실패:', e));
        console.log('🎵 진화 사운드 재생: 두구두구두구~ 짠!');
    };

    // [추가] 마지막 식사 후 경과 일수 계산
    const getDaysSinceLastFed = () => {
        const lastFedDate = new Date(petData.lastFed);
        const today = new Date();
        const diffTime = Math.abs(today - lastFedDate);
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    const daysSinceLastFed = getDaysSinceLastFed();

    // [수정] 누적 글자 수 기준 5단계 레벨 시스템
    const getLevelInfo = (totalChars) => {
        if (totalChars >= 14001) return { level: 5, name: '전설의 작가', emoji: '✨', next: null };
        if (totalChars >= 8401) return { level: 4, name: '대문호', emoji: '👑', next: 14001 };
        if (totalChars >= 4201) return { level: 3, name: '숙련 작가', emoji: '🌳', next: 8401 };
        if (totalChars >= 1401) return { level: 2, name: '초보 작가', emoji: '🌿', next: 4201 };
        return { level: 1, name: '새싹 작가', emoji: '🌱', next: 1401 };
    };

    const fetchStats = async () => {
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select('char_count, created_at, is_submitted')
                .eq('student_id', studentSession.id);

            if (error) throw error;

            if (data) {
                const totalChars = data.reduce((sum, post) => sum + (post.char_count || 0), 0);
                const completedMissions = data.filter(p => p.is_submitted).length;

                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                const monthlyPosts = data.filter(p => {
                    const postDate = new Date(p.created_at);
                    return postDate.getMonth() === currentMonth && postDate.getFullYear() === currentYear;
                }).length;

                setStats({ totalChars, completedMissions, monthlyPosts });
                setLevelInfo(getLevelInfo(totalChars));
            }
        } catch (err) {
            console.error('글쓰기 통계 로드 실패:', err.message);
        }
    };

    const fetchMyPoints = async () => {
        try {
            const { data, error } = await supabase
                .from('students')
                .select('total_points, pet_data')
                .eq('id', studentSession.id)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                // [안전장치] DB에서 가져온 값이 유효할 때만 상태 업데이트
                // 만약 DB에서 가져온 값이 null이나 undefined면 기존 값을 유지하거나 에러 처리
                if (data.total_points !== null && data.total_points !== undefined) {
                    setPoints(data.total_points);
                }

                if (data.pet_data) {
                    setPetData(prev => ({
                        ...prev,
                        ...data.pet_data,
                        ownedItems: data.pet_data.ownedItems || prev.ownedItems,
                        equippedItems: data.pet_data.equippedItems || prev.equippedItems
                    }));
                }
            }
        } catch (err) {
            console.error('포인트 로드 실패:', err.message);
            alert('데이터를 불러오는 중 문제가 발생했습니다. 페이지를 다시 불러와주세요! 🔄');
            // 에러 시 isLoading을 false로 바꾸지 않고 멈춰버리거나, 알림 후 유지
        } finally {
            setIsLoading(false);
        }
    };

    const checkActivity = async () => {
        try {
            if (!studentSession?.id) return;

            // 내가 쓴 글 목록 가져오기
            const { data: myPosts } = await supabase
                .from('student_posts')
                .select('id')
                .eq('student_id', studentSession.id);

            if (!myPosts || myPosts.length === 0) return;
            const postIds = myPosts.map(p => p.id);

            // 2. 친구들의 반응(좋아요) 확인
            const { count: reactionCount } = await supabase
                .from('post_reactions')
                .select('*', { count: 'exact', head: true })
                .in('post_id', postIds)
                .neq('student_id', studentSession.id);

            // 3. 친구들의 댓글 확인
            const { count: commentCount } = await supabase
                .from('post_comments')
                .select('*', { count: 'exact', head: true })
                .in('post_id', postIds)
                .neq('student_id', studentSession.id);

            // 3. 선생님의 다시 쓰기 요청 확인
            const { count: returnedCountVal } = await supabase
                .from('student_posts')
                .select('*', { count: 'exact', head: true })
                .eq('student_id', studentSession.id)
                .eq('is_returned', true);

            setReturnedCount(returnedCountVal || 0);
            setHasActivity((reactionCount || 0) + (commentCount || 0) + (returnedCountVal || 0) > 0);
        } catch (err) {
            console.error('활동 확인 실패:', err.message);
        }
    };

    const handleDirectRewriteGo = async () => {
        try {
            // 가장 최근의 다시 쓰기 요청 글 하나를 가져옴
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, mission_id')
                .eq('student_id', studentSession.id)
                .eq('is_returned', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                onNavigate('writing', {
                    missionId: data.mission_id,
                    postId: data.id,
                    mode: 'edit'
                });
            }
        } catch (err) {
            console.error('다시 쓰기 페이지 이동 실패:', err.message);
            // 에러 시 일반 피드백 모달이라도 열어줌
            openFeedback();
        }
    };

    const fetchFeedbacks = async () => {
        setLoadingFeedback(true);
        try {
            const { data: myPosts } = await supabase
                .from('student_posts')
                .select('id, title, is_returned, ai_feedback, created_at, mission_id')
                .eq('student_id', studentSession.id);

            if (!myPosts || myPosts.length === 0) {
                setFeedbacks([]);
                return;
            }
            const postIds = myPosts.map(p => p.id);

            // 1. 다시쓰기 요청 가져오기
            const returnedItems = myPosts
                .filter(p => p.is_returned === true)
                .map(p => ({
                    id: `return-${p.id}`,
                    post_id: p.id,
                    mission_id: p.mission_id,
                    type: 'rewrite',
                    created_at: p.created_at,
                    student_posts: { title: p.title, id: p.id },
                    content: p.ai_feedback || '선생님의 자세한 피드백을 확인하고 글을 다시 써주세요!'
                }));

            // 2. 반응 가져오기
            const { data: reactions } = await supabase
                .from('post_reactions')
                .select('*, students:student_id(name), student_posts(title, id)')
                .in('post_id', postIds)
                .neq('student_id', studentSession.id);

            // 3. 댓글 가져오기
            const { data: comments } = await supabase
                .from('post_comments')
                .select('*, students:student_id(name), student_posts(title, id)')
                .in('post_id', postIds)
                .neq('student_id', studentSession.id);

            const { data: pointLogs, error: pointError } = await supabase
                .from('point_logs')
                .select('*, student_posts(title)')
                .eq('student_id', studentSession.id)
                .order('created_at', { ascending: false })
                .limit(20);

            if (pointError) {
                console.warn('[Dashboard] 포인트 로그 로드 실패 (FK 제약조건 확인 필요):', pointError.message);
            }

            const combined = [
                ...returnedItems,
                ...(reactions || []).map(r => ({ ...r, type: 'reaction' })),
                ...(comments || []).map(c => ({ ...c, type: 'comment' })),
                ...(pointLogs || [])
                    .filter(log => {
                        // '다시 쓰기' 관련 로그는 중복 방지를 위해 제외 (위에서 별도로 처리함)
                        const reason = log.reason || '';
                        return !reason.includes('다시 쓰기') && !reason.includes('♻️');
                    })
                    .map(log => ({
                        ...log,
                        type: 'point',
                        title: log.student_posts?.title || '포인트 소식',
                        content: log.reason || '포인트가 변동되었습니다.'
                    }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            console.log('[Dashboard] 피드백 데이터 취합 완료:', combined);
            setFeedbacks(combined);
        } catch (err) {
            console.error('피드백 로드 실패:', err.message);
        } finally {
            setLoadingFeedback(false);
        }
    };

    const openFeedback = (tabIndex = 0) => {
        setFeedbackInitialTab(tabIndex);
        setShowFeedback(true);
        fetchFeedbacks();
    };

    return (
        <>
            <StudentGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
            <Card style={{ maxWidth: '600px', background: '#FFFDF7', border: '2px solid #FFE082' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{
                            background: '#FFE082',
                            color: '#795548',
                            padding: '6px 16px',
                            borderRadius: '20px',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}>
                            🎒 {studentSession.className || '우리 반'} 친구
                        </div>
                        {hasActivity && (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => openFeedback(0)}
                                style={{
                                    background: '#FF5252',
                                    color: 'white',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: '20px',
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 10px rgba(255, 82, 82, 0.3)'
                                }}
                            >
                                🔔 내 글 소식
                            </motion.button>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <motion.button
                            whileHover={{ scale: 1.1, rotate: 10 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setIsGuideOpen(true)}
                            style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '50%',
                                background: '#FFF9C4',
                                border: '3px solid #FBC02D',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                fontSize: '1.2rem',
                                cursor: 'pointer',
                                boxShadow: '0 4px 0 #F9A825',
                                transition: 'all 0.2s'
                            }}
                            title="사용법 가이드"
                        >
                            ❓
                        </motion.button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onLogout}
                            style={{
                                color: '#8D6E63',
                                fontWeight: 'bold',
                                background: '#EFEBE9',
                                borderRadius: '15px',
                                padding: '6px 12px'
                            }}
                        >
                            로그아웃 🚪
                        </Button>
                    </div>
                </div>


                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '5px' }}>🌟</div>
                    <h1 style={{ fontSize: '2rem', color: '#5D4037', marginBottom: '0.4rem' }}>
                        안녕, <span style={{ color: '#FBC02D' }}>{studentSession.name}</span>!
                    </h1>
                    <p style={{ color: '#8D6E63', fontSize: '1rem' }}>벌써 이만큼이나 성장했어! 🚀</p>
                </div>

                {/* 선생님의 다시 쓰기 요청 배너 (있을 때만 표시) */}
                <AnimatePresence>
                    {returnedCount > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            style={{
                                background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
                                padding: '16px 20px',
                                borderRadius: '24px',
                                border: '2px solid #FFB74D',
                                marginBottom: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '15px',
                                cursor: 'pointer',
                                boxShadow: '0 8px 16px rgba(255, 183, 77, 0.2)',
                                textAlign: 'left'
                            }}
                            onClick={handleDirectRewriteGo}
                        >
                            <span style={{ fontSize: '2.5rem' }}>♻️</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#E65100', marginBottom: '2px' }}>선생님의 다시 쓰기 요청이 있어요!</div>
                                <div style={{ fontSize: '0.85rem', color: '#F57C00', fontWeight: 'bold' }}>지금 바로 확인하고 완벽한 글을 완성해봐요! ✨</div>
                            </div>
                            <div style={{
                                width: '36px', height: '36px', background: '#FFB74D',
                                borderRadius: '50%', display: 'flex', justifyContent: 'center',
                                alignItems: 'center', color: 'white', fontWeight: 'bold'
                            }}>
                                {returnedCount}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>



                {/* [멀티모달] 드래곤 아지트 */}
                <AnimatePresence>
                    {isDragonModalOpen && (
                        <div style={{
                            position: 'fixed',
                            inset: 0,
                            width: '100%',
                            height: '100%',
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(8px)',
                            zIndex: 2000,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: isMobile ? 'flex-end' : 'center',
                        }} onClick={() => setIsDragonModalOpen(false)}>
                            <motion.div
                                initial={{ y: isMobile ? '100%' : 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: isMobile ? '100%' : 50, opacity: 0 }}
                                onClick={e => e.stopPropagation()}
                                style={{
                                    background: '#FFFFFF',
                                    borderRadius: isMobile ? '32px 32px 0 0' : '32px',
                                    width: '100%', maxWidth: '600px',
                                    padding: '32px',
                                    border: 'none',
                                    boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                                    position: 'relative',
                                    maxHeight: isMobile ? '90vh' : 'auto',
                                    overflowY: 'auto',
                                    transition: 'all 0.5s ease'
                                }}
                            >
                                {/* [제거] 기존 전역 섬광 레이어 */}
                                <button
                                    onClick={() => setIsDragonModalOpen(false)}
                                    style={{
                                        position: 'absolute', top: '20px', right: '20px',
                                        background: 'rgba(255,255,255,0.7)', border: 'none',
                                        width: '36px', height: '36px', borderRadius: '50%',
                                        fontSize: '1.2rem', cursor: 'pointer', zIndex: 10
                                    }}
                                >
                                    ✕
                                </button>

                                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                    <h2 style={{ margin: 0, color: '#5D4037', fontWeight: '900', fontSize: '1.5rem' }}>🐉 드래곤 아지트</h2>
                                    <p style={{ margin: '4px 0 0 0', color: '#8D6E63', fontSize: '0.9rem' }}>나의 소중한 드래곤 파트너와 함께하는 공간</p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'center', gap: '24px', background: '#F9F9F9', padding: '24px', borderRadius: '24px', border: '1px solid #EEE' }}>
                                        <div style={{
                                            position: 'relative',
                                            width: '280px', // 영역 확대
                                            height: '280px',
                                            background: HIDEOUT_BACKGROUNDS[petData.background]?.color || HIDEOUT_BACKGROUNDS.default.color,
                                            borderRadius: '24px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            border: petData.level >= 5 ? '4px solid #FFD700' : `2px solid ${HIDEOUT_BACKGROUNDS[petData.background]?.border || '#DDD'}`,
                                            boxShadow: 'none' // 내부 그림자 제거하여 투명도 명확히 함
                                        }}>
                                            {/* 후경 장식 (드래곤 뒤쪽) */}
                                            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.2) 100%)', pointerEvents: 'none' }} />

                                            {petData.background === 'volcano' && (
                                                <AnimatePresence>
                                                    {[...Array(8)].map((_, i) => (
                                                        <motion.span
                                                            key={`fire-${i}`}
                                                            initial={{ y: 20, opacity: 0, scale: 0.5 }}
                                                            animate={{ y: -80, opacity: [0, 0.8, 0], scale: [0.8, 1.4, 0.6] }}
                                                            transition={{ repeat: Infinity, duration: 1.5 + i * 0.2, delay: i * 0.1 }}
                                                            style={{ position: 'absolute', bottom: '10%', left: `${5 + i * 12}%`, fontSize: '2rem', filter: 'drop-shadow(0 0 8px #FF5722)', pointerEvents: 'none', zIndex: 0 }}
                                                        >
                                                            🔥
                                                        </motion.span>
                                                    ))}
                                                </AnimatePresence>
                                            )}
                                            {petData.background === 'sky' && (
                                                <AnimatePresence>
                                                    {[...Array(4)].map((_, i) => (
                                                        <motion.span
                                                            key={`cloud-${i}`}
                                                            animate={{ x: i % 2 === 0 ? [0, 20, 0] : [0, -20, 0] }}
                                                            transition={{ repeat: Infinity, duration: 4 + i, ease: "easeInOut" }}
                                                            style={{ position: 'absolute', top: `${10 + i * 20}%`, left: `${10 + i * 25}%`, fontSize: '2.5rem', opacity: 0.6, pointerEvents: 'none' }}
                                                        >
                                                            ☁️
                                                        </motion.span>
                                                    ))}
                                                </AnimatePresence>
                                            )}
                                            {petData.background === 'crystal' && (
                                                <AnimatePresence>
                                                    {[...Array(12)].map((_, i) => (
                                                        <motion.span
                                                            key={`gem-${i}`}
                                                            animate={{
                                                                scale: [0.5, 1.2, 0.5],
                                                                opacity: [0.3, 1, 0.3],
                                                                filter: ['brightness(1)', 'brightness(1.5)', 'brightness(1)']
                                                            }}
                                                            transition={{ repeat: Infinity, duration: 3 + Math.random() * 2, delay: Math.random() * 2 }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${Math.random() * 90}%`,
                                                                left: `${Math.random() * 90}%`,
                                                                fontSize: i % 2 === 0 ? '1.5rem' : '1rem',
                                                                color: '#E1BEE7',
                                                                pointerEvents: 'none',
                                                                textShadow: '0 0 10px rgba(255,255,255,0.8)'
                                                            }}
                                                        >
                                                            {i % 3 === 0 ? '💎' : '✨'}
                                                        </motion.span>
                                                    ))}
                                                </AnimatePresence>
                                            )}
                                            {petData.background === 'storm' && (
                                                <>
                                                    <motion.div
                                                        animate={{ opacity: [0, 0, 0.3, 0, 0.5, 0, 0, 0] }}
                                                        transition={{ repeat: Infinity, duration: 5, times: [0, 0.7, 0.72, 0.74, 0.76, 0.78, 0.8, 1] }}
                                                        style={{ position: 'absolute', inset: 0, background: 'white', pointerEvents: 'none', zIndex: 0 }}
                                                    />
                                                    <div style={{ position: 'absolute', inset: 0, opacity: 0.3, background: 'url("https://www.transparenttextures.com/patterns/carbon-fibre.png")', pointerEvents: 'none' }} />
                                                    {[...Array(3)].map((_, i) => (
                                                        <motion.span
                                                            key={`bolt-${i}`}
                                                            animate={{ opacity: [0, 1, 0], y: [0, 10, 0] }}
                                                            transition={{ repeat: Infinity, duration: 5, delay: 3.5 + (i * 0.1) }}
                                                            style={{ position: 'absolute', top: '15%', left: `${20 + i * 30}%`, fontSize: '2rem', filter: 'drop-shadow(0 0 15px #7986CB)', pointerEvents: 'none', zIndex: 0 }}
                                                        >
                                                            ⚡
                                                        </motion.span>
                                                    ))}
                                                </>
                                            )}
                                            {petData.background === 'galaxy' && (
                                                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                                                    {[...Array(20)].map((_, i) => (
                                                        <motion.div
                                                            key={`star-${i}`}
                                                            animate={{ opacity: [0.2, 1, 0.2], scale: [1, 1.2, 1] }}
                                                            transition={{ repeat: Infinity, duration: 2 + Math.random() * 3, delay: Math.random() * 5 }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${Math.random() * 100}%`,
                                                                left: `${Math.random() * 100}%`,
                                                                width: '2px',
                                                                height: '2px',
                                                                background: 'white',
                                                                borderRadius: '50%',
                                                                boxShadow: '0 0 5px white'
                                                            }}
                                                        />
                                                    ))}
                                                    <motion.span
                                                        animate={{ y: [0, -5, 0], opacity: [0.6, 0.9, 0.6] }}
                                                        transition={{ repeat: Infinity, duration: 4 }}
                                                        style={{ position: 'absolute', top: '10%', right: '15%', fontSize: '2.5rem', filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.4))' }}
                                                    >
                                                        🌙
                                                    </motion.span>
                                                </div>
                                            )}
                                            {/* 레벨 5 전용 황금 파티클 효과 */}
                                            {petData.level >= 5 && (
                                                <AnimatePresence>
                                                    {[...Array(10)].map((_, i) => (
                                                        <motion.span
                                                            key={`gold-${i}`}
                                                            animate={{
                                                                y: [0, -50, 0],
                                                                opacity: [0, 1, 0],
                                                                rotate: [0, 180, 360]
                                                            }}
                                                            transition={{
                                                                repeat: Infinity,
                                                                duration: 2 + Math.random() * 2,
                                                                delay: Math.random() * 2
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${Math.random() * 100}%`,
                                                                left: `${Math.random() * 100}%`,
                                                                fontSize: '1rem',
                                                                color: '#FFD700',
                                                                pointerEvents: 'none',
                                                                zIndex: 0
                                                            }}
                                                        >
                                                            ✨
                                                        </motion.span>
                                                    ))}
                                                </AnimatePresence>
                                            )}
                                            {/* 바닥 그림자 및 효과 */}
                                            <motion.div
                                                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                                                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                                style={{
                                                    position: 'absolute',
                                                    bottom: '20%',
                                                    width: '140px',
                                                    height: '30px',
                                                    background: 'rgba(0,0,0,0.2)',
                                                    borderRadius: '50%',
                                                    filter: 'blur(8px)',
                                                    zIndex: 0
                                                }}
                                            />

                                            {/* 진화 섬광 효과 레이어 (박스 내부) */}
                                            <AnimatePresence>
                                                {isFlashing && (
                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: [0, 1, 0] }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ duration: 0.3 }}
                                                        style={{
                                                            position: 'absolute',
                                                            inset: 0,
                                                            background: 'white',
                                                            zIndex: 50,
                                                            pointerEvents: 'none'
                                                        }}
                                                    />
                                                )}
                                            </AnimatePresence>

                                            {/* 드래곤 이미지 본체 */}
                                            <motion.div
                                                key={petData.level}
                                                animate={isEvolving ? {
                                                    x: [-3, 3, -3, 3, 0],
                                                    filter: ["brightness(1)", "brightness(1.8)", "brightness(1)"]
                                                } : {
                                                    scale: [0.8, 1.15, 1], // 등장 스프링 효과
                                                    y: [0, -12, 0]
                                                }}
                                                transition={isEvolving ? {
                                                    x: { repeat: Infinity, duration: 0.05 },
                                                    filter: { repeat: Infinity, duration: 0.5 }
                                                } : {
                                                    scale: { type: "spring", stiffness: 300, damping: 12 },
                                                    y: { repeat: Infinity, duration: 3, ease: "easeInOut" }
                                                }}
                                                style={{
                                                    width: (petData.level === 3 || petData.level === 4) ? '264px' : '220px', // 3, 4단계 20% 확대
                                                    height: (petData.level === 3 || petData.level === 4) ? '264px' : '220px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    position: 'relative',
                                                    zIndex: 1,
                                                    cursor: 'pointer',
                                                    background: 'transparent',
                                                    backgroundColor: 'transparent',
                                                    border: 'none',
                                                    boxShadow: 'none'
                                                }}
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                {dragonInfo.isPlaceholder ? (
                                                    <div style={{ color: 'white', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>
                                                        진화 중...<br />(이미지 대기)
                                                    </div>
                                                ) : (
                                                    <img
                                                        src={dragonInfo.image}
                                                        alt={dragonInfo.name}
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'contain',
                                                            background: 'transparent',
                                                            backgroundColor: 'transparent',
                                                            filter: `drop-shadow(0 10px 20px ${HIDEOUT_BACKGROUNDS[petData.background]?.glow || 'rgba(0,0,0,0.3)'}) ${petData.level >= 5 ? 'drop-shadow(0 0 15px rgba(255,215,0,0.7))' : ''}`
                                                        }}
                                                    />
                                                )}
                                            </motion.div>
                                            {petData.level > 1 && (
                                                <motion.span
                                                    animate={{ opacity: [0, 1, 0] }}
                                                    transition={{ repeat: Infinity, duration: 2 }}
                                                    style={{ position: 'absolute', top: -10, right: -10, fontSize: '1.5rem', zIndex: 5 }}
                                                >
                                                    ✨
                                                </motion.span>
                                            )}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px' }}>
                                                <div>
                                                    <span style={{ fontSize: '0.85rem', color: '#FBC02D', fontWeight: 'bold', display: 'block' }}>{dragonInfo.name}</span>
                                                    <span style={{ fontSize: '1.4rem', fontWeight: '900', color: '#5D4037' }}>{petData.name}</span>
                                                </div>
                                                <span style={{ fontSize: '1rem', color: '#8D6E63', fontWeight: 'bold' }}>Lv.{petData.level}</span>
                                            </div>
                                            {/* 드래곤 경험치 바 */}
                                            <div style={{ height: '14px', background: 'rgba(0,0,0,0.05)', borderRadius: '7px', overflow: 'hidden' }}>
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${petData.exp}%` }}
                                                    style={{
                                                        height: '100%',
                                                        background: 'linear-gradient(90deg, #FFB300, #FBC02D)',
                                                        borderRadius: '7px'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                                                <span style={{ fontSize: '0.8rem', color: '#8D6E63' }}>
                                                    식사 후 {daysSinceLastFed}일 경과
                                                </span>
                                                <span style={{ fontSize: '0.8rem', color: '#FBC02D', fontWeight: 'bold' }}>
                                                    {petData.level < 5 ? `${100 - petData.exp}% 남음` : '최고 단계! 🌈'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ background: '#FFFDE7', padding: '16px', borderRadius: '18px', border: '1px solid #FFF9C4' }}>
                                            <div style={{ fontSize: '0.9rem', color: '#795548', lineHeight: '1.5' }}>
                                                <span style={{ fontWeight: 'bold' }}>💡 드래곤 돌보기 팁</span><br />
                                                글을 써서 모은 포인트로 맛있는 먹이를 줄 수 있어요. 30일 동안 돌보지 않으면 드래곤이 지쳐서 레벨이 내려갈 수 있으니 주의하세요!
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={handleFeed}
                                                style={{
                                                    flex: 1,
                                                    background: '#FF8A65',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '16px',
                                                    borderRadius: '20px',
                                                    fontSize: '1rem',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 6px 0 #E64A19',
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    gap: '10px'
                                                }}
                                            >
                                                🍖 먹이 주기 (50P)
                                            </motion.button>
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => setIsShopOpen(true)}
                                                style={{
                                                    flex: 1,
                                                    background: '#3498DB',
                                                    color: 'white',
                                                    border: 'none',
                                                    padding: '16px',
                                                    borderRadius: '20px',
                                                    fontSize: '1rem',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    boxShadow: '0 6px 0 #2980B9',
                                                    display: 'flex',
                                                    justifyContent: 'center',
                                                    alignItems: 'center',
                                                    gap: '10px'
                                                }}
                                            >
                                                🛍️ 상점/꾸미기
                                            </motion.button>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '40px' }}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        style={{ background: 'white', padding: '15px 10px', borderRadius: '20px', border: '1px solid #FFE082', textAlign: 'center' }}
                    >
                        <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>📝</div>
                        <div style={{ fontSize: '0.75rem', color: '#8D6E63', fontWeight: 'bold' }}>쓴 글자 수</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#5D4037' }}>{stats.totalChars.toLocaleString()}자</div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        style={{ background: 'white', padding: '15px 10px', borderRadius: '20px', border: '1px solid #FFE082', textAlign: 'center' }}
                    >
                        <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>🚀</div>
                        <div style={{ fontSize: '0.75rem', color: '#8D6E63', fontWeight: 'bold' }}>완료 미션</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#5D4037' }}>{stats.completedMissions}개</div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        style={{ background: 'white', padding: '15px 10px', borderRadius: '20px', border: '1px solid #FFE082', textAlign: 'center' }}
                    >
                        <div style={{ fontSize: '1.5rem', marginBottom: '5px' }}>📅</div>
                        <div style={{ fontSize: '0.75rem', color: '#8D6E63', fontWeight: 'bold' }}>이달의 활동</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#5D4037' }}>{stats.monthlyPosts}회</div>
                    </motion.div>
                </div>

                {/* 포인트 및 레벨 표시 영역 */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    style={{
                        background: 'linear-gradient(135deg, #FFFDF7 0%, #FFFFFF 100%)',
                        padding: '20px 24px',
                        borderRadius: '24px',
                        border: '1px solid #FFE082',
                        marginBottom: '1.5rem',
                        boxShadow: '0 4px 15px rgba(255, 213, 79, 0.1)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                >
                    {isLoading && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(255,255,255,0.8)', zIndex: 10,
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            fontSize: '0.85rem', color: '#FBC02D', fontWeight: 'bold'
                        }}>
                            로딩 중... ✨
                        </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '0.85rem', color: '#8D6E63', fontWeight: 'bold' }}>보유 포인트 ✨</div>
                            <motion.div
                                key={points}
                                initial={{ y: 5, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                style={{
                                    fontSize: '2.2rem',
                                    fontWeight: '900',
                                    color: '#FBC02D',
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '4px'
                                }}
                            >
                                {points.toLocaleString()}
                                <span style={{ fontSize: '1rem', color: '#8D6E63', fontWeight: 'bold' }}>점</span>
                            </motion.div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.85rem', color: '#8D6E63', fontWeight: 'bold', marginBottom: '4px' }}>
                                {levelInfo.emoji} {levelInfo.name}
                            </div>
                            <div style={{
                                background: '#FDFCF0',
                                padding: '4px 10px',
                                borderRadius: '10px',
                                fontSize: '0.75rem',
                                color: '#FBC02D',
                                fontWeight: 'bold',
                                border: '1px solid #FFF9C4',
                                display: 'inline-block'
                            }}>
                                LV. {levelInfo.level}
                            </div>
                        </div>
                    </div>

                    {/* 프로그레스 바 영역 */}
                    <div style={{ padding: '0 2px' }}>
                        <div style={{ height: '8px', background: '#F1F3F5', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${levelInfo.next ? Math.min(100, (stats.totalChars / levelInfo.next) * 100) : 100}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                style={{
                                    height: '100%',
                                    background: 'linear-gradient(90deg, #FBC02D, #FFD54F)',
                                    borderRadius: '4px'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                            {levelInfo.next && (
                                <span style={{ fontSize: '0.7rem', color: '#ADB5BD', fontWeight: 'bold' }}>
                                    다음 목표까지 {Math.max(0, levelInfo.next - stats.totalChars).toLocaleString()}자 남음
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* 주요 활동 메뉴 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            background: 'white', padding: '24px', borderRadius: '24px', border: '2px solid #FFE082',
                            textAlign: 'center', cursor: 'pointer', transition: 'box-shadow 0.2s', position: 'relative',
                            boxShadow: '0 4px 6px rgba(255, 224, 130, 0.2)'
                        }}
                        onClick={() => onNavigate('mission_list')}
                    >
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📝</div>
                        <h3 style={{ margin: 0, color: '#5D4037' }}>글쓰기 미션</h3>
                        <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>선생님의 주제 확인</p>
                    </motion.div>

                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        style={{
                            background: 'white', padding: '24px', borderRadius: '24px', border: '2px solid #FFE082',
                            textAlign: 'center', cursor: 'pointer', transition: 'box-shadow 0.2s', position: 'relative',
                            boxShadow: '0 4px 6px rgba(255, 224, 130, 0.2)'
                        }}
                        onClick={() => onNavigate('friends_hideout')}
                    >
                        {hasActivity && (
                            <div style={{
                                position: 'absolute', top: '15px', right: '15px',
                                width: '12px', height: '12px', background: '#FF5252',
                                borderRadius: '50%', border: '2px solid white',
                                boxShadow: '0 0 10px rgba(255, 82, 82, 0.5)'
                            }} />
                        )}
                        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>👀</div>
                        <h3 style={{ margin: 0, color: '#5D4037' }}>친구 아지트</h3>
                        <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>친구들의 글 읽기</p>
                    </motion.div>
                </div>

                {/* [신규] 메인 메뉴 카드 (드래곤/어휘) */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginTop: '24px' }}>
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsDragonModalOpen(true)}
                        style={{
                            background: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)',
                            borderRadius: '24px',
                            padding: '30px 24px',
                            cursor: 'pointer',
                            border: '2px solid #FFF176',
                            boxShadow: '0 8px 24px rgba(255, 241, 118, 0.2)',
                            textAlign: 'center',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        <div style={{ fontSize: '3.5rem', marginBottom: '15px' }}>🐉</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#5D4037', marginBottom: '6px' }}>나의 드래곤 파트너</div>
                        <div style={{ fontSize: '0.9rem', color: '#FBC02D', fontWeight: 'bold', background: 'white', padding: '4px 12px', borderRadius: '10px', display: 'inline-block' }}>나의 드래곤 아지트 가기</div>
                    </motion.div>

                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => alert('🏰 어휘의 탑은 준비 중입니다! 조금만 기다려주세요! ✨')}
                        style={{
                            background: 'linear-gradient(135deg, #E3F2FD 0%, #F0F4F8 100%)',
                            borderRadius: '24px',
                            padding: '30px 24px',
                            cursor: 'pointer',
                            border: '2px solid #90CAF9',
                            boxShadow: '0 8px 24px rgba(144, 202, 249, 0.2)',
                            textAlign: 'center',
                            position: 'relative',
                            overflow: 'hidden'
                        }}
                    >
                        <div style={{ fontSize: '3.5rem', marginBottom: '15px' }}>🏰</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#1565C0', marginBottom: '6px' }}>어휘력 챌린지</div>
                        <div style={{ fontSize: '0.9rem', color: '#2196F3', fontWeight: 'bold', background: 'white', padding: '4px 12px', borderRadius: '10px', display: 'inline-block' }}>어휘의 탑 도전하기</div>
                        <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#FF7043', color: 'white', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold' }}>COMING SOON</div>
                    </motion.div>
                </div>

                <div style={{
                    marginTop: '24px', padding: '20px', background: '#FDFCF0',
                    borderRadius: '20px', textAlign: 'center', border: '1px dashed #FFE082'
                }}>
                    <p style={{ margin: 0, color: '#9E9E9E', fontSize: '0.9rem' }}>
                        🚩 오늘의 목표: 멋진 글 완성하고 포인트 더 받기!
                    </p>
                </div>

                {/* 피드백 모아보기 모달 */}
                <StudentFeedbackModal
                    isOpen={showFeedback}
                    onClose={() => setShowFeedback(false)}
                    feedbacks={feedbacks}
                    loading={loadingFeedback}
                    onNavigate={onNavigate}
                    initialTab={feedbackInitialTab}
                />
                {/* 액세서리 상점 모달 */}
                {
                    isShopOpen && (
                        <div style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.6)', zIndex: 3000,
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            padding: '20px'
                        }} onClick={() => setIsShopOpen(false)}>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                style={{
                                    background: 'white',
                                    width: '100%',
                                    maxWidth: '450px',
                                    maxHeight: '85vh',
                                    borderRadius: '32px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    overflow: 'hidden',
                                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                <div style={{ padding: '24px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8F9FA' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#2C3E50', fontWeight: '900' }}>🏡 아지트 배경 상점</h3>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#7F8C8D' }}>남은 포인트: <b>{points.toLocaleString()}P</b></p>
                                    </div>
                                    <button onClick={() => setIsShopOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                                </div>

                                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    {Object.values(HIDEOUT_BACKGROUNDS).map(item => {
                                        const isOwned = item.id === 'default' || petData.ownedItems.includes(item.id);
                                        const isEquipped = petData.background === item.id;

                                        return (
                                            <div key={item.id} style={{
                                                border: `2px solid ${isEquipped ? item.border : '#F1F3F5'}`,
                                                borderRadius: '24px',
                                                padding: '16px',
                                                textAlign: 'center',
                                                background: isEquipped ? item.color : 'white',
                                                transition: 'all 0.2s',
                                                opacity: isEquipped ? 1 : 0.8
                                            }}>
                                                <div style={{
                                                    width: '100%', height: '60px', borderRadius: '12px',
                                                    background: item.color, marginBottom: '10px',
                                                    border: `1px solid ${item.border}`
                                                }} />
                                                <div style={{ fontWeight: 'bold', fontSize: '1rem', color: isEquipped ? (item.textColor || '#2C3E50') : '#2C3E50', marginBottom: '6px' }}>{item.name}</div>

                                                {/* 가격/상태 표시 배지 */}
                                                <div style={{
                                                    display: 'inline-block',
                                                    padding: '4px 12px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: '900',
                                                    marginBottom: '14px',
                                                    background: isOwned ? (isEquipped ? 'rgba(255,255,255,0.2)' : '#F1F3F5') : '#FFF9C4',
                                                    color: isOwned ? (isEquipped ? 'white' : '#95A5A6') : '#FBC02D',
                                                    border: isOwned ? 'none' : '1px solid #FFE082'
                                                }}>
                                                    {isOwned ? (
                                                        <span>{isEquipped ? '✨ 사용 중' : '✅ 보유 중'}</span>
                                                    ) : (
                                                        <span>💰 {item.price?.toLocaleString()}P</span>
                                                    )}
                                                </div>

                                                {!isOwned ? (
                                                    <Button
                                                        size="sm"
                                                        style={{ width: '100%', background: '#FBC02D', color: '#795548', fontWeight: 'bold' }}
                                                        onClick={() => handleBuyItem(item)}
                                                    >
                                                        구매하기
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant={isEquipped ? 'primary' : 'ghost'}
                                                        style={{
                                                            width: '100%',
                                                            background: isEquipped ? item.accent : '#F8F9FA',
                                                            color: isEquipped ? 'white' : '#7F8C8D',
                                                            border: isEquipped ? 'none' : '1px solid #DEE2E6'
                                                        }}
                                                        onClick={() => handleToggleEquip(item.id)}
                                                    >
                                                        {isEquipped ? '사용 중' : '적용하기'}
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ padding: '20px', textAlign: 'center', background: '#FDFCF0' }}>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#9E9E9E' }}>멋진 배경으로 나만의 드래곤 아지트를 꾸며보세요! 🌈</p>
                                </div>
                            </motion.div>
                        </div>
                    )}
            </Card >
        </>
    );
};

export default StudentDashboard;
