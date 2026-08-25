import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import { dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';
import { getGenreMissionType, getGenreMissionTypes, resolveGenreMissionTypeId } from '../../modules/writing/mission-types/registry';
import { applyGenrePreset, getFreeformGenreCategories } from '../../modules/writing/mission-types/genreCatalog';
import { useMissionManager } from '../../hooks/useMissionManager';
import MissionForm from './MissionForm';
import MissionTypePicker from './MissionTypePicker';
import MissionList from './MissionList';
import SubmissionStatusModal from './SubmissionStatusModal';
import PostDetailViewer from './PostDetailViewer';
import ArchiveConfirmModal from './ArchiveConfirmModal';
import BulkAIProgressModal from './BulkAIProgressModal';
import EvaluationReport from './EvaluationReport';
import TeacherGuideButton from './TeacherGuideButton';

const GENRE_MISSION_BUILDERS = new Map(
    getGenreMissionTypes()
        .filter((missionType) => missionType.teacherEntry)
        .map((missionType) => [missionType.id, lazy(missionType.teacherEntry)])
);

const MissionLabSourcesModal = lazy(() => import('./MissionLabSourcesModal'));

/**
 * 역할: 선생님 - 글쓰기 미션 등록 및 관리 (정교한 글쓰기 미션 마스터 시스템) ✨
 */
const MissionManager = ({
    activeClass, isDashboardMode = true, cardLayout,
    navigationTarget, onNavigationHandled, bootstrapProfile
}) => {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
    const [isMissionTypePickerOpen, setIsMissionTypePickerOpen] = useState(false);
    const [activeGenreMissionId, setActiveGenreMissionId] = useState(null);
    const [editingGenreMission, setEditingGenreMission] = useState(null);
    const [activeGenreMode, setActiveGenreMode] = useState('create');
    const [highlightedMissionId, setHighlightedMissionId] = useState(null);
    const [labSourceMission, setLabSourceMission] = useState(null);
    const [presetGenre, setPresetGenre] = useState(null);
    const handledNavigationRef = useRef(null);

    const {
        missions, submissionCounts, isFormOpen, setIsFormOpen, loading,
        selectedMission, setSelectedMission, posts, selectedPost, setSelectedPost,
        loadingPosts, isGenerating, showCompleteToast,
        tempFeedback, setTempFeedback, postComments, totalStudentCount,
        postOutlineReference, postDetailLoading, refreshSelectedPostDetail,
        archiveModal, setArchiveModal, progress, isEditing, formData, setFormData,
        editingMissionId,
        handleEditClick, handleCancelEdit, handleSubmit, fetchPostsForMission,
        handleGenerateSingleAI, handleBulkAIAction, handleRequestRewrite,
        handleApprovePost, handleBulkApprove, handleRecovery: handleRecoveryFunc,
        handleBulkRecovery,
        handleBulkRequestRewrite,
        handleRecallPosts, handleUndoRecall,
        handleFinalArchive, handleDeleteMission, fetchMissions,
        handleGenerateQuestions, isGeneratingQuestions,
        handleSaveDefaultRubric, handleSaveDefaultSettings,
        isEvaluationMode, setIsEvaluationMode, handleEvaluationMode,
        frequentTags, saveFrequentTag, removeFrequentTag,
        addTeacherComment, deleteTeacherComment, handleTeacherEditPost
    } = useMissionManager(activeClass, bootstrapProfile);

    const [reportMission, setReportMission] = useState(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!highlightedMissionId) return undefined;
        const timerId = window.setTimeout(() => setHighlightedMissionId(null), 5000);
        return () => window.clearTimeout(timerId);
    }, [highlightedMissionId]);

    const genreCategories = getFreeformGenreCategories();

    const activeGenreMission = getGenreMissionType(activeGenreMissionId);
    const ActiveGenreMissionBuilder = GENRE_MISSION_BUILDERS.get(activeGenreMissionId) || null;

    const closeGenreMissionBuilder = (savedMission = null) => {
        if (activeClass?.id) {
            dataCache.invalidate(`missions_v2_${activeClass.id}`);
            dataCache.invalidate(`missions_summary_${activeClass.id}`);
        }
        if (savedMission?.id) setHighlightedMissionId(savedMission.id);
        setActiveGenreMissionId(null);
        setEditingGenreMission(null);
        setActiveGenreMode('create');
        fetchMissions();
    };

    const handleMissionEditClick = (mission) => {
        const templateId = resolveGenreMissionTypeId(mission);
        if (templateId && getGenreMissionType(templateId)?.teacherEntry) {
            setEditingGenreMission(mission);
            setActiveGenreMissionId(templateId);
            setActiveGenreMode('edit');
            setIsMissionTypePickerOpen(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        setIsMissionTypePickerOpen(false);
        setPresetGenre(null);
        handleEditClick(mission);
    };

    const handleReviewMission = (mission) => {
        const templateId = resolveGenreMissionTypeId(mission);
        const missionType = getGenreMissionType(templateId);
        if (!missionType?.teacherReview) return;
        setEditingGenreMission(mission);
        setActiveGenreMissionId(templateId);
        setActiveGenreMode('review');
        setIsMissionTypePickerOpen(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    useEffect(() => {
        const requestId = navigationTarget?.requestId;
        const supportedKinds = ['assignment-review', 'evaluation-entry', 'mission-review'];
        if (!requestId || handledNavigationRef.current === requestId || loading || missions.length === 0) return;
        if (!supportedKinds.includes(navigationTarget.kind)) return;

        handledNavigationRef.current = requestId;

        const openNavigationTarget = async () => {
            try {
                let missionId = navigationTarget.missionId || null;
                const postId = navigationTarget.item?.post_id || null;

                if (!missionId && postId) {
                    const { data, error } = await supabase
                        .from('student_posts')
                        .select('mission_id')
                        .eq('id', postId)
                        .eq('class_id', activeClass.id)
                        .maybeSingle();
                    if (error) throw error;
                    missionId = data?.mission_id || null;
                }

                const mission = missions.find((item) => item.id === missionId);
                if (!mission) return;

                setHighlightedMissionId(mission.id);
                window.setTimeout(() => {
                    document.querySelector(`[data-mission-id="${mission.id}"]`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 80);

                const missionType = getGenreMissionType(resolveGenreMissionTypeId(mission));
                if (navigationTarget.kind !== 'evaluation-entry' && missionType?.teacherReview) {
                    handleReviewMission(mission);
                    return;
                }

                const fetchedPosts = await fetchPostsForMission(mission);
                if (navigationTarget.kind === 'mission-review' || !postId) return;

                const targetPost = fetchedPosts.find((post) => post.id === postId) || fetchedPosts[0];
                if (!targetPost) return;

                setSelectedPost(targetPost);
                setIsEvaluationMode(navigationTarget.kind === 'evaluation-entry');
            } catch (error) {
                console.error('운영 현황 바로가기 처리 실패:', error.message);
            } finally {
                onNavigationHandled?.(requestId);
            }
        };

        openNavigationTarget();
    }, [
        activeClass?.id, fetchPostsForMission, loading, missions, navigationTarget,
        onNavigationHandled, setIsEvaluationMode, setSelectedPost
    ]);

    if (ActiveGenreMissionBuilder) {
        return (
            <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center', color: '#7C3AED' }}>{activeGenreMission.icon} 장르 미션을 불러오는 중...</div>}>
                {React.createElement(ActiveGenreMissionBuilder, {
                    activeClass,
                    isMobile,
                    mission: editingGenreMission,
                    mode: activeGenreMode,
                    onBack: closeGenreMissionBuilder,
                    onSaved: closeGenreMissionBuilder,
                })}
            </Suspense>
        );
    }

    return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
            {/* Sticky Header 영역 */}
            <div style={{
                position: 'sticky',
                top: isMobile ? '88px' : '-24px',
                zIndex: 10,
                background: 'white',
                padding: '2px 0 12px 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid #F1F3F5',
                marginBottom: '12px'
            }}>
                <h3 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.15rem', color: '#2C3E50', fontWeight: '900' }}>
                    {isDashboardMode ? '✍️ 선생님 과제' : '✍️ 글쓰기 미션 관리'}
                </h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isDashboardMode && <TeacherGuideButton tabId="dashboard" variant="help" />}
                    <Button
                        onClick={() => {
                            if (isFormOpen) {
                                handleCancelEdit();
                                setIsMissionTypePickerOpen(false);
                            } else {
                                setIsMissionTypePickerOpen((open) => !open);
                            }
                        }}
                        style={{
                            background: isFormOpen || isMissionTypePickerOpen ? '#FF5252' : '#3498DB',
                            color: 'white', padding: isMobile ? '8px 12px' : '8px 14px',
                            fontSize: isMobile ? '0.82rem' : '0.9rem',
                            minHeight: isMobile ? '44px' : '38px',
                            fontWeight: 'bold'
                        }}
                    >
                        {isFormOpen || isMissionTypePickerOpen ? '✖ 닫기' : '➕ 미션 만들기'}
                    </Button>
                </div>
            </div>

            {isMissionTypePickerOpen && (
                <MissionTypePicker
                    isMobile={isMobile}
                    onClose={() => setIsMissionTypePickerOpen(false)}
                    onSelectFreeform={(genreId) => {
                        setIsMissionTypePickerOpen(false);
                        if (genreId) {
                            setFormData((current) => applyGenrePreset(current, genreId).formData);
                            setPresetGenre(genreId);
                        }
                        setIsFormOpen(true);
                    }}
                    onSelectGenre={(id) => {
                        setIsMissionTypePickerOpen(false);
                        setEditingGenreMission(null);
                        setActiveGenreMode('create');
                        setActiveGenreMissionId(id);
                    }}
                />
            )}

            {/* 미션 등록/수정 폼 */}
            <MissionForm
                classId={activeClass?.id}
                isFormOpen={isFormOpen}
                isEditing={isEditing}
                editingMissionId={editingMissionId}
                formData={formData}
                setFormData={setFormData}
                genreCategories={genreCategories}
                presetGenre={presetGenre}
                setPresetGenre={setPresetGenre}
                submittedCount={editingMissionId ? (Reflect.get(submissionCounts || {}, editingMissionId) || 0) : 0}
                handleSubmit={handleSubmit}
                handleCancelEdit={handleCancelEdit}
                isMobile={isMobile}
                handleGenerateQuestions={handleGenerateQuestions}
                isGeneratingQuestions={isGeneratingQuestions}
                handleSaveDefaultRubric={handleSaveDefaultRubric}
                frequentTags={frequentTags}
                saveFrequentTag={saveFrequentTag}
                removeFrequentTag={removeFrequentTag}
                handleSaveDefaultSettings={handleSaveDefaultSettings}
            />

            {/* 미션 리스트 */}
            <MissionList
                missions={missions}
                loading={loading}
                submissionCounts={submissionCounts}
                totalStudentCount={totalStudentCount}
                handleEditClick={handleMissionEditClick}
                setArchiveModal={setArchiveModal}
                handleDeleteMission={handleDeleteMission}
                fetchPostsForMission={fetchPostsForMission}
                fetchMissions={fetchMissions}
                isMobile={isMobile}
                showEvaluationReport={(m) => setReportMission(m)}
                handleEvaluationMode={handleEvaluationMode}
                onReviewMission={handleReviewMission}
                onConnectLabSources={setLabSourceMission}
                highlightedMissionId={highlightedMissionId}
                cardLayout={cardLayout}
            />

            {labSourceMission && (
                <Suspense fallback={null}>
                    <MissionLabSourcesModal
                        mission={labSourceMission}
                        onClose={() => setLabSourceMission(null)}
                    />
                </Suspense>
            )}

            {/* 학생 제출 현황 모달 */}
            <SubmissionStatusModal
                selectedMission={selectedMission}
                setSelectedMission={setSelectedMission}
                posts={posts}
                loadingPosts={loadingPosts}
                handleBulkAIAction={handleBulkAIAction}
                handleBulkApprove={handleBulkApprove}
                handleBulkRecovery={handleBulkRecovery}
                handleBulkRequestRewrite={handleBulkRequestRewrite}
                handleRecallPosts={handleRecallPosts}
                handleUndoRecall={handleUndoRecall}
                setSelectedPost={setSelectedPost}
                setTempFeedback={setTempFeedback}
                isGenerating={isGenerating}
                isMobile={isMobile}
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
                postComments={postComments}
                outlineReference={postOutlineReference}
                postDetailLoading={postDetailLoading}
                onRefreshPostDetail={refreshSelectedPostDetail}
                isMobile={isMobile}
                onUpdate={() => fetchPostsForMission(selectedMission)}
                isEvaluationMode={isEvaluationMode}
                posts={posts}
                addTeacherComment={addTeacherComment}
                deleteTeacherComment={deleteTeacherComment}
                handleTeacherEditPost={handleTeacherEditPost}
            />

            {/* 보관 확인 커스텀 모달 */}
            <ArchiveConfirmModal
                archiveModal={archiveModal}
                setArchiveModal={setArchiveModal}
                handleFinalArchive={handleFinalArchive}
            />

            {/* AI 생성 진행률 모달 (피드백용) */}
            <BulkAIProgressModal
                isGenerating={isGenerating}
                progress={progress}
                title="일괄 AI 피드백을 작성 중이에요"
                description="학생들의 글을 하나하나 읽고 피드백을 생성하고 있습니다."
            />

            {/* AI 핵심 질문 생성 진행 모달 (미션 설계용) */}
            <BulkAIProgressModal
                isGenerating={isGeneratingQuestions}
                progress={{ current: 0, total: 1 }}
                title="멋진 질문을 만들고 있어요"
                description="주제에 딱 맞는 핵심 질문을 AI가 설계 중입니다. ✨"
            />

            <AnimatePresence>
                {reportMission ? (
                    <EvaluationReport
                        mission={reportMission}
                        onClose={() => setReportMission(null)}
                        isMobile={isMobile}
                    />
                ) : null}
            </AnimatePresence>
        </div>
    );
};

export default MissionManager;
