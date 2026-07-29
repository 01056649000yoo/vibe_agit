import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../common/ModalPortal';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';
import {
    calculateReaderScore,
    getReaderLevel,
    getWriterLevel,
    READER_LEVELS,
    WRITER_LEVELS
} from '../../constants/writerLevels';

const MyShelfPostDetail = lazy(() => import('./MyShelfPostDetail'));

/**
 * 나의 아지트 — 학생이 자기 것을 모아 보는 공간.
 *
 * 그동안 내 정보는 헤더 버튼(소식·발자국), 놀이터 오버레이, 홈 카드로 흩어져 있었고,
 * 정작 "내 공간"을 통째로 보는 화면은 없었다. 남의 공간은 친구 아지트에서 볼 수 있는데도.
 * 여기서 칭호·서재·드래곤·놀이터를 한 자리에 놓고, 친구 아지트와 짝을 맞춘다.
 *
 * 드래곤과 놀이터는 대시보드 상태(펫·모듈)에 묶여 있어 별도 페이지로 뺄 수 없다.
 * 그래서 놀이터처럼 대시보드 안의 오버레이로 둔다.
 */

const INK = '#3E2E23';
const INK_SOFT = '#8D7B6C';
const LINE = 'rgba(62,46,35,.10)';
const SHELF_TTL_MS = 30000;
const READER_ACTIVITY_LIMIT = 1000;

const num = (v) => Number(v || 0).toLocaleString('ko-KR');

const typeLabel = (post) => {
    if (post.writing_context === 'self') {
        return post.self_writing_type === 'reading_log' ? '📚 독서록' : '✏️ 자유글';
    }
    return '📝 과제';
};

const Row = ({ icon, title, desc, right, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{
            display: 'flex', alignItems: 'center', gap: '13px', width: '100%',
            padding: '15px 16px', border: `1px solid ${LINE}`, borderRadius: '18px',
            background: 'white', cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box'
        }}
    >
        <span aria-hidden="true" style={{ fontSize: '1.7rem' }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 900, color: INK, fontSize: '.98rem' }}>{title}</span>
            {desc && <span style={{ display: 'block', marginTop: '2px', fontSize: '.8rem', color: INK_SOFT, fontWeight: 700 }}>{desc}</span>}
        </span>
        {right && <span style={{ fontSize: '.8rem', fontWeight: 900, color: '#2a78d6', whiteSpace: 'nowrap' }}>{right}</span>}
    </button>
);

const BadgeButton = ({ kind, badgeSrc, level, loading, errorMessage, onClick }) => {
    const writer = kind === 'writer';
    const accent = writer ? '#C77712' : '#2768B7';
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${writer ? '작가' : '독자'} 칭호 설명 보기`}
            style={{
                position: 'relative', minWidth: 0, padding: '2px 4px 6px', border: 'none', borderRadius: '18px',
                background: 'transparent', cursor: 'pointer', color: INK, fontFamily: 'inherit'
            }}
        >
            <span style={{ position: 'relative', display: 'inline-block' }}>
                <img src={badgeSrc} alt="" aria-hidden="true" width="76" height="76"
                    style={{ display: 'block', width: '76px', height: '76px', objectFit: 'contain', filter: 'drop-shadow(0 5px 7px rgba(62,46,35,.14))' }} />
                {!loading && !errorMessage && (
                    <span style={{
                        position: 'absolute', right: '-2px', bottom: '2px', minWidth: '29px', height: '29px', padding: '0 4px',
                        display: 'grid', placeItems: 'center', boxSizing: 'border-box', borderRadius: '99px',
                        background: '#FFFFFF', border: `2px solid ${accent}`, color: accent, fontSize: '.68rem', fontWeight: 950,
                        boxShadow: '0 2px 6px rgba(62,46,35,.16)'
                    }}>L{level.level}</span>
                )}
            </span>
            <span style={{ display: 'block', marginTop: '1px', color: INK_SOFT, fontSize: '.68rem', fontWeight: 900 }}>
                {writer ? '작가 칭호' : '독자 칭호'}
            </span>
            <span style={{ display: 'block', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: INK, fontSize: '.88rem', fontWeight: 950 }}>
                {loading ? '살펴보는 중...' : errorMessage ? '확인 필요' : level.name}
            </span>
        </button>
    );
};

const titleRequirement = (kind, item) => {
    if (item.from === 0) return '시작';
    if (kind === 'writer' && item.criterion === 'posts') return `승인 글 ${num(item.from)}편`;
    return `${num(item.from)}${kind === 'writer' ? '자' : '점'}`;
};

const TitleGuide = ({ kind, currentLevel, currentValue, currentUnit, onClose }) => {
    if (!kind) return null;
    const writer = kind === 'writer';
    const levels = writer ? WRITER_LEVELS : READER_LEVELS;
    const badgeSrc = writer ? '/assets/title-badges/writer-badge.png' : '/assets/title-badges/reader-badge.png';
    const accent = writer ? '#C77712' : '#2768B7';

    return (
        <ModalPortal>
            <div onClick={onClose} role="presentation" style={{
                position: 'fixed', inset: 0, zIndex: 3600, display: 'grid', placeItems: 'center', padding: '18px',
                background: 'rgba(45,32,24,.58)', backdropFilter: 'blur(5px)'
            }}>
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-label={`${writer ? '작가' : '독자'} 칭호 단계 설명`}
                    onClick={(event) => event.stopPropagation()}
                    style={{
                        width: 'min(440px,100%)', maxHeight: '84vh', overflowY: 'auto', borderRadius: '26px',
                        background: '#FFFDF7', boxShadow: '0 24px 60px rgba(45,32,24,.3)'
                    }}
                >
                    <header style={{
                        position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '16px 18px 13px', background: 'rgba(255,253,247,.96)', borderBottom: `1px solid ${LINE}`
                    }}>
                        <img src={badgeSrc} alt="" aria-hidden="true" width="62" height="62" style={{ width: '62px', height: '62px', objectFit: 'contain' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: INK_SOFT, fontSize: '.7rem', fontWeight: 900 }}>{writer ? '✍️ 작가 칭호' : '📖 독자 칭호'}</div>
                            <h3 style={{ margin: '2px 0 0', color: INK, fontSize: '1.08rem', fontWeight: 950 }}>{currentLevel.name}</h3>
                            <div style={{ marginTop: '2px', color: accent, fontSize: '.72rem', fontWeight: 900 }}>LV. {currentLevel.level} · {num(currentValue)}{currentUnit}</div>
                        </div>
                        <button type="button" onClick={onClose} aria-label="칭호 설명 닫기"
                            style={{ alignSelf: 'flex-start', border: 'none', background: 'none', color: INK_SOFT, cursor: 'pointer', fontSize: '1.35rem' }}>✕</button>
                    </header>

                    <div style={{ padding: '14px 18px 20px' }}>
                        <p style={{ margin: '0 0 13px', color: INK_SOFT, fontSize: '.78rem', fontWeight: 750, lineHeight: 1.55 }}>
                            {writer
                                ? '승인된 글을 한 편 완성하면 첫 칭호가 열리고, 그다음부터는 지금까지 쓴 글자 수로 성장해요.'
                                : '친구의 서로 다른 글에 공감하거나 댓글을 남기면 1점, 댓글은 20자마다 보너스 1점이 붙어요. 한 글에서는 최대 4점까지 얻어요.'}
                        </p>
                        <div style={{ display: 'grid', gap: '7px' }}>
                            {levels.map((item) => {
                                const current = item.level === currentLevel.level;
                                const achieved = item.level <= currentLevel.level;
                                return (
                                    <div key={item.level} style={{
                                        display: 'grid', gridTemplateColumns: '34px minmax(0,1fr) auto', alignItems: 'center', gap: '9px',
                                        padding: '9px 11px', borderRadius: '13px', background: current ? `${accent}12` : '#FFFFFF',
                                        border: current ? `1.5px solid ${accent}70` : `1px solid ${LINE}`
                                    }}>
                                        <span style={{
                                            width: '30px', height: '30px', display: 'grid', placeItems: 'center', borderRadius: '10px',
                                            background: achieved ? `${accent}18` : '#F3F0EB', fontSize: '.95rem'
                                        }}>{achieved ? item.emoji : '🔒'}</span>
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: 'block', color: INK, fontSize: '.8rem', fontWeight: current ? 950 : 850 }}>
                                                LV.{item.level} {item.name}
                                            </span>
                                            {current && <span style={{ display: 'block', marginTop: '1px', color: accent, fontSize: '.64rem', fontWeight: 900 }}>지금 나의 칭호</span>}
                                        </span>
                                        <span style={{ color: achieved ? accent : INK_SOFT, fontSize: '.69rem', fontWeight: 900, whiteSpace: 'nowrap' }}>
                                            {titleRequirement(kind, item)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </div>
        </ModalPortal>
    );
};

const MyAgitPanel = ({
    isOpen, onClose, studentSession, points = 0,
    writerStats, writerLevel
}) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const studentId = studentSession?.id;

    const [shelf, setShelf] = useState([]);
    const [loading, setLoading] = useState(true);
    const [readerActivity, setReaderActivity] = useState({ score: 0, postCount: 0 });
    const [readerLoading, setReaderLoading] = useState(true);
    const [readerError, setReaderError] = useState('');
    const [activeTitleGuide, setActiveTitleGuide] = useState(null);
    const [selectedSummary, setSelectedSummary] = useState(null);
    const [selectedPost, setSelectedPost] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const selectedSummaryRef = useRef(null);

    useEffect(() => {
        if (!activeTitleGuide) return undefined;
        const closeOnEscape = (event) => {
            if (event.key === 'Escape') setActiveTitleGuide(null);
        };
        window.addEventListener('keydown', closeOnEscape);
        return () => window.removeEventListener('keydown', closeOnEscape);
    }, [activeTitleGuide]);

    const load = useCallback(async () => {
        if (!classId || !studentId) return;
        setLoading(true);
        try {
            const rows = await dataCache.get(
                classKey(classId, 'my-shelf', { student: studentId }),
                async () => {
                    const { data, error } = await supabase
                        .from('student_posts')
                        .select('id, title, mission_id, writing_context, self_writing_type, char_count, visibility, created_at, updated_at')
                        .eq('class_id', classId)
                        .eq('student_id', studentId)
                        .eq('is_submitted', true)
                        .order('created_at', { ascending: false })
                        .limit(60);
                    if (error) throw error;
                    return data || [];
                },
                SHELF_TTL_MS
            );
            setShelf(rows);
        } catch (error) {
            console.error('내 서재 로드 실패:', error.message);
            setShelf([]);
        }
        setLoading(false);
    }, [classId, studentId]);

    const loadReaderActivity = useCallback(async () => {
        if (!classId || !studentId) return;
        setReaderLoading(true);
        setReaderError('');
        try {
            const activity = await dataCache.get(
                classKey(classId, 'my-reader-title', { student: studentId }),
                async () => {
                    const { data: rpcData, error: rpcError } = await supabase.rpc('get_my_reader_title');
                    if (!rpcError && rpcData) {
                        return {
                            score: Number(rpcData.score || 0),
                            postCount: Number(rpcData.post_count || 0)
                        };
                    }

                    // 앱 배포와 운영 SQL 적용 사이에도 화면을 비우지 않는다.
                    // 함수가 아직 없으면 같은 학급·본인 직접 필터와 상한을 둔 조회로 임시 계산한다.
                    if (rpcError && !['PGRST202', '42883'].includes(rpcError.code)) {
                        console.warn('독자 칭호 RPC 폴백:', rpcError.message);
                    }
                    const [commentResult, reactionResult, ownPostResult] = await Promise.all([
                        supabase
                            .from('post_comments')
                            .select('post_id, content, created_at')
                            .eq('class_id', classId)
                            .eq('student_id', studentId)
                            .eq('status', 'approved')
                            .order('created_at', { ascending: false })
                            .limit(READER_ACTIVITY_LIMIT),
                        supabase
                            .from('post_reactions')
                            .select('post_id, created_at')
                            .eq('class_id', classId)
                            .eq('student_id', studentId)
                            .order('created_at', { ascending: false })
                            .limit(READER_ACTIVITY_LIMIT),
                        supabase
                            .from('student_posts')
                            .select('id, created_at')
                            .eq('class_id', classId)
                            .eq('student_id', studentId)
                            .order('created_at', { ascending: false })
                            .limit(READER_ACTIVITY_LIMIT)
                    ]);

                    if (commentResult.error) throw commentResult.error;
                    if (reactionResult.error) throw reactionResult.error;
                    if (ownPostResult.error) throw ownPostResult.error;

                    return calculateReaderScore({
                        comments: commentResult.data || [],
                        reactions: reactionResult.data || [],
                        ownPostIds: (ownPostResult.data || []).map((post) => post.id)
                    });
                },
                SHELF_TTL_MS
            );
            setReaderActivity(activity);
        } catch (error) {
            console.error('독자 칭호 로드 실패:', error.message);
            setReaderError('잠시 후 나의 아지트를 다시 열어 주세요.');
        } finally {
            setReaderLoading(false);
        }
    }, [classId, studentId]);

    const openShelfPost = useCallback(async (summary, forceRefresh = false) => {
        if (!summary?.id || !classId || !studentId) return;

        if (!selectedSummaryRef.current) {
            window.history.pushState({ studentPage: 'main', overlay: 'my-shelf-detail' }, '');
        }
        selectedSummaryRef.current = summary;
        setSelectedSummary(summary);
        setSelectedPost(null);
        setDetailError('');
        setDetailLoading(true);

        const detailKey = classKey(classId, 'my-shelf-detail', { student: studentId, post: summary.id });
        if (forceRefresh) dataCache.invalidate(detailKey);

        try {
            const detail = await dataCache.get(detailKey, async () => {
                const [postResult, reviewResult] = await Promise.all([
                    supabase
                        .from('student_posts')
                        .select('id, title, content, mission_id, writing_context, self_writing_type, char_count, visibility, created_at, updated_at, structured_content, ai_feedback, original_title, original_content, is_confirmed')
                        .eq('class_id', classId)
                        .eq('student_id', studentId)
                        .eq('id', summary.id)
                        .eq('is_submitted', true)
                        .maybeSingle(),
                    supabase
                        .from('reading_log_teacher_reviews')
                        .select('post_id, review_status, teacher_comment, reviewed_at')
                        .eq('class_id', classId)
                        .eq('student_id', studentId)
                        .eq('post_id', summary.id)
                        .maybeSingle()
                ]);

                if (postResult.error) throw postResult.error;
                if (!postResult.data) throw new Error('글을 찾지 못했어요.');
                if (reviewResult.error) throw reviewResult.error;

                let mission = null;
                if (postResult.data.mission_id) {
                    const { data: missionData, error: missionError } = await supabase
                        .from('writing_missions')
                        .select('id, title, is_archived, mission_type, input_template')
                        .eq('class_id', classId)
                        .eq('id', postResult.data.mission_id)
                        .maybeSingle();
                    if (missionError) throw missionError;
                    mission = missionData || null;
                }

                return {
                    ...postResult.data,
                    mission,
                    teacherReview: reviewResult.data || null
                };
            }, SHELF_TTL_MS);

            setSelectedPost(detail);
        } catch (error) {
            console.error('내 서재 글 상세 로드 실패:', error.message);
            setDetailError('글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        } finally {
            setDetailLoading(false);
        }
    }, [classId, studentId]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const timerId = window.setTimeout(() => {
            load();
            loadReaderActivity();
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [isOpen, load, loadReaderActivity]);

    // 화면을 덮는 판이라 뒤로가기로 닫히게 한다.
    // onClose 는 부모에서 인라인 화살표로 넘어와 **매 렌더 새 함수**다.
    // 이걸 의존성에 두면 부모가 리렌더될 때마다 effect 가 다시 돌아 pushState 가 쌓이고,
    // 뒤로가기를 여러 번 눌러야 닫히게 된다. ref 에 담아 두고 isOpen 에만 반응시킨다.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        window.history.pushState({ studentPage: 'main', overlay: 'my-agit' }, '');
        const closeOnBack = () => {
            if (selectedSummaryRef.current) {
                selectedSummaryRef.current = null;
                setSelectedSummary(null);
                setSelectedPost(null);
                setDetailError('');
                return;
            }
            onCloseRef.current?.();
        };
        window.addEventListener('popstate', closeOnBack);
        return () => window.removeEventListener('popstate', closeOnBack);
    }, [isOpen]);

    const counts = useMemo(() => ({
        posts: shelf.filter((p) => p.writing_context !== 'self').length,
        readingLogs: shelf.filter((p) => p.self_writing_type === 'reading_log').length,
        free: shelf.filter((p) => p.writing_context === 'self' && p.self_writing_type !== 'reading_log').length
    }), [shelf]);

    const totalChars = writerStats?.totalChars || 0;
    const completedPosts = writerStats?.completedPosts ?? writerStats?.completedMissions ?? 0;
    const writerTitle = writerLevel || getWriterLevel(totalChars, completedPosts);
    const readerTitle = getReaderLevel(readerActivity.score);

    if (!isOpen) return null;

    return (
        <ModalPortal>
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                transition={{ type: 'spring', damping: 26, stiffness: 210 }}
                style={{
                    position: 'fixed', inset: 0, zIndex: 3100, overflowY: 'auto',
                    background: 'linear-gradient(180deg,#FFFDF5 0%,#FFF8E1 100%)'
                }}
            >
                <div style={{ width: 'min(560px, 100%)', margin: '0 auto', padding: '18px 18px 90px' }}>
                    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: INK }}>🏡 나의 아지트</h2>
                        <button type="button" onClick={onClose} aria-label="닫기"
                            style={{ border: 'none', background: 'none', fontSize: '1.5rem', color: INK_SOFT, cursor: 'pointer' }}>✕</button>
                    </header>

                    {/* 칭호 — 긴 상태표 대신 프로필에 다는 두 개의 훈장으로 보여 준다. */}
                    <section aria-label="나의 작가·독자 칭호" style={{
                        padding: '15px 16px 13px', borderRadius: '22px', border: '1px solid #FFE082',
                        background: 'linear-gradient(135deg,#FFF8E1,#FFFFFF)', marginBottom: '14px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <div>
                                <div style={{ fontSize: '1.02rem', fontWeight: 950, color: INK }}>{studentSession?.name}의 두 가지 칭호</div>
                                <div style={{ marginTop: '3px', fontSize: '.7rem', fontWeight: 800, color: INK_SOFT }}>뱃지를 눌러 성장 단계를 봐요.</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FBC02D', lineHeight: 1.1 }}>
                                    {num(points)}<span style={{ fontSize: '.85rem', color: INK_SOFT }}>P</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px', marginTop: '10px' }}>
                            <BadgeButton
                                kind="writer"
                                badgeSrc="/assets/title-badges/writer-badge.png"
                                level={writerTitle}
                                onClick={() => setActiveTitleGuide('writer')}
                            />
                            <BadgeButton
                                kind="reader"
                                badgeSrc="/assets/title-badges/reader-badge.png"
                                level={readerTitle}
                                loading={readerLoading}
                                errorMessage={readerError}
                                onClick={() => setActiveTitleGuide('reader')}
                            />
                        </div>
                    </section>

                    {/* 내 서재 */}
                    <section aria-label="내 서재" style={{
                        padding: '16px 18px', borderRadius: '22px', border: `1px solid ${LINE}`,
                        background: 'white', marginBottom: '14px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: INK }}>📖 내 서재</h3>
                            <span style={{ fontSize: '.76rem', fontWeight: 800, color: INK_SOFT }}>
                                과제 {counts.posts} · 독서록 {counts.readingLogs}{counts.free ? ` · 자유글 ${counts.free}` : ''}
                            </span>
                        </div>

                        {loading ? (
                            <p style={{ padding: '28px 0', textAlign: 'center', color: INK_SOFT, fontWeight: 800 }}>책을 꽂는 중... 📚</p>
                        ) : shelf.length === 0 ? (
                            <p style={{ padding: '28px 0', textAlign: 'center', color: INK_SOFT, fontWeight: 800 }}>
                                아직 꽂힌 책이 없어요. 글을 쓰면 여기 쌓여요!
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '260px', overflowY: 'auto' }}>
                                {shelf.map((post) => (
                                    <button
                                        key={post.id}
                                        type="button"
                                        onClick={() => openShelfPost(post)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                                            padding: '10px 12px', border: `1px solid ${LINE}`, borderRadius: '13px',
                                            background: '#FCFBF7', cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box'
                                        }}
                                    >
                                        <span style={{ fontSize: '.72rem', fontWeight: 900, color: INK_SOFT, whiteSpace: 'nowrap' }}>
                                            {typeLabel(post)}
                                        </span>
                                        <span style={{
                                            flex: 1, minWidth: 0, fontSize: '.88rem', fontWeight: 800, color: INK,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {post.title || '제목 없는 글'}
                                        </span>
                                        {post.visibility !== 'class' && (
                                            <span style={{ fontSize: '.7rem', fontWeight: 800, color: INK_SOFT }}>🔒</span>
                                        )}
                                        <span aria-hidden="true" style={{ color: '#B0BEC5', fontWeight: 900 }}>›</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                </div>

                {selectedSummary && (
                    <Suspense fallback={(
                        <div style={{ position: 'fixed', inset: 0, zIndex: 3200, display: 'grid', placeItems: 'center', background: '#F8FBFF', color: INK_SOFT, fontWeight: 900 }}>
                            내 글 화면을 준비하는 중... 📖
                        </div>
                    )}>
                        <MyShelfPostDetail
                            key={selectedSummary.id}
                            summary={selectedSummary}
                            post={selectedPost}
                            loading={detailLoading}
                            errorMessage={detailError}
                            onClose={() => window.history.back()}
                            onRetry={() => openShelfPost(selectedSummary, true)}
                        />
                    </Suspense>
                )}

                <TitleGuide
                    kind={activeTitleGuide}
                    currentLevel={activeTitleGuide === 'reader' ? readerTitle : writerTitle}
                    currentValue={activeTitleGuide === 'reader' ? readerActivity.score : writerTitle.progressValue}
                    currentUnit={activeTitleGuide === 'reader' ? '점' : writerTitle.nextUnit}
                    onClose={() => setActiveTitleGuide(null)}
                />
            </motion.div>
        </ModalPortal>
    );
};

export default MyAgitPanel;
