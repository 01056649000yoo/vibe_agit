import React, { memo, useState } from 'react';
import { motion } from 'framer-motion';
import Button from '../common/Button';
import { getGenreMissionType, resolveGenreMissionTypeId } from '../../modules/writing/mission-types/registry';

// 컴포넌트 외부로 스타일 상수화 (Optimization 5)
const EMPTY_STATE_STYLE = { textAlign: 'center', padding: '60px 20px', background: '#F8F9FA', borderRadius: '24px', border: '2px dashed #E9ECEF', width: '100%', boxSizing: 'border-box' };
const GENRE_TAG_STYLE = { padding: '4px 10px', background: '#E3F2FD', color: '#1976D2', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900' };
const PROGRESS_BAR_CONTAINER_STYLE = { flex: 1, height: '8px', background: '#F8F9F9', borderRadius: '4px', overflow: 'hidden' };
const PROGRESS_COUNT_BADGE_STYLE = { background: '#E8F5E9', color: '#2E7D32', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' };
const VIEWER_BUTTON_STYLE = {
    flex: 1,
    marginTop: 0,
    padding: '10px 0',
    fontSize: '0.85rem',
    fontWeight: '900',
    borderRadius: '12px',
    transition: 'all 0.2s',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '4px'
};

// 개별 미션 아이템 컴포넌트 분리 및 memo 적용
const MissionItem = memo(({
    mission, isMobile, completedCount, totalStudentCount,
    handleEditClick, setArchiveModal, handleDeleteMission, fetchPostsForMission,
    showEvaluationReport, handleEvaluationMode, onReviewMission, isHighlighted
}) => {
    const genreMissionType = getGenreMissionType(resolveGenreMissionTypeId(mission));
    const isMeetingMission = genreMissionType?.id === 'meeting';
    const supportsEvaluation = genreMissionType?.supportsEvaluation !== false;
    const progressLabel = isMeetingMission ? `💡 제안 ${completedCount}건` : `✍️ ${completedCount}명 완료`;

    return (
        <motion.div whileHover={isMobile ? {} : { y: -4 }} style={{
            background: isHighlighted ? '#FFFBEB' : 'white', padding: isMobile ? '16px' : '20px',
            borderRadius: '20px', border: isHighlighted ? '2px solid #F59E0B' : isMeetingMission ? '1px solid #DDD6FE' : '1px solid #ECEFF1',
            boxShadow: isHighlighted ? '0 10px 28px rgba(245, 158, 11, 0.18)' : '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '12px',
            width: '100%', boxSizing: 'border-box',
            wordBreak: 'keep-all', overflowWrap: 'break-word', transition: 'all 0.25s ease'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={isMeetingMission ? { ...GENRE_TAG_STYLE, background: '#F5F3FF', color: '#6D28D9' } : GENRE_TAG_STYLE}>
                    {genreMissionType ? `${genreMissionType.icon} ${genreMissionType.name}` : mission.genre}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(mission);
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F39C12', fontSize: '1.2rem', padding: '8px' }} title="수정">
                        ✏️
                    </button>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        const hasIncomplete = completedCount < totalStudentCount;
                        setArchiveModal({
                            isOpen: true,
                            mission: mission,
                            hasIncomplete: hasIncomplete
                        });
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3498DB', fontSize: '1.2rem', padding: '8px' }}>
                        📂
                    </button>
                    <button onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm('이 글쓰기 미션을 삭제하시겠습니까? 🗑️\n작성된 학생들의 글도 확인이 어려워질 수 있습니다.')) {
                            // [수정] 인라인 삭제 대신 훅의 전용 함수 사용 (캐시 무효화 포함)
                            await handleDeleteMission(mission.id);
                        }
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5252', fontSize: '1.2rem', padding: '8px' }}>
                        🗑️
                    </button>
                </div>
            </div>
            <h4 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.1rem', color: '#2C3E50', fontWeight: '900' }}>{mission.title}</h4>

            {mission.tags && mission.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '-4px' }}>
                    {mission.tags.map((tag, idx) => (
                        <span key={idx} style={{
                            fontSize: '0.7rem',
                            background: '#F3E5F5',
                            color: '#7B1FA2',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontWeight: 'bold'
                        }}>
                            #{tag}
                        </span>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={PROGRESS_BAR_CONTAINER_STYLE}>
                    <div style={{ width: `${Math.min(completedCount / (totalStudentCount || 1) * 100, 100)}%`, height: '100%', background: isMeetingMission ? '#7C3AED' : '#2E7D32', borderRadius: '4px' }} />
                </div>
                <div style={isMeetingMission ? { ...PROGRESS_COUNT_BADGE_STYLE, background: '#F5F3FF', color: '#6D28D9' } : PROGRESS_COUNT_BADGE_STYLE}>
                    {progressLabel}
                </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <Button
                    onClick={() => isMeetingMission ? onReviewMission(mission) : fetchPostsForMission(mission)}
                    style={isMeetingMission
                        ? { ...VIEWER_BUTTON_STYLE, backgroundColor: '#7C3AED', color: 'white', border: '1px solid #7C3AED' }
                        : { ...VIEWER_BUTTON_STYLE, backgroundColor: '#F1F3F5', color: '#495057', border: '1px solid #E9ECEF' }}
                >
                    {isMeetingMission ? `💡 ${genreMissionType.reviewLabel} (${completedCount})` : '📝 학생 글 확인'}
                </Button>
                {supportsEvaluation && mission.evaluation_rubric?.use_rubric && (
                    <>
                        <Button
                            onClick={() => handleEvaluationMode(mission)}
                            style={{ ...VIEWER_BUTTON_STYLE, backgroundColor: '#FFF0F3', color: '#E91E63', border: '1px solid #FFCDD2' }}
                        >
                            🎯 평가하기
                        </Button>
                        <Button
                            onClick={() => showEvaluationReport(mission)}
                            style={{ ...VIEWER_BUTTON_STYLE, backgroundColor: '#FFF8F0', color: '#E67E22', border: '1px solid #FFE0B2' }}
                        >
                            📊 리포트
                        </Button>
                    </>
                )}
            </div>
        </motion.div>
    );
});

const MissionList = ({
    missions, loading, submissionCounts, totalStudentCount,
    handleEditClick, setArchiveModal, handleDeleteMission, fetchPostsForMission, fetchMissions,
    isMobile, showEvaluationReport, handleEvaluationMode, onReviewMission, highlightedMissionId
}) => {
    const [activeFilter, setActiveFilter] = useState('all');

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>로딩 중...</div>;
    }

    if (missions.length === 0) {
        return (
            <div style={EMPTY_STATE_STYLE}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📖</div>
                <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>아직 등록된 글쓰기 미션이 없습니다.</p>
                <p style={{ color: '#BDC3C7', fontSize: '0.9rem' }}>새로운 글쓰기 미션을 등록해 아이들과 소통해보세요! ✨</p>
            </div>
        );
    }

    const filters = [
        { id: 'all', label: '전체', count: missions.length },
        { id: 'freeform', label: '자유 글쓰기', count: missions.filter((mission) => !resolveGenreMissionTypeId(mission)).length },
        { id: 'poem', label: '시 쓰기', count: missions.filter((mission) => resolveGenreMissionTypeId(mission) === 'poem').length },
        { id: 'meeting', label: '회의 안건', count: missions.filter((mission) => resolveGenreMissionTypeId(mission) === 'meeting').length },
    ];
    const visibleMissions = activeFilter === 'all'
        ? missions
        : missions.filter((mission) => (
            activeFilter === 'freeform'
                ? !resolveGenreMissionTypeId(mission)
                : resolveGenreMissionTypeId(mission) === activeFilter
        ));

    return (
        <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '2px' }}>
                {filters.map((filter) => (
                    <button
                        key={filter.id}
                        type="button"
                        onClick={() => setActiveFilter(filter.id)}
                        style={{
                            flexShrink: 0, padding: '8px 13px', borderRadius: '12px', cursor: 'pointer',
                            border: activeFilter === filter.id ? '1px solid #7C3AED' : '1px solid #E2E8F0',
                            background: activeFilter === filter.id ? '#F5F3FF' : 'white',
                            color: activeFilter === filter.id ? '#6D28D9' : '#64748B',
                            fontWeight: '800', fontSize: '0.82rem'
                        }}
                    >
                        {filter.label} {filter.count}
                    </button>
                ))}
            </div>

            {visibleMissions.length === 0 ? (
                <div style={{ ...EMPTY_STATE_STYLE, padding: '36px 20px' }}>
                    <p style={{ margin: 0, color: '#94A3B8', fontWeight: '800' }}>이 유형으로 만든 미션이 아직 없습니다.</p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '16px'
                }}>
                    {visibleMissions.map(mission => (
                        <MissionItem
                            key={mission.id}
                            mission={mission}
                            isMobile={isMobile}
                            completedCount={submissionCounts[mission.id] || 0}
                            totalStudentCount={totalStudentCount}
                            handleEditClick={handleEditClick}
                            setArchiveModal={setArchiveModal}
                            handleDeleteMission={handleDeleteMission}
                            fetchPostsForMission={fetchPostsForMission}
                            fetchMissions={fetchMissions}
                            showEvaluationReport={showEvaluationReport}
                            handleEvaluationMode={handleEvaluationMode}
                            onReviewMission={onReviewMission}
                            isHighlighted={mission.id === highlightedMissionId}
                        />
                    ))}
                </div>
            )}
        </>
    );
};

export default memo(MissionList);
