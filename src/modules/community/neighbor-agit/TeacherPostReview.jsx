import { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';

export default function TeacherPostReview({ selection, spaceId, classId, api, busy, onSubmit, onClose }) {
    const [detail, setDetail] = useState(null);
    const [error, setError] = useState('');
    const [note, setNote] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let cancelled = false;
        const request = selection.mode === 'gallery'
            ? api.getSourcePost({ spaceId, classId, postId: selection.post.post_id })
            : api.getPostDetail({ spaceId, classId, sharedPostId: selection.post.shared_post_id });
        request.then((result) => { if (!cancelled) setDetail(result); })
            .catch((reason) => { if (!cancelled) setError(reason.message || '글을 불러오지 못했습니다.'); });
        return () => { cancelled = true; };
    }, [api, classId, spaceId, selection, attempt]);

    const submit = async (decision) => {
        setError('');
        try {
            await onSubmit(selection, detail, decision, note.trim());
            onClose();
        } catch (reason) {
            setError(reason.message || '처리하지 못했습니다. 전문을 다시 확인해 주세요.');
            setDetail(null);
        }
    };

    return (
        <Modal isOpen showFooter={false} onClose={() => { if (!busy) onClose(); }} title="공유할 글 전문 확인" maxWidth="760px">
            {error && <div role="alert"><p>{error}</p><Button onClick={() => { setError(''); setAttempt((value) => value + 1); }}>전문 다시 불러오기</Button></div>}
            {!detail && !error && <p role="status">글을 불러오는 중입니다…</p>}
            {detail && <div className="neighbor-teacher__review-body">
                <p>{detail.student_name || detail.author_name}</p>
                <h2>{detail.title || '제목 없는 글'}</h2>
                <div className="neighbor-teacher__detail-content">{detail.content}</div>
                <p>이 글을 설정된 이웃 공개 범위에 공개합니다.</p>
                {selection.mode === 'review' && <label>돌려보내는 이유
                    <textarea value={note} maxLength={240} onChange={(event) => setNote(event.target.value)} placeholder="학생이 무엇을 보완하면 좋을지 적어 주세요." />
                    <small>{note.length}/240</small>
                </label>}
                <div className="neighbor-teacher__row-actions">
                    <Button disabled={Boolean(busy) || !detail.source_revision} onClick={() => submit('publish')}>확인한 글 공개</Button>
                    {selection.mode === 'review' && <Button variant="outline" disabled={Boolean(busy) || !note.trim()} onClick={() => submit('return')}>이유와 함께 돌려보내기</Button>}
                </div>
            </div>}
        </Modal>
    );
}
