import React from 'react';
import { motion } from 'framer-motion';
import useReadingLogDailyStatus from '../../modules/writing/reading-log/useReadingLogDailyStatus';
import useDiaryDailyStatus from '../../modules/writing/diary/useDiaryDailyStatus';
import './DashboardMenu.css';

const MenuCard = ({ icon, title, description, badge, isNew, tone, onClick, disabled = false }) => (
    <motion.button
        type="button"
        className={`student-home-menu-card tone-${tone}`}
        whileHover={disabled ? undefined : { y: -2 }}
        whileTap={disabled ? undefined : { scale: .985 }}
        onClick={onClick}
        disabled={disabled}
    >
        <span className="student-home-menu-card__icon" aria-hidden="true">{icon}</span>
        <span className="student-home-menu-card__copy">
            <strong>{title}</strong>
            <small>{description}</small>
            {badge && <em>{badge}</em>}
        </span>
        <span className="student-home-menu-card__arrow" aria-hidden="true">›</span>
        {isNew && <span className="student-home-menu-card__new">NEW</span>}
    </motion.button>
);

const DashboardMenu = ({
    onNavigate,
    setIsAgitOpen,
    onOpenMyAgit,
    onOpenPlayground,
    playgroundCount = 0,
    agitSettings,
    studentSession,
    homeBootstrap,
    enabledModules = []
}) => {
    const agitOnClassEnabled = enabledModules.some((module) => module.id === 'agit-on-class');
    const hasNewMission = Boolean(homeBootstrap?.home?.has_new_mission);
    const readingDailyStatus = useReadingLogDailyStatus(studentSession?.id, {
        enabled: !homeBootstrap,
        initialStatus: homeBootstrap?.reading_daily
    });
    const diaryDailyStatus = useDiaryDailyStatus(studentSession?.id, {
        enabled: !homeBootstrap,
        initialStatus: homeBootstrap?.diary_daily
    });

    const readingDescription = readingDailyStatus.loading
        ? '오늘 작성 현황을 확인하고 있어요'
        : readingDailyStatus.canComplete
            ? `오늘 ${readingDailyStatus.completedToday}/${readingDailyStatus.dailyLimit}편 완료`
            : `오늘 ${readingDailyStatus.completedToday}/${readingDailyStatus.dailyLimit}편 완료 · 내일 다시 쓰기`;
    const readingBadge = readingDailyStatus.loading
        ? null
        : readingDailyStatus.canComplete
            ? `새 독서록 ${readingDailyStatus.remainingToday}편 가능`
            : '오늘 작성 완료';

    const diaryDescription = diaryDailyStatus.loading
        ? '오늘 작성 현황을 확인하고 있어요'
        : diaryDailyStatus.hasTodayDiary
            ? '오늘 일기를 썼어요 · 다시 열어 다듬기'
            : '오늘 있었던 일 남기기';
    const diaryBadge = diaryDailyStatus.loading
        ? null
        : diaryDailyStatus.hasTodayDiary ? '오늘 작성 완료' : '오늘 아직 안 썼어요';

    const openAgitOnClass = () => {
        if (agitSettings?.isMenuEnabled === false) return;
        const classId = studentSession?.class_id || studentSession?.classId;
        if (classId) localStorage.setItem(`last_visit_agit_menu_${classId}`, new Date().toISOString());
        setIsAgitOpen(true);
    };

    return (
        <section className="student-home-menu" aria-labelledby="student-home-menu-title">
            <header className="student-home-menu__header">
                <h2 id="student-home-menu-title">주요 메뉴</h2>
                <p>글을 쓰고, 친구의 글을 읽고, 포인트로 놀아 보세요.</p>
            </header>

            <div className="student-home-menu-grid">
                <MenuCard
                    icon="📝"
                    title="과제 글쓰기"
                    description="선생님이 낸 글 확인하기"
                    isNew={hasNewMission}
                    tone="amber"
                    onClick={() => onNavigate('mission_list')}
                />
                <MenuCard
                    icon="📚"
                    title="독서록"
                    description={readingDescription}
                    badge={readingBadge}
                    tone="green"
                    onClick={() => onNavigate('reading_logs')}
                />
                {diaryDailyStatus.isEnabled && (
                    <MenuCard
                        icon="📔"
                        title="일기"
                        description={diaryDescription}
                        badge={diaryBadge}
                        tone="blue"
                        onClick={() => onNavigate('diaries')}
                    />
                )}
                <MenuCard
                    icon="👀"
                    title="친구 아지트"
                    description="친구들의 최신 글과 책장 보기"
                    tone="blue"
                    onClick={() => onNavigate('friends_hideout')}
                />
                <MenuCard
                    icon="🏡"
                    title="나의 아지트"
                    description="내 서재·칭호·드래곤 모아보기"
                    tone="brown"
                    onClick={onOpenMyAgit}
                />
                {playgroundCount > 0 && (
                    <MenuCard
                        icon="🎡"
                        title="아지트 놀이터"
                        description={`포인트로 즐기는 놀거리 ${playgroundCount}개`}
                        tone="orange"
                        onClick={onOpenPlayground}
                    />
                )}
                {agitOnClassEnabled && (
                    <MenuCard
                        icon={agitSettings?.isMenuEnabled === false ? '🔒' : '🎈'}
                        title="두근두근 우리반 아지트"
                        description={agitSettings?.isMenuEnabled === false ? '선생님이 준비하고 있어요' : '친구들과 함께 에너지 모으기'}
                        badge={agitSettings?.isMenuEnabled === false ? '준비 중' : '입장하기'}
                        tone="rose"
                        disabled={agitSettings?.isMenuEnabled === false}
                        onClick={openAgitOnClass}
                    />
                )}
            </div>
        </section>
    );
};

export default DashboardMenu;
