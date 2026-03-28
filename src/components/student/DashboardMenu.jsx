import React, { useState, useEffect, useCallback } from 'react';
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

    // [신규] 새 미션 존재 여부 확인 (최근 24시간)
    const [hasNewMission, setHasNewMission] = useState(false);

    // [신규] 아지트 명예의 전당 새 소식 확인 (최근 24시간)
    const [hasNewAgitHonor, setHasNewAgitHonor] = useState(false);

    // [신규] 아이디어 마켓 새 소식 확인
    const [hasNewIdeaMarket, setHasNewIdeaMarket] = useState(false);
    const [hasNewAgitUpdate, setHasNewAgitUpdate] = useState(false);

    useEffect(() => {
        const classId = studentSession?.class_id || studentSession?.classId;
        const studentId = studentSession?.id;
        if (!classId || !studentId) return;

        const checkNewMissions = async () => {
            try {
                // 1. 최근 24시간 내 생성된 미션 조회
                const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const { data: allRecent } = await supabase
                    .from('writing_missions')
                    .select('id, mission_type')
                    .eq('class_id', classId)
                    .eq('is_archived', false)
                    .gt('created_at', twentyFourHoursAgo);

                // [수정] JS 필터링으로 NULL 처리 및 정확한 제외 보장
                const recentMissions = allRecent?.filter(m => m.mission_type !== 'meeting') || [];

                let unsubmittedNew = false;
                if (recentMissions.length > 0) {
                    const missionIds = recentMissions.map(m => m.id);
                    // 2. 해당 미션들에 대해 학생이 제출한 기록이 있는지 확인
                    const { data: myPosts } = await supabase
                        .from('student_posts')
                        .select('mission_id')
                        .eq('student_id', studentId)
                        .in('mission_id', missionIds)
                        .eq('is_submitted', true);

                    const submittedMissionIds = new Set(myPosts?.map(p => p.mission_id) || []);
                    unsubmittedNew = recentMissions.some(m => !submittedMissionIds.has(m.id));
                }
                setHasNewMission(unsubmittedNew);

                // [신규] 3. 아지트 명예의 전당 최신 글 조회 및 확인 여부 체크
                const { data: latestHonor } = await supabase
                    .from('agit_honor_roll')
                    .select('created_at')
                    .eq('class_id', classId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (latestHonor) {
                    const lastCheck = localStorage.getItem(`last_visit_agit_honor_${classId}`);
                    // 최근 24시간 이내의 글이면서, 마지막 확인보다 최신일 때만 NEW 표시
                    const isRecent = new Date(latestHonor.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const isUnchecked = !lastCheck || new Date(latestHonor.created_at) > new Date(lastCheck);

                    if (isRecent && isUnchecked) {
                        setHasNewAgitHonor(true);
                    }
                }

                // [신규] 4. 아이디어 마켓 최신 안건/아이디어 확인
                const { data: latestMeeting } = await supabase
                    .from('writing_missions')
                    .select('id, created_at')
                    .eq('class_id', classId)
                    .eq('mission_type', 'meeting')
                    .eq('is_archived', false)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                let latestIdea = null;
                if (latestMeeting?.id) {
                    const { data: ideaData } = await supabase
                        .from('student_posts')
                        .select('created_at')
                        .eq('mission_id', latestMeeting.id)
                        .eq('is_submitted', true)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    latestIdea = ideaData;
                }

                const latestMeetingTime = latestMeeting ? new Date(latestMeeting.created_at) : new Date(0);
                const latestIdeaTime = latestIdea ? new Date(latestIdea.created_at) : new Date(0);
                const mostRecentMarketTime = new Date(Math.max(latestMeetingTime, latestIdeaTime));

                if (mostRecentMarketTime.getTime() > 0) {
                    const lastCheckMarket = localStorage.getItem(`last_visit_idea_market_${classId}`);
                    // 최근 24시간 이내의 소식이면서, 마지막 확인보다 최신일 때만 NEW 표시
                    const isRecentMarket = mostRecentMarketTime > new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const isUncheckedMarket = !lastCheckMarket || mostRecentMarketTime > new Date(lastCheckMarket);

                    if (isRecentMarket && isUncheckedMarket) {
                        setHasNewIdeaMarket(true);
                    }
                }

                // [신규] 5. 아지트 메뉴 전체 알림 상태 (대시보드 배너용)
                const lastAccessMenu = localStorage.getItem(`last_visit_agit_menu_${classId}`);
                const latestAgitTime = new Date(Math.max(
                    latestHonor ? new Date(latestHonor.created_at) : 0,
                    mostRecentMarketTime
                ));

                if (latestAgitTime.getTime() > 0) {
                    const hasUnseenUpdate = !lastAccessMenu || latestAgitTime > new Date(lastAccessMenu);
                    const isWithin24h = latestAgitTime > new Date(Date.now() - 24 * 60 * 60 * 1000);

                    // 대시보드 배너의 'NEW'는 메뉴 자체를 열었는지 여부로 판단
                    setHasNewAgitUpdate(hasUnseenUpdate && isWithin24h);
                }

            } catch (err) {
                console.error('새 소식 확인 실패:', err);
            }
        };

        const timerId = setTimeout(() => {
            checkNewMissions();
        }, 1000); // [최적화] 대시보드 필수 데이터 로딩 대기

        return () => clearTimeout(timerId);
    }, [studentSession?.class_id, studentSession?.classId, studentSession?.id]);

    const fetchRankings = useCallback(async () => {
        const classId = studentSession?.class_id || studentSession?.classId;
        if (!classId || !isVocabTowerEnabled) return;

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
    }, [studentSession?.class_id, studentSession?.classId, isVocabTowerEnabled, vocabTowerSettings?.rankingResetDate]);

    useEffect(() => {
        if (!isVocabTowerEnabled) return;
        const timerId = setTimeout(fetchRankings, 1000);
        return () => clearTimeout(timerId);
    }, [fetchRankings, isVocabTowerEnabled]);

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
                    {hasNewMission && (
                        <div style={{
                            position: 'absolute', top: '12px', right: '12px',
                            background: '#FF5252', color: 'white', fontSize: '0.7rem',
                            padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold',
                            boxShadow: '0 2px 4px rgba(255, 82, 82, 0.3)',
                            animation: 'bounce 1s infinite'
                        }}>NEW</div>
                    )}
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
                    onMouseEnter={() => { if (isVocabTowerEnabled) { setIsRankingHovered(true); fetchRankings(); } }}
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
                    whileHover={agitSettings?.isMenuEnabled !== false ? { scale: 1.01, y: -5 } : {}}
                    whileTap={agitSettings?.isMenuEnabled !== false ? { scale: 0.99 } : {}}
                    onClick={() => {
                        if (agitSettings?.isMenuEnabled === false) {
                            alert('🔒 현재 아지트 온 클래스 서비스 준비 중입니다. 선생님께 문의해 주세요!');
                            return;
                        }
                        // [신규] 대시보드 배너 알림만 제거 (전체 열람 기록)
                        const classId = studentSession?.class_id || studentSession?.classId;
                        if (classId) {
                            localStorage.setItem(`last_visit_agit_menu_${classId}`, new Date().toISOString());
                            setHasNewAgitUpdate(false);
                        }
                        setIsAgitOpen(true);
                    }}
                    style={{
                        background: agitSettings?.isMenuEnabled === false
                            ? 'linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)'
                            : 'linear-gradient(135deg, #FFE4E6 0%, #FFF1F2 100%)',
                        borderRadius: '24px',
                        padding: '30px 24px',
                        cursor: agitSettings?.isMenuEnabled === false ? 'default' : 'pointer',
                        border: agitSettings?.isMenuEnabled === false ? '2px solid #CBD5E1' : '2px solid #FDA4AF',
                        boxShadow: agitSettings?.isMenuEnabled === false ? 'none' : '0 8px 24px rgba(251, 113, 133, 0.15)',
                        textAlign: 'center',
                        position: 'relative',
                        overflow: 'hidden',
                        gridColumn: isMobile ? 'span 1' : 'span 2',
                        minHeight: '220px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: agitSettings?.isMenuEnabled === false ? 0.8 : 1
                    }}
                >
                    <div style={{
                        position: 'absolute', top: -15, left: -15, fontSize: '4rem', opacity: 0.05, transform: 'rotate(-15deg)'
                    }}>{agitSettings?.isMenuEnabled === false ? '🔒' : '🎈'}</div>
                    <div style={{
                        position: 'absolute', bottom: -15, right: -15, fontSize: '4rem', opacity: 0.05, transform: 'rotate(15deg)'
                    }}>{agitSettings?.isMenuEnabled === false ? '🔒' : '✨'}</div>

                    {/* [신규] 아지트 전체 New 뱃지 (메인 배너용) */}
                    {hasNewAgitUpdate && agitSettings?.isMenuEnabled !== false && (
                        <div style={{
                            position: 'absolute', top: '12px', right: '12px',
                            background: '#FF5252', color: 'white', fontSize: '0.7rem',
                            padding: '2px 8px', borderRadius: '8px', fontWeight: 'bold',
                            boxShadow: '0 2px 4px rgba(255, 82, 82, 0.3)',
                            animation: 'bounce 1s infinite',
                            zIndex: 10
                        }}>NEW</div>
                    )}

                    <div style={{ fontSize: '3.2rem', marginBottom: '10px' }}>
                        {agitSettings?.isMenuEnabled === false ? '🔒' : '🎈'}
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '900', color: agitSettings?.isMenuEnabled === false ? '#64748B' : '#9F1239', marginBottom: '4px' }}>
                        두근두근 우리반 아지트 {agitSettings?.isMenuEnabled === false && <span style={{ fontSize: '0.8rem', color: '#EF4444' }}>[준비중]</span>}
                    </div>
                    <p style={{ margin: '0 0 12px 0', color: agitSettings?.isMenuEnabled === false ? '#94A3B8' : '#E11D48', fontSize: '0.9rem', fontWeight: '500' }}>
                        {agitSettings?.isMenuEnabled === false
                            ? '지금은 준비 중이에요. 선생님이 열어주실 때까지 기다려주세요!'
                            : '학급 친구들과 함께 에너지를 모으는 신나는 공간!'}
                    </p>
                    <div style={{
                        fontSize: '0.9rem', color: agitSettings?.isMenuEnabled === false ? '#94A3B8' : '#FB7185', fontWeight: 'bold',
                        background: 'white', padding: '5px 18px', borderRadius: '12px',
                        display: 'inline-block', boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
                    }}>
                        {agitSettings?.isMenuEnabled === false ? '입장 불가 🔒' : '아지트 입장하기 🚀'}
                    </div>
                </motion.div>
            </div >
        </>
    );
};

export default DashboardMenu;
