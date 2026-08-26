import React, { useState } from 'react';
import Button from '../common/Button';
import './CommentComposer.css';

/**
 * 학생 댓글은 한 번 읽어 본 뒤에만 저장한다.
 *
 * 첫 제출은 미리 보기로만 이동하고, 두 번째 명시적 확인에서 부모의 저장 함수를 부른다.
 * DB 저장과 AI 검사는 부모가 맡으므로 이 컴포넌트는 입력 UX만 소유한다.
 */
const CommentComposer = ({
    value,
    onChange,
    onConfirm,
    submitting = false,
    editing = false,
    onCancelEdit,
    placeholder
}) => {
    const [reviewing, setReviewing] = useState(false);

    const trimmed = value.trim();

    const openReview = (event) => {
        event.preventDefault();
        if (!trimmed || submitting) return;
        setReviewing(true);
    };

    const confirm = async (event) => {
        event?.preventDefault();
        if (!trimmed || submitting) return;
        const saved = await onConfirm(trimmed);
        if (saved) setReviewing(false);
    };

    if (reviewing) {
        return (
            <form className="comment-composer-review" aria-label="댓글 등록 전 확인" onSubmit={confirm}>
                <div className="comment-composer-review__heading">
                    <span aria-hidden="true">👀</span>
                    <div>
                        <strong>내가 쓴 댓글을 한 번 읽어 보세요</strong>
                        <small>친구에게 전하고 싶은 말이 맞으면 등록해요.</small>
                    </div>
                </div>
                <p className="comment-composer-review__content">{trimmed}</p>
                <div className="comment-composer-review__actions">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReviewing(false)} disabled={submitting}>
                        고쳐 쓰기
                    </Button>
                    <Button
                        type="submit"
                        size="sm"
                        disabled={submitting}
                        loading={submitting}
                        loadingText="등록 중..."
                        autoFocus
                    >
                        확인하고 등록
                    </Button>
                </div>
            </form>
        );
    }

    return (
        <form className={`comment-composer${editing ? ' is-editing' : ''}`} onSubmit={openReview}>
            <input
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                maxLength={1000}
                aria-label={editing ? '수정할 댓글' : '새 댓글'}
            />
            {editing && (
                <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit} disabled={submitting}>
                    취소
                </Button>
            )}
            <Button type="submit" size="sm" disabled={submitting || !trimmed}>
                {editing ? '수정 확인' : '댓글 확인'}
            </Button>
        </form>
    );
};

export default CommentComposer;
