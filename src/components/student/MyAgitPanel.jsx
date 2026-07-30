import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../common/ModalPortal';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';
import MyAgitModuleSlotHost from '../../modules/MyAgitModuleSlotHost';
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
// 256px WebP. 원본은 512px PNG(장당 139~419KB)였는데 화면에서는 40~76px로만 써서,
// 칭호 설명을 한 번 열면 작가 10장 약 3.3MB를 내려받았다. scripts/optimize-title-badges.mjs 로 만든다.
const titleBadgeSrc = (kind, level) => `/assets/title-badges/${kind}-level-${level}.webp`;

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
        id: 'reading', tabLabel: '독서록 책장', emptyMessage: '완성한 독서록이 아직 없어요.', alwaysVisible: true,
        match: (post) => post.writing_context === 'self' && post.self_writing_type === 'reading_log',
        label: '독서록', icon: '📚',
        colors: [
            ['#6B9A70', '#3F704A', '#295237'],
            ['#5E958B', '#356A64', '#28514D'],
            ['#77955C', '#4E6F37', '#384F29']
        ]
    },
    {
        id: 'free', tabLabel: '자유글 책장', emptyMessage: '완성한 자유글이 아직 없어요.', alwaysVisible: false,
        match: (post) => post.writing_context === 'self' && post.self_writing_type !== 'reading_log',
        label: '자유글', icon: '✏️',
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

const BadgeButton = ({ kind, level, loading, errorMessage, onClick }) => {
    const writer = kind === 'writer';
    const accent = writer ? '#F4B740' : '#72B7FF';
    const deepAccent = writer ? '#9A5B00' : '#145EA8';
    const totalLevels = writer ? WRITER_LEVELS.length : READER_LEVELS.length;
    return (
        <motion.button
            type="button"
            onClick={onClick}
            aria-label={`${writer ? '작가' : '독자'} 칭호 설명 보기`}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            style={{
                position: 'relative', minWidth: 0, minHeight: '166px', padding: '11px 10px 12px', overflow: 'hidden',
                border: `1px solid ${writer ? 'rgba(255,211,117,.48)' : 'rgba(139,199,255,.48)'}`, borderRadius: '19px',
                background: writer
                    ? 'linear-gradient(155deg,rgba(255,247,220,.98),rgba(255,220,143,.92))'
                    : 'linear-gradient(155deg,rgba(237,248,255,.98),rgba(171,216,255,.92))',
                boxShadow: `inset 0 1px 0 rgba(255,255,255,.9), 0 8px 18px ${writer ? 'rgba(81,48,8,.18)' : 'rgba(8,54,98,.2)'}`,
                cursor: 'pointer', color: INK, fontFamily: 'inherit', textAlign: 'center'
            }}
        >
            <span aria-hidden="true" style={{
                position: 'absolute', width: '108px', height: '108px', left: '50%', top: '40px', transform: 'translateX(-50%)',
                borderRadius: '50%', background: `radial-gradient(circle,${accent}42 0%,${accent}14 48%,transparent 70%)`
            }} />
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                <span style={{ color: deepAccent, fontSize: '.68rem', fontWeight: 950, letterSpacing: '.02em' }}>
                    {writer ? '✍️ 작가 칭호' : '📖 독자 칭호'}
                </span>
                <span aria-hidden="true" style={{
                    width: '20px', height: '20px', display: 'grid', placeItems: 'center', borderRadius: '50%',
                    background: 'rgba(255,255,255,.7)', border: `1px solid ${accent}90`, color: deepAccent,
                    fontSize: '.68rem', fontWeight: 950
                }}>i</span>
            </span>
            <span style={{ position: 'relative', display: 'inline-block', marginTop: '2px' }}>
                <img src={titleBadgeSrc(kind, level.level)} alt="" aria-hidden="true" width="82" height="82"
                    style={{ display: 'block', width: '82px', height: '82px', objectFit: 'contain', filter: 'drop-shadow(0 6px 7px rgba(35,27,22,.2))' }} />
            </span>
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', marginTop: '-2px' }}>
                <span style={{
                    padding: '3px 7px', borderRadius: '99px', background: deepAccent, color: '#FFFFFF',
                    fontSize: '.62rem', fontWeight: 950, boxShadow: '0 2px 5px rgba(31,28,25,.15)'
                }}>LV.{level.level} / {totalLevels}</span>
            </span>
            <span style={{ position: 'relative', display: 'block', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#342820', fontSize: '.86rem', fontWeight: 950 }}>
                {loading ? '살펴보는 중...' : errorMessage ? '확인 필요' : level.name}
            </span>
        </motion.button>
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
    const badgeSrc = titleBadgeSrc(kind, currentLevel.level);
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
                                        display: 'grid', gridTemplateColumns: '42px minmax(0,1fr) auto', alignItems: 'center', gap: '9px',
                                        padding: '9px 11px', borderRadius: '13px', background: current ? `${accent}12` : '#FFFFFF',
                                        border: current ? `1.5px solid ${accent}70` : `1px solid ${LINE}`
                                    }}>
                                        <span style={{
                                            position: 'relative', width: '40px', height: '40px', display: 'grid', placeItems: 'center'
                                        }}>
                                            <img
                                                src={titleBadgeSrc(kind, item.level)}
                                                alt=""
                                                aria-hidden="true"
                                                width="40"
                                                height="40"
                                                loading="lazy"
                                                style={{
                                                    width: '40px', height: '40px', objectFit: 'contain',
                                                    filter: achieved ? 'none' : 'grayscale(1)', opacity: achieved ? 1 : .42
                                                }}
                                            />
                                            {!achieved && <span aria-hidden="true" style={{ position: 'absolute', right: '-2px', bottom: '-2px', fontSize: '.7rem' }}>🔒</span>}
                                        </span>
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
    writerStats, writerLevel, enabledModules = [],
    moduleRuntimeById = {}, onOpenModule
}) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const studentId = studentSession?.id;

    const [shelf, setShelf] = useState([]);
    const [loading, setLoading] = useState(true);
    const [readerActivity, setReaderActivity] = useState({ score: 0, postCount: 0 });
    const [readerLoading, setReaderLoading] = useState(true);
    const [readerError, setReaderError] = useState('');
    const [activeTitleGuide, setActiveTitleGuide] = useState(null);
    const [activeShelfId, setActiveShelfId] = useState('assignment');
    const [shelfViewMode, setShelfViewMode] = useState('books');
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

    const shelfSections = useMemo(() => SHELF_SECTIONS.map((section) => ({
        ...section,
        posts: shelf.filter(section.match)
    })).filter((section) => section.alwaysVisible || section.posts.length > 0), [shelf]);
    const activeShelf = shelfSections.find((section) => section.id === activeShelfId) || shelfSections[0];
    const activeShelfPosts = activeShelf?.posts || [];

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

                    {/* 성장 상태 — 포인트 계기판과 작가·독자 훈장 슬롯을 한눈에 보여 준다. */}
                    <section aria-label="나의 작가·독자 칭호" style={{
                        position: 'relative', padding: '16px', overflow: 'hidden', borderRadius: '24px',
                        border: '1px solid rgba(255,226,168,.38)',
                        background: 'radial-gradient(circle at 8% 0%,rgba(255,210,109,.28),transparent 34%), radial-gradient(circle at 100% 100%,rgba(90,164,235,.22),transparent 38%), linear-gradient(145deg,#3B2924 0%,#503A32 48%,#263E56 100%)',
                        boxShadow: '0 14px 30px rgba(62,46,35,.18)', marginBottom: '14px'
                    }}>
                        <span aria-hidden="true" style={{ position: 'absolute', right: '-28px', top: '-34px', width: '112px', height: '112px', border: '1px solid rgba(255,255,255,.1)', borderRadius: '50%' }} />
                        <span aria-hidden="true" style={{ position: 'absolute', right: '-7px', top: '-13px', width: '70px', height: '70px', border: '1px solid rgba(255,255,255,.08)', borderRadius: '50%' }} />
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FFD987', fontSize: '.64rem', fontWeight: 950, letterSpacing: '.08em' }}>
                                    <span aria-hidden="true" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7FE0A0', boxShadow: '0 0 8px #7FE0A0' }} />
                                    나의 성장 상태
                                </div>
                                <div style={{ marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1.08rem', fontWeight: 950, color: '#FFFFFF' }}>
                                    {studentSession?.name || '나'}의 아지트
                                </div>
                            </div>
                            <div role="group" aria-label={`보유 포인트 ${num(points)}점`} style={{
                                flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px 7px 8px',
                                border: '1px solid rgba(255,224,143,.42)', borderRadius: '15px',
                                background: 'linear-gradient(145deg,rgba(255,255,255,.17),rgba(255,255,255,.08))',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2)'
                            }}>
                                <span aria-hidden="true" style={{
                                    width: '31px', height: '31px', display: 'grid', placeItems: 'center', borderRadius: '50%',
                                    background: 'linear-gradient(145deg,#FFE991,#F2AD27)', border: '2px solid #FFF1B6',
                                    color: '#9B5B00', fontSize: '.9rem', fontWeight: 950, boxShadow: '0 3px 8px rgba(0,0,0,.22)'
                                }}>★</span>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ color: 'rgba(255,255,255,.65)', fontSize: '.55rem', fontWeight: 850 }}>보유 포인트</div>
                                    <div style={{ marginTop: '1px', color: '#FFE38A', fontSize: '1.05rem', fontWeight: 950, lineHeight: 1 }}>
                                        {num(points)}<span style={{ marginLeft: '2px', fontSize: '.62rem', color: '#FFFFFF' }}>P</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '10px', marginTop: '13px' }}>
                            <BadgeButton
                                kind="writer"
                                level={writerTitle}
                                onClick={() => setActiveTitleGuide('writer')}
                            />
                            <BadgeButton
                                kind="reader"
                                level={readerTitle}
                                loading={readerLoading}
                                errorMessage={readerError}
                                onClick={() => setActiveTitleGuide('reader')}
                            />
                        </div>
                        <div style={{ position: 'relative', marginTop: '9px', textAlign: 'center', color: 'rgba(255,255,255,.7)', fontSize: '.64rem', fontWeight: 800 }}>
                            칭호 카드를 눌러 전체 성장 단계를 확인해요
                        </div>
                    </section>

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
