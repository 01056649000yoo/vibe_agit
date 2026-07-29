import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../common/ModalPortal';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';
import { getWriterLevel } from '../../constants/writerLevels';

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

const MyAgitPanel = ({
    isOpen, onClose, studentSession, points = 0,
    onOpenPost
}) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const studentId = studentSession?.id;

    const [shelf, setShelf] = useState([]);
    const [totalChars, setTotalChars] = useState(0);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!classId || !studentId) return;
        setLoading(true);
        try {
            const rows = await dataCache.get(
                classKey(classId, 'my-shelf', { student: studentId }),
                async () => {
                    const { data, error } = await supabase
                        .from('student_posts')
                        .select('id, title, writing_context, self_writing_type, char_count, visibility, created_at')
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
            setTotalChars(rows.reduce((sum, r) => sum + (r.char_count || 0), 0));
        } catch (error) {
            console.error('내 서재 로드 실패:', error.message);
            setShelf([]);
        }
        setLoading(false);
    }, [classId, studentId]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [isOpen, load]);

    // 화면을 덮는 판이라 뒤로가기로 닫히게 한다.
    // onClose 는 부모에서 인라인 화살표로 넘어와 **매 렌더 새 함수**다.
    // 이걸 의존성에 두면 부모가 리렌더될 때마다 effect 가 다시 돌아 pushState 가 쌓이고,
    // 뒤로가기를 여러 번 눌러야 닫히게 된다. ref 에 담아 두고 isOpen 에만 반응시킨다.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        window.history.pushState({ studentPage: 'main', overlay: 'my-agit' }, '');
        const closeOnBack = () => onCloseRef.current?.();
        window.addEventListener('popstate', closeOnBack);
        return () => window.removeEventListener('popstate', closeOnBack);
    }, [isOpen]);

    const counts = useMemo(() => ({
        posts: shelf.filter((p) => p.writing_context !== 'self').length,
        readingLogs: shelf.filter((p) => p.self_writing_type === 'reading_log').length,
        free: shelf.filter((p) => p.writing_context === 'self' && p.self_writing_type !== 'reading_log').length
    }), [shelf]);

    const level = getWriterLevel(totalChars);
    const toNext = level.next ? Math.max(0, level.next - totalChars) : 0;
    const percent = level.next ? Math.min(100, Math.round((totalChars / level.next) * 100)) : 100;

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

                    {/* 칭호 — 상태창 머리 */}
                    <section aria-label="작가 칭호" style={{
                        padding: '18px 20px', borderRadius: '22px', border: '1px solid #FFE082',
                        background: 'linear-gradient(135deg,#FFF8E1,#FFFFFF)', marginBottom: '14px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <div>
                                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: INK }}>
                                    {level.emoji} {level.name}
                                </div>
                                <div style={{ marginTop: '3px', fontSize: '.78rem', fontWeight: 800, color: INK_SOFT }}>
                                    {studentSession?.name} 작가
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FBC02D', lineHeight: 1.1 }}>
                                    {num(points)}<span style={{ fontSize: '.85rem', color: INK_SOFT }}>P</span>
                                </div>
                                <div style={{
                                    display: 'inline-block', marginTop: '3px', padding: '2px 9px', borderRadius: '9px',
                                    background: '#FDFCF0', border: '1px solid #FFF9C4', fontSize: '.72rem', fontWeight: 900, color: '#F9A825'
                                }}>LV. {level.level}</div>
                            </div>
                        </div>
                        <div style={{ marginTop: '14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span style={{ fontSize: '.74rem', fontWeight: 800, color: INK_SOFT }}>나의 성장 🌱</span>
                                <span style={{ fontSize: '.72rem', fontWeight: 800, color: INK_SOFT }}>
                                    {level.next ? `다음 칭호까지 ${num(toNext)}자` : '가장 높은 칭호예요!'}
                                </span>
                            </div>
                            <div style={{ height: '8px', background: '#F1F3F5', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${percent}%`, background: 'linear-gradient(90deg,#FBC02D,#FFD54F)', borderRadius: '4px' }} />
                            </div>
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
                                        onClick={() => onOpenPost?.(post)}
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
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                </div>
            </motion.div>
        </ModalPortal>
    );
};

export default MyAgitPanel;
