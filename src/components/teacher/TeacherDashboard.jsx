import { TEACHER_NAV_GROUPS } from '../../constants/teacherNav';
import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

// 지연 로딩 적용
const ClassManager = lazy(() => import('./ClassManager'));
const ArchiveManager = lazy(() => import('./ArchiveManager'));
const GameManager = lazy(() => import('./GameManager'));
const TeachingToolsHub = lazy(() => import('./TeachingToolsHub'));
const TeacherEvaluationTab = lazy(() => import('./TeacherEvaluationTab'));
const ActivityReport = lazy(() => import('./ActivityReport'));
const TeacherOperationsHub = lazy(() => import('./TeacherOperationsHub'));
const TeacherStudentHub = lazy(() => import('./TeacherStudentHub'));
const TeacherWritingFootprintDashboard = lazy(() => import('../../modules/writing/writing-footprint/TeacherWritingFootprintDashboard'));

// 별도 파일 분리 컴포넌트 및 커스텀 훅 임포트
import { useTeacherDashboard } from '../../hooks/useTeacherDashboard';
import ClassSwitcher from './ClassSwitcher';
import TeacherGuideButton from './TeacherGuideButton';
import TeacherWritingHub from './TeacherWritingHub';
import TeacherSettingsHub from './TeacherSettingsHub';
import TeacherProfileModal from './TeacherProfileModal';
import ActivityDetailModal from './ActivityDetailModal';
import FeedbackModal from './FeedbackModal';
import TeacherAnnouncementManager from './TeacherAnnouncementManager';
import AnnouncementSpotlight from './AnnouncementSpotlight';
import { AnnouncementListModal, AnnouncementModal } from './AnnouncementComponents';
import { useAnnouncements } from '../../hooks/useAnnouncements';
import useAnnouncementSeen from './useAnnouncementSeen';
import {
    DEFAULT_MISSION_CARD_SIZE,
    LEGACY_WRITING_CARD_LAYOUT_STORAGE_KEY,
    MISSION_CARD_SIZE_OPTIONS,
    MISSION_CARD_SIZE_STORAGE_KEY,
    migrateLegacyMissionCardSize,
    normalizeMissionCardSize
} from '../../modules/writing/mission-card-layout/missionCardLayout';
import './TeacherDashboard.css';

const TEACHER_TAB_STORAGE_KEY = 'teacher-dashboard-current-tab-v1';
const TEACHER_TAB_IDS = TEACHER_NAV_GROUPS.flatMap(group => group.tabs.map(tab => tab.id));

const loadTeacherTab = () => {
    try {
        const requestedTab = new URL(window.location.href).searchParams.get('teacherTab');
        if (TEACHER_TAB_IDS.includes(requestedTab)) return requestedTab;
        const savedTab = window.sessionStorage.getItem(TEACHER_TAB_STORAGE_KEY);
        return TEACHER_TAB_IDS.includes(savedTab) ? savedTab : 'dashboard';
    } catch {
        return 'dashboard';
    }
};

const loadMissionCardSize = () => {
    try {
        const savedSize = window.localStorage.getItem(MISSION_CARD_SIZE_STORAGE_KEY);
        if (savedSize) return normalizeMissionCardSize(savedSize);

        const legacyLayout = JSON.parse(window.localStorage.getItem(LEGACY_WRITING_CARD_LAYOUT_STORAGE_KEY));
        return migrateLegacyMissionCardSize(legacyLayout);
    } catch {
        return DEFAULT_MISSION_CARD_SIZE;
    }
};


/**
 * 역할: 선생님 메인 대시보드 (와이드 2단 레이아웃) ✨
 */
const TeacherDashboard = ({ profile, teacherBootstrap, session, activeClass, setActiveClass, onProfileUpdate, isAdmin, onSwitchToAdminMode, onLogout }) => {
    const [currentTab, setCurrentTab] = useState(loadTeacherTab);
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
    const [selectedActivityPost, setSelectedActivityPost] = useState(null);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    // 관리자가 답장을 달면 여기에 숫자가 붙는다. 답장이 보이지 않으면 아무도 두 번 제보하지 않는다.
    const [feedbackReplyCount, setFeedbackReplyCount] = useState(0);

    /*
     * 공지는 대시보드가 한 번만 읽어 머리말 버튼과 위쪽 띠에 함께 넘긴다.
     * 두 곳에서 각자 부르면 같은 목록을 두 번 받는다.
     */
    const { announcements } = useAnnouncements('TEACHER', teacherBootstrap?.announcements);
    const announcementSeen = useAnnouncementSeen(session?.user?.id, announcements);
    const [showAnnouncementList, setShowAnnouncementList] = useState(false);
    const [isAdminPasswordOpen, setIsAdminPasswordOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [adminPasswordError, setAdminPasswordError] = useState('');
    const [isVerifyingAdminPassword, setIsVerifyingAdminPassword] = useState(false);
    const [missionCardSize, setMissionCardSize] = useState(loadMissionCardSize);
    const [workspaceTarget, setWorkspaceTarget] = useState(null);

    // [리팩토링] 커스텀 훅을 통한 상태 및 비즈니스 로직 관리
    const {
        classes, setClasses, loadingClasses,
        teacherInfo, isEditProfileOpen, setIsEditProfileOpen,
        editName, setEditName, editSchool, setEditSchool, editPhone, setEditPhone,
        setPromptTemplate, reportPromptTemplate, setReportPromptTemplate,
        testingKey,
        handleUpdateTeacherProfile, handleTestAIConnection,
        handleWithdrawal, handleSwitchGoogleAccount, handleSetPrimaryClass, handleRestoreClass,
        fetchAllClasses, fetchDeletedClasses
    } = useTeacherDashboard(session, profile, onProfileUpdate, activeClass, setActiveClass, teacherBootstrap);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    /*
     * 못 본 답장 개수를 읽는다. 대시보드가 뜰 때 한 번만 부르고 주기 조회는 하지 않는다
     * (교사 화면의 성능 계약 — 화면마다 집계 대신 미리 계산된 한 줄을 읽는다).
     */
    const loadFeedbackReplyCount = useCallback(async () => {
        const { data, error } = await supabase.rpc('get_my_feedback_reply_badge_v1');
        if (error) { console.error('답장 개수 확인 실패:', error.message); return; }
        setFeedbackReplyCount(Number(data?.unread ?? 0));
    }, []);

    useEffect(() => {
        void loadFeedbackReplyCount();
    }, [loadFeedbackReplyCount]);

    useEffect(() => {
        try {
            window.localStorage.setItem(MISSION_CARD_SIZE_STORAGE_KEY, missionCardSize);
        } catch {
            // 저장소가 차단된 환경에서도 현재 화면의 크기 선택은 그대로 유지한다.
        }
    }, [missionCardSize]);

    useEffect(() => {
        try {
            window.sessionStorage.setItem(TEACHER_TAB_STORAGE_KEY, currentTab);
        } catch {
            // 저장소가 차단된 환경에서는 기존 기본 탭 동작을 유지한다.
        }
    }, [currentTab]);

    const handleTabChange = useCallback((tabId) => {
        setWorkspaceTarget(null);
        setCurrentTab(tabId);
    }, []);

    const handleWorkspaceNavigate = useCallback((target) => {
        if (!target?.tab) return;
        setWorkspaceTarget({
            ...target,
            requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        });
        setCurrentTab(target.tab);
    }, []);

    const handleWorkspaceNavigationHandled = useCallback((requestId) => {
        setWorkspaceTarget((current) => current?.requestId === requestId ? null : current);
    }, []);

    const handleOpenAdminPasswordModal = useCallback(() => {
        setAdminPassword('');
        setAdminPasswordError('');
        setIsAdminPasswordOpen(true);
    }, []);

    const handleConfirmAdminPassword = useCallback(async () => {
        if (!adminPassword.trim()) {
            setAdminPasswordError('비밀번호를 입력해주세요.');
            return;
        }

        setIsVerifyingAdminPassword(true);
        setAdminPasswordError('');

        try {
            const { data, error } = await supabase.functions.invoke('verify-admin-mode', {
                body: { password: adminPassword }
            });

            if (error) {
                let errorMessage = error.message || '관리자 모드 확인에 실패했습니다.';

                if (error.context) {
                    try {
                        const errorText = await error.context.text();
                        if (errorText) {
                            try {
                                const parsed = JSON.parse(errorText);
                                errorMessage = parsed?.message || parsed?.error || errorMessage;
                            } catch {
                                errorMessage = errorText;
                            }
                        }
                    } catch {
                        // context를 읽지 못하면 기본 메시지를 유지합니다.
                    }
                }

                throw new Error(errorMessage);
            }

            if (!data?.success) {
                throw new Error(data?.message || '비밀번호가 올바르지 않습니다.');
            }

            setAdminPassword('');
            setAdminPasswordError('');
            setIsAdminPasswordOpen(false);
            onSwitchToAdminMode();
        } catch (err) {
            setAdminPasswordError(err.message || '관리자 모드 확인에 실패했습니다.');
        } finally {
            setIsVerifyingAdminPassword(false);
        }
    }, [adminPassword, onSwitchToAdminMode]);


    const hasZeroClasses = classes.length === 0;
    const visibleTab = TEACHER_TAB_IDS.includes(currentTab) ? currentTab : 'dashboard';
    const activeNavGroup = TEACHER_NAV_GROUPS.find(group => group.tabs.some(tab => tab.id === visibleTab)) || TEACHER_NAV_GROUPS[0];
    const activeTab = activeNavGroup.tabs.find(tab => tab.id === visibleTab) || activeNavGroup.tabs[0];
    const secondaryTabs = activeNavGroup.tabs.length > 1 ? activeNavGroup.tabs : [];
    const usesSecondarySidebar = !isMobile && activeNavGroup.secondaryShape === 'sidebar';
    const showsMissionCardSizeControls = !isMobile && visibleTab === 'dashboard';

    return (
        <div className="teacher-dashboard">
            {/* 상단 슬림 헤더 (고정) */}
            <header className="teacher-dashboard__header" style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'white', borderBottom: '1px solid #E9ECEF',
                flexShrink: 0, zIndex: 100, width: '100%', boxSizing: 'border-box'
            }}>
                {/* 현재 학급 이름은 고정해서 읽기만 하고, 바꾸는 건 오른쪽 알약 버튼이 맡는다. */}
                <div className="teacher-class-bar">
                    <span className="teacher-class-bar__icon" aria-hidden="true">🏫</span>
                    <h2 className="teacher-class-bar__name">
                        {activeClass ? activeClass.name : '학급 관리'}
                    </h2>
                    {classes.length > 1 && (
                        <ClassSwitcher
                            classes={classes}
                            activeClass={activeClass}
                            onSelect={setActiveClass}
                        />
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {!isMobile && (
                        <span style={{ fontSize: '0.85rem', color: '#6C757D', fontWeight: 'bold' }}>
                            {teacherInfo.name || profile?.full_name} 선생님
                        </span>
                    )}
                    {isAdmin && (
                        <Button variant="primary" size="sm" onClick={handleOpenAdminPasswordModal} style={{ fontSize: '0.8rem', background: '#E67E22', border: 'none', borderRadius: '8px' }}>
                            🛡️ 관리자
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setIsEditProfileOpen(true)} style={{ fontSize: '0.8rem', color: '#6C757D', border: '1px solid #E9ECEF', borderRadius: '8px' }}>
                        ⚙️ 정보 수정
                    </Button>
                    <TeacherAnnouncementManager
                        isMobile={isMobile}
                        unreadCount={announcementSeen.unreadCount}
                        onOpenList={() => setShowAnnouncementList(true)}
                    />
                    {/*
                      * 예전 이름은 `📢 의견 보내기` 였고 회색 설정 버튼 무리에 끼어 있었다.
                      * 건의함처럼 보여 아무도 누르지 않았다(제보 0건). 무엇을 하는 곳인지로 이름을 바꾸고
                      * 색을 줘서 설정 항목과 구분한다.
                      */}
                    <Button variant="ghost" size="sm" onClick={() => setIsFeedbackOpen(true)} style={{ fontSize: '0.8rem', color: '#B45309', border: '1px solid #FCD34D', background: '#FFFBEB', borderRadius: '8px', fontWeight: 700 }}>
                        🐞 오류·정정 알려주기
                        {feedbackReplyCount > 0 && (
                            <span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '999px', background: '#DC2626', color: 'white', fontSize: '0.7rem', fontWeight: 900 }}>
                                답장 {feedbackReplyCount}
                            </span>
                        )}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onLogout} style={{ fontSize: '0.8rem', color: '#DC3545' }}>
                        로그아웃
                    </Button>
                </div>
            </header>

            {/*
              * 새 공지는 머리말의 작은 버튼만으로는 눈에 띄지 않았다(사용자 지적).
              * 안 읽은 공지가 있을 때만 여기에 띠가 뜨고, 다 읽으면 사라진다.
              */}
            <AnnouncementSpotlight
                unread={announcementSeen.unread}
                onMarkSeen={announcementSeen.markSeen}
                onViewAll={() => setShowAnnouncementList(true)}
            />

            {/* 교사 업무 영역 네비게이션 */}
            <nav className="teacher-dashboard__nav" style={{
                display: 'flex', background: 'white', borderBottom: '1px solid #E9ECEF',
                flexShrink: 0, zIndex: 99, width: '100%', boxSizing: 'border-box', overflowX: 'auto'
            }} aria-label="교사 업무 메뉴">
                {TEACHER_NAV_GROUPS.map((group) => {
                    const isActive = activeNavGroup.id === group.id;
                    const itemStyle = {
                            padding: isMobile ? '10px 12px' : '12px 22px', border: 'none',
                            background: isActive ? '#EFF6FF' : 'transparent',
                            borderBottom: isActive ? '3px solid #3498DB' : '3px solid transparent',
                            color: isActive ? '#2563EB' : '#64748B',
                            fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s',
                            fontSize: isMobile ? '0.82rem' : '0.95rem', whiteSpace: 'nowrap',
                            display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none'
                    };

                    if (group.launchHref) {
                        // 지금 보고 있는 학급을 함께 넘긴다. 연구소가 그 학급으로 바로 들어가
                        // 학급을 두 번 고르지 않게 한다(연구소는 아지트와 같은 학급 id 를 쓴다).
                        const launchHref = activeClass?.id
                            ? `${group.launchHref}?class_id=${encodeURIComponent(activeClass.id)}`
                            : group.launchHref;
                        return (
                            <a
                                key={group.id}
                                href={launchHref}
                                aria-label={`${group.label}로 이동`}
                                style={itemStyle}
                            >
                                <span aria-hidden="true">{group.icon}</span> {group.label}
                            </a>
                        );
                    }

                    return (
                        <button
                            key={group.id}
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => handleTabChange(group.defaultTab)}
                            style={itemStyle}
                        >
                            <span aria-hidden="true">{group.icon}</span> {group.label}
                        </button>
                    );
                })}
                {showsMissionCardSizeControls && (
                    <div role="group" aria-label="미션 카드 크기 설정" style={{
                        display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', paddingLeft: '18px',
                        borderLeft: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.76rem', fontWeight: '800', flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>미션 카드</span>
                            {MISSION_CARD_SIZE_OPTIONS.map(option => (
                                <button key={option.id} type="button" onClick={() => setMissionCardSize(option.id)} aria-pressed={missionCardSize === option.id} style={{
                                    height: '28px', padding: '0 9px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800',
                                    border: missionCardSize === option.id ? '1px solid #2563EB' : '1px solid #CBD5E1',
                                    background: missionCardSize === option.id ? '#EFF6FF' : 'white',
                                    color: missionCardSize === option.id ? '#1D4ED8' : '#64748B'
                                }}>{option.label}</button>
                            ))}
                        </div>
                    </div>
                )}
            </nav>

            {/* 메인 콘텐츠 영역 */}
            <main className="teacher-dashboard__main">
                <div className="teacher-dashboard__workspace" style={{
                    display: usesSecondarySidebar ? 'grid' : 'block',
                    gridTemplateColumns: usesSecondarySidebar ? 'clamp(180px, 10vw, 240px) minmax(0, 1fr)' : undefined,
                    gap: usesSecondarySidebar ? 'clamp(20px, 1.25vw, 32px)' : undefined,
                    alignItems: 'start'
                }}>
                {secondaryTabs.length > 0 && (
                    <div
                        role="tablist"
                        aria-label={`${activeNavGroup.label} 세부 메뉴`}
                        style={{
                            display: 'flex', flexDirection: usesSecondarySidebar ? 'column' : 'row', gap: '6px', padding: '6px',
                            marginBottom: usesSecondarySidebar ? 0 : (isMobile ? '16px' : '22px'),
                            width: usesSecondarySidebar || isMobile ? '100%' : 'fit-content', overflowX: 'auto', boxSizing: 'border-box',
                            borderRadius: '16px', background: '#E2E8F0', position: usesSecondarySidebar ? 'sticky' : undefined, top: usesSecondarySidebar ? 0 : undefined
                        }}
                    >
                        {secondaryTabs.map(tab => (
                            <div
                                key={tab.id}
                                className={`teacher-subtab${visibleTab === tab.id ? ' is-active' : ''}`}
                                style={{ flex: isMobile ? '1 0 auto' : undefined }}
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={visibleTab === tab.id}
                                    onClick={() => handleTabChange(tab.id)}
                                    className="teacher-subtab__button"
                                    style={{
                                        padding: usesSecondarySidebar ? '13px 14px' : '9px 16px',
                                        fontSize: isMobile ? '0.85rem' : '0.9rem',
                                        textAlign: usesSecondarySidebar ? 'left' : 'center'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <div style={{ minWidth: 0 }}>
                {secondaryTabs.length > 0 && !['writing', 'operations', 'records'].includes(activeNavGroup.id) && (
                    <div className="teacher-tab-heading">
                        <h2>{activeTab.label}</h2>
                        <TeacherGuideButton tabId={visibleTab} variant="help" />
                    </div>
                )}
                <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>로딩 중... ✨</div>}>
                    {/* 학급 데이터 로딩 중이면 스켈레톤 표시 */}
                    {loadingClasses ? (
                        <div style={{ padding: isMobile ? '16px' : '24px' }}>
                            <style>{`
                                @keyframes pulse {
                                    0%, 100% { opacity: 1; }
                                    50% { opacity: 0.4; }
                                }
                                .skeleton { animation: pulse 1.4s ease-in-out infinite; background: #E9ECEF; border-radius: 8px; }
                            `}</style>
                            {[1, 2, 3].map(i => (
                                <div key={i} className="skeleton" style={{ height: '80px', marginBottom: '12px' }} />
                            ))}
                        </div>
                    ) : visibleTab === 'archive' ? (
                        <ArchiveManager activeClass={activeClass} isMobile={isMobile} />
                    ) : visibleTab === 'playground' ? (
                        <GameManager activeClass={activeClass} isMobile={isMobile} />
                    ) : visibleTab === 'tools' ? (
                        <TeachingToolsHub activeClass={activeClass} isMobile={isMobile} />
                    ) : (!activeClass || hasZeroClasses) ? (
                        <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
                            <ClassManager
                                userId={session.user.id} classes={classes} activeClass={activeClass}
                                setActiveClass={setActiveClass} setClasses={setClasses}
                                onClassDeleted={fetchAllClasses} isMobile={isMobile}
                                fetchDeletedClasses={fetchDeletedClasses} onRestoreClass={handleRestoreClass}
                            />
                        </div>
                    ) : (
                        visibleTab === 'dashboard' || visibleTab === 'reading-logs' || visibleTab === 'diaries' ? (
                            <TeacherWritingHub
                                key={activeClass.id}
                                activeClass={activeClass}
                                isMobile={isMobile}
                                section={visibleTab === 'dashboard' ? 'missions' : visibleTab}
                                missionCardSize={missionCardSize}
                                navigationTarget={workspaceTarget}
                                onNavigationHandled={handleWorkspaceNavigationHandled}
                                bootstrapProfile={teacherBootstrap?.profile || profile}
                            />
                        ) : visibleTab === 'operations' || visibleTab === 'student-agits' || visibleTab === 'recent-activity' || visibleTab === 'comments' ? (
                            <TeacherOperationsHub
                                key={`${activeClass.id}-${visibleTab}`}
                                activeClass={activeClass}
                                isMobile={isMobile}
                                section={visibleTab}
                                setSelectedActivityPost={setSelectedActivityPost}
                                onNavigate={handleWorkspaceNavigate}
                                navigationTarget={workspaceTarget}
                                onNavigationHandled={handleWorkspaceNavigationHandled}
                            />
                        ) : visibleTab === 'students' ? (
                            <TeacherStudentHub
                                key={activeClass.id}
                                activeClass={activeClass}
                                isMobile={isMobile}
                                onNavigate={handleWorkspaceNavigate}
                            />
                        ) : visibleTab === 'evaluation' ? (
                            <TeacherEvaluationTab activeClass={activeClass} isMobile={isMobile} />
                        ) : visibleTab === 'footprints' ? (
                            <TeacherWritingFootprintDashboard activeClass={activeClass} isMobile={isMobile} />
                        ) : visibleTab === 'activity' ? (
                            <ActivityReport activeClass={activeClass} isMobile={isMobile} promptTemplate={reportPromptTemplate} />
                        ) : (
                            <TeacherSettingsHub
                                isMobile={isMobile} session={session} classes={classes} activeClass={activeClass}
                                setActiveClass={setActiveClass} setClasses={setClasses} profile={profile}
                                fetchAllClasses={fetchAllClasses} fetchDeletedClasses={fetchDeletedClasses}
                                handleRestoreClass={handleRestoreClass} handleSetPrimaryClass={handleSetPrimaryClass}
                                handleTestAIConnection={handleTestAIConnection}
                                testingKey={testingKey}
                                setPromptTemplate={setPromptTemplate} setReportPromptTemplate={setReportPromptTemplate}
                                onNavigate={handleWorkspaceNavigate}
                            />
                        )
                    )}
                </Suspense>
                </div>
                </div>
            </main>

            {/* 별도 컴포넌트 모달들 */}
            <ActivityDetailModal post={selectedActivityPost} onClose={() => setSelectedActivityPost(null)} />

            <TeacherProfileModal
                isOpen={isEditProfileOpen}
                onClose={() => setIsEditProfileOpen(false)}
                editName={editName} setEditName={setEditName}
                editSchool={editSchool} setEditSchool={setEditSchool}
                editPhone={editPhone} setEditPhone={setEditPhone}
                handleUpdateTeacherProfile={handleUpdateTeacherProfile}
                handleSwitchGoogleAccount={handleSwitchGoogleAccount}
                handleWithdrawal={handleWithdrawal}
            />

            <FeedbackModal
                isOpen={isFeedbackOpen}
                onClose={() => setIsFeedbackOpen(false)}
                onRepliesSeen={() => setFeedbackReplyCount(0)}
            />

            {/* 목록을 열면 그 안의 공지를 모두 읽은 것으로 본다. */}
            {showAnnouncementList && (
                <AnnouncementListModal
                    announcements={announcements}
                    onClose={() => {
                        announcementSeen.markAllSeen();
                        setShowAnnouncementList(false);
                    }}
                />
            )}

            {/*
              * 관리자가 `팝업` 으로 표시한 공지는 들어올 때 한 번 뜬다.
              * 그전에는 이 창이 만들어져 있고도 아무 데서도 쓰이지 않아 설정이 헛돌았다.
              */}
            <AnimatePresence>
                {announcementSeen.popupAnnouncement && (
                    <AnnouncementModal
                        announcement={announcementSeen.popupAnnouncement}
                        onClose={() => announcementSeen.markSeen([announcementSeen.popupAnnouncement.id])}
                        onDoNotShowAgain={() => announcementSeen.hidePopup(announcementSeen.popupAnnouncement.id)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isAdminPasswordOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(15, 23, 42, 0.55)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 10010,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '20px'
                        }}
                        onClick={() => setIsAdminPasswordOpen(false)}
                    >
                        <motion.div
                            initial={{ y: 16, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 12, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                width: '100%',
                                maxWidth: '420px',
                                background: 'white',
                                borderRadius: '24px',
                                padding: isMobile ? '24px' : '28px',
                                boxShadow: '0 24px 60px rgba(15, 23, 42, 0.22)'
                            }}
                        >
                            <div style={{ marginBottom: '18px' }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🛡️</div>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', color: '#1F2937', fontWeight: '900' }}>
                                    관리자 모드 비밀번호 확인
                                </h3>
                                <p style={{ margin: 0, color: '#6B7280', fontSize: '0.95rem', lineHeight: '1.6' }}>
                                    관리자 대시보드로 들어가기 전에 서버에서 비밀번호를 한 번 더 확인합니다.
                                </p>
                            </div>

                            <input
                                type="password"
                                value={adminPassword}
                                onChange={(e) => {
                                    setAdminPassword(e.target.value);
                                    if (adminPasswordError) setAdminPasswordError('');
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        handleConfirmAdminPassword();
                                    }
                                }}
                                placeholder="관리자 비밀번호 입력"
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '14px 16px',
                                    borderRadius: '14px',
                                    border: adminPasswordError ? '1px solid #EF4444' : '1px solid #D1D5DB',
                                    fontSize: '1rem',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />

                            {adminPasswordError && (
                                <div style={{
                                    marginTop: '10px',
                                    color: '#DC2626',
                                    fontSize: '0.88rem',
                                    fontWeight: '700',
                                    lineHeight: '1.5'
                                }}>
                                    {adminPasswordError}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <Button
                                    variant="ghost"
                                    onClick={() => setIsAdminPasswordOpen(false)}
                                    disabled={isVerifyingAdminPassword}
                                    style={{ flex: 1, borderRadius: '14px' }}
                                >
                                    취소
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={handleConfirmAdminPassword}
                                    disabled={isVerifyingAdminPassword}
                                    style={{ flex: 1, borderRadius: '14px', background: '#E67E22', border: 'none' }}
                                >
                                    {isVerifyingAdminPassword ? '확인 중...' : '관리자 모드 열기'}
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TeacherDashboard;
