import { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import MissionPromptFields from '../../writing/mission-form/MissionPromptFields';
import MissionTypePicker from '../../../components/teacher/MissionTypePicker';
import { applyGenrePreset, describePresetResult, getGenreEntries } from '../../writing/mission-types/genreCatalog';

/** 전용 틀 id(`poem` 등)로 카탈로그의 글 종류 이름(`시`)을 찾는다. 목록의 정본은 카탈로그 하나다. */
const genreIdForMissionType = (missionTypeId) => (
    getGenreEntries().find((entry) => entry.missionTypeId === missionTypeId)?.id || '기타'
);
import { getNeighborActivityLabel, NEIGHBOR_ACTIVITY_TABS } from './activityTypes';
import { neighborAgitTeacherApi } from './teacherApi';
import TeacherPostReview from './TeacherPostReview';
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
    const [reviewSelection, setReviewSelection] = useState(null);
    const [detailBusy, setDetailBusy] = useState(false);
    // 학급 과제와 같은 칸을 쓴다(`genreCatalog` 의 preset 이 채우는 이름 그대로).
    const [activityForm, setActivityForm] = useState({
        type: 'topic', title: '', prompt: '', genre: '', guide_questions: [],
        min_chars: 50, min_paragraphs: 1, mission_type_id: ''
    });
    const [genrePickerOpen, setGenrePickerOpen] = useState(false);
    const [presetNotice, setPresetNotice] = useState('');
    const [galleryCandidates, setGalleryCandidates] = useState(null);
    const [galleryLoading, setGalleryLoading] = useState(false);
    const [galleryQuery, setGalleryQuery] = useState('');

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
        setSpaceForm({ name: '', publicClassName: activeClass?.name || '', description: '' });
        setJoinForm({ inviteKey: '', publicClassName: activeClass?.name || '' });
        setActiveActivityTab('gallery');
        setActivityForm({ type: 'topic', title: '', prompt: '' });
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

    /** 글 종류를 고르면 안내문·길잡이 질문·분량을 채운다. 학급 과제 만들기와 같은 규칙을 그대로 쓴다. */
    const selectGenre = (genreId, missionTypeId = '') => {
        setGenrePickerOpen(false);
        const result = applyGenrePreset(
            { ...activityForm, guide: activityForm.prompt },
            genreId,
            { previousGenre: activityForm.genre || null }
        );
        const next = result.formData;
        setActivityForm((current) => ({
            ...current,
            genre: next.genre,
            prompt: next.guide ?? current.prompt,
            guide_questions: Array.isArray(next.guide_questions) ? next.guide_questions : [],
            min_chars: Number(next.min_chars) || current.min_chars,
            min_paragraphs: Number(next.min_paragraphs) || current.min_paragraphs,
            mission_type_id: missionTypeId
        }));
        setPresetNotice(describePresetResult(genreId, result));
    };

    const createActivity = async (event) => {
        event.preventDefault();
        const result = await runAction('create_activity', {
            space_id: workspace.space.id,
            type: activityForm.type,
            title: activityForm.title.trim(),
            prompt: activityForm.prompt.trim(),
            genre: activityForm.genre || null,
            guide_questions: activityForm.guide_questions,
            min_chars: activityForm.min_chars,
            min_paragraphs: activityForm.min_paragraphs,
            mission_type_id: activityForm.mission_type_id || null
        }, '함께 쓰는 주제를 제안했습니다. 다른 학급 교사의 승인을 기다려 주세요.');
        if (result) {
            setActivityForm((current) => ({
                ...current, title: '', prompt: '', genre: '', guide_questions: [],
                min_chars: 50, min_paragraphs: 1, mission_type_id: ''
            }));
            setPresetNotice('');
        }
    };

    const selectActivityTab = (tabId) => {
        setActiveActivityTab(tabId);
        if (tabId === 'gallery') return;
        setActivityForm((current) => ({ ...current, type: tabId }));
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

    const submitReviewedPost = async (selection, detail, decision, note) => {
        if (busy) throw new Error('이전 요청을 처리하는 중입니다.');
        const isGallery = selection.mode === 'gallery';
        setBusy(isGallery ? 'publish_gallery_post' : 'review_post');
        setMessage('');
        setErrorMessage('');
        try {
            const next = await api.runAction(classId, isGallery ? 'publish_gallery_post' : 'review_post', {
                space_id: workspace.space.id,
                ...(isGallery ? { post_id: selection.post.post_id } : {
                    shared_post_id: selection.post.shared_post_id, decision, review_note: note
                }),
                source_revision: detail.source_revision
            });
            setWorkspace(next.workspace);
            setMessage(decision === 'return' ? '보완할 이유와 함께 학생에게 돌려보냈습니다.' : '확인한 글을 공개했습니다.');
            setGalleryCandidates(null);
        } finally {
            setBusy('');
        }
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
    const pendingTotal = workspace?.review_total ?? pendingPosts.length;
    const activities = workspace?.activities || [];
    /**
     * 세 단계의 진행 상태. `done` 은 “이 단계에서 할 일을 마쳤다”는 뜻이고, 화면에 ✓ 로 보인다.
     * 다음에 할 일을 `hint` 로 적어 선생님이 순서대로만 따라가면 되게 한다.
     */
    const steps = useMemo(() => {
        const joined = activeMemberships.length;
        const hasPartner = joined >= 2;
        return [
            {
                id: 'space',
                label: '이웃 아지트 만들기',
                done: true,
                hint: `참여 학급 ${joined}곳`
            },
            {
                id: 'invite',
                label: '아지트 초대하기',
                done: hasPartner,
                hint: hasPartner ? '이웃 학급과 연결됨' : '초대키를 만들어 전해 주세요'
            },
            {
                id: 'activities',
                label: '활동하기',
                done: hasPartner && activities.length > 0,
                hint: !hasPartner ? '이웃 학급이 들어오면 열려요'
                    : pendingTotal > 0 ? `검토할 글 ${pendingTotal}편`
                    : activities.length > 0 ? '진행 중인 활동이 있어요' : '첫 활동을 시작해 보세요'
            }
        ];
    }, [activeMemberships.length, activities.length, pendingTotal]);

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
                            <span>검토 <strong>{pendingTotal}</strong>편</span>
                            <span>공개 <strong>{workspace.public_posts.filter((item) => item.status === 'published').length}</strong>편</span>
                        </div>
                    </section>

                    {/* 만들기 → 초대하기 → 활동하기 세 단계를 **차례로 따라가는 길**로 보여 준다.
                        끝난 단계에는 ✓ 를 달아 지금 어디까지 왔는지 한눈에 보이게 한다.
                        글 검토·공개 글 관리는 활동의 뒷일이라 3단계 안에 둔다. */}
                    <nav className="neighbor-teacher__steps" aria-label="이웃 아지트 준비 단계">
                        {steps.map((step, index) => (
                            <button
                                type="button"
                                key={step.id}
                                className={`neighbor-teacher__step${activeTab === step.id ? ' is-active' : ''}${step.done ? ' is-done' : ''}`}
                                aria-current={activeTab === step.id ? 'step' : undefined}
                                onClick={() => setActiveTab(step.id)}
                            >
                                <span className="neighbor-teacher__step-no" aria-hidden="true">{step.done ? '✓' : index + 1}</span>
                                <span className="neighbor-teacher__step-text">
                                    <strong>{step.label}</strong>
                                    <small>{step.hint}</small>
                                </span>
                            </button>
                        ))}
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
                                    <div><span>호스트</span><h2>공간 종료</h2></div>
                                    <p>종료하면 학생 접근이 즉시 끝납니다. 이미 공개된 글은 남습니다.</p>
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

                    {activeTab === 'invite' && (
                        <div className="neighbor-teacher__space-grid">
                            {workspace.space.my_role === 'host' ? (
                                <section className="neighbor-teacher-card">
                                    <div><span>호스트</span><h2>초대키 만들기</h2></div>
                                    {invite ? <div className="neighbor-teacher__invite"><strong>{invite.invite_key}</strong><small>{new Date(invite.expires_at).toLocaleString('ko-KR')}까지 · 한 번만 사용</small></div> : <p>다른 학급 교사에게 전달할 일회용 초대키를 만듭니다. 상대 교사가 이 키로 신청하면 1단계에서 승인합니다.</p>}
                                    <Button type="button" loading={busy === 'create_invite'} disabled={Boolean(busy) || activeMemberships.length >= 4 || pendingMemberships.length > 0} onClick={createInvite}>새 초대키 만들기</Button>
                                    {pendingMemberships.length > 0 && <p>승인을 기다리는 학급이 있어 새 초대키를 만들 수 없습니다. 1단계에서 먼저 처리해 주세요.</p>}
                                    {activeMemberships.length >= 4 && <p>참여 학급이 4개로 가득 찼습니다.</p>}
                                </section>
                            ) : (
                                <section className="neighbor-teacher-card">
                                    <div><span>게스트</span><h2>초대는 호스트가 만듭니다</h2></div>
                                    <p>이 공간의 초대키는 호스트 학급 선생님이 만들어 전달합니다. 우리 학급은 이미 참여 중입니다.</p>
                                </section>
                            )}
                        </div>
                    )}

                    {activeTab === 'activities' && (
                        <div className="neighbor-teacher__activity-layout">
                            <nav className="neighbor-teacher__activity-tabs" aria-label="활동 전환" role="tablist">
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
                                    {/* 위 탭이 이미 활동 이름을 말한다. 안쪽에서 되풀이하지 않아 한 화면에 더 담긴다. */}
                                    <p>학생이 공개를 요청한 글을 승인하거나, 교사가 우리 학급의 제출 글을 직접 골라 모든 참여 학급에 소개할 수 있습니다.</p>
                                    <div className="neighbor-teacher__row-actions">
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
                                                                onClick={() => setReviewSelection({ post, mode: 'gallery' })}
                                                            >
                                                                {post.share_status === 'published' ? '공개 중' : post.share_status === 'hidden' ? '공개 글 관리에서 복원' : '전문 확인 후 공유'}
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
                                    <form className="neighbor-teacher-card neighbor-teacher__activity-form" role="tabpanel" onSubmit={createActivity}>
                                        {/* 소개를 따로 카드로 두지 않고 만들기 폼 머리말로 합쳤다(카드 셋 → 둘). */}
                                        <div><span>참여 교사</span><h2>새 {getNeighborActivityLabel(activeActivityTab)} 제안하기</h2></div>
                                        <p>모든 참여 학급에 같은 주제의 글쓰기 과제를 만들고, 제출한 글을 한 공간에서 나눕니다.
                                            한 학급이 제안하고 다른 참여 학급 교사가 모두 승인하면 양쪽 학생에게 동시에 열립니다.</p>
                                        <div className="neighbor-teacher__genre">
                                            <span>글 종류</span>
                                            <Button type="button" variant="outline" size="sm" onClick={() => setGenrePickerOpen(true)}>
                                                {activityForm.genre ? `📄 ${activityForm.genre}` : '📄 글 종류 고르기'}
                                            </Button>
                                            {activityForm.genre && (
                                                <small>최소 {activityForm.min_chars}자 · {activityForm.min_paragraphs}문단
                                                    {activityForm.guide_questions.length > 0 && ` · 길잡이 질문 ${activityForm.guide_questions.length}개`}</small>
                                            )}
                                        </div>
                                        {presetNotice && <p className="neighbor-teacher__preset-notice" role="status">{presetNotice}</p>}
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
                                        <Button type="submit" loading={busy === 'create_activity'} disabled={Boolean(busy)}>{getNeighborActivityLabel(activeActivityTab)} 제안하기</Button>
                                    </form>

                                    {genrePickerOpen && (
                                        <MissionTypePicker
                                            isMobile={isMobile}
                                            onSelectGenre={(missionTypeId) => selectGenre(
                                                genreIdForMissionType(missionTypeId), missionTypeId
                                            )}
                                            onSelectFreeform={(genreId) => selectGenre(genreId)}
                                            onClose={() => setGenrePickerOpen(false)}
                                        />
                                    )}

                                    <section className="neighbor-teacher-card neighbor-teacher__activity-list">
                                        <div><span>진행 현황</span><h2>{getNeighborActivityLabel(activeActivityTab)}</h2></div>
                                        {selectedActivities.length === 0 ? <p className="neighbor-teacher__empty">아직 만든 활동이 없습니다.</p> : selectedActivities.map((activity) => (
                                    <article key={activity.id}>
                                        <div>
                                            <span>{getNeighborActivityLabel(activity.type)} · {activity.status === 'pending_approval' ? '활동 승인 대기' : activity.status === 'closed' ? '종료' : '글 쓰는 중'}</span>
                                            <h3>{activity.title}</h3>
                                            <p>{activity.prompt}</p>
                                            {activity.approvals?.length > 0 && <ul className="neighbor-teacher__approvals">{activity.approvals.map((approval) => <li key={approval.class_id} data-status={approval.status}>{approval.class_name} · {approval.is_proposer ? '제안함' : approval.status === 'approved' ? '승인' : approval.status === 'rejected' ? '거절' : approval.status === 'cancelled' ? '종료' : '확인 전'}</li>)}</ul>}
                                            <ul>{activity.class_stats.map((item) => <li key={item.class_id}>{item.class_name} · 제출 {item.submitted_count} · 검토 {item.review_count} · 공개 {item.published_count}</li>)}</ul>
                                        </div>
                                        {activity.can_review && (
                                            <div className="neighbor-teacher__row-actions">
                                                <Button type="button" loading={busy === 'review_activity'} disabled={Boolean(busy)} onClick={() => runAction('review_activity', { space_id: workspace.space.id, activity_id: activity.id, approve: true }, '활동 제안을 승인했습니다. 모든 교사가 승인하면 학생에게 열립니다.')}>활동 승인</Button>
                                                <Button type="button" variant="outline" loading={busy === 'review_activity'} disabled={Boolean(busy)} onClick={() => runAction('review_activity', { space_id: workspace.space.id, activity_id: activity.id, approve: false }, '활동 제안을 거절했습니다.')}>거절</Button>
                                            </div>
                                        )}
                                        {activity.can_manage && activity.status !== 'pending_approval' && activity.status !== 'closed' && (
                                            <div className="neighbor-teacher__row-actions">
                                                <Button type="button" variant="outline" loading={busy === 'close_activity'} disabled={Boolean(busy)} onClick={() => window.confirm('이 활동의 새 글쓰기를 마칠까요? 공개된 글은 남습니다.') && runAction('close_activity', { space_id: workspace.space.id, activity_id: activity.id }, '활동을 마쳤습니다.')}>활동 종료</Button>
                                            </div>
                                        )}
                                    </article>
                                        ))}
                                    </section>

                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'activities' && (
                        <section className="neighbor-teacher-card">
                            <div><span>우리 학급 글</span><h2>공개 요청 검토</h2></div>
                            {pendingTotal > pendingPosts.length && <p>대기 {pendingTotal}편 중 먼저 신청한 {pendingPosts.length}편입니다. 검토를 마치면 다음 글이 이어집니다.</p>}
                            {pendingPosts.length === 0 ? <p className="neighbor-teacher__empty">검토를 기다리는 글이 없습니다.</p> : <div className="neighbor-teacher__post-list">{pendingPosts.map((post) => <article key={post.shared_post_id}><div><span><strong>{post.student_name}</strong><small>{STATUS_LABELS[post.status]}</small></span><h3>{post.title}</h3><p>{post.excerpt}</p></div><Button type="button" disabled={Boolean(busy)} onClick={() => setReviewSelection({ post, mode: 'review' })}>전문 검토하기</Button></article>)}</div>}
                        </section>
                    )}

                    {activeTab === 'activities' && (
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
            {reviewSelection && <TeacherPostReview selection={reviewSelection} spaceId={workspace.space.id}
                classId={classId} api={api} busy={busy} onSubmit={submitReviewedPost} onClose={() => setReviewSelection(null)} />}
        </section>
    );
};

export default NeighborAgitTeacherEntry;
