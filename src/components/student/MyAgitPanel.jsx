import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';
import MyAgitModuleSlotHost from '../../modules/MyAgitModuleSlotHost';
import MyTitleStatusPanel from '../../modules/writing/title-status/MyTitleStatusPanel';
import MasteryBadges from '../../modules/learning/MasteryBadges';
import useLearningMastery from '../../modules/learning/useLearningMastery';
import { FREE_WRITING_TYPE, SELF_WRITING_TYPES, getSelfWritingType } from '../../modules/writing/selfWritingTypes';

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
const SHELF_TTL_MS = 30000;

// 새 글쓰기 유형은 이 배열에 탭 정보와 match만 추가한다.
// `free`는 아직 분류되지 않은 자율 글을 받는 마지막 폴백이므로 항상 맨 아래에 둔다.
const SHELF_SECTIONS = [
    {
        id: 'assignment', tabLabel: '과제 책장', emptyMessage: '완성한 과제가 아직 없어요.', alwaysVisible: true,
        match: (post) => post.writing_context !== 'self',
        label: '과제', icon: '📝',
        colors: [
            ['#477DB6', '#28527D', '#193B60'],
            ['#6589B1', '#365F8C', '#23466B'],
            ['#426A9B', '#25476F', '#173552']
        ]
    },
    {
        id: 'reading', tabLabel: SELF_WRITING_TYPES.reading_log.shelfTabLabel,
        emptyMessage: SELF_WRITING_TYPES.reading_log.emptyMessage, alwaysVisible: true,
        match: (post) => getSelfWritingType(post)?.id === 'reading_log',
        label: SELF_WRITING_TYPES.reading_log.label, icon: SELF_WRITING_TYPES.reading_log.icon,
        colors: [
            ['#6B9A70', '#3F704A', '#295237'],
            ['#5E958B', '#356A64', '#28514D'],
            ['#77955C', '#4E6F37', '#384F29']
        ]
    },
    {
        id: 'diary', tabLabel: SELF_WRITING_TYPES.diary.shelfTabLabel,
        emptyMessage: SELF_WRITING_TYPES.diary.emptyMessage, alwaysVisible: true,
        match: (post) => getSelfWritingType(post)?.id === 'diary',
        label: SELF_WRITING_TYPES.diary.label, icon: SELF_WRITING_TYPES.diary.icon,
        colors: [
            ['#7C86D6', '#4F5AA8', '#343C7A'],
            ['#8E86C9', '#5C509C', '#3E356F'],
            ['#6E8FCB', '#42639C', '#2D466F']
        ]
    },
    {
        id: 'free', tabLabel: FREE_WRITING_TYPE.shelfTabLabel,
        emptyMessage: FREE_WRITING_TYPE.emptyMessage, alwaysVisible: false,
        match: (post) => getSelfWritingType(post)?.id === 'free',
        label: FREE_WRITING_TYPE.label, icon: FREE_WRITING_TYPE.icon,
        colors: [
            ['#D17A67', '#A24E48', '#793538'],
            ['#C88658', '#9D5B32', '#743F23'],
            ['#9C76A8', '#714E7E', '#54395F']
        ]
    }
];

const shelfSectionFor = (post) => SHELF_SECTIONS.find((section) => section.match(post)) || SHELF_SECTIONS[0];

const stableBookVariant = (post) => String(post.id || post.title || '')
    .split('')
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

const ShelfBook = ({ post, section, onOpen }) => {
    const type = section || shelfSectionFor(post);
    const variant = stableBookVariant(post);
    const [light, middle, dark] = type.colors[variant % type.colors.length];
    const title = post.title || '제목 없는 글';
    const titleLength = Array.from(title).length;
    const width = titleLength > 16 ? 60 : titleLength > 8 ? 52 : 44;
    const height = 146 + ((variant % 4) * 7);
    const isPrivate = post.visibility !== 'class';

    return (
        <motion.button
            type="button"
            role="listitem"
            onClick={onOpen}
            aria-label={`${type.label} ‘${title}’ 펼쳐보기${isPrivate ? ', 나만 보는 글' : ''}`}
            title={`${type.icon} ${type.label} · ${title}`}
            whileHover={{ y: -5, rotate: -1 }}
            whileTap={{ y: 1, scale: 0.97 }}
            style={{
                position: 'relative', flex: `0 0 ${width}px`, width: `${width}px`, height: `${height}px`,
                padding: '8px 5px 7px', overflow: 'hidden', border: `1px solid ${dark}`,
                borderRadius: '5px 5px 2px 2px', color: '#FFF9E9', cursor: 'pointer',
                background: `linear-gradient(90deg,${dark} 0 8%,${light} 13%,${middle} 72%,${dark} 100%)`,
                boxShadow: 'inset 2px 0 0 rgba(255,255,255,.18), inset -2px 0 0 rgba(0,0,0,.12), 3px 3px 6px rgba(55,31,17,.28)',
                fontFamily: 'inherit', scrollSnapAlign: 'start'
            }}
        >
            <span aria-hidden="true" style={{
                position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)',
                fontSize: '.8rem', lineHeight: 1
            }}>{type.icon}</span>
            <span aria-hidden="true" style={{
                position: 'absolute', top: '25px', right: '5px', bottom: isPrivate ? '30px' : '14px', left: '5px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
            }}>
                <span style={{
                    display: 'block', height: '100%', maxWidth: '100%', overflow: 'hidden',
                    writingMode: 'vertical-rl', textOrientation: 'upright', color: '#FFFDF5',
                    whiteSpace: 'normal', wordBreak: 'break-all', fontSize: '.7rem', fontWeight: 900,
                    lineHeight: 1.18, letterSpacing: '.02em', textAlign: 'center',
                    textShadow: '0 1px 1px rgba(0,0,0,.35)'
                }}>
                    {title}
                </span>
            </span>
            {isPrivate && (
                <span aria-hidden="true" style={{
                    position: 'absolute', left: '50%', bottom: '6px', transform: 'translateX(-50%)',
                    display: 'grid', placeItems: 'center', width: '20px', height: '20px',
                    borderRadius: '50%', background: 'rgba(35,25,20,.5)', fontSize: '.64rem'
                }}>🔒</span>
            )}
            <span aria-hidden="true" style={{
                position: 'absolute', left: '5px', right: '5px', bottom: '3px', height: '2px',
                borderTop: '1px solid rgba(255,255,255,.55)', borderBottom: '1px solid rgba(0,0,0,.25)'
            }} />
        </motion.button>
    );
};

const MyAgitPanel = ({
    isOpen, onClose, studentSession, points = 0, onPointsChange,
    enabledModules = [], closeOnInitialPostClose = false,
    moduleRuntimeById = {}, onOpenModule, initialPost = null, initialTitleKind = null
}) => {
    const { contents: masteryContents, loading: masteryLoading } = useLearningMastery({
        viewer: 'me', active: isOpen
    });
    const classId = studentSession?.class_id || studentSession?.classId;
    const studentId = studentSession?.id;

    const [shelf, setShelf] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeShelfId, setActiveShelfId] = useState('assignment');
    const [shelfViewMode, setShelfViewMode] = useState('books');
    const [selectedSummary, setSelectedSummary] = useState(null);
    const [selectedPost, setSelectedPost] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const selectedSummaryRef = useRef(null);
    const initialPostOpenedRef = useRef(null);

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
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [isOpen, load]);

    // 화면을 덮는 판이라 뒤로가기로 닫히게 한다. 다만 활동 알림에서 특정 글로
    // 바로 들어온 경우에는 `아지트 → 글` 두 겹으로 느껴지지 않도록 아지트 기록을
    // 따로 쌓지 않는다. 글 상세 기록 하나만 빠지면 곧바로 학생 홈으로 돌아간다.
    // onClose 는 부모에서 인라인 화살표로 넘어와 **매 렌더 새 함수**다.
    // 이걸 의존성에 두면 부모가 리렌더될 때마다 effect 가 다시 돌아 pushState 가 쌓이고,
    // 뒤로가기를 여러 번 눌러야 닫히게 된다. ref 에 담아 두고 isOpen 에만 반응시킨다.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        if (!closeOnInitialPostClose) {
            window.history.pushState({ studentPage: 'main', overlay: 'my-agit' }, '');
        }
        const closeOnBack = () => {
            if (selectedSummaryRef.current) {
                selectedSummaryRef.current = null;
                setSelectedSummary(null);
                setSelectedPost(null);
                setDetailError('');
                if (closeOnInitialPostClose) onCloseRef.current?.();
                return;
            }
            onCloseRef.current?.();
        };
        window.addEventListener('popstate', closeOnBack);
        return () => window.removeEventListener('popstate', closeOnBack);
    }, [closeOnInitialPostClose, isOpen]);

    useEffect(() => {
        if (!isOpen || !initialPost?.id || initialPostOpenedRef.current === initialPost.id) return undefined;
        initialPostOpenedRef.current = initialPost.id;
        const timerId = window.setTimeout(() => {
            void openShelfPost(initialPost);
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [initialPost, isOpen, openShelfPost]);

    const shelfSections = useMemo(() => SHELF_SECTIONS.map((section) => ({
        ...section,
        posts: shelf.filter(section.match)
    })).filter((section) => section.alwaysVisible || section.posts.length > 0), [shelf]);
    const activeShelf = shelfSections.find((section) => section.id === activeShelfId) || shelfSections[0];
    const activeShelfPosts = activeShelf?.posts || [];

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
                        <ModalCloseButton onClick={onClose} label="나의 아지트 닫기" />
                    </header>

                    <MyTitleStatusPanel
                        active={isOpen}
                        studentSession={studentSession}
                        points={points}
                        onPointsChange={onPointsChange}
                        initialGuideKind={initialTitleKind}
                    />

                    {/* 학습 성취 — 덱마스터 진행과 정상 휘장. 나의 아지트를 열 때만 한 번 조회한다. */}
                    <MasteryBadges
                        contents={masteryContents}
                        loading={masteryLoading}
                        emptyText="어휘의 탑에서 덱마스터에 도전해 보세요."
                    />

                    <MyAgitModuleSlotHost
                        enabledModules={enabledModules}
                        runtimeByModule={moduleRuntimeById}
                        onOpenModule={onOpenModule}
                    />

                    {/* 내 서재 */}
                    <section aria-label="내 서재" style={{
                        overflow: 'hidden', borderRadius: '22px', border: '1px solid rgba(105,61,32,.18)',
                        background: 'linear-gradient(145deg,#FFF9EB,#F7E8CB)', marginBottom: '14px',
                        boxShadow: '0 8px 22px rgba(82,51,29,.08)'
                    }}>
                        <div style={{ padding: '15px 17px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 950, color: INK }}>📖 내 서재</h3>
                                <span style={{ display: 'block', marginTop: '3px', fontSize: '.68rem', fontWeight: 800, color: INK_SOFT }}>
                                    책등을 눌러 내가 쓴 글을 펼쳐보세요
                                </span>
                            </div>
                            <span style={{ padding: '4px 8px', borderRadius: '99px', background: 'rgba(255,255,255,.68)', fontSize: '.69rem', fontWeight: 900, color: '#75513A', whiteSpace: 'nowrap' }}>
                                모두 {shelf.length}권
                            </span>
                        </div>

                        <div
                            role="tablist"
                            aria-label="내 서재 책장 종류"
                            style={{
                                display: 'flex', gap: '6px', padding: '0 12px 10px', overflowX: 'auto',
                                scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch'
                            }}
                        >
                            {shelfSections.map((section) => {
                                const active = section.id === activeShelf.id;
                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        aria-controls="my-agit-bookshelf"
                                        onClick={() => setActiveShelfId(section.id)}
                                        style={{
                                            flex: '0 0 auto', minHeight: '38px', padding: '7px 11px',
                                            border: active ? '1px solid #704126' : '1px solid rgba(112,65,38,.2)',
                                            borderRadius: '11px 11px 5px 5px', cursor: 'pointer', fontFamily: 'inherit',
                                            background: active
                                                ? 'linear-gradient(180deg,#98613B,#754226)'
                                                : 'rgba(255,255,255,.62)',
                                            color: active ? '#FFF8EA' : '#73523D', fontSize: '.72rem', fontWeight: 900,
                                            boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,.2), 0 3px 6px rgba(80,43,23,.18)' : 'none'
                                        }}
                                    >
                                        {section.icon} {section.tabLabel} <span style={{ opacity: .78 }}>{section.posts.length}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 12px 8px' }}>
                            <button
                                type="button"
                                aria-pressed={shelfViewMode === 'titles'}
                                onClick={() => setShelfViewMode((mode) => mode === 'books' ? 'titles' : 'books')}
                                style={{
                                    minHeight: '34px', padding: '6px 10px', border: '1px solid rgba(112,65,38,.22)',
                                    borderRadius: '10px', background: 'rgba(255,255,255,.72)', color: '#73523D',
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: '.69rem', fontWeight: 900
                                }}
                            >
                                {shelfViewMode === 'books' ? '☰ 제목 전체 보기' : '📚 책등으로 보기'}
                            </button>
                        </div>

                        <div style={{
                            margin: '0 10px', overflow: 'hidden', border: '8px solid #85502E', borderBottom: 0,
                            borderRadius: '8px 8px 0 0', background: 'linear-gradient(180deg,#E8CFAC 0%,#D9B582 100%)',
                            boxShadow: 'inset 0 8px 16px rgba(67,37,18,.2), inset 5px 0 6px rgba(67,37,18,.12), inset -5px 0 6px rgba(67,37,18,.12)'
                        }}>
                            <div
                                id="my-agit-bookshelf"
                                role="tabpanel"
                                aria-label={`${activeShelf.tabLabel} 글 목록`}
                            >
                                <div
                                    role={activeShelfPosts.length ? 'list' : undefined}
                                    style={shelfViewMode === 'books' ? {
                                        minHeight: '182px', display: 'flex', alignItems: 'flex-end', gap: '5px',
                                        padding: '14px 12px 0', overflowX: 'auto', overscrollBehaviorX: 'contain',
                                        scrollSnapType: 'x proximity', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box'
                                    } : {
                                        minHeight: '182px', maxHeight: '282px', display: 'flex', flexDirection: 'column', gap: '6px',
                                        padding: '10px', overflowY: 'auto', WebkitOverflowScrolling: 'touch', boxSizing: 'border-box'
                                    }}
                                >
                                    {loading ? (
                                        <p style={{ alignSelf: 'center', width: '100%', margin: 'auto 0', textAlign: 'center', color: '#76563D', fontWeight: 850 }}>책을 꽂는 중... 📚</p>
                                    ) : activeShelfPosts.length === 0 ? (
                                        <div style={{ alignSelf: 'center', width: '100%', margin: 'auto 0', textAlign: 'center', color: '#76563D' }}>
                                            <span aria-hidden="true" style={{ display: 'block', marginBottom: '6px', fontSize: '2rem' }}>🪵</span>
                                            <span style={{ fontSize: '.8rem', fontWeight: 850 }}>{activeShelf.emptyMessage}</span>
                                        </div>
                                    ) : shelfViewMode === 'books' ? activeShelfPosts.map((post) => (
                                        <ShelfBook key={post.id} post={post} section={activeShelf} onOpen={() => openShelfPost(post)} />
                                    )) : activeShelfPosts.map((post) => (
                                        <button
                                            key={post.id}
                                            type="button"
                                            role="listitem"
                                            onClick={() => openShelfPost(post)}
                                            style={{
                                                display: 'flex', alignItems: 'flex-start', gap: '9px', width: '100%',
                                                padding: '10px 11px', border: '1px solid rgba(103,66,40,.18)', borderRadius: '11px',
                                                background: 'rgba(255,252,244,.9)', color: INK, cursor: 'pointer',
                                                textAlign: 'left', fontFamily: 'inherit', boxSizing: 'border-box'
                                            }}
                                        >
                                            <span aria-hidden="true" style={{ flex: '0 0 auto', fontSize: '.9rem' }}>{activeShelf.icon}</span>
                                            <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: '.8rem', fontWeight: 850, lineHeight: 1.4 }}>
                                                {post.title || '제목 없는 글'}
                                            </span>
                                            {post.visibility !== 'class' && <span aria-label="나만 보는 글" style={{ flex: '0 0 auto', fontSize: '.72rem' }}>🔒</span>}
                                            <span aria-hidden="true" style={{ flex: '0 0 auto', color: '#9C856F', fontWeight: 900 }}>›</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div aria-hidden="true" style={{
                                height: '17px', borderTop: '2px solid #B97943', borderBottom: '4px solid #552C18',
                                background: 'linear-gradient(180deg,#A96838 0%,#7E4525 58%,#60331C 100%)',
                                boxShadow: '0 -3px 6px rgba(57,29,14,.2), 0 5px 8px rgba(57,29,14,.28)'
                            }} />
                        </div>

                        <div style={{
                            display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '9px 16px 12px',
                            color: '#80624D', fontSize: '.64rem', fontWeight: 850
                        }}>
                            <span>{activeShelf.icon} {activeShelf.label} {activeShelfPosts.length}권</span>
                            {shelfViewMode === 'books' && activeShelfPosts.length > 7 && <span style={{ whiteSpace: 'nowrap' }}>옆으로 넘기기 →</span>}
                        </div>
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
                            returnsToHome={closeOnInitialPostClose}
                            onClose={() => window.history.back()}
                            onRetry={() => openShelfPost(selectedSummary, true)}
                        />
                    </Suspense>
                )}

            </motion.div>
        </ModalPortal>
    );
};

export default MyAgitPanel;
