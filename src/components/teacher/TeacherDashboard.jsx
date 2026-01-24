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

// 별도 파일 분리 컴포넌트 및 커스텀 훅 임포트
import { useTeacherDashboard } from '../../hooks/useTeacherDashboard';
import TeacherMissionTab from './TeacherMissionTab';
import TeacherSettingsTab from './TeacherSettingsTab';
import TeacherProfileModal from './TeacherProfileModal';
import ActivityDetailModal from './ActivityDetailModal';

/**
 * 역할: 선생님 메인 대시보드 (와이드 2단 레이아웃) ✨
 */
const TeacherDashboard = ({ profile, session, activeClass, setActiveClass, onProfileUpdate, isAdmin, onSwitchToAdminMode }) => {
    const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'settings', 'playground', 'archive', 'guide'
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [selectedActivityPost, setSelectedActivityPost] = useState(null);

    // [리팩토링] 커스텀 훅을 통한 상태 및 비즈니스 로직 관리
    const {
        classes, setClasses, loadingClasses,
        teacherInfo, isEditProfileOpen, setIsEditProfileOpen,
        editName, setEditName, editSchool, setEditSchool, editPhone, setEditPhone,
        geminiKey, setGeminiKey, originalKey,
        promptTemplate, setPromptTemplate, originalPrompt,
        isKeyVisible, setIsKeyVisible,
        savingKey, testingKey,
        handleUpdateTeacherProfile, handleSaveTeacherSettings, handleTestGeminiKey,
        handleWithdrawal, handleSwitchGoogleAccount, handleSetPrimaryClass, handleRestoreClass,
        fetchAllClasses, fetchDeletedClasses, maskKey
    } = useTeacherDashboard(session, profile, onProfileUpdate, activeClass, setActiveClass);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (loadingClasses) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F8F9FA' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔔</div>
                    <p style={{ color: '#7F8C8D', fontWeight: 'bold' }}>학급 정보를 불러오고 있습니다...</p>
                </div>
            </div>
        );
    }

    const hasZeroClasses = classes.length === 0;

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
                        <Button variant="primary" size="sm" onClick={onSwitchToAdminMode} style={{ fontSize: '0.8rem', background: '#E67E22', border: 'none', borderRadius: '8px' }}>
                            🛡️ 관리자
                        </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setIsEditProfileOpen(true)} style={{ fontSize: '0.8rem', color: '#6C757D', border: '1px solid #E9ECEF', borderRadius: '8px' }}>
                        ⚙️ 정보 수정
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()} style={{ fontSize: '0.8rem', color: '#DC3545' }}>
                        로그아웃
                    </Button>
                </div>
            </header>

            {/* 탭 네비게이션 */}
            <nav style={{
                display: 'flex', background: 'white', borderBottom: '1px solid #E9ECEF',
                padding: isMobile ? '0 12px' : '0 24px', flexShrink: 0, zIndex: 99, width: '100%', boxSizing: 'border-box'
            }}>
                {['dashboard', 'archive', 'evaluation', 'playground', 'settings', 'guide'].map((tabId) => (
                    <button
                        key={tabId}
                        onClick={() => setCurrentTab(tabId)}
                        style={{
                            padding: isMobile ? '10px 14px' : '12px 20px', border: 'none', background: 'transparent',
                            borderBottom: currentTab === tabId ? '3px solid #3498DB' : '3px solid transparent',
                            color: currentTab === tabId ? '#3498DB' : '#ADB5BD',
                            fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', fontSize: isMobile ? '0.85rem' : '0.95rem'
                        }}
                    >
                        {tabId === 'dashboard' ? '📊 미션 현황' : tabId === 'archive' ? '📂 글 보관함' : tabId === 'evaluation' ? '📈 학생 평가' : tabId === 'playground' ? '🎢 놀이터 관리' : tabId === 'settings' ? '⚙️ 관리 설정' : '📖 앱 사용법'}
                    </button>
                ))}
            </nav>

            {/* 메인 콘텐츠 영역 */}
            <main style={{
                flex: 1, width: '100%', maxWidth: '1400px', margin: '0 auto', padding: isMobile ? '16px' : '24px',
                boxSizing: 'border-box', overflowY: 'auto'
            }}>
                <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px' }}>로딩 중... ✨</div>}>
                    {currentTab === 'guide' ? (
                        <UsageGuide isMobile={isMobile} />
                    ) : currentTab === 'archive' ? (
                        <ArchiveManager activeClass={activeClass} isMobile={isMobile} />
                    ) : currentTab === 'playground' ? (
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
                        currentTab === 'dashboard' ? (
                            <TeacherMissionTab activeClass={activeClass} isMobile={isMobile} setSelectedActivityPost={setSelectedActivityPost} />
                        ) : currentTab === 'evaluation' ? (
                            <TeacherEvaluationTab activeClass={activeClass} isMobile={isMobile} />
                        ) : (
                            <TeacherSettingsTab
                                session={session} classes={classes} activeClass={activeClass} setActiveClass={setActiveClass}
                                setClasses={setClasses} fetchAllClasses={fetchAllClasses} handleSetPrimaryClass={handleSetPrimaryClass}
                                profile={profile} isMobile={isMobile} geminiKey={geminiKey} setGeminiKey={setGeminiKey}
                                isKeyVisible={isKeyVisible} setIsKeyVisible={setIsKeyVisible} handleTestGeminiKey={handleTestGeminiKey}
                                savingKey={savingKey} testingKey={testingKey} originalKey={originalKey} maskKey={maskKey}
                                promptTemplate={promptTemplate} setPromptTemplate={setPromptTemplate}
                                handleSaveTeacherSettings={handleSaveTeacherSettings} originalPrompt={originalPrompt}
                                fetchDeletedClasses={fetchDeletedClasses} onRestoreClass={handleRestoreClass}
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
        </div>
    );
};

export default TeacherDashboard;
