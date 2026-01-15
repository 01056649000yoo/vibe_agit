import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

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
    const [stats, setStats] = useState({ totalChars: 0, completedMissions: 0, monthlyPosts: 0 }); // [추가] 성장 통계
    const [levelInfo, setLevelInfo] = useState({ level: 1, name: '새싹 작가', icon: '🌱', nextGoal: 1000 }); // [추가] 레벨 정보
    const [isLoading, setIsLoading] = useState(true); // [긴급 점검] 데이터 로딩 상태 관리 추가
    const [petData, setPetData] = useState({
        name: '나의 드래곤',
        level: 1,
        exp: 0,
        lastFed: new Date().toISOString().split('T')[0],
        ownedItems: [], // 구매한 아이템 ID 목록
        equippedItems: [] // 장착 중인 아이템 ID 목록
    });
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isDragonModalOpen, setIsDragonModalOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // [추가] 액세서리 목록 정의 (종류, 가격, 이모지, 위치 정보 등)
    const ACCESSORIES = [
        { id: 'crown', name: '작은 왕관', price: 300, emoji: '👑', pos: { top: '-25%', left: '25%', fontSize: '2.5rem' } },
        { id: 'sunglasses', name: '멋진 선글라스', price: 200, emoji: '🕶️', pos: { top: '15%', left: '15%', fontSize: '2rem' } },
        { id: 'flame', name: '불꽃 오라', price: 1000, emoji: '🔥', pos: { top: '0', left: '0', fontSize: '6rem', zIndex: -1, filter: 'blur(2px) opacity(0.7)' } },
        { id: 'star', name: '반짝이 별', price: 150, emoji: '⭐', pos: { top: '-10%', left: '60%', fontSize: '1.5rem' } },
    ];

    useEffect(() => {
        if (studentSession?.id) {
            loadInitialData();
            checkActivity();
            fetchStats();
        }
    }, [studentSession]);

    const loadInitialData = async () => {
        await fetchMyPoints();
        // [점검] 데이터 로드가 완료된 후에 퇴화 로직 체크
        checkPetDegeneration();
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

    // [추가] 단계별 드래곤 정보
    const getDragonStage = (level) => {
        if (level >= 5) return { name: '전설의 신룡', emoji: '✨🐲' };
        if (level === 4) return { name: '날개 드래곤', emoji: '🐉' };
        if (level === 3) return { name: '어린 드래곤', emoji: '🐲' };
        if (level === 2) return { name: '아기 드래곤', emoji: '🐣' };
        return { name: '비밀의 알', emoji: '🥚' };
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

        try {
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

            setPoints(newPoints);
            setPetData(prev => ({
                ...prev,
                level: newLevel,
                exp: newExp,
                lastFed: today
            }));
        } catch (err) {
            console.error('포인트 업데이트 실패:', err.message);
            alert('포인트 사용에 실패했습니다. 다시 시도해 주세요!');
        }
    };

    // [추가] 액세서리 구매/장착 로직
    const handleBuyItem = async (item) => {
        // [점검] 로딩 중이거나 포인트 정보가 유효하지 않으면 실행 방지
        if (isLoading) {
            alert('데이터를 불러오는 중입니다. 잠시만 기다려 주세요! ⏳');
            return;
        }

        // [안전장치] 포인트 정보가 undefined거나 null이면 중단
        if (points === undefined || points === null) return;

        if (points < item.price) {
            alert('포인트가 부족해요! 꾸준히 글을 써 보세요. ✍️');
            return;
        }

        if (petData.ownedItems.includes(item.id)) return;

        const newPoints = points - item.price;
        if (newPoints < 0) {
            alert('작업을 완료할 수 없습니다. 포인트가 유효하지 않습니다.');
            return;
        }
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
            alert(`[${item.name}] 구매 성공! '장착하기'를 눌러 드래곤을 꾸며보세요. ✨`);
        } catch (err) {
            console.error('아이템 구매 실패:', err.message);
        }
    };

    const handleToggleEquip = async (itemId) => {
        if (isLoading) return; // [점검] 로딩 중 작업 방지
        const isEquipped = petData.equippedItems.includes(itemId);
        let newEquipped;

        if (isEquipped) {
            newEquipped = petData.equippedItems.filter(id => id !== itemId);
        } else {
            // 같은 부위 아이템 처리 등은 생략하고 자유롭게 중첩 가능하게 구현
            newEquipped = [...petData.equippedItems, itemId];
        }

        const newPetData = { ...petData, equippedItems: newEquipped };

        try {
            const { error } = await supabase
                .from('students')
                .update({ pet_data: newPetData })
                .eq('id', studentSession.id);

            if (error) throw error;
            setPetData(newPetData);
        } catch (err) {
            console.error('장착 상태 업데이트 실패:', err.message);
        }
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
                .single();

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
            const { data: myPosts } = await supabase
                .from('student_posts')
                .select('id')
                .eq('student_id', studentSession.id);

            if (!myPosts || myPosts.length === 0) return;
            const postIds = myPosts.map(p => p.id);

            const { count: reactionCount } = await supabase
                .from('post_reactions')
                .select('*', { count: 'exact', head: true })
                .in('post_id', postIds)
                .neq('user_id', studentSession.id);

            const { count: commentCount } = await supabase
                .from('post_comments')
                .select('*', { count: 'exact', head: true })
                .in('post_id', postIds)
                .neq('author_id', studentSession.id);

            setHasActivity((reactionCount || 0) + (commentCount || 0) > 0);
        } catch (err) {
            console.error('활동 확인 실패:', err.message);
        }
    };

    const fetchFeedbacks = async () => {
        setLoadingFeedback(true);
        try {
            const { data: myPosts } = await supabase
                .from('student_posts')
                .select('id, title')
                .eq('student_id', studentSession.id);

            if (!myPosts || myPosts.length === 0) {
                setFeedbacks([]);
                return;
            }
            const postIds = myPosts.map(p => p.id);

            // 반응 가져오기
            const { data: reactions } = await supabase
                .from('post_reactions')
                .select('*, students(name), student_posts(title, id)')
                .in('post_id', postIds)
                .neq('user_id', studentSession.id);

            // 댓글 가져오기
            const { data: comments } = await supabase
                .from('post_comments')
                .select('*, students:author_id(name), student_posts(title, id)')
                .in('post_id', postIds)
                .neq('author_id', studentSession.id);

            const combined = [
                ...(reactions || []).map(r => ({ ...r, type: 'reaction' })),
                ...(comments || []).map(c => ({ ...c, type: 'comment' }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setFeedbacks(combined);
        } catch (err) {
            console.error('피드백 로드 실패:', err.message);
        } finally {
            setLoadingFeedback(false);
        }
    };

    const openFeedback = () => {
        setShowFeedback(true);
        fetchFeedbacks();
    };

    return (
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
                            onClick={openFeedback}
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
                <Button variant="ghost" size="sm" onClick={onLogout}>
                    로그아웃 🚪
                </Button>
            </div>


            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '5px' }}>🌟</div>
                <h1 style={{ fontSize: '2rem', color: '#5D4037', marginBottom: '0.4rem' }}>
                    안녕, <span style={{ color: '#FBC02D' }}>{studentSession.name}</span>!
                </h1>
                <p style={{ color: '#8D6E63', fontSize: '1rem' }}>벌써 이만큼이나 성장했어! 🚀</p>
            </div>



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
                                background: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)',
                                borderRadius: isMobile ? '32px 32px 0 0' : '32px',
                                width: '100%', maxWidth: '600px',
                                padding: '32px',
                                border: '2px solid #FFF176',
                                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                                position: 'relative',
                                maxHeight: isMobile ? '90vh' : 'auto',
                                overflowY: 'auto'
                            }}
                        >
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.4)', padding: '20px', borderRadius: '24px' }}>
                                    <div style={{ position: 'relative' }}>
                                        <motion.div
                                            key={petData.level}
                                            initial={{ scale: 0.5, rotate: -20 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            style={{
                                                fontSize: '5rem',
                                                background: 'white',
                                                width: '120px',
                                                height: '120px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '24px',
                                                boxShadow: '0 8px 16px rgba(0,0,0,0.05)',
                                                position: 'relative',
                                                zIndex: 1
                                            }}
                                        >
                                            {dragonInfo.emoji}

                                            {/* 장착된 액세서리 레이어 */}
                                            {petData.equippedItems.map(itemId => {
                                                const item = ACCESSORIES.find(a => a.id === itemId);
                                                if (!item) return null;
                                                return (
                                                    <motion.div
                                                        key={item.id}
                                                        initial={{ scale: 0 }}
                                                        animate={{ scale: 1 }}
                                                        style={{
                                                            position: 'absolute',
                                                            ...item.pos,
                                                            pointerEvents: 'none',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}
                                                    >
                                                        {item.emoji}
                                                    </motion.div>
                                                );
                                            })}
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
            {
                showFeedback && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '20px'
                    }} onClick={() => setShowFeedback(false)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            style={{
                                background: 'white',
                                width: '100%',
                                maxWidth: '500px',
                                maxHeight: '80vh',
                                borderRadius: '32px',
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ padding: '24px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#5D4037' }}>🔔 내 글 소식</h3>
                                <button onClick={() => setShowFeedback(false)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                                {loadingFeedback ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#9E9E9E' }}>소식을 가져오고 있어요... 🏃‍♂️</div>
                                ) : feedbacks.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '60px', color: '#9E9E9E' }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📭</div>
                                        아직 새로운 소식이 없어요.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {feedbacks.map((f, idx) => (
                                            <div
                                                key={f.id || idx}
                                                style={{
                                                    padding: '16px',
                                                    background: '#F9F9F9',
                                                    borderRadius: '20px',
                                                    border: '1px solid #F1F1F1',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onClick={() => {
                                                    setShowFeedback(false);
                                                    onNavigate('friends_hideout', { initialPostId: f.post_id || f.student_posts?.id });
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.background = '#F0F7FF';
                                                    e.currentTarget.style.borderColor = '#D0E1F9';
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.background = '#F9F9F9';
                                                    e.currentTarget.style.borderColor = '#F1F1F1';
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                    <span style={{ fontSize: '1.2rem' }}>
                                                        {f.type === 'reaction' ? (
                                                            f.reaction_type === 'heart' ? '❤️' :
                                                                f.reaction_type === 'laugh' ? '😂' :
                                                                    f.reaction_type === 'wow' ? '👏' :
                                                                        f.reaction_type === 'bulb' ? '💡' : '✨'
                                                        ) : '💬'}
                                                    </span>
                                                    <span style={{ fontWeight: 'bold', color: '#5D4037', fontSize: '0.95rem' }}>
                                                        {f.students?.name} 친구가 {f.type === 'reaction' ? '리액션을 남겼어요!' : '댓글을 남겼어요!'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.85rem', color: '#9E9E9E', marginBottom: '4px' }}>
                                                    글 제목: "{f.student_posts?.title}"
                                                </div>
                                                {f.type === 'comment' && (
                                                    <div style={{
                                                        fontSize: '0.9rem', color: '#795548', background: 'white',
                                                        padding: '8px 12px', borderRadius: '12px', marginTop: '6px',
                                                        border: '1px solid #EEE'
                                                    }}>
                                                        {f.content}
                                                    </div>
                                                )}
                                                <div style={{ fontSize: '0.75rem', color: '#BDBDBD', marginTop: '8px', textAlign: 'right' }}>
                                                    {new Date(f.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )
            }
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
                                    <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#2C3E50', fontWeight: '900' }}>🛍️ 드래곤 액세서리 상점</h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#7F8C8D' }}>남은 포인트: <b>{points.toLocaleString()}P</b></p>
                                </div>
                                <button onClick={() => setIsShopOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                {ACCESSORIES.map(item => {
                                    const isOwned = petData.ownedItems.includes(item.id);
                                    const isEquipped = petData.equippedItems.includes(item.id);

                                    return (
                                        <div key={item.id} style={{
                                            border: `2px solid ${isEquipped ? '#3498DB' : '#F1F3F5'}`,
                                            borderRadius: '24px',
                                            padding: '16px',
                                            textAlign: 'center',
                                            background: isEquipped ? '#EBF5FB' : 'white',
                                            transition: 'all 0.2s'
                                        }}>
                                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>{item.emoji}</div>
                                            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#2C3E50', marginBottom: '4px' }}>{item.name}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#F39C12', fontWeight: 'bold', marginBottom: '12px' }}>
                                                {isOwned ? '보유 중' : `${item.price.toLocaleString()}P`}
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
                                                        background: isEquipped ? '#3498DB' : '#F8F9FA',
                                                        color: isEquipped ? 'white' : '#7F8C8D',
                                                        border: isEquipped ? 'none' : '1px solid #DEE2E6'
                                                    }}
                                                    onClick={() => handleToggleEquip(item.id)}
                                                >
                                                    {isEquipped ? '장착 해제' : '장착하기'}
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ padding: '20px', textAlign: 'center', background: '#FDFCF0' }}>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#9E9E9E' }}>액세서리는 여러 개를 겹쳐서 착용할 수 있어요! 🌈</p>
                            </div>
                        </motion.div>
                    </div>
                )}
        </Card>
    );
};

export default StudentDashboard;
