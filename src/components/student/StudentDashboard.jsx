import React, { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '../common/Card';
import StudentGuideModal from './StudentGuideModal';
import StudentFeedbackModal from './StudentFeedbackModal';
import { useDragonPet } from '../../modules/game/dragon/useDragonPet';
import { useStudentDashboard } from '../../hooks/useStudentDashboard';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications'; // [신규] 분리된 리얼타임 훅
import { getModule } from '../../modules/registry';
import StudentGameModuleHost from '../../modules/game/StudentGameModuleHost';

// 분리된 UI 컴포넌트들
import StudentHeader from './StudentHeader';
import TeacherNotifyBanner from './TeacherNotifyBanner';
import DashboardMenu from './DashboardMenu';
import StudentTodoCard from './StudentTodoCard';
import MyAgitPanel from './MyAgitPanel';
// 드래곤 모듈 — 모달을 열 때만 코드를 받도록 지연 로딩 (src/modules/game/dragon)
const DragonHideoutModal = lazy(() => import('../../modules/game/dragon/DragonHideoutModal'));
const BackgroundShopModal = lazy(() => import('../../modules/game/dragon/BackgroundShopModal'));
// [bundle-dynamic-imports] 조건부 렌더링되는 대형 컴포넌트를 lazy loading으로 전환
const AgitOnClassPage = lazy(getModule('agit-on-class').studentEntry);
const WritingFootprintModal = lazy(() => import('../../modules/writing/writing-footprint/WritingFootprintModal'));
const VocabularyTowerGame = lazy(() => import('../../modules/game/vocab-tower/VocabularyTowerGame'));

// [신규] 드래곤 아지트 배경 목록 (상수 외부 이동)
const HIDEOUT_BACKGROUNDS = {
    default: { id: 'default', name: '기본 초원', color: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)', border: '#FFF176', textColor: '#5D4037', subColor: '#8D6E63', glow: 'rgba(255, 241, 118, 0.3)' },
    volcano: { id: 'volcano', name: '🌋 화산 동굴', color: 'linear-gradient(135deg, #4A0000 0%, #8B0000 100%)', border: '#FF5722', textColor: 'white', subColor: '#FFCCBC', price: 300, glow: 'rgba(255, 87, 34, 0.4)' },
    sky: { id: 'sky', name: '☁️ 천상 전당', color: 'linear-gradient(180deg, #0288D1 0%, #E1F5FE 70%, #FFFFFF 100%)', border: '#81D4FA', textColor: '#01579B', subColor: '#0288D1', price: 500, glow: 'rgba(129, 212, 250, 0.4)' },
    crystal: { id: 'crystal', name: '💎 수정 궁전', color: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)', border: '#BA68C8', textColor: 'white', subColor: '#E1BEE7', price: 1000, glow: 'rgba(186, 104, 200, 0.4)' },
    storm: { id: 'storm', name: '🌩️ 번개 폭풍', color: 'linear-gradient(180deg, #050A30 0%, #000C66 50%, #000000 100%)', border: '#7986CB', textColor: 'white', subColor: '#C5CAE9', price: 700, glow: 'rgba(121, 134, 203, 0.6)' },
    galaxy: { id: 'galaxy', name: '🌌 달빛 은하수', color: 'linear-gradient(135deg, #0D47A1 0%, #000000 100%)', border: '#90CAF9', textColor: 'white', subColor: '#E3F2FD', price: 500, glow: 'rgba(144, 202, 249, 0.4)' },
    legend: { id: 'legend', name: '✨ 천상의 황금성소', color: 'linear-gradient(135deg, #1A1A1A 0%, #4D342C 50%, #1A1A1A 100%)', border: '#FFD700', textColor: '#FFD700', subColor: '#B8860B', price: 0, requiresMaxLevel: true, glow: 'rgba(255, 215, 0, 0.9)' }
};

// [신규] 아지트 실시간 데이터 연동 훅
import { useClassAgitClass } from '../../hooks/useClassAgitClass';

const StudentDashboard = ({ studentSession, onLogout, onNavigate, enabledModules = [], myAgitSignal = 0 }) => {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isDragonModalOpen, setIsDragonModalOpen] = useState(false);
    const [isAgitOpen, setIsAgitOpen] = useState(false); // [신규] 아지트 오픈 상태
    const [isVocabTowerOpen, setIsVocabTowerOpen] = useState(false); // [신규] 어휘의 탑 오픈 상태
    const [activeGameModuleId, setActiveGameModuleId] = useState(null);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isFootprintOpen, setIsFootprintOpen] = useState(false);
    const [isMyAgitOpen, setIsMyAgitOpen] = useState(false);

    // 하단 내비의 '나의 아지트'를 누르면 홈으로 온 뒤 이 신호가 올라온다.
    useEffect(() => {
        if (!myAgitSignal) return;
        setIsMyAgitOpen(true);
    }, [myAgitSignal]);


    // [신규] 아지트 온도 및 활성화 정보 실시간 동기화
    // 아지트 설정·어휘의 탑 설정. 우리 반 온도는 학생 홈에서 쓰지 않아 받지 않는다.
    const {
        agitSettings,
        vocabTowerSettings
    } = useClassAgitClass(
        studentSession?.classId || studentSession?.class_id,
        studentSession?.id,
        { lightweight: true }
    );

    // 전반적인 대시보드 데이터 및 비즈니스 로직
    const {
        points, setPoints, hasActivity, showFeedback, setShowFeedback, feedbacks,
        loadingFeedback, feedbackInitialTab,
        returnedCount, dragonConfig, dragonConfigLoaded, initialPetData,
        handleClearFeedback, handleDirectRewriteGo, openFeedback,
        fetchMyPoints, fetchStats, checkActivity
    } = useStudentDashboard(studentSession, onNavigate);

    // [신규] 실시간 알림 로직 전담 훅 (의존성 안정화)
    const refetchDataControls = React.useMemo(() => ({
        fetchMyPoints, fetchStats, checkActivity
    }), [fetchMyPoints, fetchStats, checkActivity]);

    const { teacherNotify, setTeacherNotify } = useRealtimeNotifications(
        studentSession,
        setPoints,
        refetchDataControls
    );

    // 드래곤 관련 상태 및 액션
    const {
        petData, isEvolving, isFlashing, isBusy,
        handleFeed, checkPetDegeneration, buyItem, equipItem
    } = useDragonPet(
        studentSession?.id,
        points,
        setPoints,
        dragonConfig.feedCost,
        dragonConfig.degenDays,
        initialPetData // [수정] 충돌을 피하기 위해 이름을 변경하여 전달
    );

    // 드래곤 퇴화 체크: 펫 데이터와 교사 설정이 모두 로드된 뒤 세션당 1회만 실행.
    // (155d66d 리팩토링에서 호출부가 유실되어 퇴화가 전혀 동작하지 않던 버그 복원)
    const degenCheckedRef = React.useRef(false);
    useEffect(() => {
        if (degenCheckedRef.current) return;
        if (!initialPetData || !dragonConfigLoaded) return;
        degenCheckedRef.current = true;
        checkPetDegeneration(initialPetData, dragonConfig.degenDays);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPetData, dragonConfigLoaded]);

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

    // 앱 셸이 읽은 동일한 모듈 목록으로 모든 학생 진입점을 게이팅한다.
    const isOn = (id) => enabledModules.some((m) => m.id === id);

    const gameModules = enabledModules
        .filter((module) => module.part === 'game' && module.playground !== false)
        .sort((a, b) => (a.playground?.order ?? 100) - (b.playground?.order ?? 100));
    const activeGameModule = gameModules.find((module) => module.id === activeGameModuleId) || null;

    const openGameModule = (module) => {
        setIsPlaygroundOpen(false);
        if (module.playground?.entryMode !== 'legacy') {
            setActiveGameModuleId(module.id);
            return;
        }
        if (module.id === 'dragon') setIsDragonModalOpen(true);
        if (module.id === 'vocab-tower') setIsVocabTowerOpen(true);
    };

    const playgroundItems = gameModules.map((module) => ({
        id: module.id,
        icon: module.icon || '🎮',
        name: module.playground?.name || module.name,
        description: module.playground?.description || module.description,
        background: module.playground?.background,
        borderColor: module.playground?.borderColor,
        badge: module.id === 'dragon' ? `${dragonInfo.name} · LV.${petData.level}` : null,
        onOpen: () => openGameModule(module)
    }));

    return (
        <>
            <StudentGuideModal
                isOpen={isGuideOpen}
                onClose={() => setIsGuideOpen(false)}
            />

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
                border: '2px solid #FFE082',
                overflow: 'visible'
            }}>
                {/* 헤더 섹션 */}
                <StudentHeader
                    hasActivity={hasActivity}
                    openFeedback={openFeedback}
                    setIsGuideOpen={setIsGuideOpen}
                    onLogout={onLogout}
                />

                {/* 인사말 — 할 일을 첫 화면에 올리려고 한 줄로 줄였다 */}
                <div style={{ textAlign: 'center', marginBottom: '1.1rem' }}>
                    <h1 style={{ fontSize: '1.5rem', color: '#5D4037', margin: 0 }}>
                        🌟 안녕, <span style={{ color: '#FBC02D' }}>{studentSession.name}</span>!
                    </h1>
                </div>

                {/* 선생님의 실시간 알림(포인트·승인·회수). 상시 상태인 '다시 쓸 글'은
                    아래 할 일 카드가 맡는다 — 같은 것을 두 군데서 세지 않도록. */}
                <TeacherNotifyBanner
                    teacherNotify={teacherNotify}
                    setTeacherNotify={setTeacherNotify}
                    handleDirectRewriteGo={handleDirectRewriteGo}
                />

                {/* 오늘 할 일 — 홈에서 가장 먼저 보여야 하는 것 */}
                <StudentTodoCard
                    studentSession={studentSession}
                    returnedCount={returnedCount}
                    hasActivity={hasActivity}
                    onNavigate={onNavigate}
                    onOpenFeedback={openFeedback}
                    onGoRewrite={handleDirectRewriteGo}
                />


                {/* 주요 활동 메뉴 */}
                <DashboardMenu
                    onNavigate={onNavigate}
                    onOpenMyAgit={() => setIsMyAgitOpen(true)}
                    playgroundCount={playgroundItems.length}
                    setIsAgitOpen={setIsAgitOpen} // [추가]
                    isMobile={isMobile}
                    agitSettings={agitSettings}
                    studentSession={studentSession}
                    enabledModules={enabledModules}
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

                <MyAgitPanel
                    isOpen={isMyAgitOpen}
                    onClose={() => setIsMyAgitOpen(false)}
                    studentSession={studentSession}
                    points={points}
                    playgroundItems={playgroundItems}
                    onOpenFootprint={() => { setIsMyAgitOpen(false); setIsFootprintOpen(true); }}
                    onOpenPost={() => { setIsMyAgitOpen(false); onNavigate('friends_hideout'); }}
                />

                <Suspense fallback={null}>
                    {isFootprintOpen && (
                        <WritingFootprintModal
                            isOpen={isFootprintOpen}
                            onClose={() => setIsFootprintOpen(false)}
                        />
                    )}
                </Suspense>

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

                {/* 드래곤 아지트 모달 (모듈: game/dragon) — 열릴 때만 로드 */}
                {isDragonModalOpen && isOn('dragon') && (
                    <Suspense fallback={null}>
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
                            isBusy={isBusy}
                            currentPoints={points}
                        />
                    </Suspense>
                )}

                {/* 배경 상점 모달 (모듈: game/dragon) — 열릴 때만 로드 */}
                {isShopOpen && isOn('dragon') && (
                    <Suspense fallback={null}>
                        <BackgroundShopModal
                            isOpen={isShopOpen}
                            onClose={() => setIsShopOpen(false)}
                            points={points}
                            petData={petData}
                            buyItem={buyItem}
                            equipItem={equipItem}
                            isBusy={isBusy}
                            HIDEOUT_BACKGROUNDS={HIDEOUT_BACKGROUNDS}
                        />
                    </Suspense>
                )}
            </Card>

            {/* [신규] 우리반 아지트 독립 창 (전체 화면 오버레이) */}


            {/* 신규 포인트·놀이 모듈 공통 진입점 — manifest.studentEntry를 지연 로딩 */}
            <AnimatePresence>
                {activeGameModule && activeGameModule.playground?.entryMode !== 'legacy' && (
                    <motion.div
                        key={activeGameModule.id}
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        style={{
                            position: 'fixed', inset: 0, width: '100vw', height: '100vh',
                            background: 'white', zIndex: 20000, overflow: 'auto'
                        }}
                    >
                        <StudentGameModuleHost
                            module={activeGameModule}
                            studentSession={studentSession}
                            isMobile={isMobile}
                            points={points}
                            onPointsChange={setPoints}
                            onBack={() => {
                                setActiveGameModuleId(null);
                                setIsPlaygroundOpen(true);
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isAgitOpen && isOn('agit-on-class') && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                            background: 'white', zIndex: 20000, overflow: 'hidden'
                        }}
                    >
                        <Suspense fallback={
                            <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'white' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏠</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#8D6E63' }}>우리반 아지트로 이동 중...</div>
                            </div>
                        }>
                            <AgitOnClassPage
                                studentSession={studentSession}
                                onBack={() => setIsAgitOpen(false)}
                                onNavigate={(path) => {
                                    setIsAgitOpen(false);
                                    onNavigate(path);
                                }}
                            />
                        </Suspense>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* [신규] 어휘의 탑 게임 (전체 화면 오버레이) */}
            <AnimatePresence>
                {isVocabTowerOpen && isOn('vocab-tower') && (
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                            background: 'white', zIndex: 20000, overflow: 'hidden'
                        }}
                    >
                        <Suspense fallback={
                            <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'white' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗼</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1565C0' }}>어휘의 탑 입장 중...</div>
                            </div>
                        }>
                            <VocabularyTowerGame
                                studentSession={studentSession}
                                onBack={() => setIsVocabTowerOpen(false)}
                                forcedGrade={vocabTowerSettings?.grade}
                                dailyLimit={vocabTowerSettings?.dailyLimit ?? 3}
                                timeLimit={vocabTowerSettings?.timeLimit ?? 60}
                                rewardPoints={vocabTowerSettings?.rewardPoints ?? 80}
                                resetDate={vocabTowerSettings?.resetDate}
                                rankingResetDate={vocabTowerSettings?.rankingResetDate}
                            />
                        </Suspense>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default StudentDashboard;
