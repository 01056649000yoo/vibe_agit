import React, { useState, useRef, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useMissionSubmit } from '../../hooks/useMissionSubmit';
import { usePostInteractions } from '../../hooks/usePostInteractions';

const REACTION_ICONS = [
    { type: 'heart', label: '좋아요', emoji: '❤️' },
    { type: 'laugh', label: '재밌어요', emoji: '😂' },
    { type: 'wow', label: '멋져요', emoji: '👏' },
    { type: 'bulb', label: '배워요', emoji: '💡' },
    { type: 'star', label: '최고야', emoji: '✨' }
];

/**
 * 역할: 학생 - 글쓰기 에디터 (단계별 답변 및 본문 삽입 기능 포함) ✨
 */
const StudentWriting = ({ studentSession, missionId, onBack, onNavigate, params }) => {
    const {
        mission,
        title, setTitle,
        content, setContent,
        loading,
        submitting,
        isReturned,
        isConfirmed,
        isSubmitted,
        aiFeedback,
        originalTitle,
        originalContent,
        studentAnswers,
        setStudentAnswers,
        handleSave,
        handleSubmit,
        postId
    } = useMissionSubmit(studentSession, missionId, params, onBack, onNavigate);

    const {
        reactions,
        comments,
        handleReaction,
        addComment,
        updateComment,
        deleteComment
    } = usePostInteractions(postId, studentSession?.id);

    const [commentInput, setCommentInput] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [hoveredType, setHoveredType] = useState(null);

    const [showOriginal, setShowOriginal] = useState(false);
    const editorRef = useRef(null);
    const isMobile = window.innerWidth <= 768;

    // 질문 개수가 변하면 studentAnswers 배열 초기화/유지 로직
    useEffect(() => {
        if (mission?.guide_questions?.length > 0) {
            // 기존 답변이 없거나 질문 개수가 다를 때 초기화 (기본적으로 빈 배열이면 초기화)
            if (studentAnswers.length === 0) {
                setStudentAnswers(new Array(mission.guide_questions.length).fill(''));
            }
        }
    }, [mission?.guide_questions, studentAnswers.length, setStudentAnswers]);

    const handleAnswerChange = (idx, val) => {
        const newAnswers = [...studentAnswers];
        newAnswers[idx] = val;
        setStudentAnswers(newAnswers);
    };

    const insertToBody = (text) => {
        if (!text?.trim()) return;
        const textarea = editorRef.current;

        // 커서 위치에 삽입 로직
        if (!textarea) {
            setContent(prev => prev ? prev + '\n' + text : text);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = content.substring(0, start);
        const after = content.substring(end);

        setContent(before + text + after);

        // 삽입 후 포커스 유지 및 커서 이동
        setTimeout(() => {
            textarea.focus();
            const newPos = start + text.length;
            textarea.setSelectionRange(newPos, newPos);
        }, 0);
    };

    const insertAllToBody = () => {
        const validAnswers = studentAnswers.filter(a => a?.trim());
        if (validAnswers.length === 0) {
            alert('입력된 답변이 없습니다! 질문에 먼저 답을 적어주세요. 😊');
            return;
        }
        const combined = validAnswers.join('\n\n');
        setContent(prev => prev ? prev + '\n\n' + combined : combined);
    };

    // 통계 계산
    const charCount = content.length;
    const paragraphCount = content.split(/\n+/).filter(p => p.trim().length > 0).length;

    // 수정 권한 체크 (이미 제출되었고 다시 쓰기 요청이 없는 경우 수정 불가)
    const isLocked = isConfirmed || (isSubmitted && !isReturned);

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
                }
            } else {
                const alreadyCommented = comments.some(c => c.student_id === studentSession?.id);
                if (alreadyCommented) {
                    alert('댓글은 하나만 작성할 수 있어요! 😊');
                    setSubmittingComment(false);
                    return;
                }
                const success = await addComment(commentInput);
                if (success) setCommentInput('');
            }
        } catch (err) {
            console.error('댓글 작업 실패:', err.message);
        } finally {
            setSubmittingComment(false);
        }
    };

    if (loading) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 도구를 준비하는 중... ✍️</p></Card>;
    if (!mission) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 미션을 찾을 수 없습니다.</p><Button onClick={onBack}>돌아가기</Button></Card>;

    const hasQuestions = mission?.guide_questions?.length > 0;

    return (
        <Card style={{
            maxWidth: hasQuestions ? '1200px' : '850px',
            padding: '32px',
            border: 'none',
            background: '#FFFFFF',
            boxShadow: '0 15px 40px rgba(0,0,0,0.08)',
            margin: '20px auto 40px auto',
            transition: 'all 0.3s ease'
        }}>
            {/* 상단 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <Button variant="ghost" size="sm" onClick={onBack} disabled={submitting}>
                    ⬅️ 나가기
                </Button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        background: '#E3F2FD',
                        color: '#1976D2',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '900',
                        marginBottom: '8px'
                    }}>
                        {mission.genre}
                    </div>
                    <h2 style={{ margin: 0, color: '#263238', fontSize: '1.8rem', fontWeight: '900' }}>{mission.title}</h2>
                </div>
            </div>

            {/* 선생님 피드백/상태 표시 영역 (기존 로직 유지) */}
            <AnimatePresence>
                {isConfirmed ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ background: '#E8F5E9', padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #C8E6C9', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '1.5rem' }}>✅</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#2E7D32', fontSize: '1rem' }}>포인트 지급 완료!</div>
                            <div style={{ fontSize: '0.85rem', color: '#388E3C' }}>선생님이 글을 승인하고 포인트를 선물하셨어요. 축하해요! 🌟</div>
                        </div>
                    </motion.div>
                ) : isSubmitted ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ background: '#E3F2FD', padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '1.5rem' }}>⏳</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#1565C0', fontSize: '1rem' }}>선생님이 확인 중이에요</div>
                            <div style={{ fontSize: '0.85rem', color: '#1976D2' }}>글을 멋지게 제출했어요! 조금만 기다려주세요. ✨</div>
                        </div>
                    </motion.div>
                ) : isReturned && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ background: '#FFF3E0', padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #FFE0B2', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '1.5rem' }}>♻️</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#E65100', fontSize: '1rem' }}>선생님이 다시 쓰기를 요청하셨습니다.</div>
                            <div style={{ fontSize: '0.85rem', color: '#EF6C00', marginBottom: aiFeedback ? '8px' : '0' }}>내용을 보완해서 다시 한번 멋진 글을 완성해볼까요?</div>
                            {aiFeedback && <div style={{ background: 'rgba(255,255,255,0.7)', padding: '20px', borderRadius: '16px', fontSize: '1rem', color: '#444', whiteSpace: 'pre-wrap', lineHeight: '1.8', border: '1px solid rgba(230, 81, 0, 0.2)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)' }}>{aiFeedback}</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 가이드 박스 */}
            <div style={{ background: '#F8F9FA', padding: '24px', borderRadius: '20px', marginBottom: '32px', border: '1px solid #E9ECEF', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ background: '#FFFFFF', padding: '2px 12px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '900', color: '#607D8B', border: '1px solid #E9ECEF' }}>선생님의 가이드 💡</div>
                </div>
                <p style={{ margin: 10, fontSize: '1.05rem', color: '#455A64', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{mission.guide}</p>
            </div>

            {/* 1단계: 생각 일깨우기 (질문 리스트) */}
            {hasQuestions && (
                <div style={{
                    background: '#F0F7FF',
                    padding: isMobile ? '24px 20px' : '40px',
                    borderRadius: '28px',
                    border: '1px solid #D6EAF8',
                    marginBottom: '40px',
                    boxShadow: '0 4px 15px rgba(52, 152, 219, 0.05)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#1565C0', fontWeight: '900', letterSpacing: '-0.5px' }}>🎯 생각 일깨우기</h3>
                            <p style={{ margin: '8px 0 0 0', color: '#546E7A', fontSize: '0.95rem' }}>글을 쓰기 전, 아래 질문들에 답하며 생각을 정리해볼까요?</p>
                        </div>
                        <Button size="sm" onClick={insertAllToBody} style={{ background: '#3498DB', fontWeight: 'bold', padding: '10px 20px', borderRadius: '14px' }}>답변 전체를 본문에 넣기 📥</Button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        {mission.guide_questions.map((q, idx) => (
                            <div key={idx} style={{
                                background: 'white',
                                padding: isMobile ? '20px' : '32px',
                                borderRadius: '24px',
                                border: '1px solid #E3F2FD',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.03)'
                            }}>
                                <div style={{
                                    fontSize: isMobile ? '1.2rem' : '1.35rem',
                                    color: '#2C3E50',
                                    fontWeight: '900',
                                    marginBottom: '18px',
                                    lineHeight: '1.5',
                                    display: 'flex',
                                    gap: '12px'
                                }}>
                                    <span style={{ color: '#3498DB', minWidth: '24px' }}>{idx + 1}.</span>
                                    <span>{q}</span>
                                </div>
                                <textarea
                                    value={studentAnswers[idx] || ''}
                                    onChange={(e) => handleAnswerChange(idx, e.target.value)}
                                    placeholder="여기에 생각을 적어보세요..."
                                    style={{
                                        width: '100%',
                                        minHeight: '120px',
                                        padding: '20px',
                                        borderRadius: '16px',
                                        border: '1px solid #DEE2E6',
                                        fontSize: '1.1rem',
                                        lineHeight: '1.8',
                                        resize: 'none',
                                        background: '#FBFBFB',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#3498DB'}
                                    onBlur={(e) => e.target.style.borderColor = '#DEE2E6'}
                                    disabled={isLocked}
                                />
                                <div style={{ textAlign: 'right', marginTop: '16px' }}>
                                    <button
                                        onClick={() => insertToBody(studentAnswers[idx])}
                                        disabled={isLocked || !studentAnswers[idx]?.trim()}
                                        style={{
                                            background: '#E1F5FE',
                                            color: '#0288D1',
                                            border: 'none',
                                            padding: '8px 20px',
                                            borderRadius: '12px',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            opacity: (isLocked || !studentAnswers[idx]?.trim()) ? 0.5 : 1
                                        }}
                                    >
                                        이 답변만 본문에 넣기 📥
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2단계: 메인 글쓰기 에디터 */}
            <div style={{
                background: '#FFFFFF',
                padding: isMobile ? '32px 20px' : '48px 60px',
                borderRadius: '32px',
                border: '2px solid #F1F3F5',
                position: 'relative',
                marginBottom: '40px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div style={{ borderBottom: '2px solid #3498DB', width: '120px', paddingBottom: '8px' }}>
                        <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1.1rem' }}>✍️ 본격 글쓰기</span>
                    </div>
                    {originalContent && (
                        <button
                            onClick={() => setShowOriginal(!showOriginal)}
                            style={{
                                background: showOriginal ? '#FFFDE7' : '#FFFFFF',
                                color: showOriginal ? '#F57F17' : '#3498DB',
                                border: showOriginal ? '2px solid #FBC02D' : '1px solid #D6EAF8',
                                padding: '10px 18px',
                                borderRadius: '16px',
                                fontSize: '0.95rem',
                                fontWeight: '900',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: showOriginal ? '0 4px 15px rgba(251, 192, 45, 0.2)' : '0 2px 8px rgba(52, 152, 219, 0.1)',
                                transition: 'all 0.2s',
                                zIndex: 20
                            }}
                        >
                            {showOriginal ? '✨ 마지막 글(수정본) 보기' : '📜 나의 처음 글과 비교하기'}
                        </button>
                    )}
                </div>

                <div style={{ position: 'relative' }}>
                    {showOriginal && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.98)', zIndex: 10, display: 'flex', flexDirection: 'column', padding: '0' }}>
                            <div style={{
                                width: '100%',
                                padding: '16px 0',
                                fontSize: isMobile ? '1.5rem' : '2rem',
                                fontWeight: '900',
                                borderBottom: '2px solid #FBC02D',
                                marginBottom: '24px',
                                color: '#2C3E50',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                lineHeight: '1.4'
                            }}>
                                {originalTitle || '제목 없음'}
                                <span style={{ fontSize: '0.9rem', color: '#E67E22', background: '#FFF3E0', padding: '4px 12px', borderRadius: '10px', fontWeight: '900' }}>나의 처음 글</span>
                            </div>
                            <div style={{
                                fontSize: isMobile ? '1.1rem' : '1.25rem',
                                lineHeight: '1.8',
                                color: '#7F8C8D',
                                whiteSpace: 'pre-wrap',
                                flex: 1,
                                overflowY: 'auto',
                                padding: '10px 0'
                            }}>{originalContent || '기록된 내용이 없습니다.'}</div>
                        </div>
                    )}
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="글의 제목을 적어주세요..."
                        style={{
                            width: '100%',
                            padding: '16px 0',
                            fontSize: isMobile ? '1.5rem' : '2rem',
                            fontWeight: '900',
                            border: 'none',
                            borderBottom: '2px solid #F1F3F5',
                            marginBottom: '24px',
                            outline: 'none',
                            color: isLocked ? '#546E7A' : '#2C3E50',
                            background: 'transparent',
                            lineHeight: '1.4'
                        }}
                        disabled={submitting || isLocked}
                    />
                    <textarea
                        ref={editorRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="여기에 자유롭게 이야기를 시작해보세요..."
                        style={{
                            width: '100%',
                            minHeight: '600px',
                            padding: '10px 0',
                            border: 'none',
                            fontSize: isMobile ? '1.1rem' : '1.25rem',
                            lineHeight: '1.8',
                            outline: 'none',
                            color: isLocked ? '#546E7A' : '#444',
                            resize: 'none',
                            background: 'transparent'
                        }}
                        disabled={submitting || isLocked}
                    />
                </div>
            </div>

            {/* [신규] 내 글에 달린 소식 (반응 및 댓글) */}
            <AnimatePresence>
                {isLocked && postId && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            marginTop: '40px',
                            padding: '40px',
                            background: '#F8F9FA',
                            borderRadius: '32px',
                            border: '1px solid #E9ECEF'
                        }}
                    >
                        <h3 style={{ margin: '0 0 24px 0', fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>
                            💬 친구들의 소중한 반응
                        </h3>

                        {/* 반응 버튼들 */}
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            marginBottom: '40px',
                            overflowX: 'visible'
                        }}>
                            {REACTION_ICONS.map((icon) => {
                                const typeReactions = reactions.filter(r => r.reaction_type === icon.type);
                                const isMine = typeReactions.some(r => r.student_id === studentSession?.id);
                                const reactorNames = typeReactions.map(r => r.students?.name).filter(Boolean);

                                return (
                                    <div
                                        key={icon.type}
                                        style={{ flex: 1, position: 'relative' }}
                                        onMouseEnter={() => setHoveredType(icon.type)}
                                        onMouseLeave={() => setHoveredType(null)}
                                    >
                                        <button
                                            onClick={() => handleReaction(icon.type)}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '12px 8px',
                                                border: isMine ? '2px solid #3498DB' : '1px solid #ECEFF1',
                                                background: isMine ? '#E3F2FD' : 'white',
                                                borderRadius: '16px',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <span style={{ fontSize: '1.4rem' }}>{icon.emoji}</span>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: isMine ? '#3498DB' : '#7F8C8D' }}>{icon.label}</span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '900', color: isMine ? '#2980B9' : '#ADB5BD' }}>{typeReactions.length}</span>
                                        </button>

                                        {/* 툴팁 */}
                                        <AnimatePresence>
                                            {hoveredType === icon.type && reactorNames.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                                    style={{
                                                        position: 'absolute',
                                                        bottom: '100%',
                                                        left: '20%',
                                                        marginBottom: '10px',
                                                        background: '#2D3436',
                                                        color: 'white',
                                                        padding: '10px 16px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: '600',
                                                        zIndex: 9999,
                                                        boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                                                        pointerEvents: 'none',
                                                        minWidth: 'max-content',
                                                        maxWidth: '250px',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
                                                            <span style={{ fontSize: '0.9rem' }}>👥</span>
                                                            <span style={{ color: '#BDC3C7', fontSize: '0.7rem' }}>반응을 보낸 친구들</span>
                                                        </div>
                                                        <div style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
                                                            {(() => {
                                                                const chunks = [];
                                                                for (let i = 0; i < reactorNames.length; i += 5) {
                                                                    chunks.push(reactorNames.slice(i, i + 5).join(', '));
                                                                }
                                                                return chunks.join(',\n');
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div style={{ position: 'absolute', top: '100%', left: '20px', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #2D3436' }} />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>

                        {/* 댓글 리스트 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {comments.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#B2BEC3', padding: '40px', background: 'white', borderRadius: '24px', border: '2px dashed #F1F3F5' }}>
                                    아직 친구들의 댓글이 없어요. 🌵
                                </div>
                            ) : (
                                comments.map(c => (
                                    <div key={c.id} style={{ padding: '20px', background: (c.student_id === studentSession?.id) ? '#E3F2FD' : 'white', borderRadius: '20px', border: '1px solid #F1F3F5', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <div style={{ fontWeight: '900', fontSize: '0.9rem', color: (c.student_id === studentSession?.id) ? '#1976D2' : '#3498DB' }}>
                                                {c.students?.name} {c.student_id === studentSession?.id && '(나)'}
                                            </div>
                                            {(c.student_id === studentSession?.id) && (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => { setEditingCommentId(c.id); setCommentInput(c.content); }} style={{ background: 'none', border: 'none', color: '#7F8C8D', fontSize: '0.8rem', cursor: 'pointer' }}>수정</button>
                                                    <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', color: '#E74C3C', fontSize: '0.8rem', cursor: 'pointer' }}>삭제</button>
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '1.05rem', color: '#2D3436', lineHeight: '1.6' }}>{c.content}</div>
                                    </div>
                                ))
                            )}

                            {/* 댓글 입력창 (내 글이지만 나도 댓글 달 수 있게 하거나, 혹은 보기만 하거나 선택 가능) */}
                            <form onSubmit={handleCommentSubmit} style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                <input
                                    type="text"
                                    value={commentInput}
                                    onChange={e => setCommentInput(e.target.value)}
                                    placeholder="친구들에게 답글을 남겨보세요... ✨"
                                    style={{ flex: 1, padding: '14px 20px', borderRadius: '16px', border: '2px solid #F1F3F5', outline: 'none' }}
                                />
                                <Button type="submit" disabled={submittingComment}>{editingCommentId ? '수정' : '보내기'}</Button>
                            </form>
                            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#95A5A6', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <span>🛡️</span> <strong>AI 보안관</strong>이 안전한 댓글 문화를 위해 24시간 감시 중이에요.
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 통계 및 보너스 현황 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: '#FFFDE7', borderRadius: '20px', marginBottom: '32px', border: '1px solid #FFF59D' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: '#8D6E63', marginBottom: '4px' }}>글자수</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: charCount >= mission.min_chars ? '#2E7D32' : '#F44336' }}>{charCount} / {mission.min_chars}</div>
                    </div>
                    <div style={{ width: '1px', background: '#FFE082' }} />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: '#8D6E63', marginBottom: '4px' }}>문단수</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: paragraphCount >= mission.min_paragraphs ? '#2E7D32' : '#F44336' }}>{paragraphCount} / {mission.min_paragraphs}</div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    {charCount >= mission.bonus_threshold ? (
                        <div style={{ color: '#E65100', fontWeight: '900', fontSize: '1rem' }}>🔥 보너스 달성 완료! (+{mission.bonus_reward}P)</div>
                    ) : (
                        <div style={{ color: '#795548', fontSize: '0.9rem' }}><strong style={{ color: '#E65100' }}>{mission.bonus_threshold}자</strong>를 넘기면 보너스 점수가 있어요!</div>
                    )}
                </div>
            </div>

            {/* 저장 및 제출 버튼 */}
            <div style={{ display: 'flex', gap: '12px' }}>
                <Button size="lg" onClick={() => handleSave(true)} disabled={submitting || isLocked} style={{ flex: 1, height: '64px', fontSize: '1.2rem', fontWeight: '800', background: isLocked ? '#F1F3F5' : '#ECEFF1', color: isLocked ? '#BDC3C7' : '#455A64', border: 'none' }}>
                    {isLocked ? '수정 불가 🔒' : '임시 저장 💾'}
                </Button>
                <Button size="lg" onClick={handleSubmit} disabled={submitting || isLocked} style={{ flex: 2, height: '64px', fontSize: '1.3rem', fontWeight: '900', background: isLocked ? '#B0BEC5' : 'var(--primary-color)', color: 'white', border: 'none' }}>
                    {submitting ? '제출 중...' : isConfirmed ? '승인 완료 ✨' : (isSubmitted && isReturned) ? '수정해서 다시 제출! 🚀' : (isSubmitted && !isReturned) ? '확인 대기 중...' : '멋지게 제출하기! 🚀'}
                </Button>
            </div>
        </Card>
    );
};

export default StudentWriting;
