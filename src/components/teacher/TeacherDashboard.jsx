import { TEACHER_NAV_GROUPS } from '../../constants/teacherNav';
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

const DEFAULT_WRITING_CARD_LAYOUT = { columns: 4, density: 'comfortable' };

const loadWritingCardLayout = () => {
    try {
        const saved = JSON.parse(window.localStorage.getItem('teacher-writing-card-layout-v1'));
        const columns = [3, 4, 5, 6].includes(saved?.columns) ? saved.columns : DEFAULT_WRITING_CARD_LAYOUT.columns;
        const density = ['comfortable', 'compact'].includes(saved?.density) ? saved.density : DEFAULT_WRITING_CARD_LAYOUT.density;
        return { columns, density };
    } catch {
        return DEFAULT_WRITING_CARD_LAYOUT;
    }
};


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
    const [writingCardLayout, setWritingCardLayout] = useState(loadWritingCardLayout);
    const [workspaceTarget, setWorkspaceTarget] = useState(null);

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

    useEffect(() => {
        window.localStorage.setItem('teacher-writing-card-layout-v1', JSON.stringify(writingCardLayout));
    }, [writingCardLayout]);

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
    const teacherTabs = TEACHER_NAV_GROUPS.flatMap(group => group.tabs.map(tab => tab.id));
    const visibleTab = teacherTabs.includes(currentTab) ? currentTab : 'dashboard';
    const activeNavGroup = TEACHER_NAV_GROUPS.find(group => group.tabs.some(tab => tab.id === visibleTab)) || TEACHER_NAV_GROUPS[0];
    const secondaryTabs = activeNavGroup.tabs.length > 1 ? activeNavGroup.tabs : [];
    const usesSecondarySidebar = !isMobile && activeNavGroup.secondaryShape === 'sidebar';
    const showsWritingLayoutControls = !isMobile && activeNavGroup.id === 'writing';

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
                        onClick={() => handleTabChange(group.defaultTab)}
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
                {showsWritingLayoutControls && (
                    <div role="group" aria-label="글쓰기 카드 배열 설정" style={{
                        display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', paddingLeft: '18px',
                        borderLeft: '1px solid #E2E8F0', color: '#64748B', fontSize: '0.76rem', fontWeight: '800', flexShrink: 0
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>한 줄</span>
                            {[3, 4, 5, 6].map(columns => (
                                <button key={columns} type="button" onClick={() => setWritingCardLayout(current => ({ ...current, columns }))} aria-pressed={writingCardLayout.columns === columns} style={{
                                    width: '28px', height: '28px', borderRadius: '8px', cursor: 'pointer', fontWeight: '900',
                                    border: writingCardLayout.columns === columns ? '1px solid #2563EB' : '1px solid #CBD5E1',
                                    background: writingCardLayout.columns === columns ? '#EFF6FF' : 'white',
                                    color: writingCardLayout.columns === columns ? '#1D4ED8' : '#64748B'
                                }}>{columns}</button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '4px' }}>
                            <span>크기</span>
                            {[{ id: 'comfortable', label: '보통' }, { id: 'compact', label: '작게' }].map(option => (
                                <button key={option.id} type="button" onClick={() => setWritingCardLayout(current => ({ ...current, density: option.id }))} aria-pressed={writingCardLayout.density === option.id} style={{
                                    height: '28px', padding: '0 9px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800',
                                    border: writingCardLayout.density === option.id ? '1px solid #2563EB' : '1px solid #CBD5E1',
                                    background: writingCardLayout.density === option.id ? '#EFF6FF' : 'white',
                                    color: writingCardLayout.density === option.id ? '#1D4ED8' : '#64748B'
                                }}>{option.label}</button>
                            ))}
                        </div>
                    </div>
                )}
            </nav>

            {/* 메인 콘텐츠 영역 */}
            <main style={{
                flex: 1, width: '100%', maxWidth: '1600px', margin: '0 auto', padding: isMobile ? '16px' : '20px 24px',
                boxSizing: 'border-box', overflowY: 'auto'
            }}>
                <div style={{
                    display: usesSecondarySidebar ? 'grid' : 'block',
                    gridTemplateColumns: usesSecondarySidebar ? '180px minmax(0, 1fr)' : undefined,
                    gap: usesSecondarySidebar ? '20px' : undefined,
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
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={visibleTab === tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                style={{
                                    flex: isMobile ? '1 0 auto' : 'none', padding: usesSecondarySidebar ? '13px 14px' : '9px 16px', border: 'none', borderRadius: '11px',
                                    background: visibleTab === tab.id ? 'white' : 'transparent',
                                    color: visibleTab === tab.id ? '#1D4ED8' : '#64748B',
                                    boxShadow: visibleTab === tab.id ? '0 1px 4px rgba(15, 23, 42, 0.12)' : 'none',
                                    fontWeight: '800', fontSize: isMobile ? '0.85rem' : '0.9rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                    textAlign: usesSecondarySidebar ? 'left' : 'center'
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}
                <div style={{ minWidth: 0 }}>
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
                        <ArchiveManager activeClass={activeClass} isMobile={isMobile} cardLayout={writingCardLayout} />
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
                                cardLayout={writingCardLayout}
                                navigationTarget={workspaceTarget}
                                onNavigationHandled={handleWorkspaceNavigationHandled}
                            />
                        ) : visibleTab === 'students' ? (
                            <TeacherStudentHub
                                key={activeClass.id}
                                activeClass={activeClass}
                                isMobile={isMobile}
                                setSelectedActivityPost={setSelectedActivityPost}
                                onNavigate={handleWorkspaceNavigate}
                            />
                        ) : visibleTab === 'classes' ? (
                            <ClassManager
                                userId={session.user.id} classes={classes} activeClass={activeClass}
                                setActiveClass={setActiveClass} setClasses={setClasses}
                                onClassDeleted={fetchAllClasses} isMobile={isMobile}
                                primaryClassId={profile?.primary_class_id} onSetPrimaryClass={handleSetPrimaryClass}
                                fetchDeletedClasses={fetchDeletedClasses} onRestoreClass={handleRestoreClass}
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
