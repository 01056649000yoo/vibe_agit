import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useIdeaMarket } from '../../hooks/useIdeaMarket';
import { usePostInteractions } from '../../hooks/usePostInteractions';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';

// 투표 아이콘
const VOTE_ICONS = [
    { type: 'agree', label: '찬성', emoji: '👍', color: '#4CAF50', bg: '#E8F5E9' },
    { type: 'disagree', label: '반대', emoji: '👎', color: '#F44336', bg: '#FFEBEE' },
    { type: 'supplement', label: '보완', emoji: '🔧', color: '#FF9800', bg: '#FFF3E0' }
];

// 상태 뱃지 색상
const STATUS_COLORS = {
    '제안중': { bg: '#E3F2FD', color: '#1565C0', border: '#BBDEFB' },
    '검토중': { bg: '#FFF3E0', color: '#E65100', border: '#FFE0B2' },
    '결정됨': { bg: '#E8F5E9', color: '#2E7D32', border: '#C8E6C9' }
};

/**
 * 🏛️ 아지트 아이디어 마켓 - 학생 메인 페이지
 * 학급 회의 안건 목록 + 아이디어 제출 + 토론 + 투표
 */
const IdeaMarketPage = ({ studentSession, onBack }) => {
    const classId = studentSession?.classId || studentSession?.class_id;
    const studentId = studentSession?.id;

    const {
        meetings, selectedMeeting, setSelectedMeeting,
        ideas, myIdea, loading, ideasLoading, submitting, stats,
        submitIdea, handleVote, refresh
    } = useIdeaMarket(classId, studentId);

    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [viewMode, setViewMode] = useState('list'); // 'list' | 'write' | 'detail'
    const [selectedIdea, setSelectedIdea] = useState(null);

    // 글쓰기 폼 상태
    const [ideaTitle, setIdeaTitle] = useState('');
    const [ideaContent, setIdeaContent] = useState('');
    const [answers, setAnswers] = useState([]);
    const [isAnonymous, setIsAnonymous] = useState(false);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 가이드 질문 초기화
    useEffect(() => {
        if (selectedMeeting?.guide_questions?.length > 0) {
            setAnswers(selectedMeeting.guide_questions.map(() => ''));
        }
    }, [selectedMeeting?.id]);

    // 내 아이디어가 있으면 폼에 미리 채워넣기
    useEffect(() => {
        if (myIdea && viewMode === 'write') {
            setIdeaTitle(myIdea.title || '');
            setIdeaContent(myIdea.content || '');
            if (myIdea.student_answers?.length > 0) {
                setAnswers(myIdea.student_answers);
            }
        }
    }, [myIdea, viewMode]);

    const handleSubmitIdea = async () => {
        if (!ideaTitle.trim() || !ideaContent.trim()) {
            alert('제목과 내용을 모두 입력해주세요! ✍️');
            return;
        }

        const success = await submitIdea({
            title: ideaTitle,
            content: ideaContent,
            answers,
            isAnonymous
        });

        if (success) {
            const reward = selectedMeeting?.base_reward || 30;
            alert(`아이디어가 성공적으로 제출되었습니다! 🎉${!myIdea ? `\n제출 보상 +${reward}P 획득! 🪙` : ''}`);
            setViewMode('list');
            setIdeaTitle('');
            setIdeaContent('');
            setAnswers(selectedMeeting?.guide_questions?.map(() => '') || []);
        }
    };

    const getVoteCount = (idea, type) =>
        (idea.post_reactions || []).filter(r => r.reaction_type === type).length;

    const getMyVote = (idea) =>
        (idea.post_reactions || []).find(r => r.student_id === studentId)?.reaction_type;

    if (loading) {
        return (
            <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#F8FAFC' }}>
                <div style={{ textAlign: 'center' }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }} style={{ fontSize: '3rem' }}>💡</motion.div>
                    <p style={{ marginTop: '20px', fontWeight: '900', color: '#7C3AED' }}>아이디어 마켓을 여는 중...</p>
                </div>
            </div>
        );
    }

    // ===== 아이디어 상세 보기 =====
    if (viewMode === 'detail' && selectedIdea) {
        return (
            <IdeaDetailView
                idea={selectedIdea}
                meeting={selectedMeeting}
                studentSession={studentSession}
                onBack={() => { setViewMode('list'); setSelectedIdea(null); }}
                onVote={handleVote}
                isMobile={isMobile}
            />
        );
    }

    return (
        <div style={{
            height: '100%', width: '100%',
            maxWidth: isMobile ? '100%' : '650px',
            margin: '0 auto',
            background: '#F8FAFC',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
            {/* 헤더 */}
            <header style={{
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: '12px',
                background: 'white',
                borderBottom: '1px solid #F1F5F9',
                zIndex: 100
            }}>
                <motion.button
                    whileHover={{ x: -3 }}
                    onClick={onBack}
                    style={{
                        background: '#F1F5F9', border: 'none', width: '36px', height: '36px',
                        borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.1rem', color: '#64748B', cursor: 'pointer'
                    }}
                >
                    ‹
                </motion.button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🏛️ 아이디어 마켓
                    </h1>
                </div>
                {viewMode === 'list' && selectedMeeting && (
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setViewMode('write')}
                        style={{
                            background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
                            color: 'white', border: 'none',
                            padding: '8px 16px', borderRadius: '12px',
                            fontWeight: '800', fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)'
                        }}
                    >
                        {myIdea ? '✏️ 수정하기' : '💡 제안하기'}
                    </motion.button>
                )}
                {viewMode === 'write' && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewMode('list')}
                    >
                        취소
                    </Button>
                )}
            </header>

            {/* 메인 콘텐츠 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px 100px' : '24px 20px 80px' }}>
                <AnimatePresence mode="wait">
                    {viewMode === 'list' ? (
                        <motion.div
                            key="list"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            {/* 회의 안건이 없을 때 */}
                            {meetings.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                                    <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🏛️</div>
                                    <h3 style={{ color: '#64748B', fontWeight: '800', margin: '0 0 8px' }}>아직 회의 안건이 없어요</h3>
                                    <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>
                                        선생님이 회의 안건을 등록하면<br />여기서 아이디어를 제안할 수 있어요!
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* 회의 탭 선택 */}
                                    {meetings.length > 1 && (
                                        <div style={{
                                            display: 'flex', gap: '8px', marginBottom: '20px',
                                            overflowX: 'auto', paddingBottom: '4px',
                                            scrollbarWidth: 'none'
                                        }}>
                                            {meetings.map(m => (
                                                <motion.button
                                                    key={m.id}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => setSelectedMeeting(m)}
                                                    style={{
                                                        padding: '8px 16px', borderRadius: '20px', border: 'none',
                                                        background: selectedMeeting?.id === m.id
                                                            ? 'linear-gradient(135deg, #7C3AED, #A855F7)'
                                                            : 'white',
                                                        color: selectedMeeting?.id === m.id ? 'white' : '#64748B',
                                                        fontWeight: 'bold', whiteSpace: 'nowrap', cursor: 'pointer',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    {m.title}
                                                </motion.button>
                                            ))}
                                        </div>
                                    )}

                                    {/* 선택된 회의 정보 카드 */}
                                    {selectedMeeting && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            style={{
                                                background: 'linear-gradient(135deg, #EDE9FE 0%, #F5F3FF 100%)',
                                                borderRadius: '20px',
                                                padding: '24px',
                                                marginBottom: '24px',
                                                border: '1px solid #DDD6FE'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                                <span style={{ fontSize: '2rem' }}>📋</span>
                                                <div>
                                                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#4C1D95' }}>
                                                        {selectedMeeting.title}
                                                    </h2>
                                                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#7C3AED' }}>
                                                        {new Date(selectedMeeting.created_at).toLocaleDateString('ko-KR')} 등록
                                                    </p>
                                                </div>
                                            </div>
                                            {selectedMeeting.guide && (
                                                <p style={{
                                                    margin: 0, fontSize: '0.9rem', color: '#5B21B6',
                                                    lineHeight: '1.6', background: 'rgba(255,255,255,0.5)',
                                                    padding: '12px 16px', borderRadius: '12px'
                                                }}>
                                                    {selectedMeeting.guide}
                                                </p>
                                            )}

                                            {/* 통계 */}
                                            <div style={{
                                                display: 'flex', gap: '12px', marginTop: '16px',
                                                flexWrap: 'wrap'
                                            }}>
                                                <div style={{
                                                    background: 'white', padding: '8px 16px', borderRadius: '12px',
                                                    display: 'flex', alignItems: 'center', gap: '6px'
                                                }}>
                                                    <span style={{ fontSize: '1rem' }}>💡</span>
                                                    <span style={{ fontWeight: '900', color: '#7C3AED' }}>{stats.total}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>제안</span>
                                                </div>
                                                <div style={{
                                                    background: 'white', padding: '8px 16px', borderRadius: '12px',
                                                    display: 'flex', alignItems: 'center', gap: '6px'
                                                }}>
                                                    <span style={{ fontSize: '1rem' }}>🔍</span>
                                                    <span style={{ fontWeight: '900', color: '#E65100' }}>{stats.reviewing}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>검토중</span>
                                                </div>
                                                <div style={{
                                                    background: 'white', padding: '8px 16px', borderRadius: '12px',
                                                    display: 'flex', alignItems: 'center', gap: '6px'
                                                }}>
                                                    <span style={{ fontSize: '1rem' }}>✅</span>
                                                    <span style={{ fontWeight: '900', color: '#2E7D32' }}>{stats.decided}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>결정됨</span>
                                                </div>
                                            </div>

                                            {/* 포인트 보상 안내 */}
                                            {(selectedMeeting.base_reward > 0 || selectedMeeting.bonus_reward > 0) && (
                                                <div style={{
                                                    display: 'flex', gap: '8px', marginTop: '12px',
                                                    flexWrap: 'wrap'
                                                }}>
                                                    {selectedMeeting.base_reward > 0 && (
                                                        <div style={{
                                                            background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
                                                            padding: '6px 14px', borderRadius: '20px',
                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                            border: '1px solid #BBF7D0'
                                                        }}>
                                                            <span style={{ fontSize: '0.85rem' }}>🪙</span>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#16A34A' }}>
                                                                제출 시 +{selectedMeeting.base_reward}P
                                                            </span>
                                                        </div>
                                                    )}
                                                    {selectedMeeting.bonus_reward > 0 && (
                                                        <div style={{
                                                            background: 'linear-gradient(135deg, #FFF7ED, #FFEDD5)',
                                                            padding: '6px 14px', borderRadius: '20px',
                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                            border: '1px solid #FED7AA'
                                                        }}>
                                                            <span style={{ fontSize: '0.85rem' }}>⭐</span>
                                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#EA580C' }}>
                                                                결정 시 +{selectedMeeting.bonus_reward}P
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </motion.div>
                                    )}

                                    {/* 아이디어 목록 */}
                                    {ideasLoading ? (
                                        <div style={{ textAlign: 'center', padding: '40px', color: '#7C3AED', fontWeight: 'bold' }}>
                                            아이디어들을 불러오는 중... ✨
                                        </div>
                                    ) : ideas.length === 0 ? (
                                        <div style={{
                                            textAlign: 'center', padding: '60px 20px',
                                            background: 'white', borderRadius: '20px',
                                            border: '2px dashed #E2E8F0'
                                        }}>
                                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>💭</div>
                                            <p style={{ color: '#64748B', fontWeight: 'bold', margin: 0 }}>
                                                아직 제안된 아이디어가 없어요.<br />첫 번째 아이디어를 제안해 보세요!
                                            </p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {ideas.map((idea, index) => {
                                                const statusStyle = STATUS_COLORS[idea.status] || STATUS_COLORS['제안중'];
                                                const myVote = getMyVote(idea);
                                                const agreeCount = getVoteCount(idea, 'agree');
                                                const disagreeCount = getVoteCount(idea, 'disagree');
                                                const supplementCount = getVoteCount(idea, 'supplement');
                                                const totalVotes = agreeCount + disagreeCount + supplementCount;
                                                const commentCount = (idea.post_comments || []).length;

                                                return (
                                                    <motion.div
                                                        key={idea.id}
                                                        initial={{ opacity: 0, y: 20 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: index * 0.05 }}
                                                        whileHover={{ y: -3 }}
                                                        onClick={() => {
                                                            setSelectedIdea(idea);
                                                            setViewMode('detail');
                                                        }}
                                                        style={{
                                                            background: 'white',
                                                            borderRadius: '20px',
                                                            padding: '20px',
                                                            border: idea.student_id === studentId
                                                                ? '2px solid #A855F7'
                                                                : '1px solid #E2E8F0',
                                                            cursor: 'pointer',
                                                            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        {/* 상태 뱃지 */}
                                                        <div style={{
                                                            position: 'absolute', top: '14px', right: '14px',
                                                            background: statusStyle.bg,
                                                            color: statusStyle.color,
                                                            border: `1px solid ${statusStyle.border}`,
                                                            padding: '2px 10px', borderRadius: '8px',
                                                            fontSize: '0.7rem', fontWeight: '800'
                                                        }}>
                                                            {idea.status || '제안중'}
                                                        </div>

                                                        {/* 작성자 */}
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                            marginBottom: '10px'
                                                        }}>
                                                            <span style={{
                                                                fontSize: '0.8rem', padding: '3px 10px',
                                                                background: idea.student_id === studentId ? '#F3E8FF' : '#F1F5F9',
                                                                color: idea.student_id === studentId ? '#7C3AED' : '#64748B',
                                                                borderRadius: '8px', fontWeight: 'bold'
                                                            }}>
                                                                {idea.student_id === studentId ? '나의 제안' : `${idea.students?.name}`}
                                                            </span>
                                                        </div>

                                                        {/* 제목 */}
                                                        <h3 style={{
                                                            margin: '0 0 8px', fontSize: '1.05rem',
                                                            fontWeight: '900', color: '#1E293B',
                                                            paddingRight: '70px'
                                                        }}>
                                                            {idea.title}
                                                        </h3>

                                                        {/* 내용 미리보기 */}
                                                        <p style={{
                                                            margin: '0 0 16px', fontSize: '0.85rem', color: '#64748B',
                                                            lineHeight: '1.6', overflow: 'hidden',
                                                            textOverflow: 'ellipsis', display: '-webkit-box',
                                                            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                                                        }}>
                                                            {idea.content}
                                                        </p>

                                                        {/* 투표 바 */}
                                                        <div style={{
                                                            display: 'flex', gap: '8px', alignItems: 'center',
                                                            flexWrap: 'wrap'
                                                        }}>
                                                            {VOTE_ICONS.map(vote => {
                                                                const count = getVoteCount(idea, vote.type);
                                                                const isMyVote = myVote === vote.type;
                                                                return (
                                                                    <motion.button
                                                                        key={vote.type}
                                                                        whileTap={{ scale: 0.9 }}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleVote(idea.id, vote.type);
                                                                        }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                                            padding: '5px 12px', borderRadius: '20px',
                                                                            border: isMyVote ? `2px solid ${vote.color}` : '1px solid #E2E8F0',
                                                                            background: isMyVote ? vote.bg : '#FAFAFA',
                                                                            cursor: 'pointer', fontSize: '0.8rem',
                                                                            fontWeight: isMyVote ? '900' : '600',
                                                                            color: isMyVote ? vote.color : '#94A3B8',
                                                                            transition: 'all 0.2s'
                                                                        }}
                                                                    >
                                                                        <span>{vote.emoji}</span>
                                                                        <span>{count}</span>
                                                                    </motion.button>
                                                                );
                                                            })}

                                                            <div style={{ flex: 1 }} />

                                                            {/* 댓글 수 */}
                                                            <span style={{
                                                                fontSize: '0.8rem', color: '#94A3B8',
                                                                display: 'flex', alignItems: 'center', gap: '4px'
                                                            }}>
                                                                💬 {commentCount}
                                                            </span>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </motion.div>
                    ) : viewMode === 'write' ? (
                        <motion.div
                            key="write"
                            initial={{ opacity: 0, x: 30 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -30 }}
                        >
                            {/* 글쓰기 폼 */}
                            <div style={{
                                background: 'linear-gradient(135deg, #EDE9FE, #F5F3FF)',
                                borderRadius: '20px', padding: '20px', marginBottom: '20px',
                                border: '1px solid #DDD6FE',
                                display: 'flex', alignItems: 'center', gap: '12px'
                            }}>
                                <span style={{ fontSize: '2rem' }}>✍️</span>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '900', color: '#4C1D95' }}>
                                        나의 아이디어 제안하기
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#7C3AED' }}>
                                        {selectedMeeting?.title}
                                    </p>
                                </div>
                            </div>

                            {/* 포인트 보상 안내 (글쓰기 폼 상단) */}
                            {selectedMeeting && (selectedMeeting.base_reward > 0 || selectedMeeting.bonus_reward > 0) && (
                                <div style={{
                                    background: 'linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)',
                                    borderRadius: '14px', padding: '12px 16px',
                                    marginBottom: '20px', border: '1px solid #FDE68A',
                                    display: 'flex', alignItems: 'center', gap: '10px',
                                    flexWrap: 'wrap'
                                }}>
                                    <span style={{ fontSize: '1.2rem' }}>🪙</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#92400E', marginBottom: '2px' }}>
                                            보상 포인트 안내
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#B45309', lineHeight: '1.5' }}>
                                            {selectedMeeting.base_reward > 0 && (
                                                <span>제출 시 <b>+{selectedMeeting.base_reward}P</b></span>
                                            )}
                                            {selectedMeeting.base_reward > 0 && selectedMeeting.bonus_reward > 0 && ' · '}
                                            {selectedMeeting.bonus_reward > 0 && (
                                                <span>결정 시 <b>+{selectedMeeting.bonus_reward}P</b> 추가 보상!</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 가이드 질문 */}
                            {selectedMeeting?.guide_questions?.length > 0 && (
                                <div style={{ marginBottom: '20px' }}>
                                    <h4 style={{
                                        margin: '0 0 12px', fontSize: '0.9rem', fontWeight: '800',
                                        color: '#4C1D95', display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        📌 생각 정리 질문
                                    </h4>
                                    {selectedMeeting.guide_questions.map((q, idx) => (
                                        <div key={idx} style={{
                                            background: 'white', borderRadius: '16px',
                                            padding: '16px', marginBottom: '12px',
                                            border: '1px solid #E2E8F0'
                                        }}>
                                            <label style={{
                                                display: 'block', fontSize: '0.85rem', fontWeight: '700',
                                                color: '#4C1D95', marginBottom: '8px'
                                            }}>
                                                Q{idx + 1}. {q}
                                            </label>
                                            <textarea
                                                value={answers[idx] || ''}
                                                onChange={(e) => {
                                                    const newAnswers = [...answers];
                                                    newAnswers[idx] = e.target.value;
                                                    setAnswers(newAnswers);
                                                }}
                                                placeholder="생각을 적어주세요..."
                                                style={{
                                                    width: '100%', minHeight: '60px',
                                                    border: '1px solid #E2E8F0', borderRadius: '10px',
                                                    padding: '10px 14px', fontSize: '0.9rem',
                                                    outline: 'none', resize: 'vertical',
                                                    fontFamily: 'inherit', boxSizing: 'border-box',
                                                    transition: 'border-color 0.2s'
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = '#A855F7'}
                                                onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 제목 */}
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.85rem', fontWeight: '700',
                                    color: '#1E293B', marginBottom: '6px'
                                }}>
                                    💡 아이디어 제목
                                </label>
                                <input
                                    type="text"
                                    value={ideaTitle}
                                    onChange={(e) => setIdeaTitle(e.target.value)}
                                    placeholder="한 줄로 아이디어를 요약해 주세요"
                                    style={{
                                        width: '100%', padding: '12px 16px',
                                        border: '2px solid #E2E8F0', borderRadius: '14px',
                                        fontSize: '1rem', fontWeight: '700',
                                        outline: 'none', boxSizing: 'border-box',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#A855F7'}
                                    onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                                />
                            </div>

                            {/* 내용 */}
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{
                                    display: 'block', fontSize: '0.85rem', fontWeight: '700',
                                    color: '#1E293B', marginBottom: '6px'
                                }}>
                                    📝 상세 내용
                                </label>
                                <textarea
                                    value={ideaContent}
                                    onChange={(e) => setIdeaContent(e.target.value)}
                                    placeholder="아이디어를 자세히 설명해 주세요. 왜 이 아이디어가 필요한지, 어떻게 실현할 수 있는지 적어보세요!"
                                    style={{
                                        width: '100%', minHeight: '150px',
                                        border: '2px solid #E2E8F0', borderRadius: '14px',
                                        padding: '14px 16px', fontSize: '0.95rem',
                                        lineHeight: '1.7', outline: 'none',
                                        resize: 'vertical', fontFamily: 'inherit',
                                        boxSizing: 'border-box',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#A855F7'}
                                    onBlur={(e) => e.target.style.borderColor = '#E2E8F0'}
                                />
                            </div>

                            {/* 제출 버튼 */}
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={handleSubmitIdea}
                                disabled={submitting}
                                style={{
                                    width: '100%',
                                    padding: '16px',
                                    background: submitting
                                        ? '#D1D5DB'
                                        : 'linear-gradient(135deg, #7C3AED, #A855F7)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '16px',
                                    fontWeight: '900',
                                    fontSize: '1rem',
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 8px 20px rgba(124, 58, 237, 0.3)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {submitting ? '제출 중... ⏳' : myIdea ? '✏️ 아이디어 수정하기' : '🚀 아이디어 제출하기'}
                            </motion.button>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>
        </div>
    );
};


/**
 * 🏛️ 아이디어 상세 보기 + 토론
 */
const IdeaDetailView = ({ idea, meeting, studentSession, onBack, onVote, isMobile }) => {
    const studentId = studentSession?.id;
    const {
        reactions, comments, handleReaction,
        addComment, updateComment, deleteComment, refresh
    } = usePostInteractions(idea.id, studentId);

    const [commentInput, setCommentInput] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState(null);

    const statusStyle = STATUS_COLORS[idea.status] || STATUS_COLORS['제안중'];

    const getVoteCount = (type) => reactions.filter(r => r.reaction_type === type).length;
    const myVote = reactions.find(r => r.student_id === studentId)?.reaction_type;

    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        if (!commentInput.trim() || submittingComment) return;

        setSubmittingComment(true);
        try {
            if (editingCommentId) {
                const success = await updateComment(editingCommentId, commentInput);
                if (success) {
                    setEditingCommentId(null);
                    setCommentInput('');
                    alert('의견이 수정되었습니다! ✨');
                }
            } else {
                const alreadyCommented = comments.some(c => c.student_id === studentId);
                if (alreadyCommented) {
                    alert('의견은 하나만 작성할 수 있어요! 기존 의견을 수정해 주세요! ✍️');
                    setSubmittingComment(false);
                    return;
                }
                const success = await addComment(commentInput);
                if (success) {
                    let pointsAwarded = false;
                    // [수정] RPC를 사용하여 포인트 지급 (중복 수령 방지 로직 추가)
                    if (studentId) {
                        try {
                            const detailReason = `아이디어 마켓에서 토론에 참여했어요! 🏛️ (PostID:${idea.id})`;

                            const { data: existingReward } = await supabase
                                .from('point_logs')
                                .select('id')
                                .eq('student_id', studentId)
                                .eq('reason', detailReason)
                                .maybeSingle();

                            if (!existingReward) {
                                await supabase.rpc('increment_student_points', {
                                    student_id: studentId,
                                    points_to_add: 5,
                                    log_reason: detailReason
                                });
                                pointsAwarded = true;
                            }
                        } catch (ptErr) {
                            console.error('포인트 지급 확인 실패:', ptErr.message);
                        }
                    }
                    setCommentInput('');
                    alert(pointsAwarded ? '의견이 등록되었습니다! (+5P 보너스!) 💬' : '의견이 등록되었습니다! 💬');
                }
            }
        } catch (err) {
            console.error('의견 등록 실패:', err);
        } finally {
            setSubmittingComment(false);
        }
    };

    return (
        <div style={{
            height: '100%', width: '100%',
            maxWidth: isMobile ? '100%' : '650px',
            margin: '0 auto',
            background: '#F8FAFC',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
            {/* 헤더 */}
            <header style={{
                padding: '16px 20px',
                display: 'flex', alignItems: 'center', gap: '12px',
                background: 'white',
                borderBottom: '1px solid #F1F5F9',
                zIndex: 100
            }}>
                <motion.button
                    whileHover={{ x: -3 }}
                    onClick={onBack}
                    style={{
                        background: '#F1F5F9', border: 'none', width: '36px', height: '36px',
                        borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.1rem', color: '#64748B', cursor: 'pointer'
                    }}
                >
                    ‹
                </motion.button>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: '#7C3AED', fontWeight: '600' }}>
                        {meeting?.title}
                    </div>
                    <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#1E293B' }}>
                        {idea.title}
                    </h1>
                </div>
                <span style={{
                    background: statusStyle.bg, color: statusStyle.color,
                    border: `1px solid ${statusStyle.border}`,
                    padding: '3px 10px', borderRadius: '8px',
                    fontSize: '0.7rem', fontWeight: '800'
                }}>
                    {idea.status || '제안중'}
                </span>
            </header>

            {/* 메인 콘텐츠 */}
            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px 16px 100px' : '24px 20px 80px' }}>
                {/* 작성자 정보 */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    marginBottom: '20px'
                }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #EDE9FE, #DDD6FE)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.2rem'
                    }}>
                        💡
                    </div>
                    <div>
                        <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#1E293B' }}>
                            {idea.students?.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                            {new Date(idea.created_at).toLocaleDateString('ko-KR', {
                                year: 'numeric', month: 'long', day: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                            })}
                        </div>
                    </div>
                </div>

                {/* 본문 */}
                <div style={{
                    background: 'white', borderRadius: '20px',
                    padding: '24px', border: '1px solid #E2E8F0',
                    marginBottom: '24px', lineHeight: '1.8',
                    fontSize: '0.95rem', color: '#2D3436',
                    wordBreak: 'break-word'
                }}>
                    {idea.content}
                </div>

                {/* 가이드 질문 답변 */}
                {idea.student_answers?.length > 0 && meeting?.guide_questions?.length > 0 && (
                    <div style={{
                        background: '#F5F3FF', borderRadius: '20px',
                        padding: '20px', border: '1px solid #EDE9FE',
                        marginBottom: '24px'
                    }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: '800', color: '#4C1D95' }}>
                            📌 생각 정리
                        </h4>
                        {meeting.guide_questions.map((q, idx) => (
                            <div key={idx} style={{ marginBottom: idx < meeting.guide_questions.length - 1 ? '16px' : 0 }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#7C3AED', marginBottom: '4px' }}>
                                    Q{idx + 1}. {q}
                                </div>
                                <div style={{
                                    fontSize: '0.9rem', color: '#4C1D95',
                                    background: 'rgba(255,255,255,0.7)', padding: '10px 14px',
                                    borderRadius: '10px', lineHeight: '1.6'
                                }}>
                                    {idea.student_answers[idx] || '(답변 없음)'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 투표 영역 */}
                <div style={{
                    background: 'white', borderRadius: '20px',
                    padding: '20px', border: '1px solid #E2E8F0',
                    marginBottom: '24px'
                }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: '800', color: '#1E293B' }}>
                        🗳️ 투표하기
                    </h4>
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        {VOTE_ICONS.map(vote => {
                            const count = getVoteCount(vote.type);
                            const isMyVote = myVote === vote.type;
                            return (
                                <motion.button
                                    key={vote.type}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => handleReaction(vote.type)}
                                    style={{
                                        flex: 1,
                                        display: 'flex', flexDirection: 'column',
                                        alignItems: 'center', gap: '6px',
                                        padding: '16px 12px', borderRadius: '16px',
                                        border: isMyVote ? `2px solid ${vote.color}` : '1px solid #E2E8F0',
                                        background: isMyVote ? vote.bg : '#FAFAFA',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <span style={{ fontSize: '1.8rem' }}>{vote.emoji}</span>
                                    <span style={{
                                        fontSize: '0.75rem', fontWeight: '700',
                                        color: isMyVote ? vote.color : '#94A3B8'
                                    }}>
                                        {vote.label}
                                    </span>
                                    <span style={{
                                        fontSize: '1.1rem', fontWeight: '900',
                                        color: isMyVote ? vote.color : '#CBD5E1'
                                    }}>
                                        {count}
                                    </span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>

                {/* 토론 섹션 */}
                <div style={{
                    background: 'white', borderRadius: '20px',
                    padding: '20px', border: '1px solid #E2E8F0'
                }}>
                    <h4 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: '800', color: '#1E293B' }}>
                        💬 토론 ({comments.length})
                    </h4>

                    {/* 댓글 목록 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                        {comments.length === 0 ? (
                            <div style={{
                                textAlign: 'center', padding: '30px', color: '#94A3B8',
                                background: '#FAFAFA', borderRadius: '14px',
                                border: '1px dashed #E2E8F0'
                            }}>
                                첫 번째 의견을 남겨주세요! 🙋
                            </div>
                        ) : (
                            comments.map(c => (
                                <div key={c.id} style={{
                                    padding: '14px 16px',
                                    background: c.student_id === studentId ? '#F3E8FF' : '#F8FAFC',
                                    borderRadius: '14px',
                                    border: c.student_id === studentId ? '1px solid #DDD6FE' : '1px solid #F1F5F9'
                                }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', marginBottom: '6px'
                                    }}>
                                        <span style={{
                                            fontWeight: '800', fontSize: '0.85rem',
                                            color: c.student_id === studentId ? '#7C3AED' : '#4C1D95'
                                        }}>
                                            {c.students?.name} {c.student_id === studentId && '(나)'}
                                        </span>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {c.student_id === studentId && (
                                                <button
                                                    onClick={() => {
                                                        setEditingCommentId(c.id);
                                                        setCommentInput(c.content);
                                                    }}
                                                    style={{
                                                        background: 'none', border: 'none',
                                                        color: '#94A3B8', fontSize: '0.75rem',
                                                        cursor: 'pointer', fontWeight: 'bold'
                                                    }}
                                                >수정</button>
                                            )}
                                            {c.student_id === studentId && (
                                                <button
                                                    onClick={async () => {
                                                        if (confirm('정말 삭제할까요?')) {
                                                            const success = await deleteComment(c.id);
                                                            if (success) {
                                                                if (editingCommentId === c.id) {
                                                                    setEditingCommentId(null);
                                                                    setCommentInput('');
                                                                }
                                                            }
                                                        }
                                                    }}
                                                    style={{
                                                        background: 'none', border: 'none',
                                                        color: '#EF4444', fontSize: '0.75rem',
                                                        cursor: 'pointer', fontWeight: 'bold'
                                                    }}
                                                >삭제</button>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.9rem', color: '#2D3436', lineHeight: '1.6' }}>
                                        {c.content}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* 댓글 입력 */}
                    <form onSubmit={handleCommentSubmit} style={{
                        display: 'flex', gap: '10px',
                        background: '#F8FAFC', padding: '8px',
                        borderRadius: '16px',
                        border: editingCommentId ? '2px solid #7C3AED' : '1px solid #E2E8F0'
                    }}>
                        <input
                            type="text"
                            value={commentInput}
                            onChange={(e) => setCommentInput(e.target.value)}
                            placeholder={editingCommentId
                                ? '의견을 수정하고 있어요...'
                                : '이 아이디어에 대한 의견을 남겨주세요 (+5P 보너스!) 💬'}
                            style={{
                                flex: 1, padding: '10px 14px', border: 'none',
                                outline: 'none', fontSize: '0.9rem', color: '#2D3436',
                                background: 'transparent'
                            }}
                        />
                        {editingCommentId && (
                            <button
                                type="button"
                                onClick={() => { setEditingCommentId(null); setCommentInput(''); }}
                                style={{
                                    background: 'none', border: 'none',
                                    color: '#94A3B8', cursor: 'pointer',
                                    fontWeight: 'bold', fontSize: '0.8rem'
                                }}
                            >취소</button>
                        )}
                        <motion.button
                            type="submit"
                            whileTap={{ scale: 0.95 }}
                            disabled={submittingComment || !commentInput.trim()}
                            style={{
                                background: commentInput.trim()
                                    ? 'linear-gradient(135deg, #7C3AED, #A855F7)'
                                    : '#E2E8F0',
                                color: commentInput.trim() ? 'white' : '#94A3B8',
                                border: 'none', borderRadius: '12px',
                                padding: '8px 16px', fontWeight: '800',
                                fontSize: '0.85rem', cursor: commentInput.trim() ? 'pointer' : 'default'
                            }}
                        >
                            {editingCommentId ? '수정' : '보내기'}
                        </motion.button>
                    </form>
                    <div style={{
                        marginTop: '8px', fontSize: '0.7rem', color: '#94A3B8',
                        textAlign: 'center', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: '4px'
                    }}>
                        <span>🛡️</span> <strong>AI 보안관</strong>이 안전한 토론 문화를 위해 24시간 감시 중이에요.
                    </div>
                </div>
            </div>
        </div>
    );
};


export default IdeaMarketPage;
