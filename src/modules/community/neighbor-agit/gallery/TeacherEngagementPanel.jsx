import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../../components/common/Button';
import { neighborAgitTeacherApi } from '../teacherApi';
import { groupByTopic } from './groupByTopic.js';
import './gallery.css';

/*
 * ③ 댓글·반응 — 교사. 학생 글 나눔 공간과 같은 구조: 반을 고르고 그 반 글을 주제별로 묶어 본다.
 * 반 카드에는 글 수·댓글·공감 합계. 글을 누르면 기존 상세 창(댓글 숨기기·복원)이 열린다.
 * kind: 'gallery'(글 나눔 공간) | 'topic'(함께 쓰는 주제) — 두 탭이 같은 부품을 쓴다.
 */
export default function TeacherEngagementPanel({ spaceId, classId, kind, onOpenPost, refreshToken = 0, api = neighborAgitTeacherApi }) {
    const [classes, setClasses] = useState(null);
    const [selectedKey, setSelectedKey] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        if (!spaceId || !classId) return;
        setLoading(true);
        setError('');
        try {
            setClasses(await api.getEngagement({ spaceId, classId, kind }));
        } catch (loadError) {
            setError(loadError?.message || '반별 댓글·반응을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [api, classId, kind, spaceId]);

    useEffect(() => { void load(); }, [load, refreshToken]);
    useEffect(() => { setSelectedKey(null); }, [kind]);

    const selected = classes?.find((item) => item.class_key === selectedKey) || null;
    const groups = useMemo(() => groupByTopic(selected?.posts || []), [selected]);

    return (
        <section className="neighbor-teacher-card neighbor-engage">
            {error && <p className="neighbor-gallery__empty" role="alert">{error}</p>}
            {!classes && !error && <p className="neighbor-gallery__empty">반별 댓글·반응을 불러오는 중…</p>}

            {classes && !selected && (
                <>
                    <div className="neighbor-engage__head">
                        <p>반을 고르면 그 반 글을 주제별로 보고, 글을 눌러 댓글을 확인·숨길 수 있어요.</p>
                        <Button type="button" size="sm" variant="ghost" loading={loading} onClick={load}>새로고침</Button>
                    </div>
                    <div className="neighbor-gallery__classes">
                        {classes.map((item) => (
                            <button type="button" key={item.class_key} className={`neighbor-gallery__class${item.is_own_class ? ' is-own' : ''}`}
                                onClick={() => setSelectedKey(item.class_key)} disabled={Number(item.post_count) === 0}>
                                <strong>{item.is_own_class ? `⭐ ${item.class_name}` : item.class_name}</strong>
                                <span>{Number(item.post_count) > 0 ? `공개 글 ${item.post_count}편` : '공개 글 없음'}</span>
                                <span className="neighbor-engage__totals">💬 {item.comment_total} · 💛 {item.reaction_total}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}

            {selected && (
                <>
                    <div className="neighbor-gallery__head">
                        <button type="button" className="neighbor-gallery__back" onClick={() => setSelectedKey(null)}>← 반 고르기</button>
                        <h3>{selected.is_own_class ? '⭐ ' : ''}{selected.class_name} · {selected.post_count}편 · 💬 {selected.comment_total} · 💛 {selected.reaction_total}</h3>
                    </div>
                    {groups.map((group) => (
                        <section key={group.topic} className="neighbor-gallery__group" aria-label={`${group.topic} 글`}>
                            <h3>📘 {group.topic} <small>{group.posts.length}편</small></h3>
                            <div className="neighbor-teacher__engage-list">
                                {group.posts.map((post) => (
                                    <button type="button" key={post.shared_post_id} className="neighbor-teacher__engage-card" onClick={() => onOpenPost(post.shared_post_id)}>
                                        <span className="neighbor-teacher__engage-meta"><strong>{post.author_name}</strong><small>{post.class_name}</small></span>
                                        <h3>{post.title}</h3>
                                        <span className="neighbor-teacher__engage-counts">💛 {post.reaction_count || 0} · 💬 {post.comment_count || 0}</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    ))}
                </>
            )}
        </section>
    );
}
