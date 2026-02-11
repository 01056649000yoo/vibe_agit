import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';

// 상태 뱃지 색상
const STATUS_COLORS = {
    '제안중': { bg: '#E3F2FD', color: '#1565C0', border: '#BBDEFB', icon: '💡' },
    '검토중': { bg: '#FFF3E0', color: '#E65100', border: '#FFE0B2', icon: '🔍' },
    '결정됨': { bg: '#E8F5E9', color: '#2E7D32', border: '#C8E6C9', icon: '✅' }
};

/**
 * 🏛️ 아이디어 마켓 관리자 (교사용)
 * - 4열 그리드로 한 화면에 12명 아이디어 한눈에 확인 가능
 * - 클릭 시 상세보기 모달에서 가이드 질문 답변 + 상태 변경
 */
const IdeaMarketManager = ({ activeClass, onBack, isMobile }) => {
    const [activeTab, setActiveTab] = useState('create'); // 'create' | 'manage'
    const [meetings, setMeetings] = useState([]);
    const [selectedMeeting, setSelectedMeeting] = useState(null);
    const [ideas, setIdeas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [ideasLoading, setIdeasLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingMeetingId, setEditingMeetingId] = useState(null); // 수정 중인 안건 ID
    const [detailModal, setDetailModal] = useState(null); // 상세보기 모달용

    // 새 회의 안건 폼
    const [formData, setFormData] = useState({
        title: '',
        guide: '',
        guide_questions: ['이 아이디어를 제안하는 이유는 무엇인가요?', '예상되는 문제점과 해결 방법은 무엇인가요?'],
        submit_reward: 30,
        decided_reward: 50
    });

    // 회의 목록 가져오기
    const fetchMeetings = useCallback(async () => {
        if (!activeClass?.id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('id, title, guide, guide_questions, created_at, is_archived, mission_type, base_reward, bonus_reward')
                .eq('class_id', activeClass.id)
                .eq('is_archived', false)
                .eq('mission_type', 'meeting')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMeetings(data || []);
        } catch (err) {
            console.error('[IdeaMarketManager] 회의 목록 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [activeClass?.id]);

    // 선택된 회의의 아이디어 목록 가져오기
    const fetchIdeas = useCallback(async (meetingId) => {
        if (!meetingId) return;
        setIdeasLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    id, title, content, student_id, mission_id, status,
                    is_submitted, is_confirmed, student_answers, created_at,
                    students!inner(id, name),
                    post_reactions(id, reaction_type),
                    post_comments(id)
                `)
                .eq('mission_id', meetingId)
                .eq('is_submitted', true)
                .is('students.deleted_at', null)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setIdeas(data || []);
        } catch (err) {
            console.error('[IdeaMarketManager] 아이디어 목록 로드 실패:', err.message);
        } finally {
            setIdeasLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMeetings();
    }, [fetchMeetings]);

    useEffect(() => {
        if (selectedMeeting?.id) {
            fetchIdeas(selectedMeeting.id);
        }
    }, [selectedMeeting?.id, fetchIdeas]);

    // 회의 안건 생성 또는 수정
    const handleCreateOrUpdateMeeting = async () => {
        if (!formData.title.trim()) {
            alert('회의 안건 제목을 입력해주세요! 📋');
            return;
        }
        setSaving(true);
        try {
            const meetingData = {
                class_id: activeClass.id,
                title: formData.title,
                guide: formData.guide,
                genre: '회의',
                mission_type: 'meeting',
                guide_questions: formData.guide_questions.filter(q => q.trim()),
                min_chars: 30,
                min_paragraphs: 1,
                base_reward: formData.submit_reward || 30,
                bonus_threshold: 100,
                bonus_reward: formData.decided_reward || 50,
                allow_comments: true,
                is_archived: false,
                tags: ['아이디어마켓'],
                evaluation_rubric: { use_rubric: false, levels: [] }
            };

            if (editingMeetingId) {
                // 수정 모드
                const { error } = await supabase
                    .from('writing_missions')
                    .update(meetingData)
                    .eq('id', editingMeetingId);
                if (error) throw error;
                alert('회의 안건이 수정되었습니다! ✨');
            } else {
                // 생성 모드
                const { error } = await supabase
                    .from('writing_missions')
                    .insert(meetingData);
                if (error) throw error;
                alert('회의 안건이 성공적으로 등록되었습니다! 🏛️');
            }

            setFormData({
                title: '',
                guide: '',
                guide_questions: ['이 아이디어를 제안하는 이유는 무엇인가요?', '예상되는 문제점과 해결 방법은 무엇인가요?'],
                submit_reward: 30,
                decided_reward: 50
            });
            setEditingMeetingId(null);
            fetchMeetings();
            setActiveTab('manage');
        } catch (err) {
            console.error('[IdeaMarketManager] 회의 저장 실패:', err.message);
            alert('회의 안건 저장에 실패했습니다. 다시 시도해주세요.');
        } finally {
            setSaving(false);
        }
    };

    // 수정 모드 시작
    const handleStartEdit = (meeting) => {
        setEditingMeetingId(meeting.id);
        setFormData({
            title: meeting.title || '',
            guide: meeting.guide || '',
            guide_questions: meeting.guide_questions || [],
            submit_reward: meeting.base_reward || 30,
            decided_reward: meeting.bonus_reward || 50
        });
        setActiveTab('create');
    };

    // 아이디어 상태 변경
    const handleStatusChange = async (postId, newStatus) => {
        // 결정됨으로 변경 시 확인 절차 추가
        if (newStatus === '결정됨') {
            const idea = ideas.find(i => i.id === postId);
            const reward = selectedMeeting?.bonus_reward || 50;
            if (!confirm(`"${idea?.title || '이 아이디어'}"를 최종 결정하시겠습니까?\n확인 시 학생에게 ${reward}P가 지급됩니다.`)) {
                return;
            }
        }

        try {
            const updateData = {
                status: newStatus,
                is_confirmed: newStatus === '결정됨'
            };

            const { error } = await supabase
                .from('student_posts')
                .update(updateData)
                .eq('id', postId);

            if (error) throw error;

            // 결정됨 → 해당 학생에게 결정 포인트 지급
            if (newStatus === '결정됨' && selectedMeeting) {
                const idea = ideas.find(i => i.id === postId);
                const decidedReward = selectedMeeting.bonus_reward || 50;
                if (idea?.student_id) {
                    try {
                        await supabase.rpc('increment_student_points', {
                            student_id: idea.student_id,
                            points_to_add: decidedReward,
                            log_reason: `아이디어 마켓 결정! "${(idea.title || '').slice(0, 20)}" 🏛️✅`
                        });
                    } catch (ptErr) {
                        console.error('[IdeaMarketManager] 결정 포인트 지급 실패:', ptErr.message);
                    }
                }
            }

            if (selectedMeeting?.id) fetchIdeas(selectedMeeting.id);
            // 모달 내 상태도 갱신
            if (detailModal?.id === postId) {
                setDetailModal(prev => ({ ...prev, status: newStatus }));
            }
        } catch (err) {
            console.error('[IdeaMarketManager] 상태 변경 실패:', err.message);
        }
    };

    // 회의 안건 보관 (아카이브)
    const handleArchiveMeeting = async (meetingId) => {
        if (!confirm('이 회의 안건을 보관하시겠습니까?')) return;
        try {
            const { error } = await supabase
                .from('writing_missions')
                .update({ is_archived: true })
                .eq('id', meetingId);

            if (error) throw error;
            fetchMeetings();
            if (selectedMeeting?.id === meetingId) {
                setSelectedMeeting(null);
                setIdeas([]);
            }
            alert('회의 안건이 보관되었습니다.');
        } catch (err) {
            console.error('[IdeaMarketManager] 삭제 실패:', err.message);
        }
    };

    const getVoteCount = (idea, type) =>
        (idea.post_reactions || []).filter(r => r.reaction_type === type).length;

    // 전체 상태 요약 (선택된 안건)
    const statusSummary = ideas.reduce((acc, idea) => {
        const st = idea.status || '제안중';
        acc[st] = (acc[st] || 0) + 1;
        return acc;
    }, {});

    return (
        <div style={{
            width: '100%',
            maxWidth: '100%',
            margin: '0 auto',
            padding: isMobile ? '20px 16px 100px' : '24px 32px',
        }}>
            {/* 헤더 */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '16px',
                marginBottom: '24px', flexWrap: 'wrap'
            }}>
                <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 돌아가기</Button>
                <h2 style={{
                    margin: 0, fontSize: '1.5rem', fontWeight: '900',
                    color: '#4C1D95', display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    🏛️ 아이디어 마켓 관리
                </h2>
            </div>

            {/* 탭 */}
            <div style={{
                display: 'flex', gap: '8px', marginBottom: '20px',
                background: '#F1F5F9', padding: '6px', borderRadius: '16px',
                maxWidth: '500px'
            }}>
                <button
                    onClick={() => {
                        setActiveTab('create');
                        if (!editingMeetingId) {
                            setFormData({
                                title: '',
                                guide: '',
                                guide_questions: ['이 아이디어를 제안하는 이유는 무엇인가요?', '예상되는 문제점과 해결 방법은 무엇인가요?'],
                                submit_reward: 30,
                                decided_reward: 50
                            });
                        }
                    }}
                    style={{
                        flex: 1, padding: '10px', border: 'none', borderRadius: '12px',
                        background: activeTab === 'create' ? 'white' : 'transparent',
                        fontWeight: 'bold', cursor: 'pointer',
                        color: activeTab === 'create' ? '#4C1D95' : '#64748B',
                        boxShadow: activeTab === 'create' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    {editingMeetingId ? '🔄 안건 수정' : '➕ 안건 만들기'}
                </button>
                <button
                    onClick={() => {
                        setActiveTab('manage');
                        setEditingMeetingId(null);
                    }}
                    style={{
                        flex: 1, padding: '10px', border: 'none', borderRadius: '12px',
                        background: activeTab === 'manage' ? 'white' : 'transparent',
                        fontWeight: 'bold', cursor: 'pointer',
                        color: activeTab === 'manage' ? '#4C1D95' : '#64748B',
                        boxShadow: activeTab === 'manage' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.2s'
                    }}
                >
                    🗂️ 안건 관리 ({meetings.length})
                </button>
            </div>

            <AnimatePresence mode="wait">
                {activeTab === 'create' ? (
                    <motion.div
                        key="create"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        style={{ maxWidth: '700px' }}
                    >
                        {/* 안건 생성 폼 */}
                        <Card style={{
                            background: 'white', borderRadius: '24px',
                            padding: '32px', border: '1px solid #E2E8F0'
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                marginBottom: '24px'
                            }}>
                                <div style={{
                                    width: '48px', height: '48px',
                                    background: 'linear-gradient(135deg, #A855F7, #7C3AED)',
                                    borderRadius: '12px', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                    fontSize: '1.5rem'
                                }}>📋</div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#4C1D95' }}>
                                        {editingMeetingId ? '🔄 회의 안건 내용 수정' : '새 회의 안건 등록'}
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#7C3AED' }}>
                                        {editingMeetingId ? '안건의 정보를 수정하여 업데이트하세요' : '학생들에게 의견을 구할 안건을 작성해주세요'}
                                    </p>
                                </div>
                            </div>

                            {/* 제목 */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.9rem', fontWeight: '700',
                                    color: '#1E293B', marginBottom: '8px'
                                }}>
                                    회의 안건 제목 *
                                </label>
                                <input
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="예: 학기말 학급 파티 계획, 교실 환경 꾸미기 등"
                                    style={{
                                        width: '100%', padding: '12px 16px',
                                        border: '2px solid #E2E8F0', borderRadius: '14px',
                                        fontSize: '1rem', fontWeight: '600',
                                        outline: 'none', boxSizing: 'border-box',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#A855F7'}
                                    onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                                />
                            </div>

                            {/* 안내 설명 */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.9rem', fontWeight: '700',
                                    color: '#1E293B', marginBottom: '8px'
                                }}>
                                    안건 설명 (선택)
                                </label>
                                <textarea
                                    value={formData.guide}
                                    onChange={(e) => setFormData(prev => ({ ...prev, guide: e.target.value }))}
                                    placeholder="학생들이 이해하기 쉽도록 안건에 대해 설명해주세요"
                                    style={{
                                        width: '100%', minHeight: '100px',
                                        border: '2px solid #E2E8F0', borderRadius: '14px',
                                        padding: '12px 16px', fontSize: '0.95rem',
                                        lineHeight: '1.7', outline: 'none',
                                        resize: 'vertical', fontFamily: 'inherit',
                                        boxSizing: 'border-box'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#A855F7'}
                                    onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                                />
                            </div>

                            {/* 가이드 질문 */}
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.9rem', fontWeight: '700',
                                    color: '#1E293B', marginBottom: '12px'
                                }}>
                                    📌 생각 정리 질문 (학생들이 답변할 질문)
                                </label>
                                {formData.guide_questions.map((q, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', gap: '8px', marginBottom: '8px',
                                        alignItems: 'center'
                                    }}>
                                        <span style={{
                                            minWidth: '28px', height: '28px',
                                            background: '#EDE9FE', borderRadius: '8px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.75rem', fontWeight: '800', color: '#7C3AED'
                                        }}>
                                            Q{idx + 1}
                                        </span>
                                        <input
                                            type="text"
                                            value={q}
                                            onChange={(e) => {
                                                const newQ = [...formData.guide_questions];
                                                newQ[idx] = e.target.value;
                                                setFormData(prev => ({ ...prev, guide_questions: newQ }));
                                            }}
                                            style={{
                                                flex: 1, padding: '10px 14px',
                                                border: '1px solid #E2E8F0', borderRadius: '10px',
                                                fontSize: '0.9rem', outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                            onFocus={(e) => e.target.style.borderColor = '#A855F7'}
                                            onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                                        />
                                        {formData.guide_questions.length > 1 && (
                                            <button
                                                onClick={() => {
                                                    const newQ = formData.guide_questions.filter((_, i) => i !== idx);
                                                    setFormData(prev => ({ ...prev, guide_questions: newQ }));
                                                }}
                                                style={{
                                                    background: '#FEE2E2', border: 'none',
                                                    borderRadius: '8px', padding: '6px 10px',
                                                    cursor: 'pointer', color: '#EF4444',
                                                    fontWeight: 'bold', fontSize: '0.8rem'
                                                }}
                                            >✕</button>
                                        )}
                                    </div>
                                ))}
                                {formData.guide_questions.length < 5 && (
                                    <button
                                        onClick={() => setFormData(prev => ({
                                            ...prev,
                                            guide_questions: [...prev.guide_questions, '']
                                        }))}
                                        style={{
                                            background: '#F5F3FF', border: '1px dashed #DDD6FE',
                                            borderRadius: '10px', padding: '8px 16px',
                                            cursor: 'pointer', color: '#7C3AED',
                                            fontWeight: 'bold', fontSize: '0.85rem',
                                            width: '100%', marginTop: '4px'
                                        }}
                                    >
                                        + 질문 추가
                                    </button>
                                )}
                            </div>

                            {/* 포인트 설정 */}
                            <div style={{ marginBottom: '24px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.9rem', fontWeight: '700',
                                    color: '#1E293B', marginBottom: '12px'
                                }}>
                                    🪙 포인트 보상 설정
                                </label>
                                <div style={{
                                    display: 'flex', gap: '12px',
                                    flexWrap: isMobile ? 'wrap' : 'nowrap'
                                }}>
                                    <div style={{
                                        flex: 1, background: '#F0FDF4', borderRadius: '14px',
                                        padding: '16px', border: '1px solid #BBF7D0',
                                        minWidth: '200px'
                                    }}>
                                        <div style={{
                                            fontSize: '0.8rem', fontWeight: '700', color: '#16A34A',
                                            marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}>
                                            📝 제안 제출 시
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <input
                                                type="number"
                                                value={formData.submit_reward}
                                                onChange={(e) => setFormData(prev => ({ ...prev, submit_reward: parseInt(e.target.value) || 0 }))}
                                                min="0" max="500"
                                                style={{
                                                    width: '70px', padding: '8px 10px',
                                                    border: '1px solid #BBF7D0', borderRadius: '10px',
                                                    fontSize: '1rem', fontWeight: '800',
                                                    textAlign: 'center', outline: 'none',
                                                    color: '#16A34A'
                                                }}
                                            />
                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#16A34A' }}>P</span>
                                        </div>
                                        <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#86EFAC' }}>
                                            아이디어를 제출하면 받는 포인트
                                        </p>
                                    </div>
                                    <div style={{
                                        flex: 1, background: '#FFF7ED', borderRadius: '14px',
                                        padding: '16px', border: '1px solid #FED7AA',
                                        minWidth: '200px'
                                    }}>
                                        <div style={{
                                            fontSize: '0.8rem', fontWeight: '700', color: '#EA580C',
                                            marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px'
                                        }}>
                                            ✅ 최종 결정 시
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <input
                                                type="number"
                                                value={formData.decided_reward}
                                                onChange={(e) => setFormData(prev => ({ ...prev, decided_reward: parseInt(e.target.value) || 0 }))}
                                                min="0" max="500"
                                                style={{
                                                    width: '70px', padding: '8px 10px',
                                                    border: '1px solid #FED7AA', borderRadius: '10px',
                                                    fontSize: '1rem', fontWeight: '800',
                                                    textAlign: 'center', outline: 'none',
                                                    color: '#EA580C'
                                                }}
                                            />
                                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#EA580C' }}>P</span>
                                        </div>
                                        <p style={{ margin: '6px 0 0', fontSize: '0.7rem', color: '#FDBA74' }}>
                                            아이디어가 결정되면 받는 보너스 포인트
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 등록 버튼 */}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleCreateOrUpdateMeeting}
                                disabled={saving}
                                style={{
                                    width: '100%', padding: '16px',
                                    background: saving ? '#D1D5DB' : 'linear-gradient(135deg, #7C3AED, #A855F7)',
                                    color: 'white', border: 'none',
                                    borderRadius: '16px', fontWeight: '900',
                                    fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 8px 20px rgba(124, 58, 237, 0.3)'
                                }}
                            >
                                {saving ? '저장 중... ⏳' : (editingMeetingId ? '🔄 안건 수정 내용 저장하기' : '🏛️ 회의 안건 등록하기')}
                            </motion.button>
                        </Card>
                    </motion.div>
                ) : (
                    <motion.div
                        key="manage"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                    >
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#7C3AED', fontWeight: 'bold' }}>
                                회의 목록을 불러오는 중... ✨
                            </div>
                        ) : meetings.length === 0 ? (
                            <div style={{
                                textAlign: 'center', padding: '60px',
                                background: 'white', borderRadius: '20px',
                                border: '2px dashed #E2E8F0'
                            }}>
                                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>📋</div>
                                <p style={{ color: '#64748B', fontWeight: 'bold' }}>
                                    아직 등록된 회의 안건이 없습니다.<br />
                                    '안건 만들기' 탭에서 새 안건을 등록해 보세요!
                                </p>
                            </div>
                        ) : (
                            <div>
                                {/* 회의 안건 선택 바 */}
                                <div style={{
                                    display: 'flex', gap: '10px', marginBottom: '20px',
                                    flexWrap: 'wrap', alignItems: 'center'
                                }}>
                                    {meetings.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => setSelectedMeeting(m)}
                                            style={{
                                                padding: '8px 18px',
                                                border: selectedMeeting?.id === m.id ? '2px solid #7C3AED' : '1px solid #E2E8F0',
                                                borderRadius: '12px',
                                                background: selectedMeeting?.id === m.id ? '#F5F3FF' : 'white',
                                                fontWeight: selectedMeeting?.id === m.id ? '800' : '600',
                                                color: selectedMeeting?.id === m.id ? '#4C1D95' : '#64748B',
                                                cursor: 'pointer', fontSize: '0.85rem',
                                                transition: 'all 0.2s',
                                                display: 'flex', alignItems: 'center', gap: '6px'
                                            }}
                                        >
                                            📋 {m.title}
                                        </button>
                                    ))}
                                    {selectedMeeting && (
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => handleStartEdit(selectedMeeting)}
                                                style={{
                                                    padding: '6px 12px', background: '#F0F9FF',
                                                    border: '1px solid #BAE6FD', borderRadius: '8px',
                                                    cursor: 'pointer', color: '#0284C7',
                                                    fontWeight: 'bold', fontSize: '0.75rem'
                                                }}
                                            >✏️ 안건 수정</button>
                                            <button
                                                onClick={() => handleArchiveMeeting(selectedMeeting.id)}
                                                style={{
                                                    padding: '6px 12px', background: '#F5F3FF',
                                                    border: '1px solid #DDD6FE', borderRadius: '8px',
                                                    cursor: 'pointer', color: '#7C3AED',
                                                    fontWeight: 'bold', fontSize: '0.75rem'
                                                }}
                                            >📦 안건 보관</button>
                                        </div>
                                    )}
                                </div>

                                {/* 선택된 안건의 아이디어 목록 */}
                                {selectedMeeting ? (
                                    <>
                                        {/* 상단 요약 바 */}
                                        <div style={{
                                            display: 'flex', gap: '12px', marginBottom: '16px',
                                            alignItems: 'center', flexWrap: 'wrap'
                                        }}>
                                            <h3 style={{
                                                margin: 0, fontSize: '1rem', fontWeight: '800',
                                                color: '#4C1D95', flex: 1, minWidth: '200px'
                                            }}>
                                                💡 "{selectedMeeting.title}" — 제안 {ideas.length}건
                                            </h3>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {Object.entries(statusSummary).map(([status, count]) => {
                                                    const sc = STATUS_COLORS[status] || STATUS_COLORS['제안중'];
                                                    return (
                                                        <span key={status} style={{
                                                            padding: '4px 10px', borderRadius: '8px',
                                                            background: sc.bg, color: sc.color,
                                                            fontSize: '0.75rem', fontWeight: '800',
                                                            border: `1px solid ${sc.border}`
                                                        }}>
                                                            {sc.icon} {status} {count}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {ideasLoading ? (
                                            <div style={{ textAlign: 'center', padding: '40px', color: '#7C3AED' }}>
                                                로딩 중...
                                            </div>
                                        ) : ideas.length === 0 ? (
                                            <div style={{
                                                textAlign: 'center', padding: '60px',
                                                background: '#FAFAFA', borderRadius: '16px',
                                                border: '1px dashed #E2E8F0'
                                            }}>
                                                <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>📝</div>
                                                <p style={{ color: '#94A3B8', fontWeight: 'bold' }}>
                                                    아직 제출된 제안이 없습니다.
                                                </p>
                                            </div>
                                        ) : (
                                            /* ========== 4열 그리드 카드 목록 ========== */
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: isMobile
                                                    ? 'repeat(2, 1fr)'
                                                    : 'repeat(4, 1fr)',
                                                gap: '12px'
                                            }}>
                                                {ideas.map(idea => {
                                                    const status = idea.status || '제안중';
                                                    const sc = STATUS_COLORS[status] || STATUS_COLORS['제안중'];
                                                    const agreeCount = getVoteCount(idea, 'agree');
                                                    const disagreeCount = getVoteCount(idea, 'disagree');
                                                    const supplementCount = getVoteCount(idea, 'supplement');
                                                    const commentCount = (idea.post_comments || []).length;
                                                    // 내용 미리보기 최대 60자
                                                    const preview = (idea.content || '').slice(0, 60) + ((idea.content || '').length > 60 ? '...' : '');

                                                    return (
                                                        <motion.div
                                                            key={idea.id}
                                                            whileHover={{ scale: 1.03, boxShadow: '0 8px 24px rgba(124,58,237,0.15)' }}
                                                            whileTap={{ scale: 0.98 }}
                                                            onClick={() => setDetailModal(idea)}
                                                            style={{
                                                                background: 'white',
                                                                borderRadius: '14px',
                                                                border: '1px solid #E2E8F0',
                                                                padding: '14px',
                                                                cursor: 'pointer',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '6px',
                                                                position: 'relative',
                                                                transition: 'box-shadow 0.2s',
                                                                height: '180px',
                                                                overflow: 'hidden',
                                                                boxSizing: 'border-box'
                                                            }}
                                                        >
                                                            {/* 상태 뱃지 (우상단) */}
                                                            <span style={{
                                                                position: 'absolute', top: '8px', right: '8px',
                                                                background: sc.bg, color: sc.color,
                                                                border: `1px solid ${sc.border}`,
                                                                padding: '2px 8px', borderRadius: '6px',
                                                                fontSize: '0.6rem', fontWeight: '800',
                                                                lineHeight: '1.4', zIndex: 1
                                                            }}>
                                                                {status}
                                                            </span>

                                                            {/* 학생 이름 */}
                                                            <div style={{
                                                                fontSize: '0.7rem', color: '#94A3B8',
                                                                fontWeight: '700',
                                                                whiteSpace: 'nowrap', overflow: 'hidden',
                                                                textOverflow: 'ellipsis', flexShrink: 0
                                                            }}>
                                                                {idea.students?.name}
                                                            </div>

                                                            {/* 제목 */}
                                                            <div style={{
                                                                fontSize: '0.85rem', fontWeight: '800',
                                                                color: '#1E293B', lineHeight: '1.3',
                                                                overflow: 'hidden', textOverflow: 'ellipsis',
                                                                display: '-webkit-box',
                                                                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                                                paddingRight: '40px', flexShrink: 0,
                                                                wordBreak: 'break-all'
                                                            }}>
                                                                {idea.title}
                                                            </div>

                                                            {/* 내용 미리보기 */}
                                                            <div style={{
                                                                fontSize: '0.73rem', color: '#64748B',
                                                                lineHeight: '1.5', flex: 1,
                                                                overflow: 'hidden', textOverflow: 'ellipsis',
                                                                display: '-webkit-box',
                                                                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                                                wordBreak: 'break-all', minHeight: 0
                                                            }}>
                                                                {preview}
                                                            </div>

                                                            {/* 투표·댓글 수치 바 */}
                                                            <div style={{
                                                                display: 'flex', gap: '4px',
                                                                flexWrap: 'nowrap', marginTop: 'auto',
                                                                flexShrink: 0
                                                            }}>
                                                                <span style={{
                                                                    fontSize: '0.65rem', padding: '2px 6px',
                                                                    borderRadius: '6px', background: '#E8F5E9',
                                                                    color: '#4CAF50', fontWeight: '700',
                                                                    whiteSpace: 'nowrap'
                                                                }}>👍{agreeCount}</span>
                                                                <span style={{
                                                                    fontSize: '0.65rem', padding: '2px 6px',
                                                                    borderRadius: '6px', background: '#FFEBEE',
                                                                    color: '#F44336', fontWeight: '700',
                                                                    whiteSpace: 'nowrap'
                                                                }}>👎{disagreeCount}</span>
                                                                <span style={{
                                                                    fontSize: '0.65rem', padding: '2px 6px',
                                                                    borderRadius: '6px', background: '#FFF3E0',
                                                                    color: '#FF9800', fontWeight: '700',
                                                                    whiteSpace: 'nowrap'
                                                                }}>🔧{supplementCount}</span>
                                                                <span style={{
                                                                    fontSize: '0.65rem', padding: '2px 6px',
                                                                    borderRadius: '6px', background: '#F1F5F9',
                                                                    color: '#64748B', fontWeight: '700',
                                                                    whiteSpace: 'nowrap'
                                                                }}>💬{commentCount}</span>
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div style={{
                                        textAlign: 'center', padding: '60px',
                                        background: '#FAFAFA', borderRadius: '16px',
                                        border: '1px dashed #E2E8F0'
                                    }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>👆</div>
                                        <p style={{ color: '#94A3B8', fontWeight: 'bold' }}>
                                            위에서 회의 안건을 선택해 주세요.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ========== 상세보기 모달 ========== */}
            <AnimatePresence>
                {detailModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setDetailModal(null)}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 10000,
                            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            padding: '20px'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'white', borderRadius: '24px',
                                padding: '32px', maxWidth: '600px', width: '100%',
                                maxHeight: '85vh', overflowY: 'auto', overflowX: 'hidden',
                                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                                boxSizing: 'border-box', wordBreak: 'break-word'
                            }}
                        >
                            {/* 모달 헤더 */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'flex-start', marginBottom: '20px'
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.8rem', color: '#7C3AED', fontWeight: '700', marginBottom: '4px' }}>
                                        {detailModal.students?.name}
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#1E293B', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                                        {detailModal.title}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setDetailModal(null)}
                                    style={{
                                        background: '#F1F5F9', border: 'none',
                                        borderRadius: '10px', padding: '8px 12px',
                                        cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold',
                                        color: '#64748B'
                                    }}
                                >✕</button>
                            </div>

                            {/* 내용 */}
                            <div style={{
                                background: '#F8FAFC', borderRadius: '14px',
                                padding: '16px', marginBottom: '16px',
                                border: '1px solid #E2E8F0',
                                overflow: 'hidden'
                            }}>
                                <p style={{
                                    margin: 0, fontSize: '0.9rem', color: '#334155',
                                    lineHeight: '1.8', whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word', overflowWrap: 'anywhere'
                                }}>
                                    {detailModal.content}
                                </p>
                            </div>

                            {/* 가이드 질문 답변 */}
                            {detailModal.student_answers?.length > 0 && selectedMeeting?.guide_questions?.length > 0 && (
                                <div style={{
                                    background: '#F5F3FF', borderRadius: '14px',
                                    padding: '16px', marginBottom: '16px',
                                    border: '1px solid #EDE9FE'
                                }}>
                                    <div style={{
                                        fontSize: '0.8rem', fontWeight: '800', color: '#7C3AED',
                                        marginBottom: '12px'
                                    }}>📌 생각 정리 답변</div>
                                    {selectedMeeting.guide_questions.map((q, idx) => (
                                        <div key={idx} style={{
                                            marginBottom: idx < selectedMeeting.guide_questions.length - 1 ? '12px' : 0,
                                            paddingBottom: idx < selectedMeeting.guide_questions.length - 1 ? '12px' : 0,
                                            borderBottom: idx < selectedMeeting.guide_questions.length - 1 ? '1px solid #EDE9FE' : 'none'
                                        }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#7C3AED', marginBottom: '4px' }}>
                                                Q{idx + 1}. {q}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#4C1D95', lineHeight: '1.6' }}>
                                                {detailModal.student_answers[idx] || '(답변 없음)'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 투표 현황 */}
                            <div style={{
                                display: 'flex', gap: '10px', marginBottom: '20px',
                                flexWrap: 'wrap'
                            }}>
                                {[
                                    { type: 'agree', label: '👍 찬성', bg: '#E8F5E9', color: '#4CAF50' },
                                    { type: 'disagree', label: '👎 반대', bg: '#FFEBEE', color: '#F44336' },
                                    { type: 'supplement', label: '🔧 보완', bg: '#FFF3E0', color: '#FF9800' },
                                ].map(v => (
                                    <span key={v.type} style={{
                                        padding: '6px 14px', borderRadius: '10px',
                                        background: v.bg, fontSize: '0.85rem',
                                        fontWeight: '800', color: v.color
                                    }}>
                                        {v.label} {getVoteCount(detailModal, v.type)}
                                    </span>
                                ))}
                                <span style={{
                                    padding: '6px 14px', borderRadius: '10px',
                                    background: '#F1F5F9', fontSize: '0.85rem',
                                    fontWeight: '800', color: '#64748B'
                                }}>
                                    💬 댓글 {(detailModal.post_comments || []).length}
                                </span>
                            </div>

                            {/* 상태 변경 */}
                            <div style={{ marginBottom: '8px' }}>
                                <div style={{
                                    fontSize: '0.8rem', fontWeight: '800', color: '#4C1D95',
                                    marginBottom: '10px'
                                }}>📋 상태 변경</div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['제안중', '검토중', '결정됨'].map(st => {
                                        const bsc = STATUS_COLORS[st];
                                        const isActive = (detailModal.status || '제안중') === st;
                                        return (
                                            <motion.button
                                                key={st}
                                                whileHover={{ scale: isActive ? 1 : 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                onClick={() => handleStatusChange(detailModal.id, st)}
                                                disabled={isActive}
                                                style={{
                                                    flex: 1, padding: '12px',
                                                    border: isActive ? `2px solid ${bsc.color}` : '1px solid #E2E8F0',
                                                    borderRadius: '12px',
                                                    background: isActive ? bsc.bg : 'white',
                                                    color: isActive ? bsc.color : '#94A3B8',
                                                    fontWeight: isActive ? '900' : '600',
                                                    fontSize: '0.9rem',
                                                    cursor: isActive ? 'default' : 'pointer',
                                                    transition: 'all 0.2s',
                                                    display: 'flex', alignItems: 'center',
                                                    justifyContent: 'center', gap: '4px'
                                                }}
                                            >
                                                {bsc.icon} {st}
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default IdeaMarketManager;
