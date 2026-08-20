import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import './engagement.css';

/**
 * 학생이 자기 글 한 편에서 보는 세 가지를 한 자리에 모은 공용 부품.
 *   ① 제출·확인 상태  ② 선생님 의견  ③ 친구 댓글
 *
 * 글 유형(과제·독서록·일기·앞으로 생길 것)을 가리지 않는다. 유형마다 다른 저장소는
 * 서버 `get_my_post_engagement()` 가 흡수하므로 화면은 어디서 온 값인지 몰라도 된다.
 *
 * **새 글쓰기 유형을 붙일 때 할 일은 이 한 줄뿐이다.**
 *   <MyPostEngagementPanel postId={글id} />
 *
 * 지금은 읽기 전용이다(사용자 결정). 답글은 기존대로 친구 아지트의 글 상세에서 단다.
 */

const STATUS_TONE = new Map(Object.entries({
    approved: 'is-approved',
    reviewed: 'is-approved',
    revision_requested: 'is-returned',
    returned: 'is-returned',
    submitted: 'is-submitted',
    draft: 'is-draft'
}));

const STATUS_ICON = new Map(Object.entries({
    approved: '✅',
    reviewed: '✅',
    revision_requested: '✏️',
    returned: '↩️',
    submitted: '📮',
    draft: '✍️'
}));

const formatWhen = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};

const MyPostEngagementPanel = ({ postId, className = '' }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const load = useCallback(async () => {
        if (!postId) return;
        setLoading(true);
        setErrorMessage('');
        const { data: result, error } = await supabase.rpc('get_my_post_engagement', { p_post_id: postId });
        if (error) {
            console.error('내 글 반응 불러오기 실패:', error.message);
            setErrorMessage('선생님 의견과 친구 댓글을 불러오지 못했어요.');
            setData(null);
        } else {
            setData(result);
        }
        setLoading(false);
    }, [postId]);

    useEffect(() => {
        if (!postId) return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [load, postId]);

    if (!postId) return null;

    if (loading) {
        return <div className={`post-engagement is-loading ${className}`.trim()}>선생님 의견과 친구 댓글을 가져오는 중...</div>;
    }
    if (errorMessage) {
        return <div className={`post-engagement is-error ${className}`.trim()}>{errorMessage}</div>;
    }
    if (!data) return null;

    const status = data.submission?.status || 'draft';
    const comments = Array.isArray(data.comments) ? data.comments : [];
    const teacherComment = data.teacher?.comment;

    return (
        <section className={`post-engagement ${className}`.trim()} aria-label="내 글의 확인과 반응">
            <div className={`post-engagement__status ${STATUS_TONE.get(status) || 'is-draft'}`}>
                <span aria-hidden="true">{STATUS_ICON.get(status) || '✍️'}</span>
                <span>
                    <strong>{data.submission?.status_label}</strong>
                    {data.teacher?.checked_at && (
                        <small>{formatWhen(data.teacher.checked_at)}에 확인하셨어요</small>
                    )}
                </span>
            </div>

            {teacherComment && (
                <div className="post-engagement__teacher">
                    <strong>💬 선생님 한마디</strong>
                    <p>{teacherComment}</p>
                </div>
            )}

            <div className="post-engagement__comments">
                <strong>
                    🗨️ 친구 댓글 {comments.length > 0 && <span>{comments.length}</span>}
                    {data.reaction_count > 0 && <em>✨ {data.reaction_count}</em>}
                </strong>
                {comments.length === 0 ? (
                    <p className="post-engagement__empty">
                        {data.visibility === 'class'
                            ? '아직 댓글이 없어요. 친구들이 읽으면 남겨 줄 거예요.'
                            : '나만 보는 글이라 친구 댓글이 달리지 않아요.'}
                    </p>
                ) : (
                    <ul>
                        {comments.map((comment) => (
                            <li key={comment.id} className={comment.is_teacher ? 'is-teacher' : ''}>
                                <span className="post-engagement__author">
                                    {comment.is_teacher ? '👩‍🏫 선생님' : comment.author_name}
                                </span>
                                <span className="post-engagement__body">{comment.content}</span>
                                <span className="post-engagement__when">{formatWhen(comment.created_at)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
};

export default MyPostEngagementPanel;
