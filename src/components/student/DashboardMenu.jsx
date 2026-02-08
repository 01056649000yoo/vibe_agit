import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';

const DashboardMenu = ({ onNavigate, setIsDragonModalOpen, setIsAgitOpen, setIsVocabTowerOpen, isMobile, agitSettings, vocabTowerSettings, studentSession }) => {
    // 어휘의 탑 활성화 여부
    const isVocabTowerEnabled = vocabTowerSettings?.enabled ?? false;
    const dailyLimit = vocabTowerSettings?.dailyLimit ?? 3;

    // [신규] 일일 시도 횟수 확인
    const getTodayKey = () => {
        const today = new Date().toISOString().split('T')[0];
        // 교사가 설정을 리셋한 날짜정보(resetDate)를 키에 포함하여, 설정 변경 시 회수가 리셋되도록 함
        const resetSuffix = vocabTowerSettings?.resetDate ? `_${vocabTowerSettings.resetDate}` : '';
        return `vocab_tower_attempts_${studentSession?.id}_${today}${resetSuffix}`;
    };

    const getAttempts = () => {
        const key = getTodayKey();
        const stored = localStorage.getItem(key);
        return stored ? parseInt(stored, 10) : 0;
    };

    const currentAttempts = getAttempts();
    const remainingAttempts = Math.max(0, dailyLimit - currentAttempts);
    const isExhausted = remainingAttempts <= 0;

    // [신규] 랭킹 실시간 프리뷰 상태
    const [rankings, setRankings] = useState([]);
    const [isRankingHovered, setIsRankingHovered] = useState(false);

    useEffect(() => {
        const classId = studentSession?.class_id || studentSession?.classId;
        if (!classId || !isVocabTowerEnabled) return;

        const fetchRankings = async () => {
            try {
                let query = supabase
                    .from('vocab_tower_rankings')
                    .select(`
                        max_floor,
                        student_id,
                        students:student_id ( name )
                    `)
                    .eq('class_id', classId);

                if (vocabTowerSettings?.rankingResetDate) {
                    query = query.gte('updated_at', vocabTowerSettings.rankingResetDate);
                }

                const { data, error } = await query
                    .order('max_floor', { ascending: false })
                    .limit(5);

                if (!error) setRankings(data || []);
            } catch (err) {
                console.error('랭킹 프리뷰 로드 실패:', err);
            }
        };

        fetchRankings();
    }, [studentSession?.class_id, studentSession?.classId, isVocabTowerEnabled, vocabTowerSettings?.rankingResetDate]);

    return (
        <>
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
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>👀</div>
                    <h3 style={{ margin: 0, color: '#5D4037' }}>친구 아지트</h3>
                    <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>친구들의 글 읽기</p>
                </motion.div>
            </div>

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
                        overflow: 'hidden',
                        minHeight: '220px', // 세로 높이 고정
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🐉</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#5D4037', marginBottom: '6px' }}>나의 드래곤 파트너</div>
                    <div style={{ fontSize: '0.9rem', color: '#FBC02D', fontWeight: 'bold', background: 'white', padding: '4px 12px', borderRadius: '10px', display: 'inline-block' }}>나의 드래곤 아지트 가기</div>
                </motion.div>

                <motion.div
                    whileHover={(isVocabTowerEnabled && !isExhausted) ? { scale: 1.02, y: -5 } : {}}
                    whileTap={(isVocabTowerEnabled && !isExhausted) ? { scale: 0.98 } : {}}
                    onClick={() => {
                        if (!isVocabTowerEnabled) {
                            alert('🏰 어휘의 탑 게임은 현재 준비 중입니다. 선생님께 문의해 주세요!');
                            return;
                        }
                        if (isExhausted) {
                            alert(`🎯 오늘의 도전 횟수(${dailyLimit}회)를 모두 사용했어요!\n내일 다시 도전해 주세요! 💪`);
                            return;
                        }
                        setIsVocabTowerOpen(true);
                    }}
                    onMouseEnter={() => isVocabTowerEnabled && setIsRankingHovered(true)}
                    onMouseLeave={() => setIsRankingHovered(false)}
                    style={{
                        background: !isVocabTowerEnabled
                            ? 'linear-gradient(135deg, #F5F5F5 0%, #EEEEEE 100%)'
                            : isExhausted
                                ? 'linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)'
                                : 'linear-gradient(135deg, #E3F2FD 0%, #F0F4F8 100%)',
                        borderRadius: '24px',
                        padding: '30px 24px',
                        cursor: (isVocabTowerEnabled && !isExhausted) ? 'pointer' : 'default',
                        border: !isVocabTowerEnabled
                            ? '2px solid #E0E0E0'
                            : isExhausted
                                ? '2px solid #FFC107'
                                : '2px solid #90CAF9',
                        boxShadow: (isVocabTowerEnabled && !isExhausted) ? '0 8px 24px rgba(144, 202, 249, 0.2)' : 'none',
                        textAlign: 'center',
                        position: 'relative',
                        minHeight: '220px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: (isVocabTowerEnabled && !isExhausted) ? 1 : 0.8,
                        zIndex: isRankingHovered ? 100 : 1
                    }}
                >
                    <div style={{ fontSize: '3.5rem', marginBottom: '10px', filter: (isVocabTowerEnabled && !isExhausted) ? 'none' : 'grayscale(0.3)' }}>🏰</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '900', color: !isVocabTowerEnabled ? '#9E9E9E' : isExhausted ? '#F57C00' : '#1565C0', marginBottom: '6px' }}>
                        {!isVocabTowerEnabled ? '게임 준비중' : isExhausted ? '오늘 도전 완료!' : '어휘력 챌린지'}
                    </div>
                    <div style={{
                        fontSize: '0.9rem',
                        color: !isVocabTowerEnabled ? '#BDBDBD' : isExhausted ? '#FF8F00' : '#2196F3',
                        fontWeight: 'bold',
                        background: 'white',
                        padding: '4px 12px',
                        borderRadius: '10px',
                        display: 'inline-block'
                    }}>
                        {!isVocabTowerEnabled
                            ? '선생님께서 준비 중이에요'
                            : isExhausted
                                ? '내일 다시 도전하세요!'
                                : `어휘의 탑 도전하기 (사용: ${currentAttempts}/${dailyLimit})`}
                    </div>
                    {/* 뱃지 표시 */}
                    {isVocabTowerEnabled && !isExhausted && (
                        <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#4CAF50', color: 'white', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold' }}>OPEN</div>
                    )}
                    {isVocabTowerEnabled && isExhausted && (
                        <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#FF9800', color: 'white', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold' }}>소진</div>
                    )}
                    {!isVocabTowerEnabled && (
                        <div style={{ position: 'absolute', top: '10px', right: '10px', background: '#9E9E9E', color: 'white', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold' }}>준비중</div>
                    )}

                    {/* [신규] 실시간 랭킹 호버 보드 */}
                    <AnimatePresence>
                        {isRankingHovered && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                                style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: '0',
                                    right: '0',
                                    marginBottom: '15px',
                                    background: 'rgba(255, 255, 255, 0.98)',
                                    borderRadius: '24px',
                                    padding: '20px',
                                    boxShadow: '0 15px 40px rgba(21, 101, 192, 0.15)',
                                    border: '2px solid #E3F2FD',
                                    backdropFilter: 'blur(10px)',
                                    zIndex: 2000,
                                    pointerEvents: 'none'
                                }}
                            >
                                <div style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1565C0', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    🏆 우리 반 TOP 5
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {rankings.length > 0 ? (
                                        rankings.map((rank, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: idx === 0 ? '#E3F2FD' : '#F8F9FA', borderRadius: '12px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{
                                                        width: '20px', height: '20px', borderRadius: '50%', background: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : '#E0E0E0',
                                                        color: 'white', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                    }}>
                                                        {idx + 1}
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#2C3E50' }}>{rank.students?.name}</span>
                                                </div>
                                                <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#1565C0' }}>{rank.max_floor}F</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ padding: '20px 0', textAlign: 'center', color: '#7F8C8D', fontSize: '0.8rem' }}>
                                            아직 랭킹 데이터가 없습니다.
                                            <div style={{ marginTop: '5px' }}>도전해서 첫 주인공이 되어보세요! 🏰</div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '8px solid white' }} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* [신규] 두근두근 우리반 아지트 배너 */}
                <motion.div
                    whileHover={agitSettings?.isEnabled !== false ? { scale: 1.01, y: -5 } : {}}
                    whileTap={agitSettings?.isEnabled !== false ? { scale: 0.99 } : {}}
                    onClick={() => {
                        if (agitSettings?.isEnabled === false) {
                            alert('🔒 현재 아지트 온 클래스 서비스 준비 중입니다. 선생님께 문의해 주세요!');
                            return;
                        }
                        setIsAgitOpen(true);
                    }}
                    style={{
                        background: agitSettings?.isEnabled === false
                            ? 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)'
                            : 'linear-gradient(135deg, #FFE4E6 0%, #FFF1F2 100%)',
                        borderRadius: '24px',
                        padding: '30px 24px',
                        cursor: agitSettings?.isEnabled === false ? 'default' : 'pointer',
                        border: agitSettings?.isEnabled === false ? '2px solid #CBD5E1' : '2px solid #FDA4AF',
                        boxShadow: agitSettings?.isEnabled === false ? 'none' : '0 8px 24px rgba(251, 113, 133, 0.15)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        gridColumn: isMobile ? 'span 1' : 'span 2',
                        minHeight: '220px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: agitSettings?.isEnabled === false ? 0.8 : 1
                    }}
                >
                    <div style={{
                        position: 'absolute', top: -15, left: -15, fontSize: '4rem', opacity: 0.05, transform: 'rotate(-15deg)'
                    }}>{agitSettings?.isEnabled === false ? '🔒' : '🎈'}</div>
                    <div style={{
                        position: 'absolute', bottom: -15, right: -15, fontSize: '4rem', opacity: 0.05, transform: 'rotate(15deg)'
                    }}>{agitSettings?.isEnabled === false ? '🔒' : '✨'}</div>

                    <div style={{ fontSize: '3.2rem', marginBottom: '10px' }}>
                        {agitSettings?.isEnabled === false ? '🔒' : '🎈'}
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: agitSettings?.isEnabled === false ? '#64748B' : '#9F1239', marginBottom: '4px' }}>
                        두근두근 우리반 아지트 {agitSettings?.isEnabled === false && <span style={{ fontSize: '0.8rem', color: '#EF4444' }}>[준비중]</span>}
                    </div>
                    <p style={{ margin: '0 0 12px 0', color: agitSettings?.isEnabled === false ? '#94A3B8' : '#E11D48', fontSize: '0.9rem', fontWeight: '500' }}>
                        {agitSettings?.isEnabled === false
                            ? '지금은 준비 중이에요. 선생님이 열어주실 때까지 기다려주세요!'
                            : '학급 친구들과 함께 에너지를 모으는 신나는 공간!'}
                    </p>
                    <div style={{
                        fontSize: '0.9rem', color: agitSettings?.isEnabled === false ? '#94A3B8' : '#FB7185', fontWeight: 'bold',
                        background: 'white', padding: '5px 18px', borderRadius: '12px',
                        display: 'inline-block', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                    }}>
                        {agitSettings?.isEnabled === false ? '입장 불가 🔒' : '아지트 입장하기 🚀'}
                    </div>
                </motion.div>
            </div >
        </>
    );
};

export default DashboardMenu;
