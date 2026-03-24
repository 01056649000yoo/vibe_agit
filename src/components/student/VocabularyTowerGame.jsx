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
    const [isTowerCleared, setIsTowerCleared] = useState(false); // [신규] 10층 클리어 상태

    // [신규] 일일 시도 횟수 관리
    const getTodayKey = () => {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const resetSuffix = resetDate ? `_${resetDate}` : '';
        return `vocab_tower_attempts_${studentSession?.id}_${today}${resetSuffix}`;
    };

    // [rerender-lazy-state-init] + [js-cache-storage]
    // 초기 렌더링 시에만 localStorage에서 값을 호출하고 상태로 관리합니다.
    const [attempts, setAttempts] = useState(() => {
        const key = getTodayKey();
        const stored = localStorage.getItem(key);
        return stored ? parseInt(stored, 10) : 0;
    });
    const [hasStarted, setHasStarted] = useState(false);
    const [isIntroOpen, setIsIntroOpen] = useState(true); // [신규] 게임 시작 안내 화면 상태

    // 현재 표시용 남은 횟수
    const remainingAttempts = Math.max(0, dailyLimit - attempts);
    // 초기 진입 시 남은 횟수 계산 (attempts 상태의 현재값 활용)
    const initialRemaining = dailyLimit - attempts;

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
        // 게임 진입 시 차감 전 남은 횟수가 0 이하면 즉시 종료 (안내창 띄울 필요 없이)
        if (initialRemaining <= 0) {
            setIsFullyExhausted(true);
            setIsIntroOpen(false);
            return;
        }
    }, []); // 입구 컷만 담당하므로 마운트 시에만 한 번 체크

    // [신규] 실제로 게임을 시작하는 함수 (버튼 클릭 시 호출)
    const handleGameStart = () => {
        if (consumeAttempt()) {
            setHasStarted(true);
            setIsIntroOpen(false);
        }
    };

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
        const todayKey = getTodayKey();
        const rewardKey = `${todayKey}_rewarded`;

        // [js-cache-storage] localStorage 호출 결과를 상수에 할당
        const isRewarded = localStorage.getItem(rewardKey);

        // 이미 지급했거나 보상 포인트가 0 이하인 경우 방지
        if (awardedPoints > 0 || rewardPoints <= 0 || isRewarded) {
            // 이미 지급된 상태라면 상태값만 동기화 (UI 표시용)
            if (isRewarded && awardedPoints === 0) {
                setAwardedPoints(rewardPoints);
            }
            return;
        }

        try {
            console.log('💰 보상 포인트 지급 시작:', { student_id: studentSession.id, points: rewardPoints });

            const { error } = await supabase.rpc('reward_for_vocab_tower', {
                p_amount: rewardPoints
            });

            if (error) throw error;

            // 로컬 스토리지에 기록하여 중복 지급 방지
            localStorage.setItem(rewardKey, 'true');
            setAwardedPoints(rewardPoints);

            // [수정] 중복 알림 방지를 위해 브라우저 alert 제거 (중앙 배너 UI만 노출)
            console.log('✅ 보상 포인트 지급 완료');
        } catch (err) {
            console.error('❌ 보상 포인트 지급 실패:', err);
            alert('⚠️ 보상 포인트 지급 중 오류가 발생했습니다. 선생님께 문의해 주세요.\n(에러: ' + (err.message || '데이터베이스 연결 오류') + ')');
        }
    };

    // 최신 currentFloor를 ref로 추적 (stale closure 방지)
    const currentFloorRef = React.useRef(1);

    useEffect(() => {
        if (isFullyExhausted && !isTowerCleared) { // 클리어 시에는 중복 실행 안 함
            // [수정] ref로 추적한 최신 층수 사용
            const finalFloor = currentFloorRef.current;
            const classId = studentSession?.class_id || studentSession?.classId;
            if (studentSession?.id && classId) {
                supabase.rpc('update_tower_max_floor', {
                    p_student_id: studentSession.id,
                    p_class_id: classId,
                    p_floor: finalFloor
                }).then(({ error }) => {
                    if (error) {
                        console.error('❌ isFullyExhausted 시 쳕수 기록 실패:', error);
                    } else {
                        // 랭킹 갱신
                        supabase
                            .from('vocab_tower_rankings')
                            .select('max_floor, student_id, students:student_id ( name )')
                            .eq('class_id', classId)
                            .order('max_floor', { ascending: false })
                            .then(({ data }) => { if (data) setRankings(data); });
                    }
                });
            }
            handleRewardPoints();
        }
    }, [isFullyExhausted, isTowerCleared, studentSession?.id, studentSession?.class_id, studentSession?.classId]);

    // [신규] 10층 클리어 보상 지급 로직 (500 포인트)
    useEffect(() => {
        if (isTowerCleared) {
            const clearKey = `${getTodayKey()}_floor10_cleared`;
            const isCleared = localStorage.getItem(clearKey);

            if (!isCleared) {
                console.log('👑 10층 정복 보상 지급 시작: 500P');
                supabase.rpc('reward_for_vocab_tower', { p_amount: 500 })
                    .then(({ error }) => {
                        if (!error) {
                            localStorage.setItem(clearKey, 'true');
                            console.log('✅ 10층 정복 보상 지급 완료');
                        } else {
                            console.error('❌ 10층 정복 보상 지급 실패:', error);
                        }
                    });
            }
        }
    }, [isTowerCleared, studentSession?.id]);

    // []
    const fetchRankings = React.useCallback(async () => {
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

            if (rankingResetDate) {
                query = query.gte('updated_at', rankingResetDate);
            }

            const { data, error } = await query.order('max_floor', { ascending: false });
            if (error) throw error;
            setRankings(data || []);
        } catch (err) {
            console.error('❌ 랭킹 로드 실패:', err);
        }
    }, [studentSession?.class_id, studentSession?.classId, rankingResetDate]);

    useEffect(() => {
        if (studentSession?.class_id || studentSession?.classId) {
            fetchRankings();
        }
    }, [fetchRankings]);

    // [신규] 최고 층수 업데이트 (순환참조 제거 - fetchRankings 개별 호출)
    const updateMaxFloor = React.useCallback(async (floor) => {
        const classId = studentSession?.class_id || studentSession?.classId;
        if (!studentSession?.id || !classId) return;

        try {
            const { error } = await supabase.rpc('update_tower_max_floor', {
                p_student_id: studentSession.id,
                p_class_id: classId,
                p_floor: floor
            });
            if (error) throw error;
            fetchRankings(); // 랭킹 갱신
        } catch (err) {
            console.error('❌ 최고 층수 업데이트 실패:', err);
        }
    }, [studentSession?.id, studentSession?.class_id, studentSession?.classId, fetchRankings]);

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
            const newFloor = lastResult.newFloor ?? stats.currentFloor;
            // ref 업데이트
            currentFloorRef.current = newFloor;
            setPreviousFloor(newFloor - 1);
            setShowLevelUp(true);

            // [수정] 레벨업 시 최고 층수 DB 업데이트
            updateMaxFloor(newFloor);

            const bonus = 20 + (Math.max(0, newFloor - 2) * 3);
            setTimeLeft(prev => prev + bonus);

            setTimeout(() => {
                setShowLevelUp(false);
                // 10층에 막 도달했다면 클리어 처리
                if (newFloor === 10) {
                    setIsTowerCleared(true);
                }
            }, 3000);
        }
    }, [lastResult]);

    // [신규] 광클(어뷰징) 방지를 위한 트랜지션 락
    const isTransitioningRef = React.useRef(false);

    // 정답 선택 핸들러
    const handleAnswerSelect = (answer) => {
        if (showResult || selectedAnswer || isTransitioningRef.current) return; // 광클 어뷰징 방지
        setSelectedAnswer(answer);
        actions.handleAnswer(answer);
        setShowResult(true);
    };

    // 다음 문제로 이동
    const handleNextQuestion = () => {
        if (isTransitioningRef.current) return; // 이미 넘어가는 중이면 무시 (광클 방지)
        isTransitioningRef.current = true;

        setShowResult(false);
        setSelectedAnswer(null);
        actions.nextQuiz();

        // 새 퀴즈 렌더링 후 락 해제 (버튼 애니메이션 페이드아웃 고려 0.3초)
        setTimeout(() => {
            isTransitioningRef.current = false;
        }, 300);
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

        // 기본 경고 메시지
        let message = '⚠️ 아직 게임이 진행 중이에요! 지금 나가면 시도 횟수 1회가 차감됩니다.\n정말 대시보드로 나갈까요?';

        // 마지막 기회인 경우 포인트 미지급 경고 추가
        if (remainingAttempts === 0) {
            message = '⚠️ 마지막 도전 기회예요! 지금 게임을 중단하고 나가면 일일 미션 보상 포인트를 받을 수 없어요.\n끝까지 도전해서 보상을 챙겨보세요! 정말 나갈까요?';
        }

        if (window.confirm(message)) {
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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                pointerEvents: 'none',
                scale: '1.2'
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

                {/* [신규] 게임 시작 안내 화면 (Intro) */}
                <AnimatePresence>
                    {isIntroOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'fixed', inset: 0,
                                background: 'rgba(0,0,0,0.8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                zIndex: 20000, padding: '20px'
                            }}
                        >
                            <motion.div
                                initial={{ scale: 0.9, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                style={{
                                    background: 'white', borderRadius: '32px', padding: '40px 30px',
                                    maxWidth: '450px', width: '100%', textAlign: 'center',
                                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                                    position: 'relative', overflow: 'hidden'
                                }}
                            >
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, height: '8px',
                                    background: 'linear-gradient(90deg, #1565C0, #42A5F5)'
                                }} />

                                <span style={{ fontSize: '4.5rem', display: 'block', marginBottom: '10px' }}>🏰</span>
                                <h2 style={{ fontSize: '1.8rem', color: '#1565C0', margin: '10px 0', fontWeight: '900' }}>어휘의 탑 챌린지</h2>

                                <div style={{
                                    background: '#F0F7FF', borderRadius: '20px', padding: '20px',
                                    margin: '25px 0', textAlign: 'left', border: '1px solid #E3F2FD'
                                }}>
                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.95rem', color: '#455A64', lineHeight: '1.6' }}>
                                        🎯 <strong>게임 방법:</strong><br />
                                        제한 시간 내에 어휘 퀴즈를 맞히고 탑을 높이 올라가세요! 정답을 맞히면 경험치를 얻고 다음 층으로 올라갑니다.
                                    </p>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#455A64', lineHeight: '1.6' }}>
                                        💡 <strong>도전 기회:</strong><br />
                                        매일 총 <strong>{dailyLimit}번</strong>의 도전 기회가 주어집니다.<br />
                                        (현재 남은 기회: <strong>{remainingAttempts}회</strong>)
                                    </p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                                    <Button
                                        onClick={onBack}
                                        variant="ghost"
                                        style={{
                                            height: '60px', border: '2px solid #E0E0E0',
                                            color: '#757575', borderRadius: '20px'
                                        }}
                                    >
                                        나중에 하기
                                    </Button>
                                    <Button
                                        onClick={handleGameStart}
                                        style={{
                                            height: '60px', background: 'linear-gradient(135deg, #1565C0, #1976D2)',
                                            color: 'white', fontSize: '1.1rem', fontWeight: '900',
                                            borderRadius: '20px', boxShadow: '0 8px 16px rgba(21, 101, 192, 0.3)'
                                        }}
                                    >
                                        챌린지 시작! 🚀
                                    </Button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* 미니 타워 맵 제거 (중복) */}
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

                {/* 헤더 - 학년 표시 통합 */}
                <div style={{
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(10px)',
                    borderBottom: '2px solid #E3F2FD',
                    zIndex: 1000,
                    height: '70px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
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

                        {/* [개선] 학년 표시를 헤더로 이동 (상단 공간 절약) */}
                        <div style={{
                            padding: '6px 16px',
                            background: '#E3F2FD',
                            borderRadius: '12px',
                            border: '1px solid #BBDEFB',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1565C0' }}>📚 {selectedGrade}학년</span>
                        </div>
                    </div>

                    <h2 style={{ margin: 0, color: '#1565C0', fontSize: '1.2rem', fontWeight: '800', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>🏰 어휘의 탑</h2>

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

                {/* 기존 학년 선택 영역 제거 (헤더로 통합됨) */}

                {/* 상태바 (경험치 & 타이머) - 더 컴팩트하게 */}
                <div style={{
                    padding: '10px 20px',
                    background: 'rgba(255,255,255,0.8)',
                    backdropFilter: 'blur(5px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    borderBottom: '1px solid rgba(0,0,0,0.05)'
                }}>
                    {/* 현재 층수 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '90px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: getFloorBackground(stats.currentFloor),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.9rem', fontWeight: 'bold', color: getFloorTextColor(stats.currentFloor),
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                        }}>{stats.currentFloor}</div>
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{stats.currentFloor}층</span>
                    </div>

                    {/* 경험치 바 */}
                    <div style={{ flex: 1 }}>
                        <div style={{ width: '100%', height: '8px', background: '#E0E0E0', borderRadius: '4px', overflow: 'hidden' }}>
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${stats.expProgress}%` }}
                                style={{ height: '100%', background: 'linear-gradient(90deg, #2196F3, #1565C0)' }}
                            />
                        </div>
                    </div>

                    {/* [신규] 타이머 - 컴팩트형 */}
                    <div style={{
                        minWidth: '100px', padding: '4px 12px',
                        background: timeLeft <= 10 ? '#FFEBEE' : '#F5F5F5',
                        borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px',
                        border: `1px solid ${timeLeft <= 10 ? '#FFCDD2' : '#E0E0E0'}`
                    }}>
                        <span>⏱️</span>
                        <span style={{ fontWeight: 'bold', color: timeLeft <= 10 ? '#C62828' : '#333' }}>{timeLeft}초</span>
                    </div>
                </div>

                {/* 3열 레이아웃: 랭킹 / 퀴즈 / 타워맵 */}
                {currentQuiz && (
                    <div style={{
                        flex: 1,
                        width: '100%',
                        padding: '10px 20px',
                        display: 'grid',
                        gridTemplateColumns: 'minmax(250px, 300px) 1fr minmax(150px, 200px)',
                        gap: '20px',
                        alignItems: 'start',
                        overflowY: 'auto'
                    }}>
                        {/* [1열] 랭킹 리스트 (좌측) */}
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.95)',
                            borderRadius: '24px',
                            padding: '20px 16px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                            border: '1px solid #E3F2FD',
                            maxHeight: 'calc(100vh - 120px)',
                            overflowY: 'auto'
                        }}>
                            <h3 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: '#1565C0', fontWeight: '900', textAlign: 'center' }}>🏆 탑 랭킹</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {/* 랭킹 렌더링 (동일 로직 최적화) */}
                                {(() => {
                                    if (rankings.length === 0) return <p style={{ textAlign: 'center', color: '#999', fontSize: '0.8rem' }}>참여 기록 없음</p>;
                                    const grouped = rankings.reduce((acc, curr) => {
                                        const f = curr.max_floor;
                                        if (!acc[f]) acc[f] = [];
                                        acc[f].push(curr);
                                        return acc;
                                    }, {});
                                    const sortedFloors = Object.keys(grouped).sort((a, b) => b - a);
                                    let currentRank = 1;
                                    return sortedFloors.slice(0, 5).map((floor) => { // 상위 5그룹만 표시
                                        const students = grouped[floor];
                                        const rank = currentRank;
                                        currentRank += students.length;
                                        const isMyGroup = students.some(s => s.student_id === studentSession?.id);
                                        return (
                                            <div key={floor} style={{
                                                background: isMyGroup ? '#E3F2FD' : '#F8F9FA',
                                                borderRadius: '12px', padding: '10px',
                                                border: isMyGroup ? '1px solid #2196F3' : '1px solid #EEE'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 'bold', marginBottom: '4px' }}>
                                                    <span style={{ color: rank <= 3 ? '#E65100' : '#666' }}>{rank}위</span>
                                                    <span style={{ color: '#1565C0' }}>{floor}F</span>
                                                </div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {students.map(s => (
                                                        <span key={s.student_id} style={{ fontSize: '0.75rem', padding: '2px 6px', background: s.student_id === studentSession?.id ? '#2196F3' : 'white', color: s.student_id === studentSession?.id ? 'white' : '#555', borderRadius: '4px', border: '1px solid #DDD' }}>
                                                            {s.students?.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>

                        {/* [2열] 메인 퀴즈 (중앙) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {/* 문제 카드 - 더 컴팩트하게 */}
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                key={currentQuiz.correctAnswer}
                                style={{
                                    background: 'white', borderRadius: '24px', padding: '25px',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.08)', border: '1px solid #EEE'
                                }}
                            >
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                    <span style={{ background: '#E3F2FD', color: '#1565C0', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>{currentQuiz.category}</span>
                                    <span style={{ background: '#F5F5F5', color: '#666', padding: '4px 12px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>Lv.{currentQuiz.level}</span>
                                </div>
                                <h3 style={{ fontSize: '1.4rem', color: '#333', marginBottom: '12px', lineHeight: 1.4, fontWeight: '700' }}>📖 "{currentQuiz.question}"</h3>
                                <p style={{ fontSize: '1rem', color: '#666', background: '#F9F9F9', padding: '12px 15px', borderRadius: '12px', borderLeft: '4px solid #2196F3', margin: 0 }}>
                                    💡 힌트: {currentQuiz.example?.replace(currentQuiz.correctAnswer, '___') || '예문이 없습니다.'}
                                </p>
                            </motion.div>

                            {/* 보기 버튼들 - 그리드 최적화 */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                {currentQuiz.options.map((option) => {
                                    const isSelected = selectedAnswer === option;
                                    const isCorrect = option === currentQuiz.correctAnswer;
                                    const showCorrectness = showResult;
                                    let btnStyle = { background: 'white', border: '2px solid #EEE', color: '#333' };
                                    if (showCorrectness) {
                                        if (isCorrect) btnStyle = { background: '#4CAF50', border: '2px solid #4CAF50', color: 'white' };
                                        else if (isSelected) btnStyle = { background: '#EF5350', border: '2px solid #EF5350', color: 'white' };
                                    } else if (isSelected) btnStyle = { background: '#E3F2FD', border: '2px solid #2196F3', color: '#1565C0' };

                                    return (
                                        <motion.button
                                            key={option}
                                            whileHover={!showResult ? { scale: 1.02, y: -2 } : {}}
                                            whileTap={!showResult ? { scale: 0.98 } : {}}
                                            onClick={() => handleAnswerSelect(option)}
                                            disabled={showResult}
                                            style={{
                                                padding: '16px', borderRadius: '16px', ...btnStyle,
                                                fontSize: '1.1rem', fontWeight: 'bold', cursor: showResult ? 'default' : 'pointer',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transition: 'all 0.2s'
                                            }}
                                        >
                                            {option}
                                        </motion.button>
                                    );
                                })}
                            </div>

                            {/* 정답 확인 결과 및 다음 버튼 */}
                            <AnimatePresence>
                                {showResult && lastResult && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                        style={{
                                            padding: '12px 20px', borderRadius: '16px', textAlign: 'center',
                                            background: lastResult.isCorrect ? '#E8F5E9' : '#FFEBEE',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px'
                                        }}
                                    >
                                        <span style={{ fontWeight: 'bold', color: lastResult.isCorrect ? '#2E7D32' : '#C62828' }}>
                                            {lastResult.isCorrect ? `🎉 정답! +${lastResult.earnedExp} EXP` : `💪 아쉬워요! 정답은 [${lastResult.correctAnswer}]`}
                                        </span>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                            onClick={handleNextQuestion}
                                            style={{
                                                padding: '8px 24px', borderRadius: '12px', border: 'none',
                                                background: '#1565C0', color: 'white', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer'
                                            }}
                                        >다음 문제 →</motion.button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* [3열] 실시간 타워 맵 (우측) */}
                        <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'flex-start', paddingTop: '20px', pointerEvents: 'none'
                        }}>
                            <div style={{ transform: 'scale(0.85)' }}>
                                <TowerMap />
                            </div>
                            <div style={{
                                marginTop: '20px', padding: '10px 15px', background: 'rgba(255,255,255,0.7)',
                                borderRadius: '12px', textAlign: 'center', backdropFilter: 'blur(5px)'
                            }}>
                                <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '2px' }}>나의 정복도</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1565C0' }}>{stats.currentFloor}층 탐험 중</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 하단 재설정 버튼 - 컴팩트 레이아웃에선 제거 또는 최소화 */}
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

                {/* [신규] 10층 타워 클리어 오버레이 */}
                <AnimatePresence>
                    {isTowerCleared && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                position: 'fixed', inset: 0, background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                zIndex: 8000, padding: '20px'
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
                                <span style={{ fontSize: '4.5rem', display: 'block', marginBottom: '15px' }}>👑</span>
                                <h2 style={{ fontSize: '2.2rem', color: '#FF9800', margin: '0 0 10px 0', fontWeight: '1000' }}>어휘마스터 등극!</h2>
                                <p style={{ color: '#666', fontSize: '1.1rem', marginBottom: '30px', lineHeight: '1.6' }}>
                                    대단해요! 어휘의 탑 정상을 정복했습니다!<br />
                                    전설적인 실력을 증명한 학생에게<br />
                                    <strong>특별 보너스</strong>를 드립니다!
                                </p>

                                <div style={{
                                    background: '#FFF8E1', borderRadius: '20px', padding: '20px',
                                    marginBottom: '40px', border: '2px dashed #FF9800'
                                }}>
                                    <span style={{ color: '#F57C00', fontWeight: 'bold' }}>탑 클리어 기념 보너스</span>
                                    <div style={{ fontSize: '3rem', fontWeight: '1000', color: '#E65100', marginTop: '10px' }}>
                                        +500P
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: '#FB8C00', marginTop: '10px', margin: 0 }}>
                                        (보관함에 즉시 지급되었습니다)
                                    </p>
                                </div>

                                <Button
                                    onClick={onBack}
                                    style={{
                                        width: '100%', height: '60px',
                                        background: '#E65100', color: 'white',
                                        fontSize: '1.2rem', fontWeight: '900', borderRadius: '20px'
                                    }}
                                >
                                    위풍당당하게 돌아가기 🏠
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
