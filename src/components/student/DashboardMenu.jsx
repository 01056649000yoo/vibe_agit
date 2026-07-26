import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';

const DashboardMenu = ({ onNavigate, setIsAgitOpen, setIsPlaygroundOpen, playgroundCount = 0, isMobile, agitSettings, studentSession, enabledModules = [] }) => {
    const agitOnClassEnabled = enabledModules.some((module) => module.id === 'agit-on-class');
    // [신규] 새 미션 존재 여부 확인 (최근 24시간)
    const [hasNewMission, setHasNewMission] = useState(false);

    // [신규] 아지트 명예의 전당 새 소식 확인 (최근 24시간)
    const [, setHasNewAgitHonor] = useState(false);

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
                    .select('id, mission_type, created_at')
                    .eq('class_id', classId)
                    .eq('is_archived', false)
                    .order('created_at', { ascending: false });

                // [수정] JS 필터링으로 NULL 처리 및 정확한 제외 보장
                const recentMissions = allRecent?.filter(m =>
                    m.created_at > twentyFourHoursAgo
                ) || [];

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

                // 아지트온클래스가 켜진 경우에만 전용 테이블을 조회한다.
                let latestHonor = null;
                if (agitOnClassEnabled) {
                    const { data } = await supabase
                        .from('agit_honor_roll')
                        .select('created_at')
                        .eq('class_id', classId)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    latestHonor = data;
                }

                if (latestHonor) {
                    const lastCheck = localStorage.getItem(`last_visit_agit_honor_${classId}`);
                    // 최근 24시간 이내의 글이면서, 마지막 확인보다 최신일 때만 NEW 표시
                    const isRecent = new Date(latestHonor.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000);
                    const isUnchecked = !lastCheck || new Date(latestHonor.created_at) > new Date(lastCheck);

                    if (isRecent && isUnchecked) {
                        setHasNewAgitHonor(true);
                    }
                }

                // 아지트온클래스 전용 알림 상태
                const lastAccessMenu = localStorage.getItem(`last_visit_agit_menu_${classId}`);
                const latestAgitTime = new Date(latestHonor ? latestHonor.created_at : 0);

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
    }, [studentSession?.class_id, studentSession?.classId, studentSession?.id, agitOnClassEnabled]);

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
                {/* 아지트 놀이터 — 포인트로 즐기는 콘텐츠 모음.
                    드래곤·어휘의 탑 등 포인트 활동은 이 안에서 열린다(메뉴가 길어지지 않도록).
                    켜진 놀거리가 없으면 카드 자체를 숨긴다. */}
                {playgroundCount > 0 && (
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsPlaygroundOpen(true)}
                        style={{
                            background: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)',
                            borderRadius: '24px', padding: '30px 24px', cursor: 'pointer',
                            border: '2px solid #FFF176', boxShadow: '0 8px 24px rgba(255, 241, 118, 0.2)',
                            textAlign: 'center', gridColumn: isMobile ? 'auto' : '1 / -1'
                        }}
                    >
                        <div style={{ fontSize: '3.5rem', marginBottom: '10px' }}>🎡</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#5D4037', marginBottom: '6px' }}>아지트 놀이터</div>
                        <div style={{ fontSize: '0.9rem', color: '#FBC02D', fontWeight: 'bold', background: 'white', padding: '4px 12px', borderRadius: '10px', display: 'inline-block' }}>
                            포인트로 즐기는 놀거리 {playgroundCount}개
                        </div>
                    </motion.div>
                )}


                {/* 기본 OFF 격리 모듈: 켜진 학급에서만 진입점을 렌더한다. */}
                {agitOnClassEnabled && <motion.div
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
                </motion.div>}
            </div >
        </>
    );
};

export default DashboardMenu;
