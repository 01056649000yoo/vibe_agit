import React, { useState, useEffect } from 'react';
import Button from '../common/Button';
import { useMissionManager } from '../../hooks/useMissionManager';
import MissionForm from './MissionForm';
import MissionList from './MissionList';
import SubmissionStatusModal from './SubmissionStatusModal';
import PostDetailViewer from './PostDetailViewer';
import ArchiveConfirmModal from './ArchiveConfirmModal';
import BulkAIProgressModal from './BulkAIProgressModal';

/**
 * 역할: 선생님 - 글쓰기 미션 등록 및 관리 (정교한 글쓰기 미션 마스터 시스템) ✨
 */
const MissionManager = ({ activeClass, isDashboardMode = true, profile }) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    const {
        missions, submissionCounts, isFormOpen, setIsFormOpen, loading,
        selectedMission, setSelectedMission, posts, setPosts, selectedPost, setSelectedPost,
        loadingPosts, isGenerating, showCompleteToast, setShowCompleteToast,
        tempFeedback, setTempFeedback, postReactions, postComments, totalStudentCount,
        archiveModal, setArchiveModal, progress, isEditing, formData, setFormData,
        handleEditClick, handleCancelEdit, handleSubmit, fetchPostsForMission,
        handleGenerateSingleAI, handleBulkAIAction, handleRequestRewrite,
        handleApprovePost, handleBulkApprove, handleRecovery, handleRecovery: handleRecoveryFunc,
        handleBulkRecovery, handleFinalArchive, fetchMissions
    } = useMissionManager(activeClass);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const genreCategories = [
        { label: '❤️ 마음을 표현하는 글', genres: ['일기', '생활문', '편지'] },
        { label: '🔍 사실을 전달하는 글', genres: ['설명문', '보고서(관찰 기록문)', '기사문'] },
        { label: '💡 생각을 주장하는 글', genres: ['논설문', '제안하는 글', '독후감(서평)'] },
        { label: '🌈 상상을 담은 글', genres: ['동시', '동화(소설)'] }
    ];

    const reactionIcons = [
        { type: 'heart', label: '좋아요', emoji: '❤️' },
        { type: 'laugh', label: '재밌어요', emoji: '😂' },
        { type: 'wow', label: '멋져요', emoji: '👏' },
        { type: 'bulb', label: '배워요', emoji: '💡' },
        { type: 'star', label: '최고야', emoji: '✨' }
    ];

    return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
            {/* Sticky Header 영역 */}
            <div style={{
                position: 'sticky',
                top: isMobile ? '88px' : '-24px',
                zIndex: 10,
                background: 'white',
                padding: '8px 0 16px 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #F1F3F5',
                marginBottom: '16px'
            }}>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.1rem' : '1.3rem', color: '#2C3E50', fontWeight: '900' }}>
                    {isDashboardMode ? '✍️ 글쓰기 미션 현황' : '✍️ 글쓰기 미션 관리'}
                </h3>
                <Button
                    onClick={() => {
                        if (isFormOpen) handleCancelEdit();
                        else setIsFormOpen(true);
                    }}
                    style={{
                        background: isFormOpen ? '#FF5252' : '#3498DB',
                        color: 'white', padding: isMobile ? '8px 16px' : '10px 20px',
                        fontSize: '0.9rem',
                        minHeight: '44px',
                        fontWeight: 'bold'
                    }}
                >
                    {isFormOpen ? '✖ 닫기' : '➕ 등록'}
                </Button>
            </div>

            {/* 미션 등록/수정 폼 */}
            <MissionForm
                isFormOpen={isFormOpen}
                isEditing={isEditing}
                formData={formData}
                setFormData={setFormData}
                genreCategories={genreCategories}
                handleSubmit={handleSubmit}
                handleCancelEdit={handleCancelEdit}
                isMobile={isMobile}
            />

            {/* 미션 리스트 */}
            <MissionList
                missions={missions}
                loading={loading}
                submissionCounts={submissionCounts}
                totalStudentCount={totalStudentCount}
                handleEditClick={handleEditClick}
                setArchiveModal={setArchiveModal}
                fetchPostsForMission={fetchPostsForMission}
                fetchMissions={fetchMissions}
                isMobile={isMobile}
            />

            {/* 학생 제출 현황 모달 */}
            <SubmissionStatusModal
                selectedMission={selectedMission}
                setSelectedMission={setSelectedMission}
                posts={posts}
                loadingPosts={loadingPosts}
                handleBulkAIAction={handleBulkAIAction}
                handleBulkApprove={handleBulkApprove}
                handleBulkRecovery={handleBulkRecovery}
                setSelectedPost={setSelectedPost}
                setTempFeedback={setTempFeedback}
                isGenerating={isGenerating}
            />

            {/* 글 상세보기 (Viewer) */}
            <PostDetailViewer
                selectedPost={selectedPost}
                setSelectedPost={setSelectedPost}
                selectedMission={selectedMission}
                handleRequestRewrite={handleRequestRewrite}
                handleApprovePost={handleApprovePost}
                handleRecovery={handleRecoveryFunc}
                handleGenerateSingleAI={handleGenerateSingleAI}
                tempFeedback={tempFeedback}
                setTempFeedback={setTempFeedback}
                isGenerating={isGenerating}
                showCompleteToast={showCompleteToast}
                postReactions={postReactions}
                postComments={postComments}
                reactionIcons={reactionIcons}
                isMobile={isMobile}
            />

            {/* 보관 확인 커스텀 모달 */}
            <ArchiveConfirmModal
                archiveModal={archiveModal}
                setArchiveModal={setArchiveModal}
                handleFinalArchive={handleFinalArchive}
            />

            {/* AI 생성 진행률 모달 */}
            <BulkAIProgressModal
                isGenerating={isGenerating}
                progress={progress}
            />
        </div>
    );
};

export default MissionManager;
