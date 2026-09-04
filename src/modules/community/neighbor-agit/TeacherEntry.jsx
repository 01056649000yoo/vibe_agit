import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import MissionPromptFields from '../../writing/mission-form/MissionPromptFields';
import { getNeighborActivityLabel, NEIGHBOR_ACTIVITY_TABS } from './activityTypes';
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
    const [activeActivityTab, setActiveActivityTab] = useState('gallery');
    const [postDetail, setPostDetail] = useState(null);
    const [detailBusy, setDetailBusy] = useState(false);
    const [activityForm, setActivityForm] = useState({ type: 'topic', title: '', prompt: '', classIds: [], shareScope: 'partners' });
    const [galleryCandidates, setGalleryCandidates] = useState(null);
    const [galleryLoading, setGalleryLoading] = useState(false);
    const [galleryQuery, setGalleryQuery] = useState('');
    const [matchingRoster, setMatchingRoster] = useState(null);
    const [matchingRows, setMatchingRows] = useState([]);
    const [matchingLoading, setMatchingLoading] = useState(false);

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
        setGalleryCandidates(null);
        setGalleryQuery('');
        setMatchingRoster(null);
        setMatchingRows([]);
        setSpaceForm({ name: '', publicClassName: activeClass?.name || '', description: '' });
        setJoinForm({ inviteKey: '', publicClassName: activeClass?.name || '' });
        setActiveActivityTab('gallery');
        setActivityForm({ type: 'topic', title: '', prompt: '', classIds: classId ? [classId] : [], shareScope: 'partners' });
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

    const createActivity = async (event) => {
        event.preventDefault();
        if (activityForm.type === 'exchange' && activityForm.classIds.length !== 2) {
            setErrorMessage('글짝 교환 활동에 참여할 두 학급을 골라 주세요.');
            return;
        }
        const result = await runAction('create_activity', {
            space_id: workspace.space.id,
            type: activityForm.type,
            title: activityForm.title.trim(),
            prompt: activityForm.prompt.trim(),
            exchange_class_ids: activityForm.type === 'exchange' ? activityForm.classIds : null,
            exchange_share_scope: activityForm.type === 'exchange' ? activityForm.shareScope : null
        }, activityForm.type === 'topic'
            ? '함께 쓰는 주제를 제안했습니다. 다른 학급 교사의 승인을 기다려 주세요.'
            : '글짝 교환 활동을 제안했습니다. 상대 학급 교사의 승인을 기다려 주세요.');
        if (result) setActivityForm((current) => ({ ...current, title: '', prompt: '' }));
    };

    const selectActivityTab = (tabId) => {
        setActiveActivityTab(tabId);
        setMatchingRoster(null);
        setMatchingRows([]);
        if (tabId === 'gallery') return;
        setActivityForm((current) => ({ ...current, type: tabId, classIds: [classId] }));
    };

    const loadGalleryCandidates = async () => {
        if (!workspace?.space?.id || galleryLoading) return;
        setGalleryLoading(true);
        setErrorMessage('');
        try {
            setGalleryCandidates(await api.getShareCandidates({
                spaceId: workspace.space.id,
                classId,
                limit: 100
            }));
        } catch (error) {
            setErrorMessage(getErrorMessage(error, '우리 학급 글을 불러오지 못했습니다.'));
        } finally {
            setGalleryLoading(false);
        }
    };

    const publishGalleryPost = async (post) => {
        const result = await runAction('publish_gallery_post', {
            space_id: workspace.space.id,
            post_id: post.post_id
        }, `${post.student_name} 학생의 글을 글 나눔 공간에 올렸습니다.`);
        if (!result) return;
        setGalleryCandidates((current) => current?.map((item) => item.post_id === post.post_id
            ? { ...item, shared_post_id: result.shared_post_id, share_status: result.status, review_note: '' }
            : item));
    };

    const openExchangeMatching = async (activity) => {
        if (matchingLoading) return;
        setMatchingLoading(true);
        setErrorMessage('');
        try {
            const roster = await api.getExchangeRoster({
                spaceId: workspace.space.id,
                classId,
                activityId: activity.id
            });
            const [firstClass, secondClass] = roster.classes;
            const largerClass = firstClass.students.length >= secondClass.students.length ? firstClass : secondClass;
            const smallerClass = largerClass.class_id === firstClass.class_id ? secondClass : firstClass;
            setMatchingRoster({ ...roster, activity, largerClass, smallerClass });
            setMatchingRows(largerClass.students.map((student, index) => ({
                studentKey: student.student_key,
                studentName: student.name,
                partnerKey: smallerClass.students.length > 0
                    ? smallerClass.students[index % smallerClass.students.length].student_key
                    : ''
            })));
        } catch (error) {
            setMatchingRoster(null);
            setMatchingRows([]);
            setErrorMessage(getErrorMessage(error, '두 학급 학생을 불러오지 못했습니다.'));
        } finally {
            setMatchingLoading(false);
        }
    };

    const updateMatchingPartner = (studentKey, partnerKey) => {
        setMatchingRows((current) => current.map((row) => row.studentKey === studentKey
            ? { ...row, partnerKey }
            : row));
    };

    const proposeExchangeMatches = async () => {
        if (!matchingRoster || matchingRows.some((row) => !row.partnerKey)) return;
        const partnerCounts = new Map();
        matchingRows.forEach((row) => partnerCounts.set(row.partnerKey, (partnerCounts.get(row.partnerKey) || 0) + 1));
        const isBalanced = matchingRoster.smallerClass.students.every((student) => {
            const count = partnerCounts.get(student.student_key) || 0;
            return count >= 1 && count <= 2;
        });
        if (!isBalanced) {
            setErrorMessage('모든 학생에게 한 명 또는 두 명의 글짝이 연결되도록 조정해 주세요.');
            return;
        }
        const result = await runAction('propose_exchange_matches', {
            space_id: workspace.space.id,
            activity_id: matchingRoster.activity.id,
            pairs: matchingRows.map((row) => ({
                student_key: row.studentKey,
                partner_key: row.partnerKey
            }))
        }, '글짝 매칭안을 보냈습니다. 상대 학급 교사의 승인을 기다려 주세요.');
        if (result) {
            setMatchingRoster(null);
            setMatchingRows([]);
        }
    };

    const toggleExchangeClass = (targetClassId) => {
        if (targetClassId === classId) return;
        setActivityForm((current) => {
            const selected = current.classIds.includes(targetClassId)
                ? [classId]
                : [classId, targetClassId];
            return { ...current, classIds: selected };
        });
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
    const activities = workspace?.activities || [];
    const selectedActivities = activeActivityTab === 'gallery'
        ? []
        : activities.filter((activity) => activity.type === activeActivityTab);
    const visibleGalleryCandidates = (galleryCandidates || []).filter((post) => {
        const query = galleryQuery.trim().toLocaleLowerCase('ko-KR');
        return !query || `${post.student_name} ${post.title}`.toLocaleLowerCase('ko-KR').includes(query);
    });

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
                            ['activities', '세 가지 활동'],
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

                    {activeTab === 'activities' && (
                        <div className="neighbor-teacher__activity-layout">
                            <nav className="neighbor-teacher__activity-tabs" aria-label="세 가지 활동 전환" role="tablist">
                                {NEIGHBOR_ACTIVITY_TABS.map(({ id, icon, label }, index) => (
                                    <button type="button" role="tab" key={id} className={activeActivityTab === id ? 'is-active' : ''} aria-selected={activeActivityTab === id} onClick={() => selectActivityTab(id)}>
                                        <small>활동 {index + 1}</small>
                                        <span aria-hidden="true">{icon}</span>
                                        <strong>{label}</strong>
                                    </button>
                                ))}
                            </nav>

                            {activeActivityTab === 'gallery' ? (
                                <section className="neighbor-teacher-card neighbor-teacher__activity-panel" role="tabpanel">
                                    <div><span>활동 1</span><h2>🖼️ {getNeighborActivityLabel('gallery')}</h2></div>
                                    <p>학생이 공개를 요청한 글을 승인하거나, 교사가 우리 학급의 제출 글을 직접 골라 모든 참여 학급에 소개할 수 있습니다.</p>
                                    <div className="neighbor-teacher__row-actions">
                                        <Button type="button" onClick={() => setActiveTab('review')}>글 검토로 이동{pendingPosts.length > 0 ? ` (${pendingPosts.length})` : ''}</Button>
                                        <Button type="button" variant="outline" onClick={() => setActiveTab('feed')}>공개 글 관리로 이동</Button>
                                        <Button type="button" variant="outline" loading={galleryLoading} disabled={Boolean(busy)} onClick={loadGalleryCandidates}>우리 학급 글 불러오기</Button>
                                    </div>
                                    {galleryCandidates && (
                                        <div className="neighbor-teacher__candidate-panel">
                                            <label>
                                                학생 이름이나 글 제목 찾기
                                                <input value={galleryQuery} maxLength={80} placeholder="예: 김하늘, 우리 동네" onChange={(event) => setGalleryQuery(event.target.value)} />
                                            </label>
                                            {visibleGalleryCandidates.length === 0 ? (
                                                <p className="neighbor-teacher__empty">조건에 맞는 제출 글이 없습니다.</p>
                                            ) : (
                                                <div className="neighbor-teacher__candidate-list">
                                                    {visibleGalleryCandidates.map((post) => (
                                                        <article key={post.post_id}>
                                                            <div>
                                                                <span><strong>{post.student_name}</strong><small>{post.share_status === 'published' ? '공개 중' : post.share_status === 'hidden' ? '숨김' : post.share_status === 'pending' ? '학생 요청 대기' : '공유 전'}</small></span>
                                                                <h3>{post.title || '제목 없는 글'}</h3>
                                                                <p>{post.excerpt || '내용 미리보기가 없습니다.'}</p>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant={post.share_status ? 'outline' : 'primary'}
                                                                loading={busy === 'publish_gallery_post'}
                                                                disabled={Boolean(busy) || ['published', 'hidden'].includes(post.share_status)}
                                                                onClick={() => publishGalleryPost(post)}
                                                            >
                                                                {post.share_status === 'published' ? '공개 중' : post.share_status === 'hidden' ? '공개 글 관리에서 복원' : '공유에 올리기'}
                                                            </Button>
                                                        </article>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </section>
                            ) : (
                                <>
                                    <section className="neighbor-teacher-card neighbor-teacher__activity-panel" role="tabpanel">
                                        <div>
                                            <span>활동 {activeActivityTab === 'topic' ? '2' : '3'}</span>
                                            <h2>{activeActivityTab === 'topic' ? '✍️' : '💌'} {getNeighborActivityLabel(activeActivityTab)}</h2>
                                        </div>
                                        <p>{activeActivityTab === 'topic'
                                            ? '모든 참여 학급에 같은 주제의 글쓰기 과제를 만들고, 제출한 글을 한 공간에서 나눕니다.'
                                            : '두 학급이 같은 주제로 쓴 뒤 글짝을 맺습니다. 인원이 다르면 한 학생이 최대 두 명과 연결됩니다.'}</p>
                                    </section>

                                    <form className="neighbor-teacher-card neighbor-teacher__activity-form" onSubmit={createActivity}>
                                        <div><span>참여 교사</span><h2>새 {getNeighborActivityLabel(activeActivityTab)} 제안하기</h2></div>
                                        <p>한 학급이 제안하고 다른 참여 학급 교사가 모두 승인하면 양쪽 학생에게 동시에 열립니다.</p>
                                        <MissionPromptFields
                                            title={activityForm.title}
                                            guide={activityForm.prompt}
                                            onTitleChange={(title) => setActivityForm((current) => ({ ...current, title }))}
                                            onGuideChange={(prompt) => setActivityForm((current) => ({ ...current, prompt }))}
                                            isMobile={isMobile}
                                            titleMaxLength={80}
                                            guideMaxLength={1000}
                                            required
                                            titlePlaceholder="글쓰기 주제 (예: 우리 동네의 숨은 보물)"
                                            guidePlaceholder="안내 가이드 (무엇을 떠올리고 어떻게 써 볼지 알려 주세요)"
                                        />
                                        {activityForm.type === 'exchange' && (
                                            <>
                                                <fieldset className="neighbor-teacher__class-choice">
                                                    <legend>교환할 두 학급</legend>
                                                    {activeMemberships.map((membership) => (
                                                        <label key={membership.class_id}>
                                                            <input type="checkbox" checked={activityForm.classIds.includes(membership.class_id)} disabled={membership.class_id === classId} onChange={() => toggleExchangeClass(membership.class_id)} />
                                                            {membership.class_name}{membership.class_id === classId ? ' (우리 학급)' : ''}
                                                        </label>
                                                    ))}
                                                    <small>상대 학급 {Math.max(activityForm.classIds.length - 1, 0)}/1 선택</small>
                                                </fieldset>
                                                <fieldset className="neighbor-teacher__scope-choice">
                                                    <legend>글을 나눌 범위</legend>
                                                    <label>
                                                        <input type="radio" name="exchange-share-scope" value="partners" checked={activityForm.shareScope === 'partners'} onChange={() => setActivityForm((current) => ({ ...current, shareScope: 'partners' }))} />
                                                        <span><strong>글짝끼리만 나누기</strong><small>나와 연결된 글짝의 글만 읽고 댓글을 씁니다.</small></span>
                                                    </label>
                                                    <label>
                                                        <input type="radio" name="exchange-share-scope" value="space" checked={activityForm.shareScope === 'space'} onChange={() => setActivityForm((current) => ({ ...current, shareScope: 'space' }))} />
                                                        <span><strong>교환 뒤 전체 글 공개</strong><small>두 학급의 검토 완료 글을 활동 참여 학생 모두가 읽고 댓글을 씁니다.</small></span>
                                                    </label>
                                                </fieldset>
                                            </>
                                        )}
                                        <Button type="submit" loading={busy === 'create_activity'} disabled={Boolean(busy) || (activityForm.type === 'exchange' && activityForm.classIds.length !== 2)}>{getNeighborActivityLabel(activeActivityTab)} 제안하기</Button>
                                    </form>

                                    <section className="neighbor-teacher-card neighbor-teacher__activity-list">
                                        <div><span>진행 현황</span><h2>{getNeighborActivityLabel(activeActivityTab)}</h2></div>
                                        {selectedActivities.length === 0 ? <p className="neighbor-teacher__empty">아직 만든 활동이 없습니다.</p> : selectedActivities.map((activity) => (
                                    <article key={activity.id}>
                                        <div>
                                            <span>{getNeighborActivityLabel(activity.type)} · {activity.status === 'pending_approval' ? '활동 승인 대기' : activity.status === 'matching_review' ? '매칭 승인 대기' : activity.status === 'closed' ? '종료' : activity.status === 'matched' ? '매칭 완료' : activity.type === 'exchange' ? '매칭 준비' : '글 쓰는 중'}</span>
                                            <h3>{activity.title}</h3>
                                            <p>{activity.prompt}</p>
                                            {activity.type === 'exchange' && <small className="neighbor-teacher__scope-label">공유 범위 · {activity.exchange_share_scope === 'space' ? '두 학급 전체' : '글짝끼리만'}</small>}
                                            {activity.approvals?.length > 0 && <ul className="neighbor-teacher__approvals">{activity.approvals.map((approval) => <li key={approval.class_id} data-status={approval.status}>{approval.class_name} · {approval.is_proposer ? '제안함' : approval.status === 'approved' ? '승인' : approval.status === 'rejected' ? '거절' : approval.status === 'cancelled' ? '종료' : '확인 전'}</li>)}</ul>}
                                            <ul>{activity.class_stats.map((item) => <li key={item.class_id}>{item.class_name} · 제출 {item.submitted_count} · 검토 {item.review_count} · 공개 {item.published_count}</li>)}</ul>
                                            {activity.type === 'exchange' && activity.match_pairs?.length > 0 && (
                                                <details className="neighbor-teacher__match-summary" open={activity.status === 'matching_review'}>
                                                    <summary>{activity.match_pairs.length}개 글짝 연결 보기</summary>
                                                    <ul>{activity.match_pairs.map((pair, index) => <li key={`${pair.student_name}-${pair.partner_name}-${index}`}>{pair.student_class_name} {pair.student_name} ↔ {pair.partner_class_name} {pair.partner_name}</li>)}</ul>
                                                </details>
                                            )}
                                        </div>
                                        {activity.can_review && (
                                            <div className="neighbor-teacher__row-actions">
                                                <Button type="button" loading={busy === 'review_activity'} disabled={Boolean(busy)} onClick={() => runAction('review_activity', { space_id: workspace.space.id, activity_id: activity.id, approve: true }, '활동 제안을 승인했습니다. 모든 교사가 승인하면 학생에게 열립니다.')}>활동 승인</Button>
                                                <Button type="button" variant="outline" loading={busy === 'review_activity'} disabled={Boolean(busy)} onClick={() => runAction('review_activity', { space_id: workspace.space.id, activity_id: activity.id, approve: false }, '활동 제안을 거절했습니다.')}>거절</Button>
                                            </div>
                                        )}
                                        {activity.can_review_match && (
                                            <div className="neighbor-teacher__row-actions">
                                                <Button type="button" loading={busy === 'review_exchange_matches'} disabled={Boolean(busy)} onClick={() => runAction('review_exchange_matches', { space_id: workspace.space.id, activity_id: activity.id, approve: true }, '글짝 매칭을 승인했습니다. 두 학급 학생에게 글쓰기 활동이 열렸습니다.')}>매칭 승인</Button>
                                                <Button type="button" variant="outline" loading={busy === 'review_exchange_matches'} disabled={Boolean(busy)} onClick={() => runAction('review_exchange_matches', { space_id: workspace.space.id, activity_id: activity.id, approve: false }, '매칭안을 돌려보냈습니다. 호스트 교사가 다시 정할 수 있습니다.')}>다시 매칭 요청</Button>
                                            </div>
                                        )}
                                        {activity.can_manage && activity.status !== 'pending_approval' && activity.status !== 'closed' && (
                                            <div className="neighbor-teacher__row-actions">
                                                {activity.can_propose_match && <Button type="button" loading={matchingLoading} disabled={Boolean(busy) || matchingLoading} onClick={() => openExchangeMatching(activity)}>학생 불러와 매칭하기</Button>}
                                                <Button type="button" variant="outline" loading={busy === 'close_activity'} disabled={Boolean(busy)} onClick={() => window.confirm('이 활동의 새 글쓰기를 마칠까요? 공개된 글은 남습니다.') && runAction('close_activity', { space_id: workspace.space.id, activity_id: activity.id }, '활동을 마쳤습니다.')}>활동 종료</Button>
                                            </div>
                                        )}
                                    </article>
                                        ))}
                                    </section>

                                    {activeActivityTab === 'exchange' && matchingRoster && (
                                        <section className="neighbor-teacher-card neighbor-teacher__matching-editor" aria-labelledby="neighbor-matching-title">
                                            <div><span>호스트 매칭안</span><h2 id="neighbor-matching-title">두 학급 학생 연결하기</h2></div>
                                            <p>{matchingRoster.largerClass.class_name} 학생마다 {matchingRoster.smallerClass.class_name} 글짝을 한 명씩 골라 주세요. 학생 수가 다르면 한 학생에게 두 명까지 연결할 수 있습니다.</p>
                                            <div className="neighbor-teacher__matching-counts">
                                                {matchingRoster.classes.map((item) => <span key={item.class_id}>{item.class_name} <strong>{item.students.length}</strong>명</span>)}
                                            </div>
                                            <div className="neighbor-teacher__matching-list">
                                                {matchingRows.map((row) => (
                                                    <label key={row.studentKey}>
                                                        <strong>{matchingRoster.largerClass.class_name} · {row.studentName}</strong>
                                                        <span aria-hidden="true">↔</span>
                                                        <select value={row.partnerKey} onChange={(event) => updateMatchingPartner(row.studentKey, event.target.value)}>
                                                            <option value="">글짝 선택</option>
                                                            {matchingRoster.smallerClass.students.map((student) => <option key={student.student_key} value={student.student_key}>{matchingRoster.smallerClass.class_name} · {student.name}</option>)}
                                                        </select>
                                                    </label>
                                                ))}
                                            </div>
                                            <div className="neighbor-teacher__row-actions">
                                                <Button type="button" loading={busy === 'propose_exchange_matches'} disabled={Boolean(busy) || matchingRows.some((row) => !row.partnerKey)} onClick={proposeExchangeMatches}>상대 교사에게 승인 요청</Button>
                                                <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => { setMatchingRoster(null); setMatchingRows([]); }}>취소</Button>
                                            </div>
                                        </section>
                                    )}
                                </>
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
