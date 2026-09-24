import { useCallback, useEffect, useMemo, useState } from 'react';
import { neighborAgitApi } from '../api';
import { groupByTopic } from './groupByTopic.js';
import './gallery.css';

const formatDate = (value) => (value ? new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date(value)) : '');

/*
 * 이웃 글 마당 — 학생. 글이 많아도 찾기 쉽게 "어느 반 글을 볼까요?" 에서 반을 고르고, 그 반 글을 주제별로 묶어 본다.
 *   view === null      : 반 고르기(우리 반 먼저, 반마다 글 수·지난 방문 뒤 새 글) + 🆕 새 글 모아보기
 *   view === <반 열쇠> : 그 반 글을 주제별 묶음으로(주제 칩으로 좁히기)
 * "새 글 모아보기"(view === 'latest')는 바깥(StudentEntry)이 기존 최신순 피드로 그린다.
 */
export default function StudentGalleryPanel({ spaceId, view, onSelect, onOpenPost, refreshToken = 0, api = neighborAgitApi }) {
    const [classes, setClasses] = useState(null);
    const [gallery, setGallery] = useState(null);
    const [topic, setTopic] = useState('all');
    const [error, setError] = useState('');

    const loadClasses = useCallback(async () => {
        setError('');
        try {
            setClasses(await api.getGalleryClasses({ spaceId }));
        } catch {
            setError('반 목록을 불러오지 못했어요. 잠시 뒤 다시 들어와 주세요.');
        }
    }, [api, spaceId]);

    const loadGallery = useCallback(async (classKey) => {
        setError('');
        try {
            setGallery(await api.getClassGallery({ spaceId, classKey }));
        } catch {
            setError('이 반 글을 불러오지 못했어요. 반 고르기로 돌아가 다시 골라 주세요.');
        }
    }, [api, spaceId]);

    useEffect(() => {
        if (view === null) void loadClasses();
    }, [view, loadClasses, refreshToken]);
    useEffect(() => {
        if (view && view !== 'latest') {
            setTopic('all');
            void loadGallery(view);
        }
    }, [view, loadGallery]);
    // 상세에서 댓글·공감을 남기고 돌아오면 숫자를 새로 맞춘다(화면은 그대로 두고 다시 읽는다).
    useEffect(() => {
        if (refreshToken && view && view !== 'latest') void loadGallery(view);
        // loadGallery·view 가 바뀔 때는 위 효과가 읽는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshToken]);

    const groups = useMemo(() => groupByTopic(gallery?.items || []), [gallery]);
    const shownGroups = topic === 'all' ? groups : groups.filter((group) => group.topic === topic);

    if (view === null) {
        return (
            <section className="neighbor-gallery" data-space="gallery" aria-label="반 고르기">
                <h2 className="neighbor-gallery__question">어느 반 글을 볼까요?</h2>
                {error && <p className="neighbor-gallery__empty" role="alert">{error}</p>}
                {!classes && !error && <p className="neighbor-gallery__empty">반 목록을 불러오는 중…</p>}
                {classes && (
                    <div className="neighbor-gallery__classes">
                        {classes.map((item) => (
                            <button type="button" key={item.class_key} className={`neighbor-gallery__class${item.is_own_class ? ' is-own' : ''}`}
                                onClick={() => onSelect(item.class_key)} disabled={Number(item.post_count) === 0}>
                                <strong>{item.is_own_class ? `⭐ ${item.class_name}` : item.class_name}</strong>
                                <span>{Number(item.post_count) > 0 ? `글 ${item.post_count}편` : '아직 글이 없어요'}</span>
                                {Number(item.new_count) > 0 && <em>새 글 {item.new_count}</em>}
                            </button>
                        ))}
                        <button type="button" className="neighbor-gallery__class is-latest" onClick={() => onSelect('latest')}>
                            <strong>🆕 새 글 모아보기</strong>
                            <span>모든 반의 최근 글</span>
                        </button>
                    </div>
                )}
            </section>
        );
    }

    return (
        <section className="neighbor-gallery" data-space="gallery" aria-label={`${gallery?.class_name || ''} 글`}>
            <div className="neighbor-gallery__head">
                <button type="button" className="neighbor-gallery__back" onClick={() => onSelect(null)}>← 반 고르기</button>
                <h2>{gallery ? `${gallery.is_own_class ? '⭐ ' : ''}${gallery.class_name} 글 ${gallery.total}편` : '글을 불러오는 중…'}</h2>
            </div>
            {error && <p className="neighbor-gallery__empty" role="alert">{error}</p>}
            {groups.length > 1 && (
                <div className="neighbor-gallery__topics" role="group" aria-label="주제로 좁히기">
                    <button type="button" aria-pressed={topic === 'all'} className={topic === 'all' ? 'is-active' : ''} onClick={() => setTopic('all')}>전체 주제</button>
                    {groups.map((group) => (
                        <button type="button" key={group.topic} aria-pressed={topic === group.topic} className={topic === group.topic ? 'is-active' : ''}
                            onClick={() => setTopic(group.topic)}>{group.topic} <small>{group.posts.length}</small></button>
                    ))}
                </div>
            )}
            {gallery && gallery.items.length === 0 && <p className="neighbor-gallery__empty">아직 이 반에 공개된 글이 없어요.</p>}
            {shownGroups.map((group) => (
                <section key={group.topic} className="neighbor-gallery__group" aria-label={`${group.topic} 글`}>
                    <h3>📘 {group.topic} <small>{group.posts.length}편</small></h3>
                    <div className="neighbor-student-feed">
                        {group.posts.map((item) => (
                            <button type="button" className="neighbor-post-card" key={item.shared_post_id} onClick={() => onOpenPost(item.shared_post_id)}>
                                <span className="neighbor-post-card__meta">
                                    <strong>{item.author_name}</strong>
                                    {item.is_mine && <em>내 글</em>}
                                </span>
                                <h2>{item.title}</h2>
                                <p>{item.excerpt || '글을 눌러 내용을 읽어 보세요.'}</p>
                                <span className="neighbor-post-card__footer">
                                    <time dateTime={item.published_at}>{formatDate(item.published_at)}</time>
                                    <span>💛 {Number(item.reaction_count) || 0} · 💬 {Number(item.comment_count) || 0}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            ))}
            {gallery && gallery.total > gallery.items.length && (
                <p className="neighbor-gallery__empty">최근 {gallery.items.length}편까지 보여요.</p>
            )}
        </section>
    );
}
