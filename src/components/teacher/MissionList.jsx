import React, { memo } from 'react';
import { motion } from 'framer-motion';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';

// 컴포넌트 외부로 스타일 상수화 (Optimization 5)
const EMPTY_STATE_STYLE = { textAlign: 'center', padding: '60px 20px', background: '#F8F9FA', borderRadius: '24px', border: '2px dashed #E9ECEF', width: '100%', boxSizing: 'border-box' };
const GENRE_TAG_STYLE = { padding: '4px 10px', background: '#E3F2FD', color: '#1976D2', borderRadius: '10px', fontSize: '0.75rem', fontWeight: '900' };
const PROGRESS_BAR_CONTAINER_STYLE = { flex: 1, height: '8px', background: '#F8F9F9', borderRadius: '4px', overflow: 'hidden' };
const PROGRESS_COUNT_BADGE_STYLE = { background: '#E8F5E9', color: '#2E7D32', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' };
const VIEWER_BUTTON_STYLE = { width: '100%', marginTop: '4px', backgroundColor: '#F8F9FA', color: '#495057', border: '1px solid #E9ECEF', fontSize: '0.85rem' };

// 개별 미션 아이템 컴포넌트 분리 및 memo 적용
const MissionItem = memo(({
    mission, isMobile, completedCount, totalStudentCount,
    handleEditClick, setArchiveModal, fetchPostsForMission, fetchMissions
}) => {
    return (
        <motion.div whileHover={isMobile ? {} : { y: -4 }} style={{
            background: 'white', padding: isMobile ? '16px' : '20px',
            borderRadius: '20px', border: '1px solid #ECEFF1',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: '12px',
            width: '100%', boxSizing: 'border-box',
            wordBreak: 'keep-all', overflowWrap: 'break-word'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={GENRE_TAG_STYLE}>{mission.genre}</span>
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
                            const { error } = await supabase.from('writing_missions').delete().eq('id', mission.id);
                            if (!error) fetchMissions();
                            else alert('삭제 실패: ' + error.message);
                        }
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5252', fontSize: '1.2rem', padding: '8px' }}>
                        🗑️
                    </button>
                </div>
            </div>
            <h4 style={{ margin: 0, fontSize: isMobile ? '1rem' : '1.1rem', color: '#2C3E50', fontWeight: '900' }}>{mission.title}</h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={PROGRESS_BAR_CONTAINER_STYLE}>
                    <div style={{ width: `${Math.min(completedCount / (totalStudentCount || 1) * 100, 100)}%`, height: '100%', background: '#2E7D32', borderRadius: '4px' }} />
                </div>
                <div style={PROGRESS_COUNT_BADGE_STYLE}>
                    ✍️ {completedCount}명 완료
                </div>
            </div>
            <Button
                onClick={() => fetchPostsForMission(mission)}
                variant="secondary"
                style={VIEWER_BUTTON_STYLE}
            >
                📝 학생 글 확인
            </Button>
        </motion.div>
    );
});

const MissionList = ({
    missions, loading, submissionCounts, totalStudentCount,
    handleEditClick, setArchiveModal, fetchPostsForMission, fetchMissions,
    isMobile
}) => {
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

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px'
        }}>
            {missions.map(mission => (
                <MissionItem
                    key={mission.id}
                    mission={mission}
                    isMobile={isMobile}
                    completedCount={submissionCounts[mission.id] || 0}
                    totalStudentCount={totalStudentCount}
                    handleEditClick={handleEditClick}
                    setArchiveModal={setArchiveModal}
                    fetchPostsForMission={fetchPostsForMission}
                    fetchMissions={fetchMissions}
                />
            ))}
        </div>
    );
};

export default memo(MissionList);
