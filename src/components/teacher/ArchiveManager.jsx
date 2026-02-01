import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Button from '../common/Button';
import Card from '../common/Card';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataExport } from '../../hooks/useDataExport';
import ExportSelectModal from '../common/ExportSelectModal';

/**
 * 역할: 선생님 - 보관된 미션 관리 및 글 모아보기 📂
 */
const ArchiveManager = ({ activeClass, isMobile }) => {
    const [archivedMissions, setArchivedMissions] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedMission, setSelectedMission] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loadingPosts, setLoadingPosts] = useState(false);
    const [selectedMissionIds, setSelectedMissionIds] = useState([]); // 다중 선택된 미션 ID들

    // 엑셀 추출 훅
    const { fetchExportData, exportToExcel, exportToGoogleDoc, isGapiLoaded } = useDataExport();

    // 내보내기 모달 상태
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [exportTarget, setExportTarget] = useState(null);

    const handleExportClick = (mission) => {
        setExportTarget({ type: 'mission', id: mission.id, title: mission.title });
        setExportModalOpen(true);
    };

    const handleBulkExportClick = () => {
        if (selectedMissionIds.length === 0) return;

        // 선택한 순서대로 미션 정보 찾기
        const selectedMissions = selectedMissionIds.map(id =>
            archivedMissions.find(m => m.id === id)
        ).filter(Boolean);

        const selectedTitles = selectedMissions.map(m => m.title);

        setExportTarget({
            type: 'bulk_missions',
            ids: selectedMissionIds, // 이미 클릭 순서대로 저장되어 있음
            title: selectedTitles.join(', ')
        });
        setExportModalOpen(true);
    };

    const handleExportConfirm = async (format, options) => {
        if (!exportTarget) return;

        let data = [];
        let fileName = "";

        if (exportTarget.type === 'bulk_missions') {
            setLoading(true);
            try {
                // 선택한 순서(exportTarget.ids)대로 데이터를 순차적으로 가져옴
                const allData = await Promise.all(
                    exportTarget.ids.map(async (id) => {
                        const missionData = await fetchExportData('mission', id);
                        return missionData;
                    })
                );

                // 데이터 병합 (순서 유지됨)
                data = allData.flat();

                // 파일명 설정 (너무 길면 자름)
                const baseName = exportTarget.title.length > 30
                    ? exportTarget.title.substring(0, 30) + '...'
                    : exportTarget.title;
                fileName = `일괄내보내기_${baseName}`;
            } catch (err) {
                console.error('일괄 데이터 로드 실패:', err);
                alert('데이터를 불러오는데 실패했습니다.');
                setLoading(false);
                return;
            }
            setLoading(false);
        } else {
            data = await fetchExportData(exportTarget.type, exportTarget.id);
            fileName = `${exportTarget.title}_글모음`;
        }

        if (!data || data.length === 0) {
            alert('제출된 글이 없습니다.');
            return;
        }

        if (format === 'excel') {
            exportToExcel(data, fileName);
        } else if (format === 'googleDoc') {
            const groupBy = options.groupBy || 'mission';

            // [추가] 학생별 모아보기 선택 시 데이터 정렬 (학생번호 -> 이름 -> 미션제목 순)
            if (groupBy === 'student') {
                data.sort((a, b) => {
                    // 번호 정렬 (숫자 비교)
                    const numA = Number(a.번호) || 9999;
                    const numB = Number(b.번호) || 9999;
                    if (numA !== numB) return numA - numB;

                    // 이름 정렬
                    if (a.작성자 !== b.작성자) return a.작성자.localeCompare(b.작성자);

                    // 미션 제목 정렬 (선택된 미션 순서대로 나오면 좋지만 여기선 단순히 제목순)
                    // (만약 선택 순서를 유지하고 싶다면 _missionId 순서를 참조해야 함)
                    return 0;
                });
            }

            // 구글 문서의 경우 이미 useDataExport에서 item.미션제목을 출력하므로 순서대로 정렬된 data를 넘기면 됨
            await exportToGoogleDoc(data, fileName, options.usePageBreak, null, groupBy);
        }
    };

    useEffect(() => {
        if (activeClass?.id) {
            fetchArchivedMissions();
        }
    }, [activeClass?.id]);

    const fetchArchivedMissions = async () => {
        setLoading(true);
        try {
            // 미션 정보와 함께, 전체 학생 수와 제출된 글 수를 계산하기 위해 데이터 조회
            const { data: missions, error: missionError } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', activeClass.id)
                .eq('is_archived', true)
                .order('archived_at', { ascending: false });

            if (missionError) throw missionError;

            // 추가 정보(제출 수, 전체 학생 수) 구하기
            const { count: totalStudents } = await supabase
                .from('students')
                .select('*', { count: 'exact', head: true })
                .eq('class_id', activeClass.id);

            // 각 미션별 제출된 글 수 조회
            const missionsWithStats = await Promise.all(missions.map(async (m) => {
                const { count: submittedCount } = await supabase
                    .from('student_posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('mission_id', m.id)
                    .eq('is_submitted', true);

                return {
                    ...m,
                    totalStudents: totalStudents || 0,
                    submittedCount: submittedCount || 0
                };
            }));

            setArchivedMissions(missionsWithStats || []);

            // 모든 태그 추출 (중복 제거)
            const tags = new Set();
            missions.forEach(m => {
                if (m.tags && Array.isArray(m.tags)) {
                    m.tags.forEach(t => tags.add(t));
                }
            });
            setAllTags(Array.from(tags).sort());
        } catch (err) {
            console.error('보관된 미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleTagFilter = (tag) => {
        setSelectedTags(prev =>
            prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
        );
    };

    const filteredMissions = archivedMissions.filter(m => {
        if (selectedTags.length === 0) return true;
        if (!m.tags || !Array.isArray(m.tags)) return false;
        return selectedTags.every(tag => m.tags.includes(tag));
    });

    const toggleMissionSelection = (id) => {
        setSelectedMissionIds(prev =>
            prev.includes(id) ? prev.filter(missId => missId !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        if (selectedMissionIds.length === filteredMissions.length) {
            setSelectedMissionIds([]);
        } else {
            setSelectedMissionIds(filteredMissions.map(m => m.id));
        }
    };

    const fetchPostsForMission = async (mission) => {
        setSelectedMission(mission);
        setLoadingPosts(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    *,
                    students(name)
                `)
                .eq('mission_id', mission.id)
                .eq('is_submitted', true)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setPosts(data || []);
        } catch (err) {
            console.error('글 불러오기 실패:', err.message);
        } finally {
            setLoadingPosts(false);
        }
    };

    const handleRestoreMission = async (missionId) => {
        if (!confirm('이 미션을 다시 활성화하시겠습니까? 학생들에게 다시 보이게 됩니다.')) return;
        try {
            const { error } = await supabase
                .from('writing_missions')
                .update({ is_archived: false, archived_at: null })
                .eq('id', missionId);
            if (error) throw error;
            alert('미션이 복구되었습니다! ✨');
            fetchArchivedMissions();
        } catch (err) {
            alert('복구 실패: ' + err.message);
        }
    };

    return (
        <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', color: '#2C3E50', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📂 글 보관함 <span style={{ fontSize: '1rem', fontWeight: 'normal', color: '#95A5A6' }}>지난 미션과 아이들의 글을 소중히 보관합니다.</span>
            </h3>

            {/* 태그 필터링 UI */}
            {allTags.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#7F8C8D', marginBottom: '10px', fontWeight: 'bold' }}>🏷️ 태그로 필터링 (다중 선택 가능)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <button
                            onClick={() => setSelectedTags([])}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '12px',
                                fontSize: '0.85rem',
                                fontWeight: 'bold',
                                border: '1px solid #E9ECEF',
                                background: selectedTags.length === 0 ? '#3498DB' : 'white',
                                color: selectedTags.length === 0 ? 'white' : '#7F8C8D',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            전체보기
                        </button>
                        {allTags.map(tag => {
                            const isSelected = selectedTags.includes(tag);
                            return (
                                <button
                                    key={tag}
                                    onClick={() => toggleTagFilter(tag)}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '12px',
                                        fontSize: '0.85rem',
                                        fontWeight: 'bold',
                                        border: `1px solid ${isSelected ? '#3498DB' : '#E9ECEF'}`,
                                        background: isSelected ? '#E3F2FD' : 'white',
                                        color: isSelected ? '#3498DB' : '#7F8C8D',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    #{tag}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 다중 선택 및 액션 바 */}
            {filteredMissions.length > 0 && (
                <div style={{
                    marginBottom: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    background: 'white',
                    borderRadius: '20px',
                    border: '1px solid #E9ECEF',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.02)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px', fontSize: '1rem', fontWeight: 'bold', color: '#2C3E50' }}>
                            <input
                                type="checkbox"
                                checked={selectedMissionIds.length > 0 && selectedMissionIds.length === filteredMissions.length}
                                onChange={handleSelectAll}
                                style={{ width: '20px', height: '20px', cursor: 'pointer', accentColor: '#3498DB' }}
                            />
                            전체 선택 ({selectedMissionIds.length}/{filteredMissions.length})
                        </label>
                    </div>
                    <AnimatePresence mode="wait">
                        {selectedMissionIds.length > 0 ? (
                            <motion.div
                                key="bulk-btn"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                            >
                                <Button
                                    onClick={handleBulkExportClick}
                                    style={{
                                        background: '#3498DB',
                                        color: 'white',
                                        fontWeight: '900',
                                        borderRadius: '14px',
                                        padding: '10px 24px',
                                        boxShadow: '0 4px 12px rgba(52, 152, 219, 0.3)'
                                    }}
                                >
                                    📥 {selectedMissionIds.length}건 일괄 내보내기
                                </Button>
                            </motion.div>
                        ) : (
                            <div style={{ fontSize: '0.9rem', color: '#95A5A6' }}>내보낼 미션을 선택해주세요.</div>
                        )}
                    </AnimatePresence>
                </div>
            )}


            {loading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#ADB5BD' }}>데이터를 불러오는 중입니다...</div>
            ) : filteredMissions.length === 0 ? (
                <Card style={{ padding: '60px', textAlign: 'center', color: '#ADB5BD', border: '2px dashed #E9ECEF' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '20px' }}>📭</div>
                    <p style={{ fontSize: '1.1rem' }}>{selectedTags.length > 0 ? '해당 태그를 포함한 미션이 없습니다.' : '아직 보관된 미션이 없습니다.'}</p>
                </Card>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: '20px'
                }}>
                    {filteredMissions.map((mission) => (
                        <motion.div
                            key={mission.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            whileHover={{ y: -4, borderColor: '#3498DB', boxShadow: '0 8px 16px rgba(0,0,0,0.08)' }}
                            style={{
                                background: 'white',
                                border: selectedMissionIds.includes(mission.id) ? '2px solid #3498DB' : '1px solid #E9ECEF',
                                borderRadius: '20px',
                                padding: '20px',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s ease',
                                height: '100%',
                                boxSizing: 'border-box',
                                boxShadow: selectedMissionIds.includes(mission.id) ? '0 4px 12px rgba(52, 152, 219, 0.15)' : '0 2px 4px rgba(0,0,0,0.02)',
                                cursor: 'default',
                                position: 'relative'
                            }}
                            onClick={(e) => {
                                // 버튼 클릭 시가 아닐 때만 체크박스 토글
                                if (e.target.tagName !== 'BUTTON') {
                                    toggleMissionSelection(mission.id);
                                }
                            }}
                        >
                            {/* 선택 순서 표시 배지 (우측 상단) */}
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMissionSelection(mission.id);
                                }}
                                style={{
                                    position: 'absolute',
                                    top: '15px',
                                    right: '15px',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    border: selectedMissionIds.includes(mission.id) ? 'none' : '2px solid #ADB5BD',
                                    background: selectedMissionIds.includes(mission.id) ? '#3498DB' : 'transparent',
                                    color: 'white',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    fontSize: '0.8rem',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    zIndex: 5,
                                    boxShadow: selectedMissionIds.includes(mission.id) ? '0 2px 6px rgba(52, 152, 219, 0.4)' : 'none'
                                }}
                            >
                                {selectedMissionIds.includes(mission.id) ? (selectedMissionIds.indexOf(mission.id) + 1) : ''}
                            </div>

                            {/* 헤더: 제목 및 날짜 */}
                            <div style={{ marginBottom: '16px', paddingRight: '25px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <h4 style={{
                                        margin: 0,
                                        fontSize: '1.15rem',
                                        color: '#2C3E50',
                                        fontWeight: '800',
                                        lineHeight: '1.4',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 1,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        flex: 1,
                                        marginRight: '12px'
                                    }} title={mission.title}>
                                        {mission.title}
                                    </h4>
                                    <span style={{ fontSize: '0.75rem', color: '#BDC3C7', whiteSpace: 'nowrap', paddingTop: '4px' }}>
                                        {mission.archived_at ? new Date(mission.archived_at).toLocaleDateString() : '-'}
                                    </span>
                                </div>

                                {/* 뱃지 그룹 */}
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <span style={{
                                        padding: '4px 8px',
                                        background: '#E3F2FD',
                                        color: '#1976D2',
                                        borderRadius: '8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold'
                                    }}>
                                        {mission.genre}
                                    </span>
                                    <span style={{
                                        padding: '4px 8px',
                                        background: mission.allow_comments ? '#E8F5E9' : '#FFEBEE',
                                        color: mission.allow_comments ? '#2E7D32' : '#C62828',
                                        borderRadius: '8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold'
                                    }}>
                                        {mission.allow_comments ? '💬 댓글 ON' : '🔒 댓글 OFF'}
                                    </span>
                                </div>
                                {mission.tags && mission.tags.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
                                        {mission.tags.map((tag, idx) => (
                                            <span key={idx} style={{
                                                fontSize: '0.7rem',
                                                background: '#F3E5F5',
                                                color: '#7B1FA2',
                                                padding: '2px 8px',
                                                borderRadius: '8px',
                                                fontWeight: 'bold',
                                                border: '1px solid #E1BEE7'
                                            }}>
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* 바디: 통계 정보 */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                background: '#F8F9FA',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                marginBottom: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>👥</span>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#95A5A6' }}>제출</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#2C3E50' }}>
                                            {mission.submittedCount}<span style={{ color: '#ADB5BD', fontWeight: 'normal' }}>/{mission.totalStudents}</span>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ width: '1px', background: '#E9ECEF' }}></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>✍️</span>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#95A5A6' }}>분량</div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#2C3E50' }}>{mission.min_chars}~{mission.max_chars}</div>
                                    </div>
                                </div>
                            </div>

                            {/* 푸터: 액션 버튼 */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <Button
                                    size="sm"
                                    onClick={() => fetchPostsForMission(mission)}
                                    style={{
                                        width: '100%',
                                        background: '#F1F3F5',
                                        color: '#495057',
                                        border: 'none'
                                    }}
                                >
                                    📖 보기
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => handleRestoreMission(mission.id)}
                                    style={{
                                        width: '100%',
                                        background: '#E8F5E9',
                                        color: '#2E7D32',
                                        border: 'none'
                                    }}
                                >
                                    ♻️ 복구
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => handleExportClick(mission)}
                                    style={{
                                        width: '100%',
                                        background: '#E0F7FA',
                                        color: '#006064',
                                        border: 'none',
                                        gridColumn: 'span 2' // 하단에 꽉 차게 배치
                                    }}
                                >
                                    📤 데이터 내보내기
                                </Button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* 글 모아보기 모달 */}
            <AnimatePresence>
                {selectedMission && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.6)', zIndex: 3000,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '20px'
                    }} onClick={() => setSelectedMission(null)}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            style={{
                                background: 'white', borderRadius: '28px', width: '100%', maxWidth: '900px',
                                maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden'
                            }} onClick={e => e.stopPropagation()}>
                            <header style={{ padding: '24px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, color: '#2C3E50', fontWeight: '900' }}>📂 {selectedMission.title} - 모든 글</h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#7F8C8D' }}>제출된 모든 학생의 글을 한꺼번에 확인합니다.</p>
                                </div>
                                <button onClick={() => setSelectedMission(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                            </header>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '32px', background: '#FAFAFA' }}>
                                {loadingPosts ? (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>글을 불러오고 있어요...</div>
                                ) : posts.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '60px', color: '#95A5A6' }}>제출된 글이 없습니다.</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                        {posts.map((post, idx) => (
                                            <div key={post.id} style={{
                                                background: 'white', padding: '32px', borderRadius: '24px',
                                                border: '1px solid #E9ECEF', boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #F8F9FA', paddingBottom: '12px' }}>
                                                    <span style={{ fontWeight: '900', fontSize: '1.1rem', color: '#3498DB' }}>{idx + 1}. {post.students?.name} 학생</span>
                                                    <span style={{ fontSize: '0.85rem', color: '#ADB5BD' }}>{new Date(post.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <h4 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>{post.title}</h4>
                                                <div style={{ lineHeight: '1.8', color: '#444', whiteSpace: 'pre-wrap', fontSize: '1.05rem' }}>{post.content}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* 내보내기 모달 */}
            <ExportSelectModal
                isOpen={exportModalOpen}
                onClose={() => setExportModalOpen(false)}
                title={exportTarget?.title}
                onConfirm={handleExportConfirm}
                isGapiLoaded={isGapiLoaded}
                isBulk={exportTarget?.type === 'bulk_missions'}
            />
        </div>
    );
};

export default ArchiveManager;
