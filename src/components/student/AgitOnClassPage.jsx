import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClassAgitClass } from '../../hooks/useClassAgitClass';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';

// 교실 속 비밀 아지트 느낌의 수채화 배경
const CLASSROOM_BG = "/agit_hideout_bg.png";

const AgitOnClassPage = ({ studentSession, onBack, onNavigate }) => {
    console.log("🎓 [학생 아지트 페이지] studentSession:", studentSession);

    const classId = studentSession?.classId || studentSession?.class_id;
    const {
        loading,
        temperature,
        stageLevel,
        stageInfo,
        unlockedContent,
        boardMessages,
        myMissionStatus,
        agitSettings,
        achievedStudents
    } = useClassAgitClass(classId, studentSession?.id);

    // [신규] 아지트 명예의 전당 새 소식 확인 (최근 24시간)
    const [hasNewAgitHonor, setHasNewAgitHonor] = useState(false);

    useEffect(() => {
        const checkNewHonor = async () => {
            if (!classId) return;
            try {
                // [신규] 명예의 전당 최신 글 조회 및 확인 여부 체크
                const { data: latestHonor } = await supabase
                    .from('agit_honor_roll')
                    .select('created_at')
                    .eq('class_id', classId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (latestHonor) {
                    const lastCheck = localStorage.getItem(`last_visit_agit_onclass_${classId}`);
                    // 최근 24시간 이내의 글이면서, 마지막 확인보다 최신일 때만 NEW 표시
                    const isRecent = new Date(latestHonor.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const isUnchecked = !lastCheck || new Date(latestHonor.created_at) > new Date(lastCheck);

                    if (isRecent && isUnchecked) {
                        setHasNewAgitHonor(true);
                    }
                }
            } catch (err) {
                console.error('명예의 전당 새 소식 확인 실패:', err);
            }
        };
        checkNewHonor();
    }, [classId]);

    const [subTab, setSubTab] = useState('hub');
    const [isMobileSize, setIsMobileSize] = useState(window.innerWidth <= 1024);
    const [showSurprise, setShowSurprise] = useState(false);

    // 전광판 2줄 노출을 위한 메시지 분리
    const row1Messages = boardMessages.filter((_, i) => i % 2 === 0);
    const row2Messages = boardMessages.filter((_, i) => i % 2 !== 0);
    const displayRow1 = row1Messages.length > 0 ? row1Messages : boardMessages;
    const displayRow2 = row2Messages.length > 0 ? row2Messages : (boardMessages.length > 0 ? boardMessages : ["..."]);

    // 폭죽 효과를 위한 파티클 생성
    const confettiParticles = useRef([...Array(20)].map((_, i) => ({
        id: i,
        x: Math.random() * 100 - 50,
        y: Math.random() * 100 - 50,
        color: ['#FFD700', '#FF6B6B', '#4ADE80', '#60A5FA', '#F472B6'][Math.floor(Math.random() * 5)],
        delay: Math.random() * 0.5
    }))).current;

    // 온도를 0-100 사이로 맵핑
    const currentVisualTemp = Math.min(100, Math.max(0, temperature || 0));

    useEffect(() => {
        const handleResize = () => setIsMobileSize(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // [신규] 목표 달성 시 깜짝 선물 자동 팝업 (페이지 진입 시 1회)
    const hasShownSurpriseRef = useRef(false);
    useEffect(() => {
        if (!loading && agitSettings) {
            const target = agitSettings.targetScore || 100;
            const isUnlocked = currentVisualTemp >= target;

            // 아직 보여주지 않았고, 목표 달성했고, 현재 스테이지 화면이라면
            if (isUnlocked && subTab === 'onClass' && !hasShownSurpriseRef.current) {
                const timer = setTimeout(() => {
                    setShowSurprise(true);
                    hasShownSurpriseRef.current = true;
                }, 1000); // 진입 후 1초 뒤 자연스럽게 등장
                return () => clearTimeout(timer);
            }
        }
    }, [currentVisualTemp, agitSettings, loading, subTab]);

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#F8FAFC' }}>
                <div style={{ textAlign: 'center' }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} style={{ fontSize: '3rem' }}>🗝️</motion.div>
                    <p style={{ marginTop: '20px', fontWeight: '900', color: '#6366F1' }}>아지트 문을 여는 중...</p>
                </div>
            </div>
        );
    }

    const handleBack = () => {
        if (subTab === 'hub') onBack();
        else setSubTab('hub');
    };

    return (
        <div style={{
            height: '100%', width: '100%',
            maxWidth: isMobileSize ? '100%' : '550px',
            margin: '0 auto',
            background: subTab === 'hub' ? '#F8FAFC' : '#000',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
        }}>
            <header style={{
                padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
                background: subTab === 'hub' ? 'white' : `rgba(0,0,0,${Math.max(0.4, 0.8 - (currentVisualTemp / 100) * 0.4)})`,
                zIndex: 100,
                borderBottom: subTab === 'hub' ? '1px solid #F1F5F9' : '1px solid rgba(255,255,255,0.1)',
                backdropFilter: subTab === 'hub' ? 'none' : 'blur(15px)',
                transition: 'background 1.5s ease'
            }}>
                <motion.button
                    whileHover={{ x: -3 }}
                    onClick={handleBack}
                    style={{ background: subTab === 'hub' ? '#F1F5F9' : 'rgba(255,255,255,0.1)', border: 'none', width: '32px', height: '32px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', color: subTab === 'hub' ? '#64748B' : 'white', cursor: 'pointer' }}
                >
                    ‹
                </motion.button>
                <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: '900', color: subTab === 'hub' ? '#1E293B' : 'white' }}>
                    {subTab === 'hub' ? '우리반 아지트' : '아지트 온(溫) 클래스'}
                </h1>
            </header>

            {/* [깜짝 선물 축하 모달] - 최상위 레벨로 이동 */}
            <AnimatePresence>
                {showSurprise && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
                    }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            style={{
                                background: 'linear-gradient(135deg, #FFF9C4 0%, #FFF176 100%)',
                                padding: '32px 24px', borderRadius: '32px',
                                width: '100%', maxWidth: '320px', textAlign: 'center',
                                boxShadow: '0 20px 50px rgba(255, 215, 0, 0.5)',
                                border: '4px solid #FCD34D', position: 'relative', overflow: 'visible'
                            }}
                        >
                            {/* 폭죽 파티클 효과 */}
                            {confettiParticles.map((p) => (
                                <motion.div
                                    key={p.id}
                                    initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                                    animate={{ x: p.x * 5, y: p.y * 5, opacity: 0, scale: 1.5 }}
                                    transition={{ duration: 1.5, repeat: Infinity, delay: p.delay }}
                                    style={{
                                        position: 'absolute', top: '50%', left: '50%',
                                        width: '12px', height: '12px', borderRadius: '50%',
                                        background: p.color, pointerEvents: 'none'
                                    }}
                                />
                            ))}

                            <div style={{ fontSize: '4rem', marginBottom: '16px', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }}>🎁</div>
                            <h2 style={{ fontSize: '1.8rem', color: '#B45309', margin: '0 0 8px 0', fontWeight: '900' }}>축하합니다!</h2>
                            <p style={{ color: '#D97706', margin: '0 0 24px 0', fontWeight: 'bold' }}>우리 반 목표 달성 성공!</p>

                            <div style={{
                                background: 'white', padding: '20px', borderRadius: '20px',
                                marginBottom: '24px', border: '2px dashed #F59E0B',
                                color: '#4B5563', fontSize: '1.1rem', fontWeight: 'bold', lineHeight: '1.5'
                            }}>
                                {agitSettings?.surpriseGift || '🎁 선생님이 준비한 특별 선물이 여기 표시됩니다!'}
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={() => setShowSurprise(false)}
                                style={{
                                    background: '#F59E0B', color: 'white', border: 'none',
                                    padding: '14px 32px', borderRadius: '40px', fontWeight: '900', fontSize: '1rem',
                                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.4)', cursor: 'pointer', width: '100%'
                                }}
                            >
                                와, 신난다! 😆
                            </motion.button>
                        </motion.div>
                        {/* 전체 화면 클릭 시 닫기 (배경) */}
                        <div style={{ position: 'absolute', inset: 0, zIndex: -1 }} onClick={() => setShowSurprise(false)} />
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
                {subTab === 'hub' ? (
                    <motion.div
                        key="hub" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{ flex: 1, padding: '32px 24px', overflowY: 'auto' }}
                    >
                        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🏫</div>
                            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: '900', color: '#1E293B' }}>{studentSession?.className} 아지트</h2>
                            <p style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: '500' }}>마음을 모아 함께 꾸미는 우리 반 비밀 공간</p>
                        </div>

                        <Card
                            onClick={() => {
                                if (agitSettings?.isEnabled === false) {
                                    alert('🔒 현재 아지트 온 클래스 서비스 준비 중입니다. 선생님께 문의해 주세요!');
                                    return;
                                }
                                // [신규] 확인 시점 기록 및 뱃지 제거
                                if (classId) {
                                    localStorage.setItem(`last_visit_agit_onclass_${classId}`, new Date().toISOString());
                                    setHasNewAgitHonor(false);
                                }
                                setSubTab('onClass');
                            }}
                            style={{
                                background: agitSettings?.isEnabled === false ? '#F1F5F9' : 'white',
                                border: '1px solid #E2E8F0',
                                cursor: agitSettings?.isEnabled === false ? 'default' : 'pointer',
                                padding: '24px', margin: 0,
                                opacity: agitSettings?.isEnabled === false ? 0.7 : 1,
                                position: 'relative'
                            }}
                        >
                            {/* [신규] 명예의 전당 New 뱃지 */}
                            {hasNewAgitHonor && agitSettings?.isEnabled !== false && (
                                <div style={{
                                    position: 'absolute', top: '12px', right: '12px',
                                    background: '#FF5252', color: 'white', fontSize: '0.7rem',
                                    padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold',
                                    boxShadow: '0 2px 4px rgba(255, 82, 82, 0.3)',
                                    animation: 'bounce 1s infinite'
                                }}>NEW</div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{
                                    width: '56px', height: '56px',
                                    background: agitSettings?.isEnabled === false ? '#E2E8F0' : '#F5F3FF',
                                    borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem'
                                }}>
                                    {agitSettings?.isEnabled === false ? '🔒' : '🌡️'}
                                </div>
                                <div>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: '800', color: agitSettings?.isEnabled === false ? '#64748B' : '#4338CA' }}>
                                        아지트 온(溫) 클래스 {agitSettings?.isEnabled === false && <span style={{ fontSize: '0.7rem', color: '#EF4444', verticalAlign: 'middle', marginLeft: '4px' }}>[준비중]</span>}
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                                        {agitSettings?.isEnabled === false ? '준비 중인 서비스입니다. 입장이 제한됩니다.' : '우리 반 온도를 높여 아지트를 밝혀주세요!'}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <h4 style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#64748B', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                ✨ 곧 추가될 새로운 즐거움
                            </h4>

                            {/* [신규] 한줄 릴레이 준비 중 카드 */}
                            <Card style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', opacity: 0.7, cursor: 'default', padding: '20px', margin: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '48px', height: '48px', background: '#F1F5F9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>✍️</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: '#475569' }}>북적북적 아지트 한줄 릴레이</h3>
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#E2E8F0', borderRadius: '6px', color: '#64748B', fontWeight: 'bold' }}>준비중</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>한 문장씩 이어가며 우리 반만의 소설을 지어보아요!</p>
                                    </div>
                                </div>
                            </Card>

                            {/* [신규] 비밀 우체통 준비 중 카드 */}
                            <Card style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', opacity: 0.7, cursor: 'default', padding: '20px', margin: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ width: '48px', height: '48px', background: '#F1F5F9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>✉️</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '800', color: '#475569' }}>아지트 비밀 우체통</h3>
                                            <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: '#E2E8F0', borderRadius: '6px', color: '#64748B', fontWeight: 'bold' }}>준비중</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>친구에게 전하고 싶은 따뜻한 마음을 비밀 편지로 보내보아요.</p>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="onClass" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}
                    >

                        {/* [프리미엄 학급 온도계 UI] */}
                        <div style={{
                            padding: '24px 20px', zIndex: 10,
                            background: `rgba(0,0,0,${Math.max(0.3, 0.7 - (currentVisualTemp / 100) * 0.4)})`,
                            backdropFilter: 'blur(12px)',
                            borderBottom: '1px solid rgba(255,255,255,0.1)',
                            transition: 'background 1.5s ease'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem', fontWeight: '800', marginBottom: '2px', letterSpacing: '0.05em' }}>CLASS TEMPERATURE</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: 'white', fontSize: '1.2rem', fontWeight: '900', letterSpacing: '-0.02em' }}>
                                            {studentSession?.className || '우리 반'} 아지트
                                        </span>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <motion.span
                                        key={currentVisualTemp}
                                        initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                        style={{ color: '#FCD34D', fontSize: '1.5rem', fontWeight: '900', textShadow: '0 0 15px rgba(252, 211, 77, 0.6)' }}
                                    >
                                        {currentVisualTemp}<span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }}> / {agitSettings?.targetScore || 100}</span>°C
                                    </motion.span>
                                </div>
                            </div>

                            <div style={{ height: '18px', background: 'rgba(255,255,255,0.12)', borderRadius: '20px', padding: '4px', position: 'relative', border: '1px solid rgba(255,255,255,0.15)', marginBottom: '16px' }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (currentVisualTemp / (agitSettings?.targetScore || 100)) * 100)}%` }}
                                    style={{
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #FF6B6B 0%, #FCD34D 100%)',
                                        borderRadius: '20px',
                                        boxShadow: '0 0 20px rgba(252, 211, 77, 0.4)',
                                        position: 'relative',
                                        zIndex: 2
                                    }}
                                >
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '50%', background: 'rgba(255,255,255,0.25)', borderRadius: '20px' }} />
                                </motion.div>
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'space-between', padding: '0 10px', pointerEvents: 'none', zIndex: 3 }}>
                                    {[...Array(11)].map((_, i) => (
                                        <div key={i} style={{
                                            width: i % 5 === 0 ? '2px' : '1px',
                                            height: i % 5 === 0 ? '8px' : '4px',
                                            background: i * 10 <= ((currentVisualTemp / (agitSettings?.targetScore || 100)) * 100) ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
                                            marginTop: 'auto', marginBottom: 'auto',
                                            transition: 'background 0.3s'
                                        }} />
                                    ))}
                                </div>
                            </div>

                            {/* [나의 미션 현황] */}
                            <div style={{
                                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px'
                            }}>
                                {[
                                    { key: 'post', label: '글쓰기', icon: '✏️' },
                                    { key: 'comment', label: '댓글', icon: '💬' },
                                    { key: 'reaction', label: '반응', icon: '❤️' }
                                ].map(item => {
                                    const current = myMissionStatus[item.key] || 0;
                                    const goal = agitSettings.activityGoals[item.key] || 1;
                                    const isDone = current >= goal;
                                    return (
                                        <div key={item.key} style={{
                                            background: isDone ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)',
                                            border: `1px solid ${isDone ? 'rgba(34, 197, 94, 0.5)' : 'rgba(255,255,255,0.1)'}`,
                                            padding: '8px', borderRadius: '12px', textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '0.6rem', color: isDone ? '#4ADE80' : 'rgba(255,255,255,0.5)', marginBottom: '2px', fontWeight: 'bold' }}>{item.icon} {item.label}</div>
                                            <div style={{ color: 'white', fontSize: '0.85rem', fontWeight: '900' }}>
                                                {current} <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>/ {goal}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 메인 캔버스 */}
                        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#000' }}>
                            <div style={{
                                position: 'absolute', inset: 0,
                                backgroundImage: `url(${CLASSROOM_BG})`,
                                backgroundSize: 'cover', backgroundPosition: 'center',
                                // 온도가 낮을 때(0도) 0.15 정도로 매우 어둡게 시작하여 100도일 때 1.1까지 밝아지도록 조정
                                filter: `brightness(${0.15 + (currentVisualTemp / 100) * 0.95}) saturate(${0.7 + (currentVisualTemp / 100) * 0.5}) contrast(${0.9 + (currentVisualTemp / 100) * 0.2})`,
                                transition: 'filter 2s cubic-bezier(0.4, 0, 0.2, 1)'
                            }} />

                            {/* [신규] 온도가 올라갈수록 은은하게 퍼지는 따뜻한 노란 전구광 효과 */}
                            <motion.div
                                animate={{
                                    opacity: (currentVisualTemp / 100) * 0.6,
                                }}
                                style={{
                                    position: 'absolute', inset: 0,
                                    background: 'radial-gradient(circle at 70% 30%, rgba(255, 243, 176, 0.4) 0%, transparent 70%)',
                                    zIndex: 2, pointerEvents: 'none',
                                }}
                            />

                            {/* 부드러운 중앙 광원 효과 (온도에 따라 크기와 강도 확장) */}
                            <motion.div
                                animate={{
                                    opacity: (currentVisualTemp / 100) * 0.7,
                                    scale: 0.8 + (currentVisualTemp / 100) * 0.6,
                                    filter: `blur(${40 + (currentVisualTemp / 100) * 40}px)`
                                }}
                                style={{
                                    position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
                                    width: '300px', height: '300px',
                                    background: 'radial-gradient(circle, rgba(255,253,210,0.8) 0%, rgba(255,230,150,0.3) 50%, transparent 80%)',
                                    zIndex: 3, pointerEvents: 'none',
                                }}
                            />

                            {/* 전체적인 어둠 레이어 (온도가 낮을수록 진함) */}
                            <div style={{
                                position: 'absolute', inset: 0,
                                background: `linear-gradient(to bottom, rgba(0,0,0,${0.85 - (currentVisualTemp / 100) * 0.85}), rgba(0,0,0,${0.6 - (currentVisualTemp / 100) * 0.6}))`,
                                transition: 'background 2s ease', zIndex: 1
                            }} />

                            {/* [중앙 다이내믹 격려 메시지] */}
                            <div style={{
                                position: 'absolute', top: '25%', left: '50%', transform: 'translate(-50%, -50%)',
                                width: '100%', textAlign: 'center', zIndex: 15, pointerEvents: 'none'
                            }}>
                                <motion.div
                                    key={Math.floor(currentVisualTemp / 10) * 10}
                                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                    style={{
                                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(15px)', padding: '12px 24px',
                                        borderRadius: '40px', display: 'inline-block', border: '1px solid rgba(255,255,255,0.3)',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                                    }}
                                >
                                    <span style={{ color: '#FFF', fontSize: '1rem', fontWeight: '900', letterSpacing: '-0.02em', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                                        {(() => {
                                            const tempRange = Math.floor(currentVisualTemp / 10) * 10;
                                            const messages = {
                                                0: "🌑 아직은 차갑고 어두운 아지트... 온도를 높여 불을 켜주세요!",
                                                10: "🕯️ 작은 촛불 하나가 켜졌어요! 조금 더 마음을 모아봐요.",
                                                20: "🏮 어두웠던 구석까지 은은한 온기가 퍼지기 시작해요.",
                                                30: "🔦 와! 우리들의 열정이 어둠을 조금씩 밀어내고 있어요!",
                                                40: "💡 아지트가 제업 밝아졌네요! 창가에 햇살이 비치는 것 같아요.",
                                                50: "🌗 어느덧 절반! 어둠보다 빛이 더 많아진 우리 반 아지트!",
                                                60: "🔆 눈부신 성장의 빛이 교실 곳곳을 환하게 채우고 있어요.",
                                                70: "🌟 정말 따뜻해요! 우리들의 활동이 찬란한 별빛이 되었군요.",
                                                80: "💎 보석처럼 빛나는 우리 반, 이제 어둠은 찾아볼 수 없어요!",
                                                90: "🌠 거의 다 왔어요! 전설처럼 빛나는 아지트의 탄생 직전!",
                                                100: "☀️ 축하합니다! 우리 모두의 마음으로 가장 환한 아지트를 만들었어요! ❤️"
                                            };
                                            return messages[tempRange] || messages[0];
                                        })()}
                                    </span>
                                </motion.div>
                            </div>

                            {/* [실시간 활동 전광판 (Marquee) - 2단 구성] */}
                            <div style={{
                                position: 'absolute', bottom: '0', left: 0, right: 0,
                                background: `linear-gradient(90deg, rgba(15, 23, 42, ${0.95 - (currentVisualTemp / 100) * 0.2}), rgba(30, 27, 75, ${0.95 - (currentVisualTemp / 100) * 0.2}))`,
                                padding: '10px 0',
                                borderTop: '2px solid rgba(252, 211, 77, 0.4)',
                                borderBottom: '1px solid rgba(252, 211, 77, 0.2)',
                                overflow: 'hidden', whiteSpace: 'nowrap', zIndex: 105,
                                backdropFilter: 'blur(12px)',
                                display: 'flex', flexDirection: 'column', gap: '8px',
                                transition: 'background 1.5s ease'
                            }}>
                                {/* 첫 번째 줄 (상단) - 속도를 60초로 늦춤 */}
                                <motion.div
                                    animate={{ x: ['100%', '-100%'] }}
                                    transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
                                    style={{ display: 'inline-block', paddingLeft: '5%' }}
                                >
                                    <div style={{ display: 'flex', gap: '80px', alignItems: 'center' }}>
                                        {displayRow1.map((msg, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ color: '#FCD34D', fontWeight: '900', fontSize: '1rem' }}>📢 알림</span>
                                                <span style={{ color: 'white', fontWeight: '700', fontSize: '1.05rem', letterSpacing: '-0.02em', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {msg}
                                                </span>
                                            </div>
                                        ))}
                                        {/* 3벌 복제로 끊김 없는 연결 */}
                                        {displayRow1.map((msg, idx) => (
                                            <div key={`dup1-2-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ color: '#FCD34D', fontWeight: '900', fontSize: '1rem' }}>📢 알림</span>
                                                <span style={{ color: 'white', fontWeight: '700', fontSize: '1.05rem', letterSpacing: '-0.02em', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {msg}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>

                                {/* 두 번째 줄 (하단) - 가독성을 위해 약간 다른 속도(70초)와 딜레이 적용 */}
                                <motion.div
                                    animate={{ x: ['100%', '-100%'] }}
                                    transition={{ repeat: Infinity, duration: 18, ease: "linear", delay: 0.5 }}
                                    style={{ display: 'inline-block', paddingLeft: '5%' }}
                                >
                                    <div style={{ display: 'flex', gap: '80px', alignItems: 'center' }}>
                                        {displayRow2.map((msg, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ color: '#60A5FA', fontWeight: '900', fontSize: '1rem' }}>🔔 소식</span>
                                                <span style={{ color: 'rgba(255,255,255,0.95)', fontWeight: '700', fontSize: '1.05rem', letterSpacing: '-0.02em', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {msg}
                                                </span>
                                            </div>
                                        ))}
                                        {/* 3벌 복제로 끊김 없는 연결 */}
                                        {displayRow2.map((msg, idx) => (
                                            <div key={`dup2-2-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ color: '#60A5FA', fontWeight: '900', fontSize: '1rem' }}>🔔 소식</span>
                                                <span style={{ color: 'rgba(255,255,255,0.95)', fontWeight: '700', fontSize: '1.05rem', letterSpacing: '-0.02em', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                                    {msg}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            </div>

                            {/* [오늘의 미션 완료자 명단 (Honor Roll)] */}
                            <div style={{
                                position: 'absolute', bottom: '140px', left: '20px', right: '20px',
                                zIndex: 20
                            }}>
                                <div style={{
                                    background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(10px)',
                                    borderRadius: '20px', padding: '12px',
                                    border: '1px solid rgba(255, 255, 255, 0.1)'
                                }}>
                                    <h3 style={{
                                        margin: '0 0 10px 0', fontSize: '1rem', fontWeight: '800', color: '#FCD34D',
                                        display: 'flex', alignItems: 'center', gap: '8px'
                                    }}>
                                        <span>🏆</span> 오늘의 명예의 전당 <span style={{ fontSize: '0.8rem', color: '#CBD5E1', fontWeight: 'normal' }}>(매일 자정 초기화)</span>
                                    </h3>

                                    {achievedStudents && achievedStudents.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '220px', overflowY: 'auto' }}>
                                            {achievedStudents.map((student, idx) => (
                                                <motion.div
                                                    key={student.student_id || idx}
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: idx * 0.1 }}
                                                    style={{
                                                        background: 'rgba(255, 255, 255, 0.15)',
                                                        padding: '4px 10px', borderRadius: '16px',
                                                        color: 'white', fontSize: '0.85rem', fontWeight: '600',
                                                        display: 'flex', alignItems: 'center', gap: '4px',
                                                        border: '1px solid rgba(255,255,255,0.2)'
                                                    }}
                                                >
                                                    <span>🏅</span> {student.name}
                                                </motion.div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
                                            아직 오늘의 주인공이 없어요. 가장 먼저 달성해보세요! 🔥
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>



                        {/* [하단 기능 멀티 버튼 - 3개 정렬 (1줄)] */}
                        <div style={{
                            padding: '16px', background: 'rgba(15, 23, 42, 0.95)',
                            borderTop: '1px solid rgba(255,255,255,0.1)', zIndex: 110,
                            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px'
                        }}>
                            <motion.button
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={() => onNavigate('mission_list')}
                                style={{
                                    background: '#F87171', color: 'white', border: 'none',
                                    padding: '12px 4px', borderRadius: '16px', fontWeight: '800', fontSize: '0.8rem',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(248, 113, 113, 0.3)'
                                }}
                            >
                                <span style={{ fontSize: '1.4rem' }}>✏️</span> 오늘 글쓰기
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={() => onNavigate('friends_hideout')}
                                style={{
                                    background: '#6366F1', color: 'white', border: 'none',
                                    padding: '12px 4px', borderRadius: '16px', fontWeight: '800', fontSize: '0.8rem',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                                }}
                            >
                                <span style={{ fontSize: '1.4rem' }}>❤️</span> 친구 응원
                            </motion.button>
                            <motion.button
                                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    const isUnlocked = currentVisualTemp >= (agitSettings?.targetScore || 100);
                                    if (isUnlocked) {
                                        setShowSurprise(true);
                                    } else {
                                        alert(`🎁 깜짝 선물은 ${agitSettings?.targetScore || 100}도 달성 시 공개됩니다!\n\n현재 온도: ${currentVisualTemp}도`);
                                    }
                                }}
                                style={{
                                    background: '#FBBF24', color: '#78350F', border: 'none',
                                    padding: '12px 4px', borderRadius: '16px', fontWeight: '800', fontSize: '0.8rem',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)'
                                }}
                            >
                                <span style={{ fontSize: '1.4rem' }}>🎁</span> 깜짝 선물
                            </motion.button>
                        </div>


                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};

export default AgitOnClassPage;
