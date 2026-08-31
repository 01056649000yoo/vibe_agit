import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import { neighborAgitTeacherApi } from './teacherApi';
import './TeacherEntry.css';

const STATUS_LABELS = Object.freeze({
    pending: '검토 대기',
    published: '공개 중',
    returned: '돌려보냄',
    hidden: '숨김',
    recalled: '회수'
});

const getErrorMessage = (error, fallback) => {
    const message = error?.message || '';
    if (message.includes('현재 공개 대상')) return '현재 선택한 학급에서는 이웃 아지트를 아직 사용할 수 없습니다.';
    return message || fallback;
};

const NeighborAgitTeacherEntry = ({ activeClass, isMobile, api = neighborAgitTeacherApi }) => {
    const classId = activeClass?.id;
    const [workspace, setWorkspace] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [spaceForm, setSpaceForm] = useState({ name: '', publicClassName: activeClass?.name || '', description: '' });
    const [joinForm, setJoinForm] = useState({ inviteKey: '', publicClassName: activeClass?.name || '' });
    const [invite, setInvite] = useState(null);
    const [activeTab, setActiveTab] = useState('space');
    const [postDetail, setPostDetail] = useState(null);
    const [detailBusy, setDetailBusy] = useState(false);

    const loadWorkspace = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');
        try {
            setWorkspace(await api.getWorkspace(classId));
        } catch (error) {
            setWorkspace(null);
            setErrorMessage(getErrorMessage(error, '이웃 아지트 화면을 불러오지 못했습니다.'));
        } finally {
            setLoading(false);
        }
    }, [api, classId]);

    useEffect(() => {
        setWorkspace(null);
        setInvite(null);
        setPostDetail(null);
        setSpaceForm({ name: '', publicClassName: activeClass?.name || '', description: '' });
        setJoinForm({ inviteKey: '', publicClassName: activeClass?.name || '' });
        void loadWorkspace();
    }, [activeClass?.name, classId, loadWorkspace]);

    const runAction = async (action, payload, successMessage) => {
        if (!classId || busy) return null;
        setBusy(action);
        setMessage('');
        setErrorMessage('');
        try {
            const next = await api.runAction(classId, action, payload);
            setWorkspace(next.workspace);
            if (action === 'hide_post' || action === 'restore_post') {
                setPostDetail(null);
            }
            if (action === 'hide_comment' || action === 'restore_comment') {
                setPostDetail((current) => current ? {
                    ...current,
                    comments: current.comments.map((comment) => comment.comment_id === payload.item_id
                        ? { ...comment, status: action === 'hide_comment' ? 'hidden' : 'visible' }
                        : comment)
                } : current);
            }
            setMessage(successMessage);
            return next.result;
        } catch (error) {
            setErrorMessage(getErrorMessage(error, '요청을 처리하지 못했습니다.'));
            return null;
        } finally {
            setBusy('');
        }
    };

    const createSpace = async (event) => {
        event.preventDefault();
        const result = await runAction('create_space', {
            name: spaceForm.name.trim(),
            public_class_name: spaceForm.publicClassName.trim(),
            description: spaceForm.description.trim()
        }, '이웃 아지트 공간을 만들었습니다.');
        if (result) setSpaceForm((current) => ({ ...current, name: '', description: '' }));
    };

    const joinSpace = async (event) => {
        event.preventDefault();
        const result = await runAction('join_space', {
            invite_key: joinForm.inviteKey.trim(),
            public_class_name: joinForm.publicClassName.trim()
        }, '참여를 신청했습니다. 호스트 교사의 승인을 기다려 주세요.');
        if (result) setJoinForm((current) => ({ ...current, inviteKey: '' }));
    };

    const createInvite = async () => {
        const result = await runAction('create_invite', {
            space_id: workspace.space.id
        }, '새 초대키를 만들었습니다.');
        if (result?.invite_key) setInvite(result);
    };

    const openPostDetail = async (sharedPostId) => {
        if (detailBusy) return;
        setDetailBusy(true);
        setPostDetail(null);
        setErrorMessage('');
        try {
            setPostDetail(await api.getPostDetail({
                spaceId: workspace.space.id,
                classId,
                sharedPostId
            }));
        } catch (error) {
            setErrorMessage(getErrorMessage(error, '글과 댓글을 불러오지 못했습니다.'));
        } finally {
            setDetailBusy(false);
        }
    };

    const pendingMemberships = useMemo(
        () => workspace?.memberships?.filter((item) => item.status === 'pending') || [],
        [workspace?.memberships]
    );
    const activeMemberships = useMemo(
        () => workspace?.memberships?.filter((item) => item.status === 'active') || [],
        [workspace?.memberships]
    );
    const pendingPosts = useMemo(
        () => workspace?.review_posts?.filter((item) => item.status === 'pending') || [],
        [workspace?.review_posts]
    );

    if (loading) {
        return <section className="neighbor-teacher-state">이웃 아지트 정보를 불러오는 중입니다…</section>;
    }

    if (!workspace) {
        return (
            <section className="neighbor-teacher-state neighbor-teacher-state--closed">
                <div aria-hidden="true">🤝</div>
                <h1>이웃 아지트(제작 중)</h1>
                <p>{errorMessage || '현재 선택한 학급에서는 아직 사용할 수 없습니다.'}</p>
            </section>
        );
    }

    return (
        <section className={`neighbor-teacher ${isMobile ? 'is-mobile' : ''}`}>
            <header className="neighbor-teacher__header">
                <div>
                    <span>선택 학급 제한 공개</span>
                    <h1>🤝 이웃 아지트</h1>
                    <p>{activeClass?.name}과 다른 학급이 하나의 글 피드에서 만납니다.</p>
                </div>
                <div className="neighbor-teacher__header-actions">
                    <TeacherGuideButton tabId="neighbor-agit" variant="help" />
                    <Button type="button" variant="outline" loading={loading} onClick={loadWorkspace}>새로고침</Button>
                </div>
            </header>

            {message && <p className="neighbor-teacher__message" role="status">{message}</p>}
            {errorMessage && <p className="neighbor-teacher__message neighbor-teacher__message--error" role="alert">{errorMessage}</p>}

            {!workspace.space ? (
                <div className="neighbor-teacher__start-grid">
                    <form className="neighbor-teacher-card" onSubmit={createSpace}>
                        <div><span>호스트</span><h2>새 공간 만들기</h2></div>
                        <label>공간 이름<input value={spaceForm.name} maxLength={60} required onChange={(event) => setSpaceForm({ ...spaceForm, name: event.target.value })} /></label>
                        <label>공개 학급 이름<input value={spaceForm.publicClassName} maxLength={40} required onChange={(event) => setSpaceForm({ ...spaceForm, publicClassName: event.target.value })} /></label>
                        <label>공간 소개<textarea value={spaceForm.description} maxLength={240} onChange={(event) => setSpaceForm({ ...spaceForm, description: event.target.value })} /></label>
                        <Button type="submit" loading={busy === 'create_space'} disabled={Boolean(busy)}>공간 만들기</Button>
                    </form>
                    <form className="neighbor-teacher-card" onSubmit={joinSpace}>
                        <div><span>게스트</span><h2>초대키로 참여하기</h2></div>
                        <label>초대키<input value={joinForm.inviteKey} maxLength={24} required autoComplete="off" onChange={(event) => setJoinForm({ ...joinForm, inviteKey: event.target.value })} /></label>
                        <label>공개 학급 이름<input value={joinForm.publicClassName} maxLength={40} required onChange={(event) => setJoinForm({ ...joinForm, publicClassName: event.target.value })} /></label>
                        <Button type="submit" loading={busy === 'join_space'} disabled={Boolean(busy)}>참여 신청</Button>
                    </form>
                </div>
            ) : workspace.space.my_status === 'pending' ? (
                <section className="neighbor-teacher-state">
                    <div aria-hidden="true">⏳</div>
                    <h2>{workspace.space.name}</h2>
                    <p>참여 신청을 보냈습니다. 호스트 교사가 승인하면 공간 관리가 열립니다.</p>
                    <Button type="button" variant="outline" loading={busy === 'leave_space'} onClick={() => runAction('leave_space', { space_id: workspace.space.id }, '참여 신청을 취소했습니다.')}>신청 취소</Button>
                </section>
            ) : (
                <>
                    <section className="neighbor-teacher__overview">
                        <div><span>{workspace.space.my_role === 'host' ? '호스트' : '게스트'}</span><h2>{workspace.space.name}</h2><p>{workspace.space.description || '여러 학급이 글로 만나는 공간입니다.'}</p></div>
                        <div className="neighbor-teacher__metrics">
                            <span>참여 <strong>{activeMemberships.length}</strong>학급</span>
                            <span>검토 <strong>{pendingPosts.length}</strong>편</span>
                            <span>공개 <strong>{workspace.public_posts.filter((item) => item.status === 'published').length}</strong>편</span>
                        </div>
                    </section>

                    <nav className="neighbor-teacher__tabs" aria-label="이웃 아지트 관리 메뉴">
                        {[
                            ['space', '공간·초대'],
                            ['review', `글 검토 ${pendingPosts.length}`],
                            ['feed', '공개 글 관리']
                        ].map(([id, label]) => <button type="button" key={id} className={activeTab === id ? 'is-active' : ''} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)}>{label}</button>)}
                    </nav>

                    {activeTab === 'space' && (
                        <div className="neighbor-teacher__space-grid">
                            <section className="neighbor-teacher-card">
                                <div><span>참여 학급</span><h2>{activeMemberships.length}/4</h2></div>
                                <ul className="neighbor-teacher__members">
                                    {workspace.memberships.map((membership) => (
                                        <li key={membership.class_id}>
                                            <span><strong>{membership.class_name}</strong><small>{membership.role === 'host' ? '호스트' : membership.status === 'pending' ? '승인 대기' : '게스트'} · 학생 {membership.student_access_enabled ? '공개' : 'OFF'}</small></span>
                                            {workspace.space.my_role === 'host' && membership.status === 'pending' && <span className="neighbor-teacher__row-actions"><Button type="button" onClick={() => runAction('review_join', { space_id: workspace.space.id, target_class_id: membership.class_id, approve: true }, '참여 학급을 승인했습니다.')}>승인</Button><Button type="button" variant="outline" onClick={() => runAction('review_join', { space_id: workspace.space.id, target_class_id: membership.class_id, approve: false }, '참여 신청을 거절했습니다.')}>거절</Button></span>}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                            <section className="neighbor-teacher-card">
                                <div><span>우리 학급</span><h2>학생 공개</h2></div>
                                <p>두 학급 이상 참여한 뒤 켜면 학생 홈에 이웃 아지트 카드가 나타납니다.</p>
                                <Button type="button" variant={workspace.space.student_access_enabled ? 'outline' : 'primary'} loading={busy === 'set_access'} disabled={Boolean(busy) || activeMemberships.length < 2} onClick={() => runAction('set_access', { space_id: workspace.space.id, enabled: !workspace.space.student_access_enabled }, workspace.space.student_access_enabled ? '학생 공개를 껐습니다.' : '학생 공개를 켰습니다.')}>{workspace.space.student_access_enabled ? '학생 공개 끄기' : '학생 공개 켜기'}</Button>
                            </section>
                            {workspace.space.my_role === 'host' ? (
                                <section className="neighbor-teacher-card">
                                    <div><span>호스트</span><h2>초대키</h2></div>
                                    {invite ? <div className="neighbor-teacher__invite"><strong>{invite.invite_key}</strong><small>{new Date(invite.expires_at).toLocaleString('ko-KR')}까지 · 한 번만 사용</small></div> : <p>다른 학급 교사에게 전달할 일회용 초대키를 만듭니다.</p>}
                                    <Button type="button" loading={busy === 'create_invite'} disabled={Boolean(busy) || activeMemberships.length >= 4 || pendingMemberships.length > 0} onClick={createInvite}>새 초대키 만들기</Button>
                                    <Button type="button" variant="outline" loading={busy === 'close_space'} disabled={Boolean(busy)} onClick={() => window.confirm('공간을 종료하면 학생 접근이 즉시 끝납니다. 종료할까요?') && runAction('close_space', { space_id: workspace.space.id }, '공간을 종료했습니다.')}>공간 종료</Button>
                                </section>
                            ) : (
                                <section className="neighbor-teacher-card">
                                    <div><span>게스트</span><h2>공간 나가기</h2></div>
                                    <p>원래 학급의 글은 보존되고 이웃 공간 연결만 끝납니다.</p>
                                    <Button type="button" variant="outline" loading={busy === 'leave_space'} disabled={Boolean(busy)} onClick={() => window.confirm('이 공간에서 나갈까요?') && runAction('leave_space', { space_id: workspace.space.id }, '공간에서 나갔습니다.')}>공간 나가기</Button>
                                </section>
                            )}
                        </div>
                    )}

                    {activeTab === 'review' && (
                        <section className="neighbor-teacher-card">
                            <div><span>우리 학급 글</span><h2>공개 요청 검토</h2></div>
                            {pendingPosts.length === 0 ? <p className="neighbor-teacher__empty">검토를 기다리는 글이 없습니다.</p> : <div className="neighbor-teacher__post-list">{pendingPosts.map((post) => <article key={post.shared_post_id}><div><span><strong>{post.student_name}</strong><small>{STATUS_LABELS[post.status]}</small></span><h3>{post.title}</h3><p>{post.excerpt}</p></div><div className="neighbor-teacher__row-actions"><Button type="button" disabled={Boolean(busy)} onClick={() => runAction('review_post', { space_id: workspace.space.id, shared_post_id: post.shared_post_id, decision: 'publish', review_note: '' }, '글을 이웃 피드에 공개했습니다.')}>공개</Button><Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => runAction('review_post', { space_id: workspace.space.id, shared_post_id: post.shared_post_id, decision: 'return', review_note: '내용을 다시 확인해 주세요.' }, '글을 학생에게 돌려보냈습니다.')}>돌려보내기</Button></div></article>)}</div>}
                        </section>
                    )}

                    {activeTab === 'feed' && (
                        <div className="neighbor-teacher__feed-layout">
                            <section className="neighbor-teacher-card">
                                <div><span>공간 피드</span><h2>공개 글 관리</h2></div>
                                {workspace.public_posts.length === 0 ? <p className="neighbor-teacher__empty">공개된 글이 없습니다.</p> : <div className="neighbor-teacher__post-list">{workspace.public_posts.map((post) => <article key={post.shared_post_id}><button type="button" className="neighbor-teacher__post-open" onClick={() => openPostDetail(post.shared_post_id)}><span><strong>{post.author_name}</strong><small>{post.class_name} · {STATUS_LABELS[post.status]}</small></span><h3>{post.title}</h3><p>{post.excerpt}</p><small>💛 {post.reaction_count || 0} · 💬 {post.comment_count || 0}</small></button>{post.status === 'published' && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => runAction('hide_post', { space_id: workspace.space.id, item_id: post.shared_post_id, reason: '교사 확인' }, '글을 공간에서 숨겼습니다.')}>숨기기</Button>}{post.status === 'hidden' && post.is_own_class && <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => runAction('restore_post', { space_id: workspace.space.id, item_id: post.shared_post_id, reason: '' }, '글을 다시 공개했습니다.')}>복원</Button>}</article>)}</div>}
                            </section>
                            {(detailBusy || postDetail) && <section className="neighbor-teacher-card neighbor-teacher__detail">{detailBusy ? <p>글을 불러오는 중입니다…</p> : <><div><span>{postDetail.class_name}</span><h2>{postDetail.title}</h2></div><p className="neighbor-teacher__detail-content">{postDetail.content}</p><h3>댓글 {postDetail.comments.length}개</h3>{postDetail.comments.length === 0 ? <p>댓글이 없습니다.</p> : <ul>{postDetail.comments.map((comment) => <li key={comment.comment_id}><span><strong>{comment.author_name}</strong><small>{comment.class_name}</small></span><p>{comment.status === 'hidden' ? '숨긴 댓글' : comment.content}</p>{comment.status === 'visible' ? <Button type="button" variant="outline" onClick={() => runAction('hide_comment', { space_id: workspace.space.id, item_id: comment.comment_id, reason: '교사 확인' }, '댓글을 숨겼습니다.')}>숨기기</Button> : comment.is_own_class ? <Button type="button" variant="outline" onClick={() => runAction('restore_comment', { space_id: workspace.space.id, item_id: comment.comment_id, reason: '' }, '댓글을 복원했습니다.')}>복원</Button> : null}</li>)}</ul>}</>}</section>}
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default NeighborAgitTeacherEntry;
