import { MISSION_STARTERS } from '../../constants/missionStarters.js';
import React, { memo, useState } from 'react';

import { formatMissionOpenAt, isMissionScheduled } from '../../modules/writing/mission-form/missionSchedule';
import { motion } from 'framer-motion';
import Button from '../common/Button';
import { getGenreMissionType, getGenreMissionTypes, resolveGenreMissionTypeId } from '../../modules/writing/mission-types/registry';
import { getMissionCardColumns, normalizeMissionCardSize } from '../../modules/writing/mission-card-layout/missionCardLayout';

// 컴포넌트 외부로 스타일 상수화 (Optimization 5)
const EMPTY_STATE_STYLE = { textAlign: 'center', padding: '60px 20px', background: '#F8F9FA', borderRadius: '24px', border: '2px dashed #E9ECEF', width: '100%', boxSizing: 'border-box' };
const GENRE_TAG_STYLE = { padding: '4px 10px', background: '#E3F2FD', color: '#1976D2', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900' };
const PROGRESS_BAR_CONTAINER_STYLE = { flex: 1, height: '8px', background: '#F8F9F9', borderRadius: '4px', overflow: 'hidden' };
const PROGRESS_COUNT_BADGE_STYLE = { background: '#E8F5E9', color: '#2E7D32', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' };
const VIEWER_BUTTON_STYLE = {
    flex: 1,
    marginTop: 0,
    padding: '8px 4px',
    fontSize: '0.76rem',
    fontWeight: '900',
    borderRadius: '12px',
    transition: 'all 0.2s',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '4px'
};
const CARD_ACTION_BUTTON_STYLE = {
    borderRadius: '9px',
    cursor: 'pointer',
    fontSize: '0.76rem',
    fontWeight: '900',
    padding: '4px 7px',
    minHeight: '30px',
    whiteSpace: 'nowrap'
};

// 개별 미션 아이템 컴포넌트 분리 및 memo 적용
const MissionItem = memo(({
    mission, isMobile, submittedCount, missionStatus, totalStudentCount,
    handleEditClick, setArchiveModal, handleDeleteMission, fetchPostsForMission,
    showEvaluationReport, handleEvaluationMode, onReviewMission, onConnectLabSources,
    isHighlighted, missionCardSize, onOpenScheduledMission
}) => {
    const genreMissionType = getGenreMissionType(resolveGenreMissionTypeId(mission));
    const isMeetingMission = genreMissionType?.id === 'meeting';
    const supportsEvaluation = genreMissionType?.supportsEvaluation !== false;
    const pendingCount = Number(missionStatus?.pendingCount || 0);
    const hasPending = pendingCount > 0 && !isMeetingMission;
    const progressLabel = isMeetingMission
        ? `💡 제안 ${submittedCount}건`
        : `✍️ 제출 ${submittedCount}/${totalStudentCount}`;
    const normalizedCardSize = normalizeMissionCardSize(missionCardSize);
    const isSmall = normalizedCardSize === 'small';
    const isLarge = normalizedCardSize === 'large';

    return (
        <motion.div data-mission-id={mission.id} whileHover={isMobile ? {} : { y: -4 }} style={{
            background: isHighlighted ? '#FFFBEB' : 'white', padding: isMobile ? '16px' : (isSmall ? '10px' : isLarge ? '18px' : '14px'),
            borderRadius: '16px',
            border: isHighlighted
                ? '2px solid #F59E0B'
                : hasPending
                    ? '1.5px solid #FCA5A5'
                    : isMeetingMission
                        ? '1px solid #DDD6FE'
                        : '1px solid #ECEFF1',
            boxShadow: isHighlighted
                ? '0 8px 20px rgba(245, 158, 11, 0.16)'
                : hasPending
                    ? '0 4px 14px rgba(239, 68, 68, 0.08)'
                    : '0 3px 9px rgba(0,0,0,0.03)',
            display: 'flex', flexDirection: 'column', gap: isSmall ? '6px' : isLarge ? '10px' : '8px',
            width: '100%', boxSizing: 'border-box',
            wordBreak: 'keep-all', overflowWrap: 'break-word', transition: 'all 0.25s ease'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flexWrap: 'wrap' }}>
                    <span style={isMeetingMission ? { ...GENRE_TAG_STYLE, background: '#F5F3FF', color: '#6D28D9' } : GENRE_TAG_STYLE}>
                        {genreMissionType ? `${genreMissionType.icon} ${genreMissionType.name}` : mission.genre}
                    </span>
                    {hasPending && (
                        <span
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '2px 7px',
                                background: '#EF4444',
                                color: '#FFFFFF',
                                borderRadius: '999px',
                                fontSize: '0.72rem',
                                fontWeight: '900',
                                lineHeight: 1.2,
                                letterSpacing: '-0.2px',
                                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.28)'
                            }}
                            title={`확인 대기 중인 글이 ${pendingCount}편 있습니다.`}
                            aria-label={`확인 대기 ${pendingCount}편`}
                        >
                            NEW {pendingCount}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '4px' }}>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        onConnectLabSources(mission);
                    }} style={{
                        /*
                         * 옆의 수정·보관·삭제는 아이콘에 글자가 붙어 있는데 이것만 아이콘뿐이라
                         * 무엇인지 알 수 없었다(2026-09-13 지적). 같은 모양으로 맞춘다.
                         */
                        ...CARD_ACTION_BUTTON_STYLE,
                        background: '#F5F3FF', border: '1px solid #DDD6FE', color: '#6D28D9'
                    }} title="연구소 자료 연결" aria-label={`${mission.title} 연구소 자료 연결`}>
                        🧪 연구소 연결
                    </button>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        handleEditClick(mission);
                    }} style={{
                        ...CARD_ACTION_BUTTON_STYLE,
                        background: '#FFF7ED', border: '1px solid #FED7AA', color: '#C2410C'
                    }} title="과제 내용 수정" aria-label={`${mission.title} 과제 내용 수정`}>
                        ✏️ 수정
                    </button>
                    <button onClick={(e) => {
                        e.stopPropagation();
                        const hasIncomplete = submittedCount < totalStudentCount;
                        setArchiveModal({
                            isOpen: true,
                            mission: mission,
                            hasIncomplete: hasIncomplete
                        });
                    }} style={{
                        ...CARD_ACTION_BUTTON_STYLE,
                        background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8'
                    }} title="과제를 보관함으로 이동" aria-label={`${mission.title} 과제를 보관함으로 이동`}>
                        📂 보관
                    </button>
                    <button onClick={async (e) => {
                        e.stopPropagation();
                        // 모두의 아지트 '같이 쓰기 광장'으로 만들어진 과제는 지우면 그 활동에서 우리 반이 빠진다.
                        const isNeighborActivity = Array.isArray(mission.tags) && mission.tags.includes('이웃 아지트');
                        const message = isNeighborActivity
                            ? '이 과제는 모두의 아지트 ‘같이 쓰기 광장’에 쓰이고 있어요. 🗑️\n지우면 우리 반이 그 주제에서 빠지고, 학생들이 쓴 글도 함께 삭제됩니다(되돌릴 수 없음). 삭제할까요?'
                            : '이 글쓰기 미션을 삭제하시겠습니까? 🗑️\n작성된 학생들의 글도 확인이 어려워질 수 있습니다.';
                        if (confirm(message)) {
                            // [수정] 인라인 삭제 대신 훅의 전용 함수 사용 (캐시 무효화 포함)
                            await handleDeleteMission(mission.id);
                        }
                    }} style={{
                        ...CARD_ACTION_BUTTON_STYLE,
                        background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626'
                    }} title="과제 삭제" aria-label={`${mission.title} 과제 삭제`}>
                        🗑️ 삭제
                    </button>
                </div>
            </div>
            <h4 style={{ margin: 0, fontSize: isSmall ? '0.92rem' : isLarge ? '1.08rem' : '1rem', lineHeight: 1.35, color: '#2C3E50', fontWeight: '900' }}>{mission.title}</h4>

            {/* 예약 과제는 학생에게 아직 안 보인다. 선생님 화면에서만 이렇게 갈라 보여 준다. */}
            {isMissionScheduled(mission) && (
                <div style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '10px',
                    background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412'
                }}>
                    <strong style={{ fontSize: 'var(--ui-text-xs)' }}>🕒 {formatMissionOpenAt(mission.open_at)} 공개 예정</strong>
                    <span style={{ fontSize: 'var(--ui-text-xs)', color: '#B45309' }}>학생에게는 아직 안 보여요</span>
                    {onOpenScheduledMission && (
                        <button type="button" onClick={() => onOpenScheduledMission(mission)}
                            title="예약을 지금 풀고 학생에게 바로 엽니다"
                            aria-label={`${mission.title} 지금 열기`}
                            style={{
                                marginLeft: 'auto', border: '1px solid #9A3412', borderRadius: '999px',
                                padding: '4px 12px', background: '#fff', color: '#9A3412',
                                fontSize: 'var(--ui-text-xs)', fontWeight: 'bold', cursor: 'pointer'
                            }}>
                            지금 열기
                        </button>
                    )}
                </div>
            )}

            {mission.tags && mission.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '-4px', maxHeight: isSmall ? '18px' : 'none', overflow: 'hidden' }}>
                    {mission.tags.slice(0, isSmall ? 2 : mission.tags.length).map((tag, idx) => (
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
                    <div style={{ width: `${Math.min(submittedCount / (totalStudentCount || 1) * 100, 100)}%`, height: '100%', background: isMeetingMission ? '#7C3AED' : '#2E7D32', borderRadius: '4px' }} />
                </div>
                <div style={isMeetingMission ? { ...PROGRESS_COUNT_BADGE_STYLE, background: '#F5F3FF', color: '#6D28D9' } : PROGRESS_COUNT_BADGE_STYLE}>
                    {progressLabel}
                </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
                <Button
                    onClick={() => isMeetingMission ? onReviewMission(mission) : fetchPostsForMission(mission)}
                    style={isMeetingMission
                        ? { ...VIEWER_BUTTON_STYLE, backgroundColor: '#7C3AED', color: 'white', border: '1px solid #7C3AED' }
                        : hasPending
                            ? {
                                ...VIEWER_BUTTON_STYLE,
                                backgroundColor: '#FEF2F2',
                                color: '#DC2626',
                                border: '1px solid #FECACA'
                            }
                            : { ...VIEWER_BUTTON_STYLE, backgroundColor: '#F1F3F5', color: '#495057', border: '1px solid #E9ECEF' }}
                >
                    {isMeetingMission
                        ? `💡 ${isSmall ? '검토' : genreMissionType.reviewLabel} (${submittedCount})`
                        : hasPending
                            ? `📝 ${isSmall ? '글 확인' : '학생 글 확인'} · 미확인 ${pendingCount}`
                            : `📝 ${isSmall ? '글 확인' : '학생 글 확인'}`}
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
    onUseStarter,
    missions, loading, submissionCounts, missionStatuses, totalStudentCount,
    handleEditClick, setArchiveModal, handleDeleteMission, fetchPostsForMission, fetchMissions,
    isMobile, showEvaluationReport, handleEvaluationMode, onReviewMission, onConnectLabSources,
    highlightedMissionId, missionCardSize, onOpenScheduledMission
}) => {
    const [activeFilter, setActiveFilter] = useState('all');
    const cardColumns = getMissionCardColumns(missionCardSize);

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>로딩 중...</div>;
    }

    if (missions.length === 0) {
        /*
         * 빈 화면에서 **예시로 바로 시작**할 수 있게 한다(2026-09-14 분석).
         * 학생을 등록한 교사 168명 중 과제를 만든 사람은 90명뿐이고, 과제만 만들면 그 뒤는
         * 81%가 학생 글까지 간다. 누르면 폼이 채워진 채 열린다 — 조용히 만들지 않는다.
         */
        return (
            <div style={EMPTY_STATE_STYLE}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📖</div>
                <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>아직 등록된 글쓰기 미션이 없습니다.</p>
                <p style={{ color: '#BDC3C7', fontSize: '0.9rem' }}>아래 예시로 바로 시작하거나, `➕ 미션 만들기`로 직접 만들 수 있어요.</p>
                {onUseStarter && (
                    <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: '18px', textAlign: 'left' }}>
                        {MISSION_STARTERS.map((starter) => (
                            <button
                                key={starter.id}
                                type="button"
                                onClick={() => onUseStarter(starter)}
                                style={{
                                    padding: '14px', border: '1px solid #D6E4FF', borderRadius: '14px',
                                    background: 'white', cursor: 'pointer', textAlign: 'left'
                                }}
                            >
                                <strong style={{ display: 'block', fontSize: '0.95rem', color: '#1E293B' }}>{starter.emoji} {starter.label}</strong>
                                <span style={{ display: 'block', marginTop: '4px', fontSize: '0.78rem', color: '#64748B' }}>{starter.detail}</span>
                                <span style={{ display: 'block', marginTop: '8px', fontSize: '0.78rem', color: '#2563EB', fontWeight: 800 }}>이 과제로 시작하기 →</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    const pendingMissions = missions.filter((mission) => {
        const status = missionStatuses?.[mission.id];
        const count = Number(status?.pendingCount || 0);
        const isMeeting = resolveGenreMissionTypeId(mission) === 'meeting';
        return count > 0 && !isMeeting;
    });

    const filters = [
        { id: 'all', label: '전체', count: missions.length },
        ...(pendingMissions.length > 0 ? [{
            id: 'pending',
            label: '🔔 확인 필요',
            count: pendingMissions.length,
            isHighlight: true
        }] : []),
        { id: 'freeform', label: '자유 글쓰기', count: missions.filter((mission) => !resolveGenreMissionTypeId(mission)).length },
        ...getGenreMissionTypes().map((missionType) => ({
            id: missionType.id,
            label: missionType.name,
            count: missions.filter((mission) => resolveGenreMissionTypeId(mission) === missionType.id).length,
        })),
    ];
    const visibleMissions = activeFilter === 'all'
        ? missions
        : activeFilter === 'pending'
            ? pendingMissions
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
                            border: activeFilter === filter.id
                                ? (filter.isHighlight ? '1px solid #DC2626' : '1px solid #7C3AED')
                                : (filter.isHighlight ? '1px solid #FECACA' : '1px solid #E2E8F0'),
                            background: activeFilter === filter.id
                                ? (filter.isHighlight ? '#EF4444' : '#F5F3FF')
                                : (filter.isHighlight ? '#FEF2F2' : 'white'),
                            color: activeFilter === filter.id
                                ? (filter.isHighlight ? '#FFFFFF' : '#6D28D9')
                                : (filter.isHighlight ? '#DC2626' : '#64748B'),
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
                    gridTemplateColumns: isMobile ? '1fr' : `repeat(${cardColumns}, minmax(0, 1fr))`,
                    gap: '12px',
                    justifyContent: 'start'
                }}>
                    {visibleMissions.map(mission => (
                        <MissionItem
                            key={mission.id}
                            mission={mission}
                            isMobile={isMobile}
                            submittedCount={submissionCounts[mission.id] || 0}
                            missionStatus={missionStatuses?.[mission.id]}
                            totalStudentCount={totalStudentCount}
                            onOpenScheduledMission={onOpenScheduledMission}
                            handleEditClick={handleEditClick}
                            setArchiveModal={setArchiveModal}
                            handleDeleteMission={handleDeleteMission}
                            fetchPostsForMission={fetchPostsForMission}
                            fetchMissions={fetchMissions}
                            showEvaluationReport={showEvaluationReport}
                            handleEvaluationMode={handleEvaluationMode}
                            onReviewMission={onReviewMission}
                            onConnectLabSources={onConnectLabSources}
                            isHighlighted={mission.id === highlightedMissionId}
                            missionCardSize={missionCardSize}
                        />
                    ))}
                </div>
            )}
        </>
    );
};

export default memo(MissionList);
