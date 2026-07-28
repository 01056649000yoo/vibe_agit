import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';

// 지연 로딩 적용
const ClassManager = lazy(() => import('./ClassManager'));
const ArchiveManager = lazy(() => import('./ArchiveManager'));
const UsageGuide = lazy(() => import('./UsageGuide'));
const GameManager = lazy(() => import('./GameManager'));
const TeacherEvaluationTab = lazy(() => import('./TeacherEvaluationTab'));
const ActivityReport = lazy(() => import('./ActivityReport'));
const TeacherStudentHub = lazy(() => import('./TeacherStudentHub'));

// 별도 파일 분리 컴포넌트 및 커스텀 훅 임포트
import { useTeacherDashboard } from '../../hooks/useTeacherDashboard';
import TeacherWritingHub from './TeacherWritingHub';
import TeacherSettingsTab from './TeacherSettingsTab';
import TeacherProfileModal from './TeacherProfileModal';
import ActivityDetailModal from './ActivityDetailModal';
import FeedbackModal from './FeedbackModal';
import TeacherAnnouncementManager from './TeacherAnnouncementManager';

const TEACHER_NAV_GROUPS = [
    {
        id: 'writing',
        label: '글쓰기',
        icon: '✍️',
        defaultTab: 'dashboard',
        tabs: [
            { id: 'dashboard', label: '선생님 과제' },
            { id: 'reading-logs', label: '학생 독서록' },
            { id: 'archive', label: '보관함' }
        ]
    },
    {
        id: 'students',
        label: '학생',
        icon: '👥',
        defaultTab: 'students',
        tabs: [{ id: 'students', label: '학생 관리' }]
    },
    {
        id: 'records',
        label: '평가·기록',
        icon: '📝',
        defaultTab: 'evaluation',
        tabs: [
            { id: 'evaluation', label: '학생 평가' },
            { id: 'activity', label: '국어 평어' }
        ]
    },
    {
        id: 'playground',
        label: '포인트·놀이',
        icon: '🎮',
        defaultTab: 'playground',
        tabs: [{ id: 'playground', label: '포인트·놀이' }]
    },
    {
        id: 'settings',
        label: '설정',
        icon: '⚙️',
        defaultTab: 'settings',
        tabs: [
            { id: 'settings', label: '관리 설정' },
            { id: 'guide', label: '사용 안내' }
        ]
    }
];

/**
 * 역할: 선생님 메인 대시보드 (와이드 2단 레이아웃) ✨
 */
const TeacherDashboard = ({ profile, session, activeClass, setActiveClass, onProfileUpdate, isAdmin, onSwitchToAdminMode, onLogout }) => {
    const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'students', 'settings', 'playground', 'archive', 'guide'
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
    const [selectedActivityPost, setSelectedActivityPost] = useState(null);
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [isAdminPasswordOpen, setIsAdminPasswordOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [adminPasswordError, setAdminPasswordError] = useState('');
    const [isVerifyingAdminPassword, setIsVerifyingAdminPassword] = useState(false);

    // [리팩토링] 커스텀 훅을 통한 상태 및 비즈니스 로직 관리
    const {
        classes, setClasses, loadingClasses,
        teacherInfo, isEditProfileOpen, setIsEditProfileOpen,
        editName, setEditName, editSchool, setEditSchool, editPhone, setEditPhone,
        promptTemplate, setPromptTemplate, originalPrompt,
        reportPromptTemplate, setReportPromptTemplate, originalReportPrompt,
        savingKey, testingKey, aiStatus,
        handleUpdateTeacherProfile, handleSaveTeacherSettings, handleTestAIConnection, runAIDiagnosis,
        handleWithdrawal, handleSwitchGoogleAccount, handleSetPrimaryClass, handleRestoreClass,
        fetchAllClasses, fetchDeletedClasses
    } = useTeacherDashboard(session, profile, onProfileUpdate, activeClass, setActiveClass);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
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
    const teacherTabs = TEACHER_NAV_GROUPS.flatMap(group => group.tabs.map(tab => tab.id));
    const visibleTab = teacherTabs.includes(currentTab) ? currentTab : 'dashboard';
    const activeNavGroup = TEACHER_NAV_GROUPS.find(group => group.tabs.some(tab => tab.id === visibleTab)) || TEACHER_NAV_GROUPS[0];
    const secondaryTabs = activeNavGroup.tabs.length > 1 ? activeNavGroup.tabs : [];

    return (
        <div style={{
            width: '100vw', height: '100vh', background: '#F8F9FA',
            display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box'
        }}>
            {/* 상단 슬림 헤더 (고정) */}
            <header style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: isMobile ? '8px 16px' : '12px 24px',
                background: 'white', borderBottom: '1px solid #E9ECEF',
                flexShrink: 0, zIndex: 100, width: '100%', boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '12px' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px', background: '#EEF2FF',
                        padding: isMobile ? '4px 12px' : '6px 16px', borderRadius: '12px',
                        border: '1px solid #E0E7FF', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }}>
                        <span style={{ fontSize: isMobile ? '1.1rem' : '1.3rem' }}>🏫</span>
                        <h2 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.2rem', color: '#4F46E5', fontWeight: '900', letterSpacing: '-0.5px' }}>
                            {activeClass ? activeClass.name : '학급 관리'}
                        </h2>
                    </div>
                    {classes.length > 1 && (
                        <select
                            value={activeClass?.id || ''}
                            onChange={(e) => setActiveClass(classes.find(c => c.id === e.target.value))}
                            style={{
                                padding: '4px 6px', borderRadius: '8px', border: '1px solid #DEE2E6',
                                background: '#F8F9FA', color: '#495057', fontSize: '0.8rem', fontWeight: 'bold'
                            }}
                        >
                            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
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
                    <TeacherAnnouncementManager isMobile={isMobile} />
                    <Button variant="ghost" size="sm" onClick={() => setIsFeedbackOpen(true)} style={{ fontSize: '0.8rem', color: '#6C757D', border: '1px solid #E9ECEF', borderRadius: '8px' }}>
                        📢 의견 보내기
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onLogout} style={{ fontSize: '0.8rem', color: '#DC3545' }}>
                        로그아웃
                    </Button>
                </div>
            </header>

            {/* 교사 업무 영역 네비게이션 */}
            <nav style={{
                display: 'flex', background: 'white', borderBottom: '1px solid #E9ECEF',
                padding: isMobile ? '0 8px' : '0 24px', flexShrink: 0, zIndex: 99, width: '100%', boxSizing: 'border-box', overflowX: 'auto'
            }} role="tablist" aria-label="교사 업무 메뉴">
                {TEACHER_NAV_GROUPS.map((group) => (
                    <button
                        key={group.id}
                        type="button"
                        role="tab"
                        aria-selected={activeNavGroup.id === group.id}
                        onClick={() => setCurrentTab(group.defaultTab)}
                        style={{
                            padding: isMobile ? '10px 12px' : '12px 22px', border: 'none',
                            background: activeNavGroup.id === group.id ? '#EFF6FF' : 'transparent',
                            borderBottom: activeNavGroup.id === group.id ? '3px solid #3498DB' : '3px solid transparent',
                            color: activeNavGroup.id === group.id ? '#2563EB' : '#64748B',
                            fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s',
                            fontSize: isMobile ? '0.82rem' : '0.95rem', whiteSpace: 'nowrap'
                        }}
                    >
                        <span aria-hidden="true">{group.icon}</span> {group.label}
                    </button>
                ))}
            </nav>

            {/* 메인 콘텐츠 영역 */}
            <main style={{
                flex: 1, width: '100%', maxWidth: '1400px', margin: '0 auto', padding: isMobile ? '16px' : '24px',
                boxSizing: 'border-box', overflowY: 'auto'
            }}>
                {secondaryTabs.length > 0 && (
                    <div
                        role="tablist"
                        aria-label={`${activeNavGroup.label} 세부 메뉴`}
                        style={{
                            display: 'flex', gap: '8px', padding: '5px', marginBottom: isMobile ? '16px' : '22px',
                            width: isMobile ? '100%' : 'fit-content', overflowX: 'auto', boxSizing: 'border-box',
                            borderRadius: '14px', background: '#E2E8F0'
                        }}
                    >
                        {secondaryTabs.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={visibleTab === tab.id}
                                onClick={() => setCurrentTab(tab.id)}
                                style={{
                                    flex: isMobile ? '1 0 auto' : 'none', padding: '9px 16px', border: 'none', borderRadius: '10px',
                                    background: visibleTab === tab.id ? 'white' : 'transparent',
                                    color: visibleTab === tab.id ? '#1D4ED8' : '#64748B',
                                    boxShadow: visibleTab === tab.id ? '0 1px 4px rgba(15, 23, 42, 0.12)' : 'none',
                                    fontWeight: '800', fontSize: isMobile ? '0.85rem' : '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap'
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
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
                    ) : visibleTab === 'guide' ? (
                        <UsageGuide isMobile={isMobile} />
                    ) : visibleTab === 'archive' ? (
                        <ArchiveManager activeClass={activeClass} isMobile={isMobile} />
                    ) : visibleTab === 'playground' ? (
                        <GameManager activeClass={activeClass} isMobile={isMobile} />
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
                        visibleTab === 'dashboard' || visibleTab === 'reading-logs' ? (
                            <TeacherWritingHub
                                key={activeClass.id}
                                activeClass={activeClass}
                                isMobile={isMobile}
                                section={visibleTab === 'reading-logs' ? 'reading-logs' : 'missions'}
                            />
                        ) : visibleTab === 'students' ? (
                            <TeacherStudentHub
                                session={session}
                                classes={classes}
                                activeClass={activeClass}
                                setActiveClass={setActiveClass}
                                setClasses={setClasses}
                                fetchAllClasses={fetchAllClasses}
                                primaryClassId={profile?.primary_class_id}
                                handleSetPrimaryClass={handleSetPrimaryClass}
                                fetchDeletedClasses={fetchDeletedClasses}
                                onRestoreClass={handleRestoreClass}
                                isMobile={isMobile}
                                setSelectedActivityPost={setSelectedActivityPost}
                            />
                        ) : visibleTab === 'evaluation' ? (
                            <TeacherEvaluationTab activeClass={activeClass} isMobile={isMobile} />
                        ) : visibleTab === 'activity' ? (
                            <ActivityReport activeClass={activeClass} isMobile={isMobile} promptTemplate={reportPromptTemplate} />
                        ) : (
                            <TeacherSettingsTab
                                handleTestAIConnection={handleTestAIConnection}
                                runAIDiagnosis={runAIDiagnosis}
                                savingKey={savingKey} testingKey={testingKey} aiStatus={aiStatus}
                                promptTemplate={promptTemplate} setPromptTemplate={setPromptTemplate} originalPrompt={originalPrompt}
                                reportPromptTemplate={reportPromptTemplate} setReportPromptTemplate={setReportPromptTemplate} originalReportPrompt={originalReportPrompt}
                                handleSaveTeacherSettings={handleSaveTeacherSettings}
                            />
                        )
                    )}
                </Suspense>
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
                userId={session.user.id}
            />

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
