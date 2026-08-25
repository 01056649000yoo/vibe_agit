import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '../common/Card';
import StudentGuideModal from './StudentGuideModal';
import StudentFeedbackModal from './StudentFeedbackModal';
import { useDragonPet } from '../../modules/game/dragon/useDragonPet';
import {
    getDragonGrowthFromWriterLevel,
    getDragonStage,
    getPendingDragonGrowth,
    shouldOpenDragonSpeciesReselectionAfterGrowth
} from '../../modules/game/dragon/presentation';
import { useStudentDashboard } from '../../hooks/useStudentDashboard';
import StudentGameModuleHost from '../../modules/game/StudentGameModuleHost';
import useMyTitleStatus from '../../modules/writing/title-status/useMyTitleStatus';
import ActivityNotificationPanel from '../../modules/notifications/ActivityNotificationPanel';
import { studentHomeApi } from '../../modules/home/studentHomeApi';

// 분리된 UI 컴포넌트들
import StudentHeader from './StudentHeader';
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
const WritingFootprintModal = lazy(() => import('../../modules/writing/writing-footprint/WritingFootprintModal'));
const MyAgitPanel = lazy(() => import('./MyAgitPanel'));
const ReadingMarathonDashboardCard = lazy(() => import('../../modules/writing/reading-log/marathon/ReadingMarathonDashboardCard'));

const StudentDashboard = ({
    studentSession,
    onLogout,
    onNavigate,
    enabledModules = [],
    homeBootstrap,
    homeBootstrapLoading = false,
    onRefreshHome,
    myAgitSignal = 0,
    playgroundSignal = 0,
    dashboardResetSignal = 0,
    onMyAgitSignalHandled,
    onPlaygroundSignalHandled,
    onActiveNavChange
}) => {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isDragonModalOpen, setIsDragonModalOpen] = useState(false);
    const [activeGameModuleId, setActiveGameModuleId] = useState(null);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isFootprintOpen, setIsFootprintOpen] = useState(false);
    const [isMyAgitOpen, setIsMyAgitOpen] = useState(false);
    const [isPlaygroundOpen, setIsPlaygroundOpen] = useState(false);
    const [myAgitInitialPost, setMyAgitInitialPost] = useState(null);
    const [activityOverride, setActivityOverride] = useState(null);
    const [growthCelebration, setGrowthCelebration] = useState(null);
    const [openSpeciesPickerAfterGrowth, setOpenSpeciesPickerAfterGrowth] = useState(false);

    const activeDashboardNav = isMyAgitOpen
        ? 'my_agit'
        : (isPlaygroundOpen || isShopOpen || isDragonModalOpen || activeGameModuleId ? 'playground' : null);
    const activeDashboardNavRef = useRef(null);
    const onActiveNavChangeRef = useRef(onActiveNavChange);
    useEffect(() => { onActiveNavChangeRef.current = onActiveNavChange; }, [onActiveNavChange]);
    useEffect(() => {
        if (activeDashboardNavRef.current === activeDashboardNav) return;
        activeDashboardNavRef.current = activeDashboardNav;
        onActiveNavChangeRef.current?.(activeDashboardNav);
    }, [activeDashboardNav]);
    useEffect(() => () => {
        if (activeDashboardNavRef.current) onActiveNavChangeRef.current?.(null);
    }, []);

    // 하단 내비의 '나의 아지트'를 누르면 홈으로 온 뒤 이 신호가 올라온다.
    useEffect(() => {
        if (!myAgitSignal) return undefined;
        const timerId = window.setTimeout(() => {
            setIsPlaygroundOpen(false);
            setIsShopOpen(false);
            setIsDragonModalOpen(false);
            setActiveGameModuleId(null);
            setIsFootprintOpen(false);
            setIsGuideOpen(false);
            setMyAgitInitialPost(null);
            setIsMyAgitOpen(true);
            onMyAgitSignalHandled?.();
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [myAgitSignal, onMyAgitSignalHandled]);

    useEffect(() => {
        if (!playgroundSignal) return undefined;
        const timerId = window.setTimeout(() => {
            setIsMyAgitOpen(false);
            setMyAgitInitialPost(null);
            setIsShopOpen(false);
            setIsDragonModalOpen(false);
            setActiveGameModuleId(null);
            setIsFootprintOpen(false);
            setIsGuideOpen(false);
            setIsPlaygroundOpen(true);
            onPlaygroundSignalHandled?.();
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [playgroundSignal, onPlaygroundSignalHandled]);

    useEffect(() => {
        if (!dashboardResetSignal) return undefined;
        const timerId = window.setTimeout(() => {
            setIsMyAgitOpen(false);
            setMyAgitInitialPost(null);
            setIsPlaygroundOpen(false);
            setIsShopOpen(false);
            setIsDragonModalOpen(false);
            setActiveGameModuleId(null);
            setIsFootprintOpen(false);
            setIsGuideOpen(false);
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [dashboardResetSignal]);

    // 전반적인 대시보드 데이터 및 비즈니스 로직
    const {
        points, setPoints, hasActivity, showFeedback, feedbacks,
        loadingFeedback, feedbackInitialTab,
        returnedCount, initialPetData,
        handleMarkFeedbackRead, handleMarkAllFeedbackRead, handleCloseFeedback,
        handleDirectRewriteGo, openFeedback
    } = useStudentDashboard(studentSession, onNavigate, {
        bootstrap: homeBootstrap,
        bootstrapLoading: homeBootstrapLoading,
        refreshBootstrap: onRefreshHome
    });

    const {
        writerLevel,
        readerLevel,
        loading: titleStatusLoading
    } = useMyTitleStatus({
        studentSession,
        active: true,
        initialStatus: homeBootstrap?.title_status,
        bootstrapLoading: homeBootstrapLoading
    });

    // 드래곤 관련 상태 및 액션
    const {
        petData, isFlashing, isBusy,
        handleBond, buyDecorItem, claimLegendaryReward, equipDecorItem, selectSpecies, acknowledgeGrowth
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
        || isGuideOpen || showFeedback || isPlaygroundOpen
        || Boolean(activeGameModuleId);

    useEffect(() => {
        if (titleStatusLoading || !dragonEnabled || hasBlockingOverlay || growthCelebration) return;
        const pendingGrowth = getPendingDragonGrowth(writerLevel, petData);
        if (!pendingGrowth) return;
        const timerId = window.setTimeout(() => setGrowthCelebration(pendingGrowth), 280);
        return () => window.clearTimeout(timerId);
    }, [dragonEnabled, growthCelebration, hasBlockingOverlay, petData, titleStatusLoading, writerLevel]);

    const handleGrowthCelebrationConfirm = async () => {
        const acknowledgment = await acknowledgeGrowth();
        if (!acknowledgment) return;

        const confirmedGrowth = {
            ...growthCelebration,
            toLevel: acknowledgment.level
        };
        const shouldOpenSpeciesPicker = shouldOpenDragonSpeciesReselectionAfterGrowth(
            confirmedGrowth,
            acknowledgment.petData
        );

        setGrowthCelebration(null);
        if (shouldOpenSpeciesPicker) {
            setOpenSpeciesPickerAfterGrowth(true);
            setIsDragonModalOpen(true);
        }
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
    const serverActivitySummary = homeBootstrap?.activity_notifications || {
        version: 1,
        unread_count: 0,
        latest: null
    };
    const activitySummary = activityOverride?.bootstrapGeneratedAt === homeBootstrap?.generated_at
        ? activityOverride.summary
        : serverActivitySummary;

    const openGameModule = (module) => {
        setIsPlaygroundOpen(false);
        if (module.playground?.entryMode !== 'legacy') {
            setActiveGameModuleId(module.id);
            return;
        }
        if (module.id === 'dragon') setIsDragonModalOpen(true);
    };

    const playgroundItems = gameModules.map((module) => ({
        id: module.id,
        icon: module.icon || '🎮',
        name: module.playground?.name || module.name,
        description: module.playground?.description || module.description,
        background: module.playground?.background,
        borderColor: module.playground?.borderColor,
        economy: module.playground?.economy,
        pointLabel: module.playground?.pointLabel,
        ctaLabel: module.playground?.ctaLabel,
        guide: module.playground?.guide,
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
                        marathonMedal={homeBootstrap?.reading_marathon?.latest_medal}
                        marathonMedalCount={Number(homeBootstrap?.reading_marathon?.medal_count) || 0}
                        onOpenMyAgit={() => {
                            setMyAgitInitialPost(null);
                            setIsMyAgitOpen(true);
                        }}
                        onOpenDragon={() => setIsDragonModalOpen(true)}
                        onOpenPoints={() => setIsPlaygroundOpen(true)}
                    />

                    <Suspense fallback={null}>
                        <ReadingMarathonDashboardCard
                            studentSession={studentSession}
                            initialSnapshot={homeBootstrap?.reading_marathon}
                        />
                    </Suspense>

                <div className="student-home-action-grid">
                    <StudentTodoCard
                        unstartedCount={Number(homeBootstrap?.home?.unstarted_missions || 0)}
                        draftCount={Number(homeBootstrap?.home?.draft_missions || 0)}
                        returnedCount={returnedCount}
                        loading={homeBootstrapLoading}
                        onNavigate={onNavigate}
                        onGoRewrite={handleDirectRewriteGo}
                    />
                    <ActivityNotificationPanel
                        summary={activitySummary}
                        loading={homeBootstrapLoading}
                        onSummaryChange={(summary) => {
                            setActivityOverride({
                                bootstrapGeneratedAt: homeBootstrap?.generated_at,
                                summary
                            });
                            // activityOverride는 대시보드가 사라지면 함께 날아간다. 서버 값을
                            // 다시 받아 두지 않으면 다른 메뉴에 갔다 오는 순간 옛 개수가 다시
                            // 적용돼 방금 확인한 알림이 되살아난다(내 글 소식과 같은 문제).
                            // 여기는 승인·포인트라 보통 한두 건이므로 확인할 때마다 바로 받는다.
                            // 하루 스무 건까지 오는 내 글 소식은 창을 닫을 때 한 번만 받는다.
                            if (studentSession?.id) studentHomeApi.invalidate(studentSession.id);
                        }}
                        onNavigate={onNavigate}
                        onOpenPost={(post) => {
                            setMyAgitInitialPost(post);
                            setIsMyAgitOpen(true);
                        }}
                    />
                </div>


                {/* 주요 활동 메뉴 */}
                <DashboardMenu
                    onNavigate={onNavigate}
                    onOpenMyAgit={() => {
                        setMyAgitInitialPost(null);
                        setIsMyAgitOpen(true);
                    }}
                    onOpenPlayground={() => setIsPlaygroundOpen(true)}
                    playgroundCount={playgroundItems.length}
                    studentSession={studentSession}
                    homeBootstrap={homeBootstrap}
                    enabledModules={enabledModules}
                />

                <AgitPlayground
                    isOpen={isPlaygroundOpen}
                    onClose={() => setIsPlaygroundOpen(false)}
                    points={points}
                    items={playgroundItems}
                />

                {isMyAgitOpen && (
                    <Suspense fallback={null}>
                        <MyAgitPanel
                            isOpen={isMyAgitOpen}
                            onClose={() => {
                                setIsMyAgitOpen(false);
                                setMyAgitInitialPost(null);
                            }}
                            studentSession={studentSession}
                            initialPost={myAgitInitialPost}
                            closeOnInitialPostClose={Boolean(myAgitInitialPost)}
                            points={points}
                            enabledModules={enabledModules}
                            moduleRuntimeById={{
                                dragon: { petData: displayPetData, daysSinceLastFed: daysSinceLastBond, readerLevel }
                            }}
                            onOpenModule={(module) => {
                                setIsMyAgitOpen(false);
                                setMyAgitInitialPost(null);
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
                    onClose={handleCloseFeedback}
                    feedbacks={feedbacks}
                    loading={loadingFeedback}
                    onNavigate={onNavigate}
                    initialTab={feedbackInitialTab}
                    onMarkRead={handleMarkFeedbackRead}
                    onMarkAllRead={handleMarkAllFeedbackRead}
                />

                {/* 드래곤 아지트 모달 (모듈: game/dragon) — 열릴 때만 로드 */}
                {isDragonModalOpen && isOn('dragon') && (
                    <Suspense fallback={null}>
                        <DragonHideoutModal
                            isOpen={isDragonModalOpen}
                            onClose={() => {
                                setIsDragonModalOpen(false);
                                setOpenSpeciesPickerAfterGrowth(false);
                            }}
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
                            initiallyOpenSpeciesPicker={openSpeciesPickerAfterGrowth}
                            onGoWrite={(target) => {
                                setIsDragonModalOpen(false);
                                setOpenSpeciesPickerAfterGrowth(false);
                                onNavigate(target);
                            }}
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
                            claimLegendaryReward={claimLegendaryReward}
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
                        // ⚠️ zIndex 20000 은 공용 `Modal`(9999) 보다 높다. 그래서 게임 화면 **안에서**
                        // `Modal`/`ModalPortal` 을 열면 창이 이 화면 뒤에 숨고, 몸통 스크롤만 잠긴 채
                        // 학생이 닫지도 못한다(2026-08-17 어휘의 탑 지도 도움말에서 실제로 발생).
                        // 게임 화면 안에 창을 띄워야 하면 이 값을 먼저 정리하고 붙인다.
                        style={{
                            position: 'fixed', inset: 0, width: '100vw', height: '100dvh',
                            background: 'white', zIndex: 20000, overflowX: 'hidden', overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch'
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

        </>
    );
};

export default StudentDashboard;
