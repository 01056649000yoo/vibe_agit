import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import StudentGuideModal from './StudentGuideModal';
import StudentFeedbackModal from './StudentFeedbackModal';
import { useDragonPet } from '../../hooks/useDragonPet';
import { useStudentDashboard } from '../../hooks/useStudentDashboard';

// 분리된 UI 컴포넌트들
import StudentHeader from './StudentHeader';
import TeacherNotifyBanner from './TeacherNotifyBanner';
import StudentStatsCards from './StudentStatsCards';
import PointLevelCard from './PointLevelCard';
import DashboardMenu from './DashboardMenu';
import DragonHideoutModal from './DragonHideoutModal';
import BackgroundShopModal from './BackgroundShopModal';

// [신규] 드래곤 아지트 배경 목록 (상수 외부 이동)
const HIDEOUT_BACKGROUNDS = {
    default: { id: 'default', name: '기본 초원', color: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)', border: '#FFF176', textColor: '#5D4037', subColor: '#8D6E63', glow: 'rgba(255, 241, 118, 0.3)' },
    volcano: { id: 'volcano', name: '🌋 화산 동굴', color: 'linear-gradient(135deg, #4A0000 0%, #8B0000 100%)', border: '#FF5722', textColor: 'white', subColor: '#FFCCBC', price: 300, glow: 'rgba(255, 87, 34, 0.4)' },
    sky: { id: 'sky', name: '☁️ 천상 전당', color: 'linear-gradient(135deg, #B3E5FC 0%, #E1F5FE 100%)', border: '#4FC3F7', textColor: '#01579B', subColor: '#0288D1', price: 500, glow: 'rgba(79, 195, 247, 0.3)' },
    crystal: { id: 'crystal', name: '💎 수정 궁전', color: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)', border: '#BA68C8', textColor: 'white', subColor: '#E1BEE7', price: 1000, glow: 'rgba(186, 104, 200, 0.4)' },
    storm: { id: 'storm', name: '🌩️ 번개 폭풍', color: 'linear-gradient(135deg, #1A237E 0%, #000000 100%)', border: '#7986CB', textColor: 'white', subColor: '#C5CAE9', price: 700, glow: 'rgba(121, 134, 203, 0.5)' },
    galaxy: { id: 'galaxy', name: '🌌 달빛 은하수', color: 'linear-gradient(135deg, #0D47A1 0%, #000000 100%)', border: '#90CAF9', textColor: 'white', subColor: '#E3F2FD', price: 500, glow: 'rgba(144, 202, 249, 0.4)' },
    legend: { id: 'legend', name: '🌈 무지개 성소', color: 'linear-gradient(135deg, #FF9A9E 0%, #FAD0C4 99%, #FAD0C4 100%)', border: '#FFD700', textColor: '#D81B60', subColor: '#AD1457', price: 0, requiresMaxLevel: true, glow: 'rgba(255, 215, 0, 0.6)' }
};

const StudentDashboard = ({ studentSession, onLogout, onNavigate }) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isDragonModalOpen, setIsDragonModalOpen] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);

    // 전반적인 대시보드 데이터 및 비즈니스 로직
    const {
        points, setPoints, hasActivity, showFeedback, setShowFeedback, feedbacks,
        loadingFeedback, feedbackInitialTab, teacherNotify, setTeacherNotify,
        returnedCount, stats, levelInfo, isLoading, dragonConfig,
        handleClearFeedback, handleDirectRewriteGo, openFeedback
    } = useStudentDashboard(studentSession, onNavigate);

    // 드래곤 관련 상태 및 액션
    const {
        petData, setPetData, isEvolving, isFlashing,
        handleFeed, buyItem, equipItem
    } = useDragonPet(
        studentSession?.id,
        points,
        setPoints,
        dragonConfig.feedCost,
        dragonConfig.degenDays
    );

    // [신규] 이미지 선행 로딩 (Optimization 4)
    useEffect(() => {
        const imagesToPreload = [
            '/assets/dragons/dragon_stage_1.webp',
            '/assets/dragons/dragon_stage_2.webp',
            '/assets/dragons/dragon_stage_3.webp',
            '/assets/dragons/dragon_stage_4.webp',
            '/assets/dragons/dragon_stage_5.webp'
        ];
        imagesToPreload.forEach(src => {
            const img = new Image();
            img.src = src;
        });
    }, []);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 헬퍼 함수들
    const getDragonStage = (level) => {
        const basePath = '/assets/dragons';
        // Optimization 4: WebP 포맷 사용
        if (level >= 5) return { name: '전설의 수호신룡', image: `${basePath}/dragon_stage_5.webp`, isPlaceholder: false };
        if (level === 4) return { name: '불을 내뿜는 성장한 용', image: `${basePath}/dragon_stage_4.webp`, isPlaceholder: false };
        if (level === 3) return { name: '푸른 빛의 어린 용', image: `${basePath}/dragon_stage_3.webp`, isPlaceholder: false };
        if (level === 2) return { name: '갓 태어난 용', image: `${basePath}/dragon_stage_2.webp`, isPlaceholder: false };
        return { name: '신비로운 알', image: `${basePath}/dragon_stage_1.webp`, isPlaceholder: false };
    };

    const getDaysSinceLastFed = () => {
        const lastFedDate = new Date(petData.lastFed);
        const today = new Date();
        const diffTime = Math.abs(today - lastFedDate);
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    const dragonInfo = getDragonStage(petData.level);
    const daysSinceLastFed = getDaysSinceLastFed();

    return (
        <>
            <StudentGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

            {/* [모바일 최적화] 모바일에서는 전체 폭, PC에서는 카드 형태 유지 */}
            <Card style={isMobile ? {
                width: '100%',
                maxWidth: '800px', // 태블릿 가로모드 대응 (너무 넓어짐 방지)
                margin: '0 auto', // 중앙 정렬
                minHeight: '100vh',
                border: 'none',
                borderRadius: 0,
                background: '#FFFDF7',
                paddingBottom: '80px', // 하단 탭바 가림 방지
            } : {
                maxWidth: '600px',
                background: '#FFFDF7',
                border: '2px solid #FFE082'
            }}>
                {/* 헤더 섹션 */}
                <StudentHeader
                    studentSession={studentSession}
                    hasActivity={hasActivity}
                    openFeedback={openFeedback}
                    setIsGuideOpen={setIsGuideOpen}
                    onLogout={onLogout}
                />

                {/* 인사말 섹션 */}
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '5px' }}>🌟</div>
                    <h1 style={{ fontSize: '2rem', color: '#5D4037', marginBottom: '0.4rem' }}>
                        안녕, <span style={{ color: '#FBC02D' }}>{studentSession.name}</span>!
                    </h1>
                    <p style={{ color: '#8D6E63', fontSize: '1rem' }}>벌써 이만큼이나 성장했어! 🚀</p>
                </div>

                {/* 선생님 알림 배너 */}
                <TeacherNotifyBanner
                    returnedCount={returnedCount}
                    teacherNotify={teacherNotify}
                    setTeacherNotify={setTeacherNotify}
                    handleDirectRewriteGo={handleDirectRewriteGo}
                />

                {/* 성장 통계 카드 */}
                <StudentStatsCards stats={stats} />

                {/* 포인트 및 레벨 카드 */}
                <PointLevelCard
                    points={points}
                    levelInfo={levelInfo}
                    stats={stats}
                    isLoading={isLoading}
                />

                {/* 주요 활동 메뉴 */}
                <DashboardMenu
                    onNavigate={onNavigate}
                    setIsDragonModalOpen={setIsDragonModalOpen}
                    isMobile={isMobile}
                />

                {/* 오늘의 목표 하단 문구 */}
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
                    onClear={handleClearFeedback}
                />

                {/* 드래곤 아지트 모달 */}
                <DragonHideoutModal
                    isOpen={isDragonModalOpen}
                    onClose={() => setIsDragonModalOpen(false)}
                    isMobile={isMobile}
                    petData={petData}
                    dragonInfo={dragonInfo}
                    HIDEOUT_BACKGROUNDS={HIDEOUT_BACKGROUNDS}
                    daysSinceLastFed={daysSinceLastFed}
                    dragonConfig={dragonConfig}
                    handleFeed={handleFeed}
                    setIsShopOpen={setIsShopOpen}
                    isEvolving={isEvolving}
                    isFlashing={isFlashing}
                />

                {/* 배경 상점 모달 */}
                <BackgroundShopModal
                    isOpen={isShopOpen}
                    onClose={() => setIsShopOpen(false)}
                    points={points}
                    petData={petData}
                    buyItem={buyItem}
                    equipItem={equipItem}
                    HIDEOUT_BACKGROUNDS={HIDEOUT_BACKGROUNDS}
                />
            </Card>
        </>
    );
};

export default StudentDashboard;
