import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import useVocabularyTower from '../../hooks/useVocabularyTower';

/**
 * 어휘의 탑 게임 컴포넌트
 * 학년별 어휘 퀴즈를 통해 경험치를 쌓고 탑을 올라가는 게임
 * @param {Object} studentSession - 학생 세션 정보
 * @param {Function} onBack - 뒤로가기 핸들러
 * @param {number} forcedGrade - 교사가 설정한 학년 (고정 출제)
 * @param {number} dailyLimit - 일일 시도 횟수 제한
 * @param {number} timeLimit - [신규] 게임 제한 시간 (초)
 * @param {number} rewardPoints - [신규] 기회 소진 시 보상 포인트
 * @param {number} rewardPoints - [신규] 기회 소진 시 보상 포인트
 * @param {string} resetDate - [신규] 교사 설정 변경에 따른 리셋 기준일
 */

const FLOOR_MESSAGES = {
    2: "첫 발을 내디뎠어요! 어휘의 탑 정복 시작! 🌱",
    3: "놀라운 기세예요! 벌써 3층이라니 대단합니다! 🚀",
    4: "어휘력이 폭발하고 있어요! 이 기세로 쭉쭉 가보자고! 🔥",
    5: "드디어 탑의 절반! 당신은 어휘의 강자입니다! 🏅",
    6: "고지가 멀지 않았어요! 집중력을 잃지 마세요! 🎯",
    7: "진정한 실력자가 나타났다! 어휘 마스터에 한 발짝 더! ✨",
    8: "대문호의 기운이 느껴져요! 엄청난 실력입니다! 👑",
    9: "이제 단 한 층뿐! 마지막까지 에너지를 쏟아부으세요! ⚡",
    10: "전설의 탄생! 탑의 정상이 코앞이에요! 🏆",
    default: "점점 더 정상이 가까워지고 있어요! 💪"
};

const VocabularyTowerGame = ({ studentSession, onBack, forcedGrade, dailyLimit = 3, timeLimit = 60, rewardPoints = 80, resetDate, rankingResetDate }) => {
    // 교사가 설정한 학년이 있으면 고정, 없으면 학생 학년 또는 4학년
    const [selectedGrade, setSelectedGrade] = useState(forcedGrade || studentSession?.grade || 4);
    const [showResult, setShowResult] = useState(false);
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [previousFloor, setPreviousFloor] = useState(1); // [신규] 이전 층 기록
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    const [isTimeUp, setIsTimeUp] = useState(false);
    const [isFullyExhausted, setIsFullyExhausted] = useState(false);
    const [awardedPoints, setAwardedPoints] = useState(0);
    const [rankings, setRankings] = useState([]); // [신규] 랭킹 정보

    // [신규] 일일 시도 횟수 관리
    const getTodayKey = () => {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const resetSuffix = resetDate ? `_${resetDate}` : '';
        return `vocab_tower_attempts_${studentSession?.id}_${today}${resetSuffix}`;
    };

    const getAttempts = () => {
        const key = getTodayKey();
        const stored = localStorage.getItem(key);
        return stored ? parseInt(stored, 10) : 0;
    };

    const [attempts, setAttempts] = useState(getAttempts());
    const [hasStarted, setHasStarted] = useState(false);

    // 차감 전 남은 횟수 (게임 진입 시점 기준)
    const initialRemaining = dailyLimit - getAttempts();
    // 현재 표시용 남은 횟수 (차감 후)
    const remainingAttempts = Math.max(0, dailyLimit - attempts);

    // 시도 횟수 차감 (게임 시작 시 한 번만 차감)
    const consumeAttempt = () => {
        if (remainingAttempts > 0) {
            const key = getTodayKey();
            const newAttempts = attempts + 1;
            localStorage.setItem(key, newAttempts.toString());
            setAttempts(newAttempts);
            return true;
        }
        return false;
    };

    useEffect(() => {
        // 게임 진입 시 차감 전 남은 횟수가 0 이하면 즉시 종료
        if (initialRemaining <= 0) {
            setIsFullyExhausted(true);
            return;
        }

        // 진입 시 첫 번째 시도 차감
        if (!hasStarted) {
            consumeAttempt();
            setHasStarted(true);
        }
    }, []);

    // 타이머 로직
    useEffect(() => {
        if (!hasStarted || showResult || isTimeUp || isFullyExhausted) return;

        if (timeLeft <= 0) {
            if (remainingAttempts <= 0) {
                // 남은 기회가 없으면 즉시 보상 결과 화면으로
                setIsFullyExhausted(true);
            } else {
                // 기회가 남았을 때만 시간 초과 팝업 표시
                setIsTimeUp(true);
            }
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timer);
    }, [hasStarted, timeLeft, showResult, isTimeUp, isFullyExhausted]);

    // 보상 포인트 지급 로직
    const handleRewardPoints = async () => {
        const rewardKey = `${getTodayKey()}_rewarded`;

        // [신규] 게임 종료 시 현재 층수 랭킹에 기록
        updateMaxFloor(stats.currentFloor);

        // 이미 지급했거나 보상 포인트가 0 이하인 경우 방지
        if (awardedPoints > 0 || rewardPoints <= 0 || localStorage.getItem(rewardKey)) {
            // 이미 지급된 상태라면 상태값만 동기화 (UI 표시용)
            if (localStorage.getItem(rewardKey) && awardedPoints === 0) {
                setAwardedPoints(rewardPoints);
            }
            return;
        }

        try {
            console.log('💰 보상 포인트 지급 시작:', { student_id: studentSession.id, points: rewardPoints });

            const { error } = await supabase.rpc('increment_student_points', {
                student_id: studentSession.id,
                points_to_add: rewardPoints
            });

            if (error) throw error;

            // 로컬 스토리지에 기록하여 중복 지급 방지
            localStorage.setItem(rewardKey, 'true');
            setAwardedPoints(rewardPoints);

            // 학생에게 명확하게 알림
            alert(`🏆 어휘의 탑 일일 미션 완료!\n\n오늘의 기회를 모두 소진하여 보상 포인트 ${rewardPoints}P가 지급되었습니다! ✨\n(이제 활동지수 랭킹에서 내 점수를 확인해보세요!)`);

            console.log('✅ 보상 포인트 지급 완료');
        } catch (err) {
            console.error('❌ 보상 포인트 지급 실패:', err);
            alert('⚠️ 보상 포인트 지급 중 오류가 발생했습니다. 선생님께 문의해 주세요.\n(에러: ' + (err.message || '데이터베이스 연결 오류') + ')');
        }
    };

    useEffect(() => {
        if (isFullyExhausted) {
            handleRewardPoints();
        }
    }, [isFullyExhausted]);

    // [신규] 랭킹 데이터 불러오기
    const fetchRankings = async () => {
        const classId = studentSession?.class_id || studentSession?.classId;
        if (!classId) return;

        try {
            let query = supabase
                .from('vocab_tower_rankings')
                .select(`
                    max_floor,
                    student_id,
                    students:student_id ( name )
                `)
                .eq('class_id', classId);

            // [신규] 랭킹 리셋 설정이 있다면 해당 시점 이후 데이터만 필터링
            if (rankingResetDate) {
                query = query.gte('updated_at', rankingResetDate);
            }

            const { data, error } = await query.order('max_floor', { ascending: false });

            if (error) throw error;
            setRankings(data || []);
        } catch (err) {
            console.error('❌ 랭킹 로드 실패:', err);
        }
    };

    useEffect(() => {
        if (studentSession?.class_id || studentSession?.classId) {
            fetchRankings();
        }
    }, [studentSession?.class_id, studentSession?.classId, rankingResetDate]);

    // [신규] 최고 층수 업데이트
    const updateMaxFloor = async (floor) => {
        const classId = studentSession?.class_id || studentSession?.classId;
        if (!studentSession?.id || !classId) return;

        try {
            await supabase.rpc('update_tower_max_floor', {
                p_student_id: studentSession.id,
                p_class_id: classId,
                p_floor: floor
            });
            fetchRankings(); // 랭킹 갱신
        } catch (err) {
            console.error('❌ 최고 층수 업데이트 실패:', err);
        }
    };

    // forcedGrade가 변경되면 동기화
    useEffect(() => {
        if (forcedGrade) {
            setSelectedGrade(forcedGrade);
        }
    }, [forcedGrade]);

    const {
        currentQuiz,
        stats,
        actions,
        isLoading,
        error,
        lastResult
    } = useVocabularyTower(selectedGrade);

    // 레벨업 애니메이션 처리
    useEffect(() => {
        if (lastResult?.leveledUp) {
            setPreviousFloor(stats.currentFloor - 1);
            setShowLevelUp(true);

            // [신규] 레벨업 시 최고 층수 DB 업데이트
            updateMaxFloor(stats.currentFloor);

            // [보너스] 다음 층 도달 시 시간 추가 로직 적용
            // 2층: +20초, 3층부터: 20초 + (층수-2)*3초
            const floor = stats.currentFloor;
            const bonus = 20 + (Math.max(0, floor - 2) * 3);
            setTimeLeft(prev => prev + bonus);

            setTimeout(() => setShowLevelUp(false), 3000);
        }
    }, [lastResult, stats.currentFloor]);

    // 정답 선택 핸들러
    const handleAnswerSelect = (answer) => {
        if (showResult) return;
        setSelectedAnswer(answer);
        actions.handleAnswer(answer);
        setShowResult(true);
    };

    // 다음 문제로 이동
    const handleNextQuestion = () => {
        setShowResult(false);
        setSelectedAnswer(null);
        actions.nextQuiz();
    };

    // 게임 재시작 (시간 초과 후 계속하기 시 사용)
    const handleContinue = () => {
        if (remainingAttempts <= 0) {
            setIsFullyExhausted(true);
            setIsTimeUp(false);
            return;
        }

        // 새로운 시도 차감
        consumeAttempt();
        setTimeLeft(timeLimit);
        setIsTimeUp(false);
        setShowResult(false);
        setSelectedAnswer(null);
        actions.startGame();
    };

    // 게임 재시작 (결과 화면 등에서 사용)
    const handleRestart = () => {
        setShowResult(false);
        setSelectedAnswer(null);
        setTimeLeft(timeLimit);
        actions.startGame();
    };

    // [신규] 게임 중 퇴장 핸들러
    const handleExit = () => {
        // 이미 모든 기회를 썼거나 시간 초과 상태면 그냥 나감
        if (isFullyExhausted || isTimeUp) {
            onBack();
            return;
        }

        // 게임 도중 나갈 때 경고
        if (window.confirm('⚠️ 아직 게임이 진행 중이에요! 지금 나가면 시도 횟수 1회가 차감됩니다.\n정말 대시보드로 나갈까요?')) {
            onBack();
        }
    };

    // 학년 변경
    const handleGradeChange = (grade) => {
        setSelectedGrade(grade);
        setShowResult(false);
        setSelectedAnswer(null);
    };

    // 층수에 따른 배경색 결정
    const getFloorBackground = (floor) => {
        if (floor >= 10) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)';
        if (floor >= 7) return 'linear-gradient(135deg, #9C27B0 0%, #673AB7 100%)';
        if (floor >= 5) return 'linear-gradient(135deg, #2196F3 0%, #03A9F4 100%)';
        if (floor >= 3) return 'linear-gradient(135deg, #4CAF50 0%, #8BC34A 100%)';
        return 'linear-gradient(135deg, #90CAF9 0%, #E3F2FD 100%)';
    };

    // 층수에 따른 텍스트 색상
    const getFloorTextColor = (floor) => {
        return floor >= 5 ? 'white' : '#1565C0';
    };

    // [신규] 미니 타워 맵 컴포넌트
    const TowerMap = () => {
        const floors = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
        return (
            <div style={{
                position: 'fixed',
                right: '40px', // 우측 끝으로 이동
                top: '55%',
                transform: 'translateY(-50%)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'none',
                scale: '1.1' // 모바일/태블릿 배려하여 약간 축소
            }}>
                {/* 타워 꼭대기 지붕 (10층 위) */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    style={{
                        width: '0',
                        height: '0',
                        borderLeft: '40px solid transparent', // 지붕 크기 확대
                        borderRight: '40px solid transparent',
                        borderBottom: '50px solid #D32F2F',
                        marginBottom: '-5px',
                        position: 'relative',
                        filter: 'drop-shadow(0 -5px 10px rgba(211,47,47,0.4))',
                        zIndex: 2
                    }}
                >
                    <span style={{ position: 'absolute', top: '18px', left: '-12px', fontSize: '1.6rem' }}>👑</span>
                </motion.div>

                {/* 타워 몸체 */}
                <div style={{
                    background: '#5D4037',
                    padding: '8px 6px',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                    border: '3px solid #3E2723'
                }}>
                    {floors.map(f => {
                        const isCurrent = f === stats.currentFloor;
                        const isPassed = f < stats.currentFloor;

                        return (
                            <motion.div
                                key={f}
                                initial={false}
                                animate={{
                                    scale: isCurrent ? 1.2 : 1,
                                    x: isCurrent ? -10 : 0,
                                    backgroundColor: isCurrent ? '#FFF' : (isPassed ? '#4CAF50' : '#8D6E63'),
                                    boxShadow: isCurrent ? '0 0 20px #FFD700' : 'none'
                                }}
                                style={{
                                    width: '45px',
                                    height: '32px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.9rem',
                                    fontWeight: '900',
                                    color: isCurrent ? '#1565C0' : (isPassed ? '#FFF' : '#D7CCC8'),
                                    border: `2px solid ${isCurrent ? '#FFD700' : '#4E342E'}`,
                                    position: 'relative'
                                }}
                            >
                                {f === 10 ? 'TOP' : f}

                                {isCurrent && (
                                    <motion.div
                                        layoutId="tower-marker-new"
                                        style={{
                                            position: 'absolute',
                                            left: '-65px',
                                            background: 'linear-gradient(135deg, #FF9800, #F57C00)',
                                            color: 'white',
                                            padding: '4px 8px',
                                            borderRadius: '8px',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: '0 4px 10px rgba(255,152,0,0.4)',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        <span>내 위치</span>
                                        <motion.span
                                            animate={{ x: [0, 4, 0] }}
                                            transition={{ repeat: Infinity, duration: 1 }}
                                        >
                                            ▶
                                        </motion.span>
                                    </motion.div>
                                )}

                                {/* 장식: 창문 */}
                                <div style={{
                                    position: 'absolute',
                                    right: '4px',
                                    top: '4px',
                                    width: '5px',
                                    height: '7px',
                                    background: isCurrent ? '#FFEB3B' : 'rgba(0,0,0,0.2)',
                                    borderRadius: '1px'
                                }} />
                            </motion.div>
                        );
                    })}
                </div>

                {/* 타워 받침대 */}
                <div style={{
                    width: '70px',
                    height: '20px',
                    background: '#3E2723',
                    borderRadius: '4px 4px 12px 12px',
                    marginTop: '-2px',
                    boxShadow: '0 5px 15px rgba(0,0,0,0.2)'
                }} />
            </div>
        );
    };

    if (isLoading) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #E3F2FD 0%, #F0F4F8 100%)'
            }}>
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    style={{ fontSize: '4rem', marginBottom: '20px' }}
                >
                    🏰
                </motion.div>
                <p style={{ color: '#1565C0', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    어휘의 탑 준비 중...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #FFEBEE 0%, #FCE4EC 100%)',
                padding: '20px'
            }}>
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>😢</div>
                <p style={{ color: '#C62828', fontSize: '1.1rem', textAlign: 'center', marginBottom: '20px' }}>
                    {error}
                </p>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onBack}
                    style={{
                        padding: '12px 32px',
                        borderRadius: '20px',
                        border: 'none',
                        background: '#1565C0',
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    돌아가기
                </motion.button>
            </div>
        );
    }

    return (
        <div style={{
            minHeight: '100vh',
            background: getFloorBackground(stats.currentFloor),
            position: 'relative',
            overflowX: 'hidden',
            overflowY: 'auto',
            transition: 'background 1s ease',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center' // 전체 중앙 정렬
        }}>
            {/* 전체 컨텐츠 래퍼 (태블릿/데스크탑 대응 최대 너비 설정) */}
            <div style={{
                width: '100%',
                maxWidth: '1280px',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100vh',
                position: 'relative'
            }}>
                {/* 배경 타워 벽돌 패턴 (미세하게) */}
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    opacity: 0.05,
                    backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                    backgroundSize: '30px 30px',
                    pointerEvents: 'none'
                }} />

                {/* 미니 타워 맵 */}
                <TowerMap />
                {/* [신규] 층간 이동 고도화 애니메이션 */}
                <AnimatePresence>
                    {showLevelUp && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed',
                                top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(0,0,0,0.85)',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 10000,
                                overflow: 'hidden'
                            }}
                        >
                            {/* 올라가는 연출: 배경 배경 구름 */}
                            {[1, 2, 3].map(i => (
                                <motion.div
                                    key={i}
                                    initial={{ y: -100 }}
                                    animate={{ y: 800 }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear', delay: i * 0.5 }}
                                    style={{
                                        position: 'absolute',
                                        left: `${i * 30}%`,
                                        fontSize: '3rem',
                                        opacity: 0.2
                                    }}
                                >
                                    ☁️
                                </motion.div>
                            ))}

                            <div style={{ position: 'relative', height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                {/* 이전 층 (아래로 내려감) */}
                                <motion.div
                                    initial={{ y: 0, opacity: 1 }}
                                    animate={{ y: 150, opacity: 0 }}
                                    transition={{ duration: 0.8 }}
                                    style={{
                                        fontSize: '2rem',
                                        color: '#AAA',
                                        fontWeight: 'bold',
                                        position: 'absolute',
                                        top: '40%'
                                    }}
                                >
                                    {previousFloor}층
                                </motion.div>

                                {/* 로켓/캐릭터 (위로 상승) */}
                                <motion.div
                                    initial={{ y: 100, scale: 0.5, opacity: 0 }}
                                    animate={{ y: [-20, 10, -20], scale: 1, opacity: 1 }}
                                    transition={{
                                        y: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' },
                                        opacity: { duration: 0.5 },
                                        scale: { duration: 0.5 }
                                    }}
                                    style={{ fontSize: '6rem', zIndex: 2 }}
                                >
                                    🚀
                                </motion.div>

                                {/* 현재 층 (위에서 나타남) */}
                                <motion.div
                                    initial={{ y: -150, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    transition={{ delay: 0.5, duration: 0.8, type: 'spring' }}
                                    style={{
                                        fontSize: '4rem',
                                        color: '#FFD700',
                                        fontWeight: '900',
                                        textShadow: '0 0 20px rgba(255,215,0,0.5)',
                                        zIndex: 3,
                                        marginTop: '120px'
                                    }}
                                >
                                    {stats.currentFloor}층 도달!
                                </motion.div>
                            </div>

                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 1 }}
                                style={{ textAlign: 'center', marginTop: '40px', padding: '0 20px' }}
                            >
                                <h2 style={{ color: 'white', fontSize: '1.8rem', margin: 0 }}>
                                    {stats.currentFloor === 10 ? '✨ 최종 층 도달! ✨' : '층간 정복 완료!'}
                                </h2>
                                <p style={{ color: '#DDD', fontSize: '1.2rem', marginTop: '12px', lineHeight: 1.5 }}>
                                    {FLOOR_MESSAGES[stats.currentFloor] || FLOOR_MESSAGES.default}
                                </p>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 헤더 */}
                <div style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(10px)',
                    borderBottom: '2px solid #E3F2FD',
                    zIndex: 1000
                }}>
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleExit}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: '#F5F5F5',
                            border: '1px solid #E0E0E0',
                            padding: '6px 14px',
                            borderRadius: '12px',
                            color: '#666',
                            fontSize: '0.9rem',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                        }}
                    >
                        <span style={{ fontSize: '1.2rem' }}>←</span>
                        <span className="hide-on-mobile">나가기</span>
                    </motion.button>
                    <h2 style={{ margin: 0, color: '#1565C0', fontSize: '1.2rem', fontWeight: '800' }}>🏰 어휘의 탑</h2>
                    {/* [신규] 남은 시도 횟수 표시 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        background: remainingAttempts > 1 ? '#E8F5E9' : remainingAttempts === 1 ? '#FFF3E0' : '#FFEBEE',
                        borderRadius: '20px',
                        border: `2px solid ${remainingAttempts > 1 ? '#4CAF50' : remainingAttempts === 1 ? '#FF9800' : '#EF5350'}`
                    }}>
                        <span style={{ fontSize: '1rem' }}>🎯</span>
                        <span style={{
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            color: remainingAttempts > 1 ? '#2E7D32' : remainingAttempts === 1 ? '#E65100' : '#C62828'
                        }}>
                            {remainingAttempts > 0 ? `사용: ${attempts}/${dailyLimit}` : '완료!'}
                        </span>
                    </div>
                </div>

                {/* 학년 선택 - 교사 설정 시 고정 표시 */}
                <div style={{
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.9)',
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'center',
                    flexWrap: 'wrap',
                    alignItems: 'center'
                }}>
                    {forcedGrade ? (
                        // 교사가 학년을 설정한 경우: 고정 표시
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '10px 20px',
                            background: '#E8F5E9',
                            borderRadius: '20px',
                            border: '2px solid #4CAF50'
                        }}>
                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#2E7D32' }}>
                                📚 {forcedGrade}학년 어휘
                            </span>
                            <span style={{ fontSize: '0.8rem', color: '#66BB6A' }}>
                                (선생님 설정)
                            </span>
                        </div>
                    ) : (
                        // 교사 설정이 없으면 학생이 선택 가능
                        [3, 4, 5, 6].map(grade => (
                            <motion.button
                                key={grade}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleGradeChange(grade)}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '20px',
                                    border: selectedGrade === grade ? '2px solid #1565C0' : '2px solid #E0E0E0',
                                    background: selectedGrade === grade ? '#1565C0' : 'white',
                                    color: selectedGrade === grade ? 'white' : '#666',
                                    fontSize: '0.95rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                {grade}학년
                            </motion.button>
                        ))
                    )}
                </div>

                {/* 상태 표시 바 */}
                <div style={{
                    padding: '20px',
                    background: 'rgba(255,255,255,0.95)',
                    margin: '0',
                    borderBottom: '2px solid #E3F2FD'
                }}>
                    {/* 현재 층수 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '50px',
                                height: '50px',
                                borderRadius: '50%',
                                background: getFloorBackground(stats.currentFloor),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.5rem',
                                fontWeight: 'bold',
                                color: getFloorTextColor(stats.currentFloor),
                                boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
                            }}>
                                {stats.currentFloor}
                            </div>
                            <div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333' }}>
                                    {stats.currentFloor}층
                                </div>
                                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                                    현재 위치
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.85rem', color: '#666' }}>다음 층까지</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1565C0' }}>
                                {stats.requiredExp - stats.experience} EXP
                            </div>
                        </div>
                    </div>

                    {/* 경험치 바 */}
                    <div style={{
                        width: '100%',
                        height: '12px',
                        background: '#E0E0E0',
                        borderRadius: '6px',
                        overflow: 'hidden'
                    }}>
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${stats.expProgress}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            style={{
                                height: '100%',
                                background: 'linear-gradient(90deg, #2196F3, #1565C0)',
                                borderRadius: '6px'
                            }}
                        />
                    </div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '8px',
                        fontSize: '0.8rem',
                        color: '#666'
                    }}>
                        <span>EXP: {stats.experience} / {stats.requiredExp}</span>
                        <span>📚 {stats.usedWords} / {stats.totalWords} 단어</span>
                    </div>

                    {/* [신규] 타이머 표시 */}
                    <div style={{
                        marginTop: '16px',
                        padding: '10px 15px',
                        background: timeLeft <= 10 ? '#FFEBEE' : '#F5F5F5',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        border: `1px solid ${timeLeft <= 10 ? '#FFCDD2' : '#E0E0E0'}`
                    }}>
                        <span style={{ fontSize: '1.2rem' }}>⏱️</span>
                        <div style={{ flex: 1, height: '8px', background: '#E0E0E0', borderRadius: '4px', overflow: 'hidden' }}>
                            <motion.div
                                animate={{ width: `${(timeLeft / timeLimit) * 100}%` }}
                                style={{
                                    height: '100%',
                                    background: timeLeft <= 10 ? '#E53935' : '#FF9800',
                                    borderRadius: '4px'
                                }}
                            />
                        </div>
                        <span style={{
                            fontSize: '1rem',
                            fontWeight: '1000',
                            color: timeLeft <= 10 ? '#C62828' : '#333',
                            minWidth: '40px',
                            textAlign: 'right',
                            fontFamily: 'monospace'
                        }}>
                            {timeLeft}초
                        </span>
                    </div>
                </div>

                {/* 퀴즈 및 랭킹 영역 - Flex 레이아웃으로 변경 (겹침 방지) */}
                {currentQuiz && (
                    <div style={{
                        width: '100%',
                        padding: '20px',
                        margin: '10px auto 0 auto',
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap', // 화면이 좁아지면 아래로 배치
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        gap: '24px',
                        minHeight: 'auto'
                    }}>
                        {/* [신규] 랭킹 보드 */}
                        <div style={{
                            width: '300px',
                            background: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(10px)',
                            borderRadius: '24px',
                            padding: '24px 20px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                            border: '2px solid #E3F2FD',
                            zIndex: 10,
                            flexShrink: 0
                        }}>
                            <h3 style={{
                                margin: '0 0 20px 0',
                                fontSize: '1.1rem',
                                color: '#1565C0',
                                fontWeight: '900',
                                textAlign: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}>
                                🏆 실시간 탑 랭킹
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(() => {
                                    if (rankings.length === 0) {
                                        return <p style={{ textAlign: 'center', color: '#999', fontSize: '0.85rem', margin: '20px 0' }}> 아직 기록이 없어요!</p>;
                                    }

                                    // 층별 그룹화
                                    const grouped = rankings.reduce((acc, curr) => {
                                        const f = curr.max_floor;
                                        if (!acc[f]) acc[f] = [];
                                        acc[f].push(curr);
                                        return acc;
                                    }, {});

                                    // 층수 내림차순 정렬
                                    const sortedFloors = Object.keys(grouped).sort((a, b) => b - a);

                                    let currentRank = 1;
                                    return sortedFloors.map((floor, idx) => {
                                        const students = grouped[floor];
                                        const rank = currentRank;
                                        currentRank += students.length; // 공동 순위 반영 (예: 1등 2명이면 다음은 3등)

                                        const isMyGroup = students.some(s => s.student_id === studentSession?.id);

                                        return (
                                            <div key={floor} style={{
                                                background: isMyGroup ? '#E3F2FD' : 'white',
                                                borderRadius: '16px',
                                                padding: '12px 14px',
                                                border: isMyGroup ? '2px solid #2196F3' : '1px solid #F0F0F0',
                                                boxShadow: isMyGroup ? '0 4px 12px rgba(33, 150, 243, 0.1)' : 'none'
                                            }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: '6px'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            fontWeight: '1000',
                                                            fontSize: '1rem',
                                                            color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#9E9E9E',
                                                        }}>
                                                            {rank}위
                                                        </span>
                                                        <span style={{ fontWeight: '1000', color: '#1565C0', fontSize: '0.95rem' }}>{floor}F</span>
                                                    </div>
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    gap: '6px'
                                                }}>
                                                    {students.map(s => (
                                                        <span key={s.student_id} style={{
                                                            fontSize: '0.85rem',
                                                            padding: '4px 8px',
                                                            background: s.student_id === studentSession?.id ? '#2196F3' : '#F5F5F5',
                                                            color: s.student_id === studentSession?.id ? 'white' : '#555',
                                                            borderRadius: '8px',
                                                            fontWeight: s.student_id === studentSession?.id ? 'bold' : 'normal'
                                                        }}>
                                                            {s.students?.name || '학생'}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>

                        {/* 메인 퀴즈 컨텐츠 */}
                        <div style={{
                            flex: '1',
                            maxWidth: '800px',
                            minWidth: '320px',
                            position: 'relative',
                            zIndex: 1
                        }}>
                            {/* 문제 카드 */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                key={currentQuiz.correctAnswer}
                                style={{
                                    background: 'white',
                                    borderRadius: '24px',
                                    padding: '30px', // 패딩 약간 축소
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                                    marginBottom: '20px'
                                }}
                            >
                                {/* 카테고리 & 레벨 태그 */}
                                <div style={{
                                    display: 'flex',
                                    gap: '10px',
                                    marginBottom: '16px',
                                    flexWrap: 'wrap'
                                }}>
                                    <span style={{
                                        background: '#E3F2FD',
                                        color: '#1565C0',
                                        padding: '6px 14px',
                                        borderRadius: '20px',
                                        fontSize: '0.85rem',
                                        fontWeight: 'bold'
                                    }}>
                                        {currentQuiz.category}
                                    </span>
                                    <span style={{
                                        background: currentQuiz.level >= 4 ? '#FCE4EC' : currentQuiz.level >= 2 ? '#FFF3E0' : '#E8F5E9',
                                        color: currentQuiz.level >= 4 ? '#C2185B' : currentQuiz.level >= 2 ? '#E65100' : '#2E7D32',
                                        padding: '6px 14px',
                                        borderRadius: '20px',
                                        fontSize: '0.85rem',
                                        fontWeight: 'bold'
                                    }}>
                                        레벨 {currentQuiz.level}
                                    </span>
                                </div>

                                {/* 문제 (뜻) */}
                                <h3 style={{
                                    fontSize: '1.6rem',
                                    color: '#333',
                                    marginBottom: '16px',
                                    lineHeight: 1.5,
                                    fontWeight: '600'
                                }}>
                                    📖 "{currentQuiz.question}"
                                </h3>

                                {/* 예문 */}
                                <p style={{
                                    fontSize: '1.1rem',
                                    color: '#666',
                                    background: '#F5F5F5',
                                    padding: '14px 18px',
                                    borderRadius: '12px',
                                    lineHeight: 1.6,
                                    borderLeft: '4px solid #2196F3'
                                }}>
                                    💡 <strong>힌트:</strong> {currentQuiz.example?.replace(currentQuiz.correctAnswer, '___') || '예문이 없습니다.'}
                                </p>
                            </motion.div>

                            {/* 보기 버튼들 */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '16px'
                            }}>
                                {currentQuiz.options.map((option, index) => {
                                    const isSelected = selectedAnswer === option;
                                    const isCorrect = option === currentQuiz.correctAnswer;
                                    const showCorrectness = showResult;

                                    let buttonStyle = {
                                        background: 'white',
                                        border: '2px solid #E0E0E0',
                                        color: '#333'
                                    };

                                    if (showCorrectness) {
                                        if (isCorrect) {
                                            buttonStyle = {
                                                background: 'linear-gradient(135deg, #4CAF50, #81C784)',
                                                border: '2px solid #4CAF50',
                                                color: 'white'
                                            };
                                        } else if (isSelected && !isCorrect) {
                                            buttonStyle = {
                                                background: 'linear-gradient(135deg, #EF5350, #E57373)',
                                                border: '2px solid #EF5350',
                                                color: 'white'
                                            };
                                        }
                                    } else if (isSelected) {
                                        buttonStyle = {
                                            background: '#E3F2FD',
                                            border: '2px solid #2196F3',
                                            color: '#1565C0'
                                        };
                                    }

                                    return (
                                        <motion.button
                                            key={option}
                                            whileHover={!showResult ? { scale: 1.03 } : {}}
                                            whileTap={!showResult ? { scale: 0.97 } : {}}
                                            onClick={() => handleAnswerSelect(option)}
                                            disabled={showResult}
                                            style={{
                                                padding: '22px 20px',
                                                borderRadius: '16px',
                                                ...buttonStyle,
                                                fontSize: '1.25rem',
                                                fontWeight: 'bold',
                                                cursor: showResult ? 'default' : 'pointer',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px'
                                            }}
                                        >
                                            {showCorrectness && isCorrect && '✅ '}
                                            {showCorrectness && isSelected && !isCorrect && '❌ '}
                                            {option}
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {/* 결과 표시 및 다음 버튼 */}
                            <AnimatePresence>
                                {showResult && lastResult && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -20 }}
                                        style={{
                                            marginTop: '16px',
                                            padding: '12px 20px',
                                            background: lastResult.isCorrect
                                                ? 'linear-gradient(135deg, #E8F5E9, #C8E6C9)'
                                                : 'linear-gradient(135deg, #FFEBEE, #FFCDD2)',
                                            borderRadius: '20px',
                                            textAlign: 'center',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.8rem' }}>
                                                {lastResult.isCorrect ? '🎉' : '💪'}
                                            </span>
                                            <h3 style={{
                                                color: lastResult.isCorrect ? '#2E7D32' : '#C62828',
                                                margin: 0,
                                                fontSize: '1.2rem'
                                            }}>
                                                {lastResult.isCorrect ? '정답이에요!' : '아쉬워요!'}
                                            </h3>
                                        </div>
                                        {lastResult.isCorrect && (
                                            <p style={{ color: '#388E3C', fontSize: '1rem', margin: 0 }}>
                                                +{lastResult.earnedExp} EXP 획득! 🌟
                                            </p>
                                        )}
                                        {!lastResult.isCorrect && (
                                            <p style={{ color: '#666', fontSize: '0.95rem', margin: 0 }}>
                                                정답: <strong style={{ color: '#1565C0' }}>{lastResult.correctAnswer}</strong>
                                            </p>
                                        )}

                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={handleNextQuestion}
                                            style={{
                                                marginTop: '10px',
                                                padding: '10px 32px',
                                                borderRadius: '20px',
                                                border: 'none',
                                                background: 'linear-gradient(135deg, #2196F3, #1565C0)',
                                                color: 'white',
                                                fontSize: '1.1rem',
                                                fontWeight: 'bold',
                                                cursor: 'pointer',
                                                boxShadow: '0 4px 15px rgba(33, 150, 243, 0.3)'
                                            }}
                                        >
                                            다음 문제 →
                                        </motion.button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {/* 하단 재시작 버튼 */}
                <div style={{
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'center',
                    paddingBottom: '100px'
                }}>
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleRestart}
                        style={{
                            padding: '12px 28px',
                            borderRadius: '20px',
                            border: '2px solid rgba(255,255,255,0.5)',
                            background: 'rgba(255,255,255,0.2)',
                            color: getFloorTextColor(stats.currentFloor),
                            fontSize: '0.95rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            backdropFilter: 'blur(10px)'
                        }}
                    >
                        🔄 처음부터 다시 시작
                    </motion.button>
                </div>
                {/* [신규] 시간 초과 오버레이 */}
                <AnimatePresence>
                    {isTimeUp && !isFullyExhausted && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                zIndex: 6000, padding: '20px'
                            }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                style={{
                                    background: 'white', borderRadius: '32px', padding: '40px 30px',
                                    maxWidth: '400px', width: '100%', textAlign: 'center'
                                }}
                            >
                                <span style={{ fontSize: '4rem', display: 'block', marginBottom: '20px' }}>⏱️</span>
                                <h2 style={{ fontSize: '1.8rem', color: '#E53935', margin: '0 0 10px 0', fontWeight: '900' }}>제한시간 종료!</h2>
                                <p style={{ color: '#666', marginBottom: '30px', lineHeight: '1.6' }}>
                                    아쉽게도 시간이 모두 지났어요!<br />
                                    기회를 1회 소진했습니다.<br />
                                    <strong>남은 기회: {remainingAttempts}회</strong>
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <Button
                                        onClick={handleContinue}
                                        style={{
                                            background: '#2196F3', color: 'white', height: '56px',
                                            fontSize: '1.1rem', fontWeight: 'bold', borderRadius: '16px'
                                        }}
                                    >
                                        계속 도전하기 🚀
                                    </Button>
                                    <Button
                                        onClick={onBack}
                                        variant="ghost"
                                        style={{
                                            color: '#757575', height: '56px',
                                            fontSize: '1rem', fontWeight: 'bold'
                                        }}
                                    >
                                        그만하고 나갈래요 🏠
                                    </Button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* [신규] 모든 기회 소진 오버레이 (보상 획득) */}
                <AnimatePresence>
                    {isFullyExhausted && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                zIndex: 7000, padding: '20px'
                            }}
                        >
                            <motion.div
                                initial={{ scale: 0.8, y: 50 }}
                                animate={{ scale: 1, y: 0 }}
                                style={{
                                    background: 'white', borderRadius: '32px', padding: '40px 30px',
                                    maxWidth: '450px', width: '100%', textAlign: 'center',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                                }}
                            >
                                <span style={{ fontSize: '4rem', display: 'block', marginBottom: '20px' }}>🏆</span>
                                <h2 style={{ fontSize: '2rem', color: '#FF9800', margin: '0 0 10px 0', fontWeight: '1000' }}>오늘의 미션 완료!</h2>
                                <p style={{ color: '#666', fontSize: '1.1rem', marginBottom: '30px', lineHeight: '1.6' }}>
                                    {dailyLimit}번의 기회를 모두 사용했어요!<br />
                                    정상을 향한 학생의 열정, 정말 멋져요!<br />
                                    <strong>{stats.currentFloor}층</strong>까지 등반했습니다!
                                </p>

                                <div style={{
                                    background: '#FFF8E1', borderRadius: '20px', padding: '20px',
                                    marginBottom: '40px', border: '2px dashed #FF9800'
                                }}>
                                    <span style={{ color: '#F57C00', fontWeight: 'bold' }}>축하 보너스</span>
                                    <div style={{ fontSize: '2.5rem', fontWeight: '1000', color: '#E65100', marginTop: '10px' }}>
                                        +{rewardPoints}P
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: '#FB8C00', marginTop: '10px', margin: 0 }}>
                                        (포인트가 보관함에 지급되었습니다)
                                    </p>
                                </div>

                                <Button
                                    onClick={onBack}
                                    style={{
                                        width: '100%', height: '60px',
                                        background: '#1565C0', color: 'white',
                                        fontSize: '1.2rem', fontWeight: '900', borderRadius: '20px'
                                    }}
                                >
                                    대시보드로 돌아가기 🏠
                                </Button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div> {/* 컨텐츠 래퍼 닫기 */}
        </div>
    );
};

// 재사용 가능한 버튼 컴포넌트
const Button = ({ children, onClick, style, variant = 'primary', disabled = false }) => (
    <motion.button
        whileHover={!disabled ? { scale: 1.02, y: -2 } : {}}
        whileTap={!disabled ? { scale: 0.98 } : {}}
        onClick={onClick}
        disabled={disabled}
        style={{
            padding: '0 20px',
            borderRadius: '12px',
            border: 'none',
            fontSize: '14px',
            fontWeight: '600',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: variant === 'ghost' ? 'none' : '0 4px 12px rgba(0,0,0,0.1)',
            opacity: disabled ? 0.6 : 1,
            background: variant === 'ghost' ? 'transparent' : '#eee',
            ...style
        }}
    >
        {children}
    </motion.button>
);

export default VocabularyTowerGame;
