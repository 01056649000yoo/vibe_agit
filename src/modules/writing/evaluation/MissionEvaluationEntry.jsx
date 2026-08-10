import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Button from '../../../components/common/Button';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import { supabase } from '../../../lib/supabaseClient';
import { useEvaluation } from '../../../hooks/useEvaluation';
import { formatKoreanGradeBand, resolveKoreanStandards } from './koreanAchievementStandards';

const hasEvaluation = (post) => post?.final_eval != null || post?.initial_eval != null;

const MissionEvaluationEntry = ({ mission, activeClass, isMobile, onClose, onSaved }) => {
    const { saveEvaluation, loading: saving } = useEvaluation();
    const [posts, setPosts] = useState([]);
    const [selectedPostId, setSelectedPostId] = useState(null);
    const [score, setScore] = useState(null);
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(true);

    const selectedPost = useMemo(
        () => posts.find((post) => post.id === selectedPostId) || null,
        [posts, selectedPostId]
    );
    const curriculum = mission?.evaluation_rubric?.curriculum;
    const standards = resolveKoreanStandards(
        curriculum?.achievement_standard_codes,
        curriculum
    );
    const levels = mission?.evaluation_rubric?.levels || [];
    const evaluatedCount = posts.filter(hasEvaluation).length;

    useEffect(() => {
        let isMounted = true;

        const fetchPosts = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, title, content, student_id, initial_eval, final_eval, eval_comment, is_submitted, students!inner(id, name, class_id)')
                .eq('mission_id', mission.id)
                .eq('is_submitted', true)
                // 학급은 student_posts.class_id 로 직접 좁힌다 (students 경유 금지).
                .eq('class_id', activeClass.id)
                .is('students.deleted_at', null);

            if (!isMounted) return;
            if (error) {
                console.error('평가 대상 글 로드 실패:', error.message);
                alert('평가할 학생 글을 불러오지 못했습니다.');
                setPosts([]);
            } else {
                const sortedPosts = [...(data || [])].sort((a, b) => (
                    (a.students?.name || '').localeCompare(b.students?.name || '', 'ko')
                ));
                setPosts(sortedPosts);
                const firstPost = sortedPosts[0] || null;
                setSelectedPostId(firstPost?.id || null);
                setScore(firstPost?.final_eval ?? firstPost?.initial_eval ?? null);
                setComment(firstPost?.eval_comment || '');
            }
            setLoading(false);
        };

        fetchPosts();
        return () => {
            isMounted = false;
        };
    }, [activeClass.id, mission.id]);

    const selectPost = (post) => {
        setSelectedPostId(post?.id || null);
        setScore(post?.final_eval ?? post?.initial_eval ?? null);
        setComment(post?.eval_comment || '');
    };

    const handleSave = async () => {
        if (!selectedPost) return;
        if (score == null) {
            alert('평가결과가 없습니다. 평가결과를 입력해주세요.');
            return;
        }

        const result = await saveEvaluation(selectedPost.id, {
            initial_eval: selectedPost.initial_eval,
            final_eval: score,
            eval_comment: comment.trim()
        });

        if (!result.success) {
            alert('평가 결과 저장에 실패했습니다.');
            return;
        }

        const updatedPosts = posts.map((post) => (
            post.id === selectedPost.id
                ? { ...post, final_eval: score, eval_comment: comment.trim() }
                : post
        ));
        setPosts(updatedPosts);
        onSaved?.();

        const nextPost = updatedPosts.find((post) => !hasEvaluation(post));
        if (nextPost) {
            selectPost(nextPost);
        } else {
            alert('모든 제출 글의 평가결과를 입력했습니다. ✨');
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 2600, background: 'rgba(15, 23, 42, 0.58)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0' : '24px'
        }} onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                onClick={(event) => event.stopPropagation()}
                style={{
                    width: '100%', maxWidth: '1180px', height: isMobile ? '100%' : 'min(90vh, 860px)',
                    background: 'white', borderRadius: isMobile ? 0 : '28px', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(15, 23, 42, 0.25)'
                }}
            >
                <header style={{
                    padding: isMobile ? '16px' : '20px 26px', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px'
                }}>
                    <div style={{ minWidth: 0 }}>
                        <h3 style={{ margin: 0, color: '#1E293B', fontSize: isMobile ? '1.05rem' : '1.3rem' }}>🎯 평가결과 입력</h3>
                        <div style={{ marginTop: '4px', color: '#64748B', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {mission.title} · 평가 {evaluatedCount}/{posts.length}명
                        </div>
                    </div>
                    <ModalCloseButton onClick={onClose} label="평가결과 입력 닫기" />
                </header>

                {standards.length > 0 && (
                    <div style={{ padding: '10px 26px', background: '#EEF2FF', color: '#4338CA', fontSize: '0.78rem', lineHeight: 1.5 }}>
                        <strong>{formatKoreanGradeBand(curriculum)} 성취기준:</strong>{' '}
                        {standards.map((standard) => `[${standard.code}] ${standard.description}`).join(' · ')}
                    </div>
                )}

                <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '260px 1fr' }}>
                    {!isMobile && (
                        <aside style={{ overflowY: 'auto', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', padding: '12px' }}>
                            {posts.map((post) => (
                                <button
                                    key={post.id}
                                    type="button"
                                    onClick={() => selectPost(post)}
                                    style={{
                                        width: '100%', padding: '11px 12px', marginBottom: '7px', borderRadius: '12px',
                                        border: selectedPostId === post.id ? '1px solid #6366F1' : '1px solid transparent',
                                        background: selectedPostId === post.id ? 'white' : 'transparent', cursor: 'pointer',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left'
                                    }}
                                >
                                    <span style={{ color: '#334155', fontWeight: '800' }}>{post.students?.name}</span>
                                    <span style={{ color: hasEvaluation(post) ? '#15803D' : '#B45309', fontSize: '0.68rem', fontWeight: '900' }}>
                                        {hasEvaluation(post) ? '평가완료' : '입력 필요'}
                                    </span>
                                </button>
                            ))}
                        </aside>
                    )}

                    <main style={{ overflowY: 'auto', padding: isMobile ? '16px' : '24px 30px' }}>
                        {loading ? (
                            <div style={{ padding: '80px', textAlign: 'center', color: '#94A3B8' }}>평가 대상을 불러오는 중입니다...</div>
                        ) : !selectedPost ? (
                            <div style={{ padding: '80px', textAlign: 'center', color: '#94A3B8' }}>제출한 학생 글이 없습니다.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {isMobile && (
                                    <select
                                        value={selectedPostId || ''}
                                        onChange={(event) => selectPost(posts.find((post) => post.id === event.target.value))}
                                        style={{ padding: '12px', borderRadius: '12px', border: '1px solid #CBD5E1', fontWeight: '800' }}
                                    >
                                        {posts.map((post) => (
                                            <option key={post.id} value={post.id}>
                                                {post.students?.name} · {hasEvaluation(post) ? '평가완료' : '입력 필요'}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                <div>
                                    <div style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: '800', marginBottom: '5px' }}>{selectedPost.students?.name} 학생</div>
                                    <h4 style={{ margin: 0, color: '#1E293B', fontSize: '1.15rem' }}>{selectedPost.title || '제목 없음'}</h4>
                                </div>

                                <div style={{ padding: '20px', borderRadius: '18px', background: '#F8FAFC', border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#334155' }}>
                                    {selectedPost.content}
                                </div>

                                <section>
                                    <div style={{ marginBottom: '9px', color: '#1E293B', fontWeight: '900' }}>평가 결과 *</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {levels.map((level) => (
                                            <button
                                                key={level.score}
                                                type="button"
                                                onClick={() => setScore(level.score)}
                                                style={{
                                                    padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: '900',
                                                    border: score === level.score ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                                                    background: score === level.score ? '#EEF2FF' : 'white',
                                                    color: score === level.score ? '#4338CA' : '#64748B'
                                                }}
                                            >
                                                {level.label} ({level.score}점)
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                <label>
                                    <span style={{ display: 'block', marginBottom: '8px', color: '#1E293B', fontWeight: '900' }}>교사 평가 의견</span>
                                    <textarea
                                        value={comment}
                                        onChange={(event) => setComment(event.target.value)}
                                        placeholder="성취기준과 연결된 관찰 근거를 남겨주세요."
                                        style={{ width: '100%', minHeight: '100px', boxSizing: 'border-box', padding: '14px', borderRadius: '14px', border: '1px solid #CBD5E1', resize: 'vertical', fontFamily: 'inherit' }}
                                    />
                                </label>

                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button onClick={handleSave} disabled={saving} style={{ background: '#4F46E5', color: 'white', fontWeight: '900', padding: '12px 24px' }}>
                                        {saving ? '저장 중...' : '평가결과 저장'}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </motion.div>
        </div>
    );
};

export default MissionEvaluationEntry;
