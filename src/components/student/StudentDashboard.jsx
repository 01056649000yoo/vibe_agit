import React, { useState, useEffect, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '../common/Card';
import StudentGuideModal from './StudentGuideModal';
import StudentFeedbackModal from './StudentFeedbackModal';
import { useDragonPet } from '../../modules/game/dragon/useDragonPet';
import { getDragonGrowthFromWriterLevel, getDragonStage, getPendingDragonGrowth } from '../../modules/game/dragon/presentation';
import { useStudentDashboard } from '../../hooks/useStudentDashboard';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications'; // [신규] 분리된 리얼타임 훅
import { getModule } from '../../modules/registry';
import StudentGameModuleHost from '../../modules/game/StudentGameModuleHost';
import useMyTitleStatus, { invalidateMyTitleStatus } from '../../modules/writing/title-status/useMyTitleStatus';

// 분리된 UI 컴포넌트들
import StudentHeader from './StudentHeader';
import TeacherNotifyBanner from './TeacherNotifyBanner';
import DashboardMenu from './DashboardMenu';
import StudentHomeGrowthPanel from './StudentHomeGrowthPanel';
import StudentTodoCard from './StudentTodoCard';
import AgitPlayground from './AgitPlayground';
import './StudentDashboard.css';
// 드래곤 모듈 — 모달을 열 때만 코드를 받도록 지연 로딩 (src/modules/game/dragon)
const DragonHideoutModal = lazy(() => import('../../modules/game/dragon/DragonHideoutModal'));
const DragonGrowthCelebrationModal = lazy(() => import('../../modules/game/dragon/DragonGrowthCelebrationModal'));
const BackgroundShopModal = lazy(() => import('../../modules/game/dragon/BackgroundShopModal'));
// [bundle-dynamic-imports] 조건부 렌더링되는 대형 컴포넌트를 lazy loading으로 전환
const AgitOnClassPage = lazy(getModule('agit-on-class').studentEntry);
const WritingFootprintModal = lazy(() => import('../../modules/writing/writing-footprint/WritingFootprintModal'));
const VocabularyTowerGame = lazy(() => import('../../modules/game/vocab-tower/VocabularyTowerGame'));
const MyAgitPanel = lazy(() => import('./MyAgitPanel'));

// [신규] 아지트 실시간 데이터 연동 훅
import { useClassAgitClass } from '../../hooks/useClassAgitClass';

const StudentDashboard = ({ studentSession, onLogout, onNavigate, enabledModules = [], myAgitSignal = 0, playgroundSignal = 0 }) => {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isDragonModalOpen, setIsDragonModalOpen] = useState(false);
    const [isAgitOpen, setIsAgitOpen] = useState(false); // [신규] 아지트 오픈 상태
    const [isVocabTowerOpen, setIsVocabTowerOpen] = useState(false); // [신규] 어휘의 탑 오픈 상태
    const [activeGameModuleId, setActiveGameModuleId] = useState(null);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isFootprintOpen, setIsFootprintOpen] = useState(false);
    const [isMyAgitOpen, setIsMyAgitOpen] = useState(false);
    const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);
    const [growthCelebration, setGrowthCelebration] = useState(null);

    // 하단 내비의 '나의 아지트'를 누르면 홈으로 온 뒤 이 신호가 올라온다.
    useEffect(() => {
        if (!myAgitSignal) return undefined;
        const timerId = window.setTimeout(() => setIsMyAgitOpen(true), 0);
        return () => window.clearTimeout(timerId);
    }, [myAgitSignal]);

    useEffect(() => {
        if (!playgroundSignal) return undefined;
        const timerId = window.setTimeout(() => setIsPlaygroundOpen(true), 0);
        return () => window.clearTimeout(timerId);
    }, [playgroundSignal]);


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
        returnedCount, initialPetData,
        handleClearFeedback, handleDirectRewriteGo, openFeedback,
        fetchMyPoints, checkActivity
    } = useStudentDashboard(studentSession, onNavigate);

    const {
        writerLevel,
        readerLevel,
        loading: titleStatusLoading
    } = useMyTitleStatus({ studentSession, active: true });

    const refreshMyTitleStatus = React.useCallback(() => {
        invalidateMyTitleStatus({
            classId: studentSession?.class_id || studentSession?.classId,
            studentId: studentSession?.id
        });
    }, [studentSession?.classId, studentSession?.class_id, studentSession?.id]);

    // [신규] 실시간 알림 로직 전담 훅 (의존성 안정화)
    const refetchDataControls = React.useMemo(() => ({
        fetchMyPoints, refreshMyTitleStatus, checkActivity
    }), [fetchMyPoints, refreshMyTitleStatus, checkActivity]);

    const { teacherNotify, setTeacherNotify } = useRealtimeNotifications(
        studentSession,
        setPoints,
        refetchDataControls
    );

    // 드래곤 관련 상태 및 액션
    const {
        petData, isFlashing, isBusy,
        handleBond, buyDecorItem, equipDecorItem, selectSpecies, acknowledgeGrowth
    } = useDragonPet(
        studentSession?.id,
        points,
        setPoints,
        initialPetData
    );

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const getDaysSinceLastBond = () => {
        if (!petData.lastFed) return null;
        const lastFedDate = new Date(petData.lastFed);
        if (Number.isNaN(lastFedDate.getTime())) return null;
        const today = new Date();
        const diffTime = Math.abs(today - lastFedDate);
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    const dragonGrowth = getDragonGrowthFromWriterLevel(writerLevel);
    const displayPetData = React.useMemo(() => ({
        ...petData,
        level: dragonGrowth.level,
        exp: dragonGrowth.progress
    }), [dragonGrowth.level, dragonGrowth.progress, petData]);
    const dragonInfo = getDragonStage(displayPetData.level, displayPetData.species);
    const daysSinceLastBond = getDaysSinceLastBond();
    const dragonEnabled = enabledModules.some((module) => module.id === 'dragon');

    const hasBlockingOverlay = isDragonModalOpen || isShopOpen || isMyAgitOpen || isFootprintOpen
        || isGuideOpen || showFeedback || isPlaygroundOpen || isAgitOpen || isVocabTowerOpen
        || Boolean(activeGameModuleId);

    useEffect(() => {
        if (titleStatusLoading || !dragonEnabled || hasBlockingOverlay || growthCelebration) return;
        const pendingGrowth = getPendingDragonGrowth(writerLevel, petData);
        if (!pendingGrowth) return;
        const timerId = window.setTimeout(() => setGrowthCelebration(pendingGrowth), 280);
        return () => window.clearTimeout(timerId);
    }, [dragonEnabled, growthCelebration, hasBlockingOverlay, petData, titleStatusLoading, writerLevel]);

    const handleGrowthCelebrationConfirm = async () => {
        const success = await acknowledgeGrowth();
        if (success) setGrowthCelebration(null);
    };

    // 현재 모습은 화면의 img가 받고, 다음 한 단계만 브라우저가 한가할 때 미리 받는다.
    useEffect(() => {
        if (displayPetData.level >= 10) return undefined;
        const nextImage = getDragonStage(displayPetData.level + 1, displayPetData.species).image;
        const preload = () => {
            const image = new Image();
            image.src = nextImage;
        };
        if ('requestIdleCallback' in window) {
            const idleId = window.requestIdleCallback(preload, { timeout: 1800 });
            return () => window.cancelIdleCallback(idleId);
        }
        const timerId = window.setTimeout(preload, 600);
        return () => window.clearTimeout(timerId);
    }, [displayPetData.level, displayPetData.species]);

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
        badge: module.id === 'dragon' ? `${dragonInfo.name} · LV.${displayPetData.level}` : null,
        onOpen: () => openGameModule(module)
    }));

    return (
        <>
            <StudentGuideModal
                isOpen={isGuideOpen}
                onClose={() => setIsGuideOpen(false)}
            />

            <Card
                className="student-home-shell"
                style={{ maxWidth: '960px', padding: 0, background: 'var(--ui-page)', border: '1px solid var(--ui-border)', boxShadow: 'none', overflow: 'visible' }}
            >
                <div className="student-home-content">
                    {/* 헤더 섹션 */}
                    <StudentHeader
                        hasActivity={hasActivity}
                        onOpenFootprint={() => setIsFootprintOpen(true)}
                        openFeedback={openFeedback}
                        setIsGuideOpen={setIsGuideOpen}
                        onLogout={onLogout}
                    />

                    <StudentHomeGrowthPanel
                        studentSession={studentSession}
                        points={points}
                        writerLevel={writerLevel}
                        readerLevel={readerLevel}
                        titleLoading={titleStatusLoading}
                        dragonEnabled={isOn('dragon')}
                        petData={displayPetData}
                        dragonInfo={dragonInfo}
                        onOpenMyAgit={() => setIsMyAgitOpen(true)}
                        onOpenFootprint={() => setIsFootprintOpen(true)}
                    />

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
                    onOpenPlayground={() => setIsPlaygroundOpen(true)}
                    playgroundCount={playgroundItems.length}
                    setIsAgitOpen={setIsAgitOpen}
                    agitSettings={agitSettings}
                    studentSession={studentSession}
                    enabledModules={enabledModules}
                />

                <AgitPlayground
                    isOpen={isPlaygroundOpen}
                    onClose={() => setIsPlaygroundOpen(false)}
                    items={playgroundItems}
                />

                {isMyAgitOpen && (
                    <Suspense fallback={null}>
                        <MyAgitPanel
                            isOpen={isMyAgitOpen}
                            onClose={() => setIsMyAgitOpen(false)}
                            studentSession={studentSession}
                            points={points}
                            enabledModules={enabledModules}
                            moduleRuntimeById={{
                                dragon: { petData: displayPetData, daysSinceLastFed: daysSinceLastBond, readerLevel }
                            }}
                            onOpenModule={(module) => {
                                setIsMyAgitOpen(false);
                                openGameModule(module);
                            }}
                        />
                    </Suspense>
                )}

                <Suspense fallback={null}>
                    {isFootprintOpen && (
                        <WritingFootprintModal
                            isOpen={isFootprintOpen}
                            onClose={() => setIsFootprintOpen(false)}
                            studentSession={studentSession}
                            points={points}
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
                            petData={displayPetData}
                            dragonInfo={dragonInfo}
                            ownerName={studentSession?.name}
                            daysSinceLastFed={daysSinceLastBond}
                            handleBond={handleBond}
                            setIsShopOpen={setIsShopOpen}
                            isFlashing={isFlashing}
                            isBusy={isBusy}
                            readerLevel={readerLevel}
                            selectSpecies={selectSpecies}
                        />
                    </Suspense>
                )}

                {growthCelebration && isOn('dragon') && (
                    <Suspense fallback={null}>
                        <DragonGrowthCelebrationModal
                            growth={growthCelebration}
                            species={displayPetData.species}
                            dragonName={displayPetData.name}
                            writerTitle={writerLevel.name}
                            readerLevel={readerLevel}
                            saving={isBusy}
                            onConfirm={handleGrowthCelebrationConfirm}
                        />
                    </Suspense>
                )}

                {/* 아지트 공방 모달 (모듈: game/dragon) — 열릴 때만 로드 */}
                {isShopOpen && isOn('dragon') && (
                    <Suspense fallback={null}>
                        <BackgroundShopModal
                            isOpen={isShopOpen}
                            onClose={() => setIsShopOpen(false)}
                            points={points}
                            petData={displayPetData}
                            dragonInfo={dragonInfo}
                            readerLevel={readerLevel}
                            ownerName={studentSession?.name}
                            buyDecorItem={buyDecorItem}
                            equipDecorItem={equipDecorItem}
                            isBusy={isBusy}
                        />
                    </Suspense>
                )}
                </div>
            </Card>

            {/* [신규] 우리반 아지트 독립 창 (전체 화면 오버레이) */}


            {/* 신규 아지트 놀이터 모듈 공통 진입점 — manifest.studentEntry를 지연 로딩 */}
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
