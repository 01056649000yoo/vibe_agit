import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import useConfirmDialog from '../../../components/common/useConfirmDialog';
import ModalPortal from '../../../components/common/ModalPortal';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import { TEACHER_TOUR_ANCHORS, neighborSpaceAnchorId, tourAnchor } from '../../../guides/teacherTour.js';
import MissionPromptFields from '../../writing/mission-form/MissionPromptFields';
import MissionTypePicker from '../../../components/teacher/MissionTypePicker';
import { describePresetResult, getGenreEntries } from '../../writing/mission-types/genreCatalog';
import { applyGenreToMissionDraft } from '../../writing/mission-form/missionDraft';
import { createNeighborTopicDraft, NEIGHBOR_TOPIC_DEFAULTS, toNeighborTopicProposal } from './topicProposalAdapter';
import { defaultDeadlineInput } from './deadlineDefaults.js';
import InviteCodeBox from './InviteCodeBox';
import { callAI } from '../../../lib/openai';

/** 전용 틀 id(`poem` 등)로 카탈로그의 글 종류 이름(`시`)을 찾는다. 목록의 정본은 카탈로그 하나다. */
const genreIdForMissionType = (missionTypeId) => (
    getGenreEntries().find((entry) => entry.missionTypeId === missionTypeId)?.id || '기타'
);
import { getNeighborActivityLabel, getNeighborSpace, NEIGHBOR_ACTIVITY_TABS } from './activityTypes';
import './spaces.css';
import { neighborAgitTeacherApi } from './teacherApi';
import { NEIGHBOR_AGIT_LIMITS } from './policy';
import TeacherPostReview from './TeacherPostReview';
import TeacherBooksPanel from './books/TeacherBooksPanel';
import TeacherEngagementPanel from './gallery/TeacherEngagementPanel';
import { neighborBooksApi } from './books/booksApi';
import { useTeacherWorkspacePoll } from './useTeacherWorkspacePoll';
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
    if (message.includes('현재 공개 대상')) return '현재 선택한 학급에서는 모두의 아지트를 아직 사용할 수 없습니다.';
    return message || fallback;
};

/** datetime-local 입력값(현지 시각)을 서버에 보낼 ISO 로 바꾼다. 빈 값은 null(기한 없음). */
const localInputToIso = (value) => (value ? new Date(value).toISOString() : null);

/** 기한 종류는 둘뿐이다: 글쓰기 마감(writing_close_at)·댓글·반응 마감(comments_close_at). */
const deadlineLabel = (key) => (key === 'writing_close_at' ? '글쓰기 마감' : '댓글·반응 마감');
const deadlineValue = (activity, key) => (key === 'writing_close_at' ? activity.writing_close_at : activity.comments_close_at);

/** 기한을 사람이 읽는 한 줄로. */
const formatDeadline = (value) => new Date(value).toLocaleString('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit'
});

const NeighborAgitTeacherEntry = ({ activeClass, isMobile, api = neighborAgitTeacherApi, booksApi = neighborBooksApi, onTodoCountChange, onNavigateTab }) => {
    const classId = activeClass?.id;
    const [workspace, setWorkspace] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [spaceForm, setSpaceForm] = useState({ name: '', publicClassName: activeClass?.name || '', description: '' });
    const [joinForm, setJoinForm] = useState({ inviteKey: '', publicClassName: activeClass?.name || '' });
    const [invite, setInvite] = useState(null);
    // 진입 시 역할 선택(호스트/게스트). 고르면 모달로 진행한다.
    const [startChoice, setStartChoice] = useState(null); // null | 'host' | 'guest'
    // 운영 화면의 최상위 탭: 이웃 글 마당(gallery) / 같이 쓰기 광장(topic).
    const [activeActivityTab, setActiveActivityTab] = useState('gallery');
    // 같이 쓰기 광장: 주제 만들기는 모달로, 화면은 활동 결과만 넓게 본다.
    const [topicCreateOpen, setTopicCreateOpen] = useState(false);
    // 각 탭 안의 3스텝. 이웃 글 마당: 모으기→관리→반응 / 같이 쓰기 광장: 주제→관리→반응.
    const [galleryStep, setGalleryStep] = useState('collect'); // collect | manage | engage
    const [topicStep, setTopicStep] = useState('topics');      // topics | manage | engage
    // 같이 쓰기 광장 진행 현황에서 이번에 본 "새 제출 글" — 기준선을 옮긴 뒤에도 보는 동안 NEW 를 남긴다.
    const [seenNewSubmissionIds, setSeenNewSubmissionIds] = useState(() => new Set());
    const [closeActivityFor, setCloseActivityFor] = useState(null); // 활동 종료 방법을 고르는 창의 대상 활동
    const [topicDetailId, setTopicDetailId] = useState(null); // 진행 현황에서 눌러 연 주제(자세히 보기 모달)
    const [engageRefresh, setEngageRefresh] = useState(0); // 상세 창을 닫으면 ③ 댓글·반응 반별 목록이 숫자를 다시 맞춘다
    const [liveNotice, setLiveNotice] = useState('');
    const [activityPublishFor, setActivityPublishFor] = useState(null); // 활동 글 공개 모달 대상 활동
    const [activityCandidates, setActivityCandidates] = useState(null);
    const [activityCandLoading, setActivityCandLoading] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);       // 공간 관리 모달
    const [reviewInboxOpen, setReviewInboxOpen] = useState(false); // 통합 검토함 모달
    const [postDetail, setPostDetail] = useState(null);
    const [reviewSelection, setReviewSelection] = useState(null);
    const [detailBusy, setDetailBusy] = useState(false);
    const { ask, confirmDialog } = useConfirmDialog(); // 브라우저 기본창 대신 앱 안 확인 창
    // 학급 과제와 같은 칸을 쓴다(`genreCatalog` 의 preset 이 채우는 이름 그대로).
    const [activityForm, setActivityForm] = useState(createNeighborTopicDraft);
    // 주제를 낼 때 함께 정하는 기한(datetime-local 입력값, 빈 값 = 기한 없음). 승인하는 교사들도 본다.
    const [topicSchedule, setTopicSchedule] = useState({ writing_close_at: '', comments_close_at: '' });
    const [genrePickerOpen, setGenrePickerOpen] = useState(false);
    const [presetNotice, setPresetNotice] = useState('');
    const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
    const [galleryCandidates, setGalleryCandidates] = useState(null);
    const [galleryLoading, setGalleryLoading] = useState(false);
    const [galleryQuery, setGalleryQuery] = useState('');
    const [galleryMissionFilter, setGalleryMissionFilter] = useState('all');
    const [collectGroupBy, setCollectGroupBy] = useState('mission'); // 'mission' | 'student'
    const [collectOpenGroup, setCollectOpenGroup] = useState(null);  // 드릴인한 묶음 key(null 이면 묶음 목록)
    const [manageGroupBy, setManageGroupBy] = useState('mission');   // 공개 글 관리도 주제/학생별로 묶어 본다
    const [manageOpenGroup, setManageOpenGroup] = useState(null);    // 드릴인한 묶음 key(null 이면 묶음 목록)

    const loadWorkspace = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');
        try {
            setWorkspace(await api.getWorkspace(classId));
        } catch (error) {
            setWorkspace(null);
            setErrorMessage(getErrorMessage(error, '모두의 아지트 화면을 불러오지 못했습니다.'));
        } finally {
            setLoading(false);
        }
    }, [api, classId]);

    // 화면을 비우지 않고 작업 공간만 다시 읽는다(문집 도서관·검토함에서 처리한 뒤 숫자를 맞출 때).
    const refreshWorkspace = useCallback(async () => {
        if (!classId) return;
        const next = await api.getWorkspace(classId);
        setWorkspace(next);
    }, [api, classId]);

    // 검토함에서 방문록을 올리거나 올리지 않는다(문집 주인 반 교사).
    const reviewGuestbookEntry = async (entry, action) => {
        if (busy) return;
        setBusy(`guestbook_${entry.entry_id}`);
        setMessage('');
        setErrorMessage('');
        try {
            await booksApi.reviewGuestbook({ spaceId: workspace.space.id, classId, entryId: entry.entry_id, action });
            await refreshWorkspace();
            setMessage(action === 'approve' ? '방문록을 올렸습니다. 쓴 학생과 문집에 글이 실린 학생들에게 알림이 갑니다.' : '방문록을 올리지 않았습니다.');
        } catch (error) {
            setErrorMessage(getErrorMessage(error, '방문록을 처리하지 못했습니다.'));
        } finally {
            setBusy('');
        }
    };

    useEffect(() => {
        setWorkspace(null);
        setInvite(null);
        setPostDetail(null);
        setGalleryCandidates(null);
        setGalleryQuery('');
        setGalleryMissionFilter('all');
        setSpaceForm({ name: '', publicClassName: activeClass?.name || '', description: '' });
        setJoinForm({ inviteKey: '', publicClassName: activeClass?.name || '' });
        setActiveActivityTab('gallery');
        setTopicCreateOpen(false);
        setGalleryStep('collect');
        setTopicStep('topics');
        setActivityForm(createNeighborTopicDraft());
        setPresetNotice('');
        setGenrePickerOpen(false);
        setStartChoice(null);
        setManageOpen(false);
        setReviewInboxOpen(false);
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

    const leaveSpace = async () => {
        const ok = await ask({
            title: '이 공간에서 나갈까요?',
            body: '우리 반 글은 학급에 그대로 남습니다.\n이 공간에서 주고받은 댓글·공감은 더 이상 볼 수 없어요.',
            confirmLabel: '공간 나가기', cancelLabel: '그만두기', tone: 'danger'
        });
        if (ok) await runAction('leave_space', { space_id: workspace.space.id }, '공간에서 나갔습니다.');
    };
    const closeSpace = async () => {
        const ok = await ask({
            title: '공간을 종료할까요?',
            body: '모든 반의 학생 입장이 바로 끝나고 되돌릴 수 없습니다.\n각 반 글은 그 반에 그대로 남고, 이 공간에서 주고받은 댓글·공감은 더 이상 볼 수 없어요.',
            confirmLabel: '공간 종료', cancelLabel: '그만두기', tone: 'danger'
        });
        if (ok) await runAction('close_space', { space_id: workspace.space.id }, '공간을 종료했습니다.');
    };

    const createSpace = async (event) => {
        event.preventDefault();
        const result = await runAction('create_space', {
            name: spaceForm.name.trim(),
            public_class_name: spaceForm.publicClassName.trim(),
            description: spaceForm.description.trim()
        }, '모두의 아지트 공간을 만들었습니다.');
        if (result) {
            setSpaceForm((current) => ({ ...current, name: '', description: '' }));
            setStartChoice(null);
        }
    };

    const joinSpace = async (event) => {
        event.preventDefault();
        const result = await runAction('join_space', {
            invite_key: joinForm.inviteKey.trim(),
            public_class_name: joinForm.publicClassName.trim()
        }, '');
        if (!result) return;
        // 틀린·쓴·만료된 키는 오류가 아니라 success:false 로 돌아온다(시도 횟수 제한 때문).
        // 예전에는 이것을 성공으로 알리고 창을 닫아, 선생님이 신청된 줄 알고 기다렸다(2026-09-23 시뮬레이션).
        if (result.success === false) {
            setErrorMessage(result.error === 'rate_limited'
                ? `초대 코드를 여러 번 잘못 넣어 잠시 막혔어요. ${Math.ceil((Number(result.retry_after_seconds) || 60) / 60)}분 뒤 다시 해 주세요.`
                : '초대 코드가 맞지 않거나, 기한이 지났거나, 새 코드로 바뀌었어요. 모임을 연 선생님께 코드를 다시 받아 주세요.');
            return;
        }
        setMessage('참여를 신청했습니다. 모임을 연 선생님이 승인하면 이 화면이 저절로 바뀌어요.');
        setJoinForm((current) => ({ ...current, inviteKey: '' }));
        setStartChoice(null);
    };

    const createInvite = async () => {
        const result = await runAction('create_invite', {
            space_id: workspace.space.id
        }, '초대 코드를 만들었습니다. 복사해서 이웃 반 선생님들께 보내 주세요.');
        if (result?.invite_key) setInvite(result);
    };

    /** 글 종류를 고르면 안내문·길잡이 질문·분량을 채운다. 학급 과제 만들기와 같은 규칙을 그대로 쓴다. */
    const selectGenre = (genreId, missionTypeId = '') => {
        setGenrePickerOpen(false);
        const result = applyGenreToMissionDraft(
            {
                ...activityForm,
                min_chars: !activityForm.genre && activityForm.min_chars === NEIGHBOR_TOPIC_DEFAULTS.min_chars ? null : activityForm.min_chars,
                min_paragraphs: !activityForm.genre && activityForm.min_paragraphs === 1 ? null : activityForm.min_paragraphs
            },
            genreId,
            { previousGenre: activityForm.genre || null, missionType: missionTypeId }
        );
        const next = result.formData;
        setActivityForm((current) => ({
            ...current,
            genre: next.genre,
            guide: next.guide ?? current.guide,
            guide_questions: Array.isArray(next.guide_questions) ? next.guide_questions : [],
            min_chars: Number(next.min_chars) || current.min_chars,
            min_paragraphs: Number(next.min_paragraphs) || current.min_paragraphs,
            mission_type: next.mission_type
        }));
        setPresetNotice(describePresetResult(genreId, result));
    };

    // 미션 만들기 모듈과 같은 방식으로 AI가 길잡이 질문을 추천한다(제목·종류·안내 기반).
    const generateGuideQuestions = async (count = 5) => {
        if (!activityForm.title.trim()) { setPresetNotice('먼저 주제를 적어 주세요. ✨'); return; }
        setIsGeneratingQuestions(true);
        try {
            const prompt = `\n너는 초등학생 글쓰기 지도를 돕는 AI 선생님이야.\n주제: "${activityForm.title}"\n글의 종류: "${activityForm.genre || '자유'}"\n가이드: "${activityForm.guide || ''}"\n\n학생들이 이 주제로 글을 쓸 때 글의 구조를 잡고 내용을 풍성하게 만들 수 있도록 돕는 '핵심 질문'을 ${count}개 만들어줘.\n[규칙]\n1. 초등학생이 이해하기 쉬운 친절한 말투.\n2. 추상적이지 않고 구체적인 기억·생각을 끌어내는 질문.\n3. 다른 설명 없이 JSON 배열만. 예: ["질문1","질문2"]\n`;
            const responseText = await callAI(prompt, { type: 'GENERAL' });
            const jsonMatch = String(responseText).match(/\[.*\]/s);
            if (jsonMatch) {
                const questions = JSON.parse(jsonMatch[0]);
                if (Array.isArray(questions)) {
                    setActivityForm((current) => ({ ...current, guide_questions: questions.map((q) => String(q).slice(0, 200)).slice(0, 10) }));
                    setPresetNotice(`AI가 질문 ${Math.min(questions.length, 10)}개를 추천했어요. 고쳐 쓰거나 지울 수 있어요.`);
                }
            }
        } catch {
            setPresetNotice('질문을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        } finally {
            setIsGeneratingQuestions(false);
        }
    };

    const createActivity = async (event) => {
        event.preventDefault();
        const { writing_close_at: writingAt, comments_close_at: commentsAt } = topicSchedule;
        const now = Date.now();
        if ((writingAt && new Date(writingAt).getTime() <= now) || (commentsAt && new Date(commentsAt).getTime() <= now)) {
            setErrorMessage('기한은 지금 이후로 정해 주세요.');
            return;
        }
        if (writingAt && commentsAt && new Date(commentsAt) < new Date(writingAt)) {
            setErrorMessage('댓글·반응 마감은 글쓰기 마감과 같거나 그 뒤로 정해 주세요.');
            return;
        }
        const result = await runAction(
            'create_activity',
            toNeighborTopicProposal({ spaceId: workspace.space.id, draft: activityForm }),
            '같이 쓰기 광장에 주제를 제안했습니다. 다른 학급 교사의 승인을 기다려 주세요.'
        );
        if (!result) return;
        setActivityForm(createNeighborTopicDraft());
        setTopicSchedule({ writing_close_at: '', comments_close_at: '' });
        setPresetNotice('');
        setTopicCreateOpen(false);
        if ((!writingAt && !commentsAt) || !result.activity_id) return;
        try {
            // 제안과 같은 순간에 기한을 붙인다. 승인 전이라 다른 교사들은 기한까지 보고 승인한다.
            await api.setActivitySchedule({
                spaceId: workspace.space.id, classId, activityId: result.activity_id,
                changes: {
                    ...(writingAt ? { writing_close_at: localInputToIso(writingAt) } : {}),
                    ...(commentsAt ? { comments_close_at: localInputToIso(commentsAt) } : {})
                }
            });
            setWorkspace(await api.getWorkspace(classId));
        } catch (error) {
            setErrorMessage(getErrorMessage(error, '주제는 제안했지만 기한을 저장하지 못했습니다. 주제 카드에서 다시 정해 주세요.'));
        }
    };

    const selectActivityTab = (tabId) => {
        setActiveActivityTab(tabId);
        if (tabId === 'gallery') return;
    };

    const loadGalleryCandidates = async () => {
        if (!workspace?.space?.id || galleryLoading) return;
        setGalleryLoading(true);
        setErrorMessage('');
        try {
            setGalleryCandidates(await api.getShareCandidates({
                spaceId: workspace.space.id,
                classId,
                limit: 500
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

    // 묶음(주제/학생) 안의 공개 대상 글을 한 번에 공개한다. 이미 다 점검한 선생님을 위한 길.
    const bulkPublishGroup = async (group) => {
        const eligible = group.posts.filter((post) => !['published', 'hidden'].includes(post.share_status));
        if (eligible.length === 0 || busy) return;
        const scope = collectGroupBy === 'student' ? `${group.label} 학생` : `"${group.label}" 주제`;
        const ok = await ask({
            title: `${scope}의 글 ${eligible.length}편을 지금 모두 공개할까요?`,
            body: '전문 확인은 생략하고 바로 공개합니다. 공개된 글은 공개 글 관리에서 다시 숨길 수 있어요.',
            confirmLabel: `${eligible.length}편 공개하기`,
            cancelLabel: '그만두기'
        });
        if (!ok) return;
        const result = await runAction('publish_gallery_posts_bulk', {
            space_id: workspace.space.id,
            post_ids: eligible.map((post) => post.post_id)
        }, '');
        if (result) {
            setGalleryCandidates(null);
            setMessage(`${result.published}편을 공개했습니다.${result.skipped ? ` (${result.skipped}편은 지금 공개할 수 없어 건너뜀)` : ''}`);
        }
    };

    // 공개 글 관리에서 묶음 안 공개 중인 글을 한 번에 비공개로 돌린다.
    const bulkHideGroup = async (group) => {
        // 자기 학급이 공개한 글만 비공개로 돌릴 수 있다.
        const eligible = group.posts.filter((post) => post.status === 'published' && post.is_own_class);
        if (eligible.length === 0 || busy) return;
        const scope = manageGroupBy === 'student' ? `${group.label} 학생` : `"${group.label}" 주제`;
        const ok = await ask({
            title: `${scope}의 공개 글 ${eligible.length}편을 모두 비공개로 돌릴까요?`,
            body: '학생에게 더는 보이지 않습니다. 우리 반 글은 다시 공개할 수 있어요.',
            confirmLabel: `${eligible.length}편 비공개`,
            cancelLabel: '그만두기',
            tone: 'danger'
        });
        if (!ok) return;
        const result = await runAction('hide_gallery_posts_bulk', {
            space_id: workspace.space.id,
            shared_post_ids: eligible.map((post) => post.shared_post_id)
        }, '');
        if (result) {
            setMessage(`${result.hidden}편을 비공개로 돌렸습니다.${result.skipped ? ` (${result.skipped}편은 건너뜀)` : ''}`);
        }
    };

    // 활동 종료: 글쓰기만 마칠지, 댓글·반응까지 함께 닫을지 고른다.
    const closeActivity = async (activity, alsoCloseComments) => {
        setCloseActivityFor(null);
        const closed = await runAction('close_activity', { space_id: workspace.space.id, activity_id: activity.id },
            alsoCloseComments ? '글쓰기와 댓글·반응을 모두 마쳤습니다.' : '글쓰기를 마쳤습니다. 댓글·반응은 계속 열려 있어요.');
        if (!closed || !alsoCloseComments) return;
        try {
            // 지난 시각을 주면 서버가 "지금 마감" 으로 받는다.
            await api.setActivitySchedule({
                spaceId: workspace.space.id, classId, activityId: activity.id,
                changes: { comments_close_at: new Date().toISOString() }
            });
            setWorkspace(await api.getWorkspace(classId));
        } catch (error) {
            setMessage('');
            setErrorMessage(getErrorMessage(error, '글쓰기는 마쳤지만 댓글·반응을 닫지 못했습니다. 주제 카드에서 마감을 다시 정해 주세요.'));
        }
    };

    // 교사가 한 활동의 우리 반 제출 글을 직접 골라 공개한다(학생 요청 없이).
    const openActivityPublish = async (activity) => {
        setActivityPublishFor(activity);
        setActivityCandidates(null);
        setActivityCandLoading(true);
        setErrorMessage('');
        try {
            setActivityCandidates(await api.getActivityCandidates({ spaceId: workspace.space.id, classId, activityId: activity.id }));
        } catch (error) {
            setErrorMessage(getErrorMessage(error, '활동 글을 불러오지 못했습니다.'));
        } finally {
            setActivityCandLoading(false);
        }
    };
    const reloadActivityCandidates = async (activityId) => {
        try {
            setActivityCandidates(await api.getActivityCandidates({ spaceId: workspace.space.id, classId, activityId }));
        } catch { /* 목록 새로고침 실패는 조용히 넘긴다 — 다음 열람 때 다시 받는다. */ }
    };
    const publishActivityPost = async (activityId, post) => {
        const result = await runAction('publish_activity_post', { space_id: workspace.space.id, post_id: post.post_id }, '활동 글을 공개했습니다.');
        if (result) await reloadActivityCandidates(activityId);
    };
    const bulkPublishActivity = async (activity, posts) => {
        const eligible = posts.filter((post) => !['published', 'hidden'].includes(post.share_status));
        if (eligible.length === 0 || busy) return;
        const ok = await ask({
            title: `"${activity.title}" 주제의 글 ${eligible.length}편을 모두 공개할까요?`,
            body: '전문 확인은 생략하고 바로 공개합니다. 공개된 글은 공개 글 관리에서 다시 숨길 수 있어요.',
            confirmLabel: `${eligible.length}편 공개하기`,
            cancelLabel: '그만두기'
        });
        if (!ok) return;
        const result = await runAction('publish_activity_posts_bulk', {
            space_id: workspace.space.id,
            post_ids: eligible.map((post) => post.post_id)
        }, '');
        if (result) {
            setMessage(`${result.published}편을 공개했습니다.${result.skipped ? ` (${result.skipped}편은 건너뜀)` : ''}`);
            await reloadActivityCandidates(activity.id);
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

    const closePostDetail = () => { setPostDetail(null); setDetailBusy(false); setEngageRefresh((value) => value + 1); };

    // AI가 막은 우리 반 이웃 댓글 처리(되살리기/삭제) → 워크스페이스 다시 읽어 배지·목록 갱신.
    const handleBlockedComment = async (commentId, action) => {
        if (busy) return;
        setBusy(`blocked_${commentId}`);
        setMessage('');
        setErrorMessage('');
        try {
            await api.reviewBlockedComment({ spaceId: workspace.space.id, classId, commentId, action });
            setWorkspace(await api.getWorkspace(classId));
            setMessage(action === 'restore' ? '막힌 댓글을 되살렸습니다.' : '막힌 댓글을 삭제했습니다.');
        } catch (error) {
            setErrorMessage(getErrorMessage(error, '댓글을 처리하지 못했습니다.'));
        } finally {
            setBusy('');
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
    const activities = useMemo(() => workspace?.activities || [], [workspace?.activities]);
    // 참여 학급 2곳 이상이면 준비 끝 → 운영 화면. 그 전(호스트 단독)은 진행형 마법사.
    const isReady = activeMemberships.length >= 2;
    // 알림 카운트(서버 계산). 배지로 보여 탭을 오가지 않아도 처리할 것을 안다.
    const notif = workspace?.notifications || {};
    // 검토함에 올릴 것: 다른 학급이 낸 주제(활동) 제안 중 우리 반이 승인/거절할 것 + AI가 막은 우리 반 댓글
    // + (호스트) 참여 신청 + 우리 반 문집에 들어온 방문록. 메뉴 배지(get_neighbor_teacher_badge_v1)와 같은 셋을
    // 센다 — 둘이 다른 수를 말하면 안 된다.
    const pendingApprovalActivities = activities.filter((activity) => activity.can_review);
    const pendingGuestbook = workspace?.pending_guestbook || [];
    const reviewInboxCount = (notif.pending_approvals || 0) + (notif.blocked_comments || 0) + (notif.pending_joins || 0)
        + (notif.pending_guestbook || 0) + (notif.new_topic_submissions || 0);
    // 메뉴 숫자 = 검토함(처리할 일) + 새 소식(지난 방문 뒤 새 이웃 글·댓글·문집). 서버 메뉴 배지와 같은 식(20261343).
    const menuCount = reviewInboxCount + (notif.new_posts || 0) + (notif.new_comments || 0) + (notif.new_books || 0);

    // 화면을 실제로 보고 있는 교사만 12초 간격으로 한 번 읽는다. 학생 쪽 연결·폴링은 만들지 않는다.
    // 준비 전(참여 신청을 기다리는 호스트·승인을 기다리는 게스트)도 포함한다 — 신청·승인이 새로고침 없이 보이게(2026-09-24).
    useTeacherWorkspacePoll({ enabled: Boolean(workspace?.space?.id), refresh: refreshWorkspace });

    // 대기 방문록·AI 차단 댓글·새로 보이는 이웃 댓글이 늘면, 배지와 함께 눈에 보이는 갱신 안내를 남긴다.
    const liveCounts = `${notif.pending_guestbook || 0}:${notif.blocked_comments || 0}:${notif.new_comments || 0}:${notif.new_topic_submissions || 0}:${notif.new_posts || 0}:${notif.new_books || 0}`;
    const lastLiveCounts = useRef({ value: liveCounts, ready: false, classId: null });
    useEffect(() => {
        if (!lastLiveCounts.current.ready || lastLiveCounts.current.classId !== classId) {
            lastLiveCounts.current = { value: liveCounts, ready: true, classId };
            setLiveNotice('');
            return;
        }
        const [beforeGuestbook, beforeBlocked, beforeComments, beforeTopic, beforePosts, beforeBooks] = lastLiveCounts.current.value.split(':').map(Number);
        const [nextGuestbook, nextBlocked, nextComments, nextTopic, nextPosts, nextBooks] = liveCounts.split(':').map(Number);
        lastLiveCounts.current.value = liveCounts;
        const updates = [];
        if (nextGuestbook > beforeGuestbook) updates.push(`새 방문록 ${nextGuestbook - beforeGuestbook}건`);
        if (nextBlocked > beforeBlocked) updates.push(`확인할 댓글 ${nextBlocked - beforeBlocked}건`);
        if (nextComments > beforeComments) {
            updates.push(`새 이웃 댓글 ${nextComments - beforeComments}건`);
            // ③ 댓글·반응 반별 목록은 따로 읽으므로, 새 댓글이 왔을 때만 한 번 다시 맞춘다(점검표 D4).
            setEngageRefresh((value) => value + 1);
        }
        if (nextTopic > beforeTopic) updates.push(`새 제출 글 ${nextTopic - beforeTopic}건`);
        if (nextPosts > beforePosts) updates.push(`새 이웃 글 ${nextPosts - beforePosts}편`);
        if (nextBooks > beforeBooks) updates.push(`새 문집 ${nextBooks - beforeBooks}권`);
        if (updates.length) setLiveNotice(`${updates.join(' · ')}이 도착했어요.`);
    }, [classId, liveCounts]);

    // 공간 카드에 보일 현황(이미 받은 작업 공간에서 센다 — 추가 조회 없음).
    const ownPublished = (workspace?.public_posts || []).filter((post) => post.is_own_class && post.status === 'published').length;
    const openTopics = activities.filter((activity) => activity.status === 'open').length;
    const spaceStats = (spaceKey) => {
        if (spaceKey === 'gallery') return [`우리 반 공개 ${ownPublished}편`, notif.new_posts > 0 ? `새 이웃 글 ${notif.new_posts}` : '새 이웃 글 없음', notif.new_comments > 0 ? `새 댓글 ${notif.new_comments}` : '새 댓글 없음'];
        if (spaceKey === 'topic') return [`진행 중 ${openTopics}`, notif.pending_approvals > 0 ? `승인할 제안 ${notif.pending_approvals}` : '승인할 제안 없음',
            ...(notif.new_topic_submissions > 0 ? [`새 제출 글 ${notif.new_topic_submissions}`] : [])];
        return [notif.pending_guestbook > 0 ? `확인할 방문록 ${notif.pending_guestbook}` : '확인할 방문록 없음',
            ...(notif.new_books > 0 ? [`새 문집 ${notif.new_books}`] : [])];
    };

    // 처리할 일 수를 메뉴 배지로 올린다. 메뉴는 학급을 바꿀 때만 세므로, 여기서 처리하는 즉시 줄어들게 한다.
    useEffect(() => {
        if (workspace) onTodoCountChange?.(menuCount);
    }, [workspace, menuCount, onTodoCountChange]);

    // 같이 쓰기 광장 진행 현황을 보고 있으면 "새 제출 글" 을 본 것으로 남긴다. 이번에 본 글은 NEW 를 유지한다.
    const newTopicSubmissions = notif.new_topic_submissions || 0;
    const viewingTopicProgress = isReady && activeActivityTab === 'topic' && topicStep === 'topics';
    useEffect(() => {
        if (!viewingTopicProgress || newTopicSubmissions === 0 || !classId) return;
        const freshIds = activities.flatMap((activity) => (activity.my_submissions || [])
            .filter((submission) => submission.is_new).map((submission) => submission.post_id));
        setSeenNewSubmissionIds((current) => new Set([...current, ...freshIds]));
        api.markTopicSeen(classId).then(refreshWorkspace).catch(() => {});
    }, [viewingTopicProgress, newTopicSubmissions, classId, activities, api, refreshWorkspace]);
    useEffect(() => {
        if (!viewingTopicProgress) setSeenNewSubmissionIds(new Set());
    }, [viewingTopicProgress]);

    // 운영 화면을 열면 "지금까지 봤음"을 남긴다(새 글/새 댓글 배지 기준선).
    useEffect(() => {
        if (isReady && classId) void api.markSeen(classId).catch(() => {});
    }, [isReady, classId, api]);

    // 이웃 글 마당 "글 모으기" 스텝에 들어가면 우리 반 글을 자동으로 불러온다(큰 버튼 없이).
    useEffect(() => {
        if (isReady && activeActivityTab === 'gallery' && galleryStep === 'collect'
            && workspace?.space?.id && !galleryCandidates && !galleryLoading) {
            void loadGalleryCandidates();
        }
        // loadGalleryCandidates 는 매 렌더 새로 만들어지지만, 위 가드(candidates/loading)가 재실행을 막는다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady, activeActivityTab, galleryStep, workspace?.space?.id, galleryCandidates, galleryLoading]);

    const selectedActivities = activeActivityTab === 'gallery'
        ? []
        : activities.filter((activity) => activity.type === activeActivityTab);
    const galleryMissionOptions = useMemo(() => {
        const options = new Map();
        for (const post of galleryCandidates || []) {
            const id = post.mission_id || 'self';
            if (!options.has(id)) options.set(id, post.mission_title || '자율 글');
        }
        return [...options].map(([id, title]) => ({ id, title }));
    }, [galleryCandidates]);
    const visibleGalleryCandidates = (galleryCandidates || []).filter((post) => {
        const query = galleryQuery.trim().toLocaleLowerCase('ko-KR');
        const missionId = post.mission_id || 'self';
        const matchesMission = galleryMissionFilter === 'all' || galleryMissionFilter === missionId;
        const matchesQuery = !query || `${post.student_name} ${post.title} ${post.mission_title || ''}`.toLocaleLowerCase('ko-KR').includes(query);
        return matchesMission && matchesQuery;
    });
    // 글 모으기는 주제별 또는 학생별로 묶어, 각 묶음의 전체 목록을 따로 본다.
    const collectGroups = useMemo(() => {
        const map = new Map();
        for (const post of visibleGalleryCandidates) {
            const key = collectGroupBy === 'student'
                ? (post.student_name || '이름 없음')
                : (post.mission_id || 'self');
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    label: collectGroupBy === 'student'
                        ? (post.student_name || '이름 없음')
                        : (post.mission_title || '자율 글'),
                    posts: []
                });
            }
            map.get(key).posts.push(post);
        }
        return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko-KR'));
    }, [visibleGalleryCandidates, collectGroupBy]);

    // 스텝 바(탭 안 3스텝). 공용으로 이웃 글 마당·같이 쓰기 광장 모두 쓴다.
    const renderStepBar = (steps, current, onSelect) => (
        <nav className="neighbor-teacher__stepbar" role="tablist" aria-label="단계 이동">
            {steps.map((step) => (
                <button key={step.id} type="button" role="tab" aria-selected={current === step.id}
                    className={current === step.id ? 'is-active' : ''} onClick={() => onSelect(step.id)}>
                    {step.label}
                </button>
            ))}
        </nav>
    );

    // ② 공개 글 관리: 주제별/학생별로 묶어 보고, 묶음째 비공개로 돌리거나 한 편씩 숨김·복원.
    // 주제 카드의 기한 칸(글쓰기 마감·댓글·반응 마감). 기한은 주제를 만들 때 정하므로 여기서는 보여 주기만 한다
    // (2026-09-25 선생님 요청 — 글마다 고칠 일이 없다. 기한 RPC 는 `활동 종료` 가 계속 쓴다).
    const renderDeadlineTile = (activity, key) => {
        const saved = deadlineValue(activity, key);
        const closed = (activity.status === 'closed' && key === 'writing_close_at') || Boolean(saved && new Date(saved) <= new Date());
        const days = saved && !closed ? Math.ceil((new Date(saved).getTime() - Date.now()) / 86400000) : null;
        const remain = closed ? '마감됨' : days === null ? '' : days <= 1 ? '오늘·내일 마감' : `D-${days}`;
        return (
            <div className="neighbor-topic-card__deadline" key={key} data-closed={closed ? 'true' : 'false'}>
                <dt>{key === 'writing_close_at' ? '📝' : '💬'} {deadlineLabel(key)}</dt>
                <dd>
                    <span>{saved ? formatDeadline(saved) : '기한 없음'}</span>
                    {remain && <em>{remain}</em>}
                </dd>
            </div>
        );
    };

    // 참여 반마다 한 줄: 승인 상태(주제 제안·승인)와 제출·공개 수를 합친다. 우리 반을 맨 앞에.
    const topicClassRows = (activity) => {
        const rows = new Map();
        const approvalLabel = (approval) => (approval.is_proposer ? '제안함'
            : approval.status === 'approved' ? '승인' : approval.status === 'rejected' ? '거절'
                : approval.status === 'cancelled' ? '종료' : '확인 전');
        for (const approval of activity.approvals || []) {
            rows.set(approval.class_id, { class_id: approval.class_id, class_name: approval.class_name,
                approvalStatus: approval.is_proposer ? 'approved' : approval.status, approvalLabel: approvalLabel(approval) });
        }
        for (const stat of activity.class_stats || []) {
            const row = rows.get(stat.class_id) || { class_id: stat.class_id, class_name: stat.class_name };
            rows.set(stat.class_id, { ...row, hasStats: true, submitted: stat.submitted_count, published: stat.published_count });
        }
        return [...rows.values()].sort((left, right) => Number(right.class_id === classId) - Number(left.class_id === classId));
    };

    // 진행 현황 목록 카드의 기한 한 줄: 가장 가까운 열린 기한.
    const topicTileDeadline = (activity) => {
        if (activity.status === 'closed') return '마감됨';
        const next = [['글쓰기', activity.writing_close_at], ['댓글·반응', activity.comments_close_at]]
            .filter(([, value]) => value && new Date(value) > new Date())[0];
        if (!next) return '기한 없음';
        const days = Math.ceil((new Date(next[1]).getTime() - Date.now()) / 86400000);
        return `${next[0]} 마감 ${days <= 1 ? '오늘·내일' : `D-${days}`}`;
    };

    // 주제를 지울 수 있는 사람: 제안한 반 교사 또는 호스트(서버도 같은 규칙으로 막는다, 20261344).
    const canDeleteTopic = (activity) => Boolean(activity.can_manage
        || activity.approvals?.some((approval) => approval.is_proposer && approval.class_id === classId));

    const deleteTopic = async (activity) => {
        const published = (activity.class_stats || []).reduce((sum, stat) => sum + (Number(stat.published_count) || 0), 0);
        const ok = await ask({
            title: '이 주제를 지울까요?',
            body: `모두의 아지트에서 이 주제와 공개된 글 ${published}편, 그 댓글·공감이 사라집니다.\n`
                + '각 반의 과제와 학생이 쓴 글은 지우지 않고 그 반 보관함으로 옮겨 둡니다.\n지운 주제는 되돌릴 수 없어요.',
            confirmLabel: '주제 지우기', cancelLabel: '그만두기', tone: 'danger'
        });
        if (!ok) return;
        setBusy('delete_activity');
        setMessage('');
        setErrorMessage('');
        try {
            await api.deleteActivity({ spaceId: workspace.space.id, classId, activityId: activity.id });
            setTopicDetailId(null);
            await refreshWorkspace();
            setMessage('주제를 지웠습니다. 각 반 과제와 학생 글은 그 반 보관함에 남아 있어요.');
        } catch (error) {
            setErrorMessage(getErrorMessage(error, '주제를 지우지 못했습니다.'));
        } finally {
            setBusy('');
        }
    };

    // 진행 현황 카드를 누르면 여는 자세히 보기(머리·기한·참여 반·제출 글 카드·삭제).
    const renderTopicDetail = (activity) => (
                                    <article className="neighbor-topic-card" data-status={activity.status}>
                                        {/* 머리: 무엇에 대한 주제인지(왼쪽)와 할 수 있는 일(오른쪽 위)을 한눈에 — 2026-09-25 배치 정리 */}
                                        <header className="neighbor-topic-card__head">
                                            <div className="neighbor-topic-card__title">
                                                <span className="neighbor-topic-card__status" data-status={activity.status}>
                                                    {activity.status === 'pending_approval' ? '⏳ 승인 대기' : activity.status === 'closed' ? '🔒 종료' : '✏️ 글 쓰는 중'}
                                                </span>
                                                <h3>{activity.title}</h3>
                                                {activity.prompt && <p>{activity.prompt}</p>}
                                            </div>
                                            <div className="neighbor-topic-card__actions">
                                                {activity.can_review && (
                                                    <>
                                                        <Button type="button" loading={busy === 'review_activity'} disabled={Boolean(busy)} onClick={() => runAction('review_activity', { space_id: workspace.space.id, activity_id: activity.id, approve: true }, '활동 제안을 승인했습니다. 모든 교사가 승인하면 학생에게 열립니다.')}>활동 승인</Button>
                                                        <Button type="button" variant="outline" loading={busy === 'review_activity'} disabled={Boolean(busy)} onClick={() => runAction('review_activity', { space_id: workspace.space.id, activity_id: activity.id, approve: false }, '활동 제안을 거절했습니다.')}>거절</Button>
                                                    </>
                                                )}
                                                {activity.status !== 'pending_approval' && (
                                                    <Button type="button" disabled={Boolean(busy)} onClick={() => { setTopicDetailId(null); openActivityPublish(activity); }}>제출 글 공개하기</Button>
                                                )}
                                                {activity.status !== 'pending_approval' && activity.can_manage && activity.status !== 'closed' && (
                                                    <Button type="button" variant="ghost" size="sm" className="neighbor-topic-card__close" loading={busy === 'close_activity'} disabled={Boolean(busy)} onClick={() => { setTopicDetailId(null); setCloseActivityFor(activity); }}>활동 종료</Button>
                                                )}
                                            </div>
                                        </header>

                                        {/* 기한 두 칸: 날짜와 남은 기간. 기한은 주제를 만들 때 정하고 여기서는 보여 주기만 한다. */}
                                        <dl className="neighbor-topic-card__deadlines">
                                            {renderDeadlineTile(activity, 'writing_close_at')}
                                            {renderDeadlineTile(activity, 'comments_close_at')}
                                        </dl>

                                        {/* 참여 반: 반마다 한 줄로 승인 상태·제출·공개 수를 함께. */}
                                        <ul className="neighbor-topic-card__classes">
                                            {topicClassRows(activity).map((row) => (
                                                <li key={row.class_id} data-status={row.approvalStatus} className={row.class_id === classId ? 'is-own' : ''}>
                                                    <strong>{row.class_name}{row.class_id === classId && <small> (우리 반)</small>}</strong>
                                                    {row.approvalLabel && <span className="neighbor-topic-card__approval">{row.approvalLabel}</span>}
                                                    {row.hasStats && <span className="neighbor-topic-card__counts">제출 {row.submitted} · 공개 {row.published}</span>}
                                                </li>
                                            ))}
                                        </ul>

                                        {activity.status !== 'pending_approval' && (
                                            <div className="neighbor-teacher__submissions">
                                                <p className="neighbor-teacher__submissions-head">
                                                    우리 반 제출 글 <strong>{activity.my_submissions?.length || 0}</strong>편
                                                    {(activity.my_submissions?.length || 0) > 0 && <small>카드를 누르면 공개할 글을 고를 수 있어요</small>}
                                                </p>
                                                {(activity.my_submissions || []).length === 0
                                                    ? <p className="neighbor-teacher__empty">아직 글을 낸 학생이 없어요.</p>
                                                    : <ul className="neighbor-teacher__submission-grid">{activity.my_submissions.map((submission) => (
                                                        <li key={submission.post_id}>
                                                            <button type="button" disabled={Boolean(busy)} onClick={() => { setTopicDetailId(null); openActivityPublish(activity); }}
                                                                className={`neighbor-teacher__submission${submission.share_status === 'published' ? ' is-published' : ''}`}
                                                                aria-label={`${submission.student_name}의 글 ${submission.title || '제목 없음'}${submission.share_status === 'published' ? ', 공개 중' : ''}`}>
                                                                {(submission.is_new || seenNewSubmissionIds.has(submission.post_id)) && <span className="neighbor-teacher__new-flag">NEW</span>}
                                                                <strong>{submission.title || '제목 없음'}</strong>
                                                                <small>{submission.student_name}</small>
                                                            </button>
                                                        </li>))}</ul>}
                                            </div>
                                        )}
                                        {canDeleteTopic(activity) && (
                                            <footer className="neighbor-topic-card__danger">
                                                <small>주제를 지우면 공개된 글과 댓글이 모두의 아지트에서 사라집니다. 각 반 과제와 학생 글은 그 반 보관함에 남아요.</small>
                                                <Button type="button" variant="danger" size="sm" className="neighbor-topic-card__delete" loading={busy === 'delete_activity'}
                                                    disabled={Boolean(busy)} onClick={() => deleteTopic(activity)}>🗑️ 주제 지우기</Button>
                                            </footer>
                                        )}
                                    </article>
    );

    const renderManageStep = () => {
        // 공개 글 관리는 "공개 중"인 글만 보여 준다(숨긴 글은 목록에서 빠진다).
        const managePosts = workspace.public_posts.filter((post) => post.status === 'published');
        const groups = (() => {
            const map = new Map();
            for (const post of managePosts) {
                const key = manageGroupBy === 'student'
                    ? (post.author_name || '이름 없음')
                    : (post.mission_id || 'self');
                if (!map.has(key)) {
                    map.set(key, {
                        key,
                        label: manageGroupBy === 'student'
                            ? (post.author_name || '이름 없음')
                            : (post.mission_title || '자율 글'),
                        posts: []
                    });
                }
                map.get(key).posts.push(post);
            }
            return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'ko-KR'));
        })();
        const publishedCount = managePosts.length;
        // 학급마다 고유 색을 준다(교사가 아니라 "학급" 단위로 구분). 우리 반은 청록으로 고정.
        // 주제·학생 묶음은 각각 한 학급 소유이므로 묶음(폴더)도 그 학급 색으로 칠한다.
        const OWN_COLOR = { bar: '#0f766e', bg: '#ccfbf1', ink: '#0f766e' };
        const CLASS_PALETTE = [
            { bar: '#2563eb', bg: '#dbeafe', ink: '#1e40af' },
            { bar: '#d946ef', bg: '#fae8ff', ink: '#a21caf' },
            { bar: '#f59e0b', bg: '#fef3c7', ink: '#92400e' },
            { bar: '#059669', bg: '#d1fae5', ink: '#047857' },
            { bar: '#ef4444', bg: '#fee2e2', ink: '#b91c1c' },
            { bar: '#8b5cf6', bg: '#ede9fe', ink: '#6d28d9' },
            { bar: '#0ea5e9', bg: '#e0f2fe', ink: '#0369a1' },
            { bar: '#ec4899', bg: '#fce7f3', ink: '#be185d' }
        ];
        const otherClassNames = [...new Set(workspace.public_posts.filter((post) => !post.is_own_class).map((post) => post.class_name))]
            .sort((a, b) => (a || '').localeCompare(b || '', 'ko-KR'));
        const classColor = (post) => post.is_own_class
            ? OWN_COLOR
            : CLASS_PALETTE[Math.max(0, otherClassNames.indexOf(post.class_name)) % CLASS_PALETTE.length];
        return (
            <section className="neighbor-teacher-card neighbor-teacher__activity-panel">
                {managePosts.length === 0 ? (
                    <p className="neighbor-teacher__empty">공개 중인 글이 없습니다.</p>
                ) : (
                    <div className="neighbor-teacher__candidate-panel">
                        <div className="neighbor-teacher__candidate-toolbar">
                            <div className="neighbor-teacher__group-toggle" role="tablist" aria-label="공개 글 묶어 보기">
                                <button type="button" role="tab" aria-selected={manageGroupBy === 'mission'} className={manageGroupBy === 'mission' ? 'is-active' : ''} onClick={() => { setManageGroupBy('mission'); setManageOpenGroup(null); }}>주제별</button>
                                <button type="button" role="tab" aria-selected={manageGroupBy === 'student'} className={manageGroupBy === 'student' ? 'is-active' : ''} onClick={() => { setManageGroupBy('student'); setManageOpenGroup(null); }}>학생별</button>
                            </div>
                            <div className="neighbor-teacher__candidate-summary">
                                <strong>{publishedCount}편 공개 중</strong>
                                <span>{manageGroupBy === 'student' ? '학생별' : '주제별'} · {groups.length}개 묶음</span>
                            </div>
                        </div>
                        {(() => {
                            const openGroup = manageOpenGroup ? groups.find((group) => group.key === manageOpenGroup) : null;
                            if (!openGroup) {
                                // 묶음 목록(폴더). 주제/학생만 보이고, 눌러 들어가 그 안의 글을 편집한다.
                                return (
                                    <div className="neighbor-teacher__folder-list">
                                        {groups.map((group) => {
                                            const open = group.posts.filter((post) => post.status === 'published').length;
                                            const owner = group.posts[0]; // 주제·학생 묶음은 한 학급 소유 → 대표 글로 학급을 정한다.
                                            return (
                                                <div className={`neighbor-teacher__folder ${owner.is_own_class ? 'is-own' : 'is-other'}`} key={group.key} style={{ borderLeftColor: classColor(owner).bar, borderLeftWidth: owner.is_own_class ? '7px' : '4px', background: owner.is_own_class ? '#c7f2e3' : '#eceff3' }}>
                                                    <button type="button" className="neighbor-teacher__folder-open" onClick={() => setManageOpenGroup(group.key)}>
                                                        <span className="neighbor-teacher__folder-icon" aria-hidden="true">{manageGroupBy === 'student' ? '🙂' : '📘'}</span>
                                                        <span className="neighbor-teacher__folder-body">
                                                            <strong>{group.label}</strong>
                                                            <span className="neighbor-teacher__folder-line">
                                                                <span className="neighbor-teacher__class-tag" style={{ background: classColor(owner).bar, color: '#fff' }}>{owner.is_own_class ? `⭐ 우리 반` : owner.class_name}</span>
                                                                <small>{group.posts.length}편{open > 0 ? ` · ${open} 공개 중` : ' · 모두 숨김'}</small>
                                                            </span>
                                                        </span>
                                                        <span className="neighbor-teacher__folder-arrow" aria-hidden="true">›</span>
                                                    </button>
                                                    {open > 0 && owner.is_own_class && (
                                                        <Button type="button" size="sm" variant="outline" className="neighbor-teacher__folder-action"
                                                            loading={busy === 'hide_gallery_posts_bulk'} disabled={Boolean(busy)}
                                                            onClick={() => bulkHideGroup(group)}>
                                                            {open}편 일괄 비공개
                                                        </Button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            }
                            // 드릴인: 이 묶음의 글만 편집한다.
                            const eligible = openGroup.posts.filter((post) => post.status === 'published');
                            return (
                                <section className="neighbor-teacher__candidate-group">
                                    <header className="neighbor-teacher__candidate-group-head">
                                        <Button type="button" size="sm" variant="ghost" onClick={() => setManageOpenGroup(null)}>← 목록</Button>
                                        <h3>{manageGroupBy === 'student' ? `🙂 ${openGroup.label}` : `📘 ${openGroup.label}`}</h3>
                                        <span>{openGroup.posts.length}편</span>
                                        {eligible.length > 0 && openGroup.posts[0]?.is_own_class && (
                                            <Button type="button" size="sm" variant="outline" className="neighbor-teacher__bulk-publish"
                                                loading={busy === 'hide_gallery_posts_bulk'} disabled={Boolean(busy)}
                                                onClick={() => bulkHideGroup(openGroup)}>
                                                이 묶음 {eligible.length}편 일괄 비공개
                                            </Button>
                                        )}
                                    </header>
                                    <div className="neighbor-teacher__manage-list">
                                        {openGroup.posts.map((post) => (
                                            <article key={post.shared_post_id} className={`neighbor-teacher__manage-card is-${post.status} ${post.is_own_class ? 'is-own' : 'is-other'}`}
                                                style={{ borderLeftColor: classColor(post).bar, borderLeftWidth: post.is_own_class ? '7px' : '4px', background: post.status === 'hidden' ? '#e6e9ee' : (post.is_own_class ? '#c7f2e3' : '#eceff3') }}>
                                                <div className="neighbor-teacher__manage-info">
                                                    <span className="neighbor-teacher__class-tag" style={{ background: classColor(post).bar, color: '#fff' }}>{post.is_own_class ? `⭐ 우리 반` : post.class_name}</span>
                                                    <span className="neighbor-teacher__manage-author">{post.author_name}</span>
                                                    <span className="neighbor-teacher__manage-title">{post.title || '제목 없는 글'}</span>
                                                    {manageGroupBy === 'student' && <span className="neighbor-teacher__manage-sub">{post.mission_title || '자율 글'}</span>}
                                                    {post.status === 'hidden' && <span className={`neighbor-teacher__share-status is-${post.status}`}>{STATUS_LABELS[post.status]}</span>}
                                                </div>
                                                {post.status === 'published' && post.is_own_class && <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => runAction('hide_post', { space_id: workspace.space.id, item_id: post.shared_post_id, reason: '교사 확인' }, '글을 공간에서 숨겼습니다.')}>비공개</Button>}
                                                {post.status === 'hidden' && post.is_own_class && <Button type="button" size="sm" disabled={Boolean(busy)} onClick={() => runAction('restore_post', { space_id: workspace.space.id, item_id: post.shared_post_id, reason: '' }, '글을 다시 공개했습니다.')}>다시 공개</Button>}
                                                {!post.is_own_class && <span className="neighbor-teacher__muted-note">다른 반 글</span>}
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            );
                        })()}
                    </div>
                )}
            </section>
        );
    };

    // ③ 댓글·반응: 우리 반이 공개한 글을 눌러 크게(모달) 보고, 거기 달린 댓글·공감을 확인·검열한다.
    //    다른 반 글의 반응은 그 반 선생님이 본다(여기선 우리 반 글만).
    // ③ 댓글·반응: 학생 이웃 글 마당과 같은 반별 구조(반 고르기 → 주제별 묶음). 작업 공간의 public_posts 는
    // 50편 상한이라 반별로 모으기엔 모자라 전용 조회를 쓴다(20261336).
    const renderEngageStep = () => (
        <TeacherEngagementPanel spaceId={workspace.space.id} classId={classId}
            kind={activeActivityTab === 'topic' ? 'topic' : 'gallery'} onOpenPost={openPostDetail}
            refreshToken={engageRefresh} api={api} />
    );

    if (loading) {
        return <section className="neighbor-teacher-state">모두의 아지트 정보를 불러오는 중입니다…</section>;
    }

    if (!workspace) {
        return (
            <section className="neighbor-teacher-state neighbor-teacher-state--closed">
                <div aria-hidden="true">🤝</div>
                <h1>모두의 아지트(Beta)</h1>
                <p>{errorMessage || '현재 선택한 학급에서는 아직 사용할 수 없습니다.'}</p>
            </section>
        );
    }

    return (
        <section className={`neighbor-teacher ${isMobile ? 'is-mobile' : ''}`}>
            {/* 모임을 준비할 때만 설명을 크게, 운영 중에는 한 줄로(2026-09-25 — 위쪽 겹침 정리). */}
            <header className={`neighbor-teacher__header${isReady && workspace?.space?.my_status === 'active' ? ' is-compact' : ''}`}>
                <div>
                    <span>여러 반이 함께 글을 나누는 마을</span>
                    <h1>🤝 모두의 아지트</h1>
                    <p>🌳 이웃 글 마당에서 서로의 글을 읽고, 🎪 같이 쓰기 광장에서 같은 주제로 쓰고, 🏛️ 문집 도서관에서 반 문집을 나눠요.</p>
                </div>
                <div className="neighbor-teacher__header-actions">
                    <TeacherGuideButton tabId="neighbor-agit" variant="help" />
                    <Button type="button" variant="outline" loading={loading} onClick={loadWorkspace}>새로고침</Button>
                </div>
            </header>

            {message && <p className="neighbor-teacher__message" role="status">{message}</p>}
            {errorMessage && <p className="neighbor-teacher__message neighbor-teacher__message--error" role="alert">{errorMessage}</p>}

            {!workspace.space ? (
                <>
                    {/* 진입: 역할을 먼저 고르고(호스트/게스트) 고른 것만 모달로 진행한다.
                        두 폼을 나란히 늘어놓지 않아 처음 화면이 단순해진다. */}
                    <div className="neighbor-teacher__start-choice">
                        <button type="button" className="neighbor-teacher__choice" onClick={() => setStartChoice('host')}>
                            <span className="neighbor-teacher__choice-mark" aria-hidden="true">🏠</span>
                            <strong>새 모임 만들기</strong>
                            <small>우리 반이 모임을 열고 이웃 반 선생님께 초대 코드를 보내요</small>
                        </button>
                        <button type="button" className="neighbor-teacher__choice" onClick={() => setStartChoice('guest')}>
                            <span className="neighbor-teacher__choice-mark" aria-hidden="true">🚪</span>
                            <strong>받은 초대 코드로 들어가기</strong>
                            <small>다른 반 선생님께 받은 코드를 넣고 참여를 신청해요</small>
                        </button>
                    </div>

                    {/* 진입 모달은 카드 밖 최상위라 ModalPortal 없이 Modal 만 쓴다
                        (학생 상세 창과 같은 방식). 장르 고르기 포털과 섞이지 않게 한다. */}
                    <Modal
                        isOpen={startChoice === 'host'}
                        onClose={() => { if (!busy) setStartChoice(null); }}
                        title="🏠 새 모임 만들기"
                        maxWidth="520px"
                        showFooter={false}
                    >
                        <form className="neighbor-teacher__start-form" onSubmit={createSpace}>
                            <label>모임 이름<input value={spaceForm.name} maxLength={60} required placeholder="예: 4학년 글쓰기 모임"
                                onChange={(event) => setSpaceForm({ ...spaceForm, name: event.target.value })} /></label>
                            <label>다른 반에 보일 우리 반 이름<input value={spaceForm.publicClassName} maxLength={40} required placeholder="예: 진남초 4-1"
                                onChange={(event) => setSpaceForm({ ...spaceForm, publicClassName: event.target.value })} />
                                <small>학생 글과 댓글 옆에 이 이름이 붙어요.</small></label>
                            <label>공간 소개<textarea value={spaceForm.description} maxLength={240} onChange={(event) => setSpaceForm({ ...spaceForm, description: event.target.value })} /></label>
                            <Button type="submit" loading={busy === 'create_space'} disabled={Boolean(busy)}>공간 만들기</Button>
                        </form>
                    </Modal>
                    <Modal
                        isOpen={startChoice === 'guest'}
                        onClose={() => { if (!busy) setStartChoice(null); }}
                        title="🚪 받은 초대 코드로 들어가기"
                        maxWidth="520px"
                        showFooter={false}
                    >
                        <form className="neighbor-teacher__start-form" onSubmit={joinSpace}>
                            <label>받은 초대 코드<input value={joinForm.inviteKey} maxLength={24} required autoComplete="off" placeholder="예: ABCD-EFGH-JKMN-PQRS"
                                onChange={(event) => setJoinForm({ ...joinForm, inviteKey: event.target.value })} />
                                <small>띄어쓰기·하이픈은 있어도 없어도 돼요.</small></label>
                            <label>다른 반에 보일 우리 반 이름<input value={joinForm.publicClassName} maxLength={40} required placeholder="예: 진남초 4-2"
                                onChange={(event) => setJoinForm({ ...joinForm, publicClassName: event.target.value })} />
                                <small>학생 글과 댓글 옆에 이 이름이 붙어요.</small></label>
                            <Button type="submit" loading={busy === 'join_space'} disabled={Boolean(busy)}>참여 신청하기</Button>
                            <small className="neighbor-teacher__start-hint">신청하면 모임을 연 선생님이 승인해요. 승인되면 이 화면이 12초 안에 저절로 바뀌어요.</small>
                        </form>
                    </Modal>
                </>
            ) : workspace.space.my_status === 'pending' ? (
                <section className="neighbor-teacher-state">
                    <div aria-hidden="true">⏳</div>
                    <h2>{workspace.space.name}</h2>
                    <p>참여 신청을 보냈어요. <strong>모임을 연 선생님께 승인을 부탁해 주세요.</strong><br />승인되면 이 화면이 12초 안에 저절로 바뀌어요.</p>
                    <Button type="button" variant="outline" loading={busy === 'leave_space'} onClick={() => runAction('leave_space', { space_id: workspace.space.id }, '참여 신청을 취소했습니다.')}>신청 취소</Button>
                </section>
            ) : !isReady ? (
                /* 준비 마법사(진행형): 참여 2학급 전. 호스트는 초대·승인만 순서대로 하면 된다. */
                <section className="neighbor-teacher__wizard">
                    <div className="neighbor-teacher__wizard-head">
                        <span>{workspace.space.my_role === 'host' ? '호스트' : '게스트'}</span>
                        <h2>{workspace.space.name}</h2>
                        <p>이웃 반이 <strong>2곳 이상</strong> 모이면 활동이 열려요. 아래 순서대로 진행해 주세요.</p>
                    </div>
                    <ol className="neighbor-teacher__wizard-steps">
                        <li className="is-done"><span aria-hidden="true">✓</span><div><strong>공간 만들기</strong><small>{workspace.space.name}</small></div></li>
                        <li className={pendingMemberships.length === 0 ? 'is-current' : ''}><span aria-hidden="true">2</span><div><strong>이웃 반 초대</strong><small>초대 코드 하나를 여러 반 선생님께 보내요</small></div></li>
                        <li className={pendingMemberships.length > 0 ? 'is-current' : ''}><span aria-hidden="true">3</span><div><strong>참여 확인</strong><small>{pendingMemberships.length > 0 ? `승인 대기 ${pendingMemberships.length}곳` : '들어온 반을 승인해요'}</small></div></li>
                    </ol>

                    {workspace.space.my_role === 'host' ? (
                        <div className="neighbor-teacher__wizard-body">
                            <section className="neighbor-teacher-card">
                                <div><span>2단계</span><h3>이웃 반 초대 코드</h3></div>
                                {invite
                                    ? <InviteCodeBox invite={invite} spaceName={workspace.space.name} />
                                    : <p>초대 코드를 만들어 이웃 반 선생님들께 보내요. <strong>코드 하나로 여러 반</strong>이 7일 동안 신청할 수 있고, 들어온 신청은 아래에서 승인해요.</p>}
                                <Button type="button" variant={invite ? 'outline' : 'primary'} loading={busy === 'create_invite'} disabled={Boolean(busy)} onClick={createInvite}>{invite ? '새 초대 코드로 바꾸기' : '초대 코드 만들기'}</Button>
                            </section>
                            <section className="neighbor-teacher-card">
                                <div><span>3단계</span><h3>참여 신청</h3></div>
                                {pendingMemberships.length === 0
                                    ? <p className="neighbor-teacher__empty">아직 들어온 반이 없어요. 초대 코드를 보내 주세요. 신청이 오면 12초 안에 여기 나타나요.</p>
                                    : <ul className="neighbor-teacher__members">{pendingMemberships.map((membership) => (
                                        <li key={membership.class_id}>
                                            <span><strong>{membership.class_name}</strong><small>승인 대기</small></span>
                                            <span className="neighbor-teacher__row-actions">
                                                <Button type="button" disabled={Boolean(busy)} onClick={() => runAction('review_join', { space_id: workspace.space.id, target_class_id: membership.class_id, approve: true }, '참여 학급을 승인했습니다.')}>승인</Button>
                                                <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => runAction('review_join', { space_id: workspace.space.id, target_class_id: membership.class_id, approve: false }, '참여 신청을 거절했습니다.')}>거절</Button>
                                            </span>
                                        </li>))}</ul>}
                            </section>
                        </div>
                    ) : (
                        <section className="neighbor-teacher-card">
                            <div><span>게스트</span><h3>이웃 반을 기다리는 중</h3></div>
                            <p>호스트 선생님이 다른 반을 더 초대하면 활동이 열려요.</p>
                            <Button type="button" variant="outline" loading={busy === 'leave_space'} disabled={Boolean(busy)} onClick={leaveSpace}>공간 나가기</Button>
                        </section>
                    )}
                </section>
            ) : (
                <>
                    {/* 운영 요약 바: 얇게 한 줄. 학생 입장·검토함·공간 관리를 어느 탭에서든 바로 연다. */}
                    <section className="neighbor-teacher__bar">
                        <div className="neighbor-teacher__bar-title">
                            <span>{workspace.space.my_role === 'host' ? '우리 반이 연 모임' : '참여 중인 모임'}</span>
                            <h2>{workspace.space.name}</h2>
                        </div>
                        <div className="neighbor-teacher__bar-actions">
                            <span className="neighbor-teacher__bar-metric">참여 {activeMemberships.length}학급</span>
                            <button
                                type="button"
                                {...tourAnchor(TEACHER_TOUR_ANCHORS.NEIGHBOR_ACCESS)}
                                className={`neighbor-teacher__access-toggle${workspace.space.student_access_enabled ? ' is-on' : ''}`}
                                disabled={Boolean(busy)}
                                onClick={() => runAction('set_access', { space_id: workspace.space.id, enabled: !workspace.space.student_access_enabled }, workspace.space.student_access_enabled ? '우리 반 학생 입장을 닫았습니다.' : '우리 반 학생 입장을 열었습니다.')}
                            >
                                학생 입장 {workspace.space.student_access_enabled ? '열림' : '닫힘'}
                            </button>
                            <Button type="button" variant="outline" {...tourAnchor(TEACHER_TOUR_ANCHORS.NEIGHBOR_REVIEW)} className={reviewInboxCount > 0 ? 'neighbor-teacher__review-btn is-new' : 'neighbor-teacher__review-btn'} onClick={() => setReviewInboxOpen(true)}>
                                🗂️ 검토{reviewInboxCount > 0 && <><span className="neighbor-teacher__new-flag">NEW</span><span className="neighbor-teacher__badge">{reviewInboxCount}</span></>}
                            </Button>
                            <Button type="button" variant="outline" onClick={() => setManageOpen(true)}>
                                ⚙️ 공간 관리
                            </Button>
                        </div>
                    </section>
                    {!workspace.space.student_access_enabled && activeMemberships.length >= 2 && (
                        /* 학생 입장은 두 반이 모이면 저절로 열린다(20261349). 닫혀 있다면 이 반 선생님이 닫은 것 — 다시 열 곳을 위에 둔다. */
                        <div className="neighbor-teacher__access-callout" role="status">
                            <span>🔒 <strong>우리 반 학생 입장을 닫아 두었어요.</strong> 우리 반 학생에게는 모두의 아지트가 보이지 않아요. 다시 열면 학생 홈에 카드가 나타나요.</span>
                            <Button type="button" size="sm" loading={busy === 'set_access'} disabled={Boolean(busy)}
                                onClick={() => runAction('set_access', { space_id: workspace.space.id, enabled: true }, '우리 반 학생 입장을 열었습니다.')}>학생 입장 열기</Button>
                        </div>
                    )}
                    <p className="neighbor-teacher__live-status" role="status" aria-live="polite">
                        <span aria-hidden="true">📡</span> 12초마다 새 방문록·댓글을 자동 확인합니다.
                        {liveNotice && <strong>{liveNotice}</strong>}
                    </p>

                    {(
                        <div className="neighbor-teacher__activity-layout">
                            {/* 세 공간을 필터가 아니라 따로 있는 방처럼: 공간마다 색(spaces.css)·소개·현황 숫자.
                                선택한 카드와 아래 작업판이 같은 색 테두리로 이어진다. 숫자는 이미 받은 작업 공간에서 센다. */}
                            <nav className="neighbor-teacher__spaces" aria-label="공간 고르기" role="tablist">
                                {NEIGHBOR_ACTIVITY_TABS.map(({ id, icon, label }) => {
                                    const stats = spaceStats(id);
                                    const todo = id === 'topic' ? notif.pending_approvals : id === 'books' ? notif.pending_guestbook : 0;
                                    return (
                                        <button type="button" role="tab" key={id} data-space={id} {...tourAnchor(neighborSpaceAnchorId(id))}
                                            className={`neighbor-teacher__space-card${activeActivityTab === id ? ' is-active' : ''}`}
                                            aria-selected={activeActivityTab === id} onClick={() => selectActivityTab(id)}>
                                            <span className="neighbor-teacher__space-mark" aria-hidden="true">{icon}</span>
                                            <strong>{label}</strong>
                                            <span className="neighbor-teacher__space-stats">{stats.map((item) => <span key={item}>{item}</span>)}</span>
                                            {todo > 0 && <span className="neighbor-teacher__badge" aria-label={`처리할 일 ${todo}건`}>{todo}</span>}
                                        </button>
                                    );
                                })}
                            </nav>

                            <div className="neighbor-teacher__space-room" data-space={activeActivityTab}>
                            <p className="neighbor-teacher__space-heading">
                                <span aria-hidden="true">{getNeighborSpace(activeActivityTab)?.icon}</span>
                                <strong>{getNeighborSpace(activeActivityTab)?.label}</strong>
                                <small>{getNeighborSpace(activeActivityTab)?.teacherSummary}</small>
                            </p>
                            {activeActivityTab === 'gallery' ? (
                                <div className="neighbor-teacher__activity-body">
                                {renderStepBar([
                                    { id: 'collect', label: '글 고르기' },
                                    { id: 'manage', label: '공개한 글' },
                                    { id: 'engage', label: '댓글·반응' }
                                ], galleryStep, setGalleryStep)}

                                {galleryStep === 'collect' && (
                                <section className="neighbor-teacher-card neighbor-teacher__activity-panel" role="tabpanel">
                                    <div className="neighbor-teacher__gallery-intro">
                                        <p>우리 학급의 제출 글을 골라 참여 학급에 소개합니다.</p>
                                        <Button type="button" variant="ghost" size="sm" loading={galleryLoading} disabled={Boolean(busy)} onClick={loadGalleryCandidates}>새로고침</Button>
                                    </div>
                                    {galleryLoading && !galleryCandidates && <p className="neighbor-teacher__empty">우리 학급 글을 불러오는 중…</p>}
                                    {galleryCandidates && (
                                        <div className="neighbor-teacher__candidate-panel">
                                            <div className="neighbor-teacher__candidate-toolbar">
                                                <div className="neighbor-teacher__group-toggle" role="tablist" aria-label="글 묶어 보기">
                                                    <button type="button" role="tab" aria-selected={collectGroupBy === 'mission'} className={collectGroupBy === 'mission' ? 'is-active' : ''} onClick={() => { setCollectGroupBy('mission'); setCollectOpenGroup(null); }}>주제별</button>
                                                    <button type="button" role="tab" aria-selected={collectGroupBy === 'student'} className={collectGroupBy === 'student' ? 'is-active' : ''} onClick={() => { setCollectGroupBy('student'); setCollectOpenGroup(null); }}>학생별</button>
                                                </div>
                                                <label>특정 주제만
                                                    <select value={galleryMissionFilter} onChange={(event) => setGalleryMissionFilter(event.target.value)}>
                                                        <option value="all">전체 주제 ({galleryCandidates.length}편)</option>
                                                        {galleryMissionOptions.map((option) => (
                                                            <option value={option.id} key={option.id}>{option.title}</option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label>글 찾기
                                                    <input value={galleryQuery} maxLength={80} placeholder="학생 이름 또는 글 제목" onChange={(event) => setGalleryQuery(event.target.value)} />
                                                </label>
                                            </div>
                                            <div className="neighbor-teacher__candidate-summary">
                                                <strong>{visibleGalleryCandidates.length}편</strong>
                                                <span>{collectGroupBy === 'student' ? '학생별' : '주제별'} · {collectGroups.length}개 묶음{galleryMissionFilter !== 'all' ? ` · ${galleryMissionOptions.find((option) => option.id === galleryMissionFilter)?.title}` : ''}</span>
                                            </div>
                                            {visibleGalleryCandidates.length === 0 ? (
                                                <p className="neighbor-teacher__empty">조건에 맞는 제출 글이 없습니다.</p>
                                            ) : (() => {
                                                const openGroup = collectOpenGroup ? collectGroups.find((group) => group.key === collectOpenGroup) : null;
                                                const shareable = (group) => group.posts.filter((post) => !['published', 'hidden'].includes(post.share_status));
                                                if (!openGroup) {
                                                    // 묶음 목록(폴더). 주제/학생만 보이고, 폴더째 바로 공개하거나 눌러 들어가 하나씩 고른다.
                                                    return (
                                                        <div className="neighbor-teacher__folder-list">
                                                            {collectGroups.map((group) => {
                                                                const ready = shareable(group).length;
                                                                return (
                                                                    <div className="neighbor-teacher__folder" key={group.key}>
                                                                        <button type="button" className="neighbor-teacher__folder-open" onClick={() => setCollectOpenGroup(group.key)}>
                                                                            <span className="neighbor-teacher__folder-icon" aria-hidden="true">{collectGroupBy === 'student' ? '🙂' : '📘'}</span>
                                                                            <span className="neighbor-teacher__folder-body">
                                                                                <strong>{group.label}</strong>
                                                                                <small>{group.posts.length}편{ready > 0 ? ` · ${ready} 공개 가능` : ' · 모두 공개됨'}</small>
                                                                            </span>
                                                                            <span className="neighbor-teacher__folder-arrow" aria-hidden="true">›</span>
                                                                        </button>
                                                                        {ready > 0 && (
                                                                            <Button type="button" size="sm" className="neighbor-teacher__folder-action"
                                                                                loading={busy === 'publish_gallery_posts_bulk'} disabled={Boolean(busy)}
                                                                                onClick={() => bulkPublishGroup(group)}>
                                                                                {ready}편 일괄 공개
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                }
                                                // 드릴인: 이 묶음의 글을 하나씩 확인해 공개한다.
                                                const ready = shareable(openGroup);
                                                return (
                                                    <section className="neighbor-teacher__candidate-group">
                                                        <header className="neighbor-teacher__candidate-group-head">
                                                            <Button type="button" size="sm" variant="ghost" onClick={() => setCollectOpenGroup(null)}>← 목록</Button>
                                                            <h3>{collectGroupBy === 'student' ? `🙂 ${openGroup.label}` : `📘 ${openGroup.label}`}</h3>
                                                            <span>{openGroup.posts.length}편</span>
                                                            {ready.length > 0 && (
                                                                <Button type="button" size="sm" className="neighbor-teacher__bulk-publish"
                                                                    loading={busy === 'publish_gallery_posts_bulk'} disabled={Boolean(busy)}
                                                                    onClick={() => bulkPublishGroup(openGroup)}>
                                                                    이 묶음 {ready.length}편 일괄 공개
                                                                </Button>
                                                            )}
                                                        </header>
                                                        <div className="neighbor-teacher__candidate-list">
                                                            {openGroup.posts.map((post) => (
                                                                <article key={post.post_id}>
                                                                    <div className="neighbor-teacher__candidate-card-body">
                                                                        <div className="neighbor-teacher__candidate-meta">
                                                                            <span className="neighbor-teacher__mission-chip">{post.mission_title || '자율 글'}</span>
                                                                            <span className={`neighbor-teacher__share-status is-${post.share_status || 'ready'}`}>{post.share_status === 'published' ? '공개 중' : post.share_status === 'hidden' ? '숨김' : '공유 전'}</span>
                                                                        </div>
                                                                        <h3>{post.title || '제목 없는 글'}</h3>
                                                                        <p>{post.excerpt || '내용 미리보기가 없습니다.'}</p>
                                                                        <strong className="neighbor-teacher__candidate-author">{post.student_name}</strong>
                                                                    </div>
                                                                    {post.share_status === 'hidden' ? (
                                                                        <Button type="button" loading={busy === 'restore_post'} disabled={Boolean(busy)}
                                                                            onClick={async () => { const r = await runAction('restore_post', { space_id: workspace.space.id, item_id: post.shared_post_id, reason: '' }, '글을 다시 공개했습니다.'); if (r) setGalleryCandidates(null); }}>
                                                                            숨김 해제·다시 공개
                                                                        </Button>
                                                                    ) : (
                                                                        <Button
                                                                            type="button"
                                                                            variant={post.share_status ? 'outline' : 'primary'}
                                                                            loading={busy === 'publish_gallery_post'}
                                                                            disabled={Boolean(busy) || post.share_status === 'published'}
                                                                            onClick={() => setReviewSelection({ post, mode: 'gallery' })}
                                                                        >
                                                                            {post.share_status === 'published' ? '공개 중' : '전문 확인 후 공유'}
                                                                        </Button>
                                                                    )}
                                                                </article>
                                                            ))}
                                                        </div>
                                                    </section>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </section>
                                )}

                                {galleryStep === 'manage' && renderManageStep()}
                                {galleryStep === 'engage' && renderEngageStep()}
                                </div>
                            ) : activeActivityTab === 'books' ? (
                                <div className="neighbor-teacher__activity-body">
                                    <TeacherBooksPanel spaceId={workspace.space.id} classId={classId} pendingEntries={pendingGuestbook}
                                        ask={ask} onChanged={refreshWorkspace} api={booksApi}
                                        onOpenBooks={onNavigateTab ? () => onNavigateTab('class-agit-books') : undefined} />
                                </div>
                            ) : (
                                <>
                                    {/* 주제 만들기는 모달로. 화면(아래)은 활동 결과만 넓게 보인다(2026-09-18). */}
                                    <Modal isOpen={topicCreateOpen} onClose={() => { if (!busy) setTopicCreateOpen(false); }} title="✏️ 새 주제 제안" maxWidth="880px" showFooter={false}>
                                    <form className="neighbor-teacher__activity-form" onSubmit={createActivity}>
                                        <div className="neighbor-teacher__composer-flow">
                                            <section className="neighbor-teacher__form-step">
                                                <div className="neighbor-teacher__compact-heading"><span>1</span><h3>글 종류</h3></div>
                                                {activityForm.genre ? (
                                                    <div className="neighbor-teacher__genre is-picked">
                                                        <div className="neighbor-teacher__genre-mark" aria-hidden="true">📄</div>
                                                        <div className="neighbor-teacher__genre-body">
                                                            <strong>{activityForm.genre}</strong>
                                                            <ul>
                                                                <li>최소 {activityForm.min_chars}자</li>
                                                                <li>{activityForm.min_paragraphs}문단 이상</li>
                                                                {activityForm.guide_questions.length > 0 && <li>질문 {activityForm.guide_questions.length}개</li>}
                                                                {activityForm.mission_type && <li>전용 원고지</li>}
                                                            </ul>
                                                        </div>
                                                        <Button type="button" variant="ghost" size="sm" onClick={() => setGenrePickerOpen(true)}>변경</Button>
                                                    </div>
                                                ) : (
                                                    <button type="button" className="neighbor-teacher__genre is-empty" onClick={() => setGenrePickerOpen(true)}>
                                                        <span aria-hidden="true">📄</span>
                                                        <span><strong>글 종류 고르기</strong><small>시·편지·생활문 등</small></span>
                                                        <span className="neighbor-teacher__genre-go" aria-hidden="true">→</span>
                                                    </button>
                                                )}
                                                {presetNotice && <p className="neighbor-teacher__preset-notice" role="status">{presetNotice}</p>}
                                            </section>

                                            <section className="neighbor-teacher__form-step">
                                                <div className="neighbor-teacher__compact-heading"><span>2</span><h3>제목 · 주제 안내</h3></div>
                                                <MissionPromptFields
                                                    title={activityForm.title}
                                                    guide={activityForm.guide}
                                                    onTitleChange={(title) => setActivityForm((current) => ({ ...current, title }))}
                                                    onGuideChange={(guide) => setActivityForm((current) => ({ ...current, guide }))}
                                                    isMobile={isMobile}
                                                    titleMaxLength={80}
                                                    guideMaxLength={1000}
                                                    required
                                                    titlePlaceholder="글쓰기 주제 (예: 우리 동네의 숨은 보물)"
                                                    guidePlaceholder="무엇을 떠올리고 어떻게 써 볼지 안내해 주세요"
                                                />
                                            </section>

                                            <section className="neighbor-teacher__form-step">
                                                <div className="neighbor-teacher__compact-heading">
                                                    <span>3</span><h3>길잡이 질문</h3>
                                                    <Button type="button" variant="ghost" size="sm" loading={isGeneratingQuestions} disabled={isGeneratingQuestions || Boolean(busy)} onClick={() => generateGuideQuestions(5)}>🤖 AI 추천</Button>
                                                </div>
                                                <p className="neighbor-teacher__step-hint">학생이 글을 쓸 때 떠올릴 질문이에요. 직접 쓰거나 AI 추천을 받아 고쳐 쓰세요.</p>
                                                <div className="neighbor-teacher__questions">
                                                    {activityForm.guide_questions.map((question, index) => (
                                                        <div className="neighbor-teacher__question" key={index}>
                                                            <label><span>질문 {index + 1}</span>
                                                                <textarea value={question} required maxLength={200} rows={2}
                                                                    onChange={(event) => setActivityForm((current) => ({
                                                                        ...current, guide_questions: current.guide_questions.map((value, i) => i === index ? event.target.value : value)
                                                                    }))} />
                                                            </label>
                                                            <button type="button" className="neighbor-teacher__question-remove" aria-label={`질문 ${index + 1} 삭제`}
                                                                onClick={() => setActivityForm((current) => ({
                                                                    ...current, guide_questions: current.guide_questions.filter((_, i) => i !== index)
                                                                }))}>×</button>
                                                        </div>
                                                    ))}
                                                    <Button type="button" variant="secondary" size="sm" disabled={activityForm.guide_questions.length >= 10}
                                                        onClick={() => setActivityForm((current) => ({ ...current, guide_questions: [...current.guide_questions, ''] }))}>
                                                        + 질문 추가
                                                    </Button>
                                                </div>
                                            </section>

                                            <section className="neighbor-teacher__form-step">
                                                <div className="neighbor-teacher__compact-heading"><span>4</span><h3>완료 조건 · 포인트</h3></div>
                                                <div className="neighbor-teacher__setting-groups">
                                                    <fieldset>
                                                        <legend>완료 조건</legend>
                                                        <label>글자 수<input type="number" required min="1" max="5000" value={activityForm.min_chars}
                                                            onChange={(event) => setActivityForm((current) => ({ ...current, min_chars: event.target.value === '' ? '' : Number(event.target.value) }))} /></label>
                                                        <label>문단 수<input type="number" required min="1" max="20" value={activityForm.min_paragraphs}
                                                            onChange={(event) => setActivityForm((current) => ({ ...current, min_paragraphs: event.target.value === '' ? '' : Number(event.target.value) }))} /></label>
                                                    </fieldset>
                                                    <fieldset>
                                                        <legend>포인트</legend>
                                                        <label>기본<input type="number" min="0" max="1000" value={activityForm.base_reward}
                                                            onChange={(event) => setActivityForm((current) => ({ ...current, base_reward: Number(event.target.value) }))} /></label>
                                                        <label>추가 기준<input type="number" min="0" max="5000" step="50" value={activityForm.bonus_threshold}
                                                            onChange={(event) => setActivityForm((current) => ({ ...current, bonus_threshold: Number(event.target.value) }))} /></label>
                                                        <label>추가<input type="number" min="0" max="1000" value={activityForm.bonus_reward}
                                                            onChange={(event) => setActivityForm((current) => ({ ...current, bonus_reward: Number(event.target.value) }))} /></label>
                                                    </fieldset>
                                                </div>
                                            </section>

                                            <section className="neighbor-teacher__form-step">
                                                <div className="neighbor-teacher__compact-heading"><span>5</span><h3>기한 <small>(선택)</small></h3></div>
                                                <div className="neighbor-teacher__setting-groups">
                                                    {/* 기본은 기한 없음. 켜면 7일 뒤 오후 5시로 채운다(2026-09-25, deadlineDefaults.js). */}
                                                    <fieldset className="neighbor-teacher__deadline-field">
                                                        <legend>글쓰기 마감</legend>
                                                        <label className="neighbor-teacher__deadline-toggle">
                                                            <input type="checkbox" checked={Boolean(topicSchedule.writing_close_at)}
                                                                onChange={(event) => setTopicSchedule((current) => ({ ...current,
                                                                    writing_close_at: event.target.checked ? defaultDeadlineInput() : '' }))} />
                                                            기한 정하기
                                                        </label>
                                                        {topicSchedule.writing_close_at && (
                                                            <label>이때까지 글을 써요<input type="datetime-local" value={topicSchedule.writing_close_at}
                                                                onChange={(event) => setTopicSchedule((current) => ({ ...current, writing_close_at: event.target.value }))} /></label>
                                                        )}
                                                        <small>{topicSchedule.writing_close_at ? '지나면 주제가 저절로 종료돼요.' : '기한 없음 — 주제 카드의 ‘활동 종료’로 직접 마쳐요.'}</small>
                                                    </fieldset>
                                                    <fieldset className="neighbor-teacher__deadline-field">
                                                        <legend>댓글·반응 마감</legend>
                                                        <label className="neighbor-teacher__deadline-toggle">
                                                            <input type="checkbox" checked={Boolean(topicSchedule.comments_close_at)}
                                                                onChange={(event) => setTopicSchedule((current) => ({ ...current,
                                                                    // 댓글 마감은 글쓰기 마감보다 빠를 수 없어, 글쓰기 기한이 있으면 그 값으로 시작한다.
                                                                    comments_close_at: event.target.checked ? (current.writing_close_at || defaultDeadlineInput()) : '' }))} />
                                                            기한 정하기
                                                        </label>
                                                        {topicSchedule.comments_close_at && (
                                                            <label>이때까지 댓글·공감을 남겨요<input type="datetime-local" value={topicSchedule.comments_close_at}
                                                                onChange={(event) => setTopicSchedule((current) => ({ ...current, comments_close_at: event.target.value }))} /></label>
                                                        )}
                                                        <small>{topicSchedule.comments_close_at ? '지나면 글은 읽기만 돼요.' : '기한 없음 — 공간이 열려 있는 동안 계속 남길 수 있어요.'}</small>
                                                    </fieldset>
                                                </div>
                                            </section>

                                            <Button className="neighbor-teacher__submit-topic" type="submit" loading={busy === 'create_activity'} disabled={Boolean(busy)}>{getNeighborActivityLabel(activeActivityTab)} 제안하기</Button>
                                        </div>
                                    </form>
                                    </Modal>

                                    {/* `MissionTypePicker` 는 그 자리에 펼쳐지는 판이라 폼 아래로 밀려났었다.
                                        고르는 동안에는 다른 것을 볼 일이 없으므로 창으로 띄우고, 고르면 바로 닫는다
                                        (`selectGenre` 첫 줄에서 닫는다). 창은 `ModalPortal` 로 body 에 붙인다 —
                                        이 화면은 카드 안에 있어 그 자리에 그리면 조상 기준으로 잘릴 수 있다. */}
                                    <ModalPortal>
                                        <Modal
                                            isOpen={genrePickerOpen}
                                            onClose={() => setGenrePickerOpen(false)}
                                            title="📄 어떤 글을 쓰게 할까요?"
                                            maxWidth="760px"
                                            showFooter={false}
                                        >
                                            <MissionTypePicker
                                                embedded
                                                isMobile={isMobile}
                                                onSelectGenre={(missionTypeId) => selectGenre(
                                                    genreIdForMissionType(missionTypeId), missionTypeId
                                                )}
                                                onSelectFreeform={(genreId) => selectGenre(genreId)}
                                                onClose={() => setGenrePickerOpen(false)}
                                            />
                                        </Modal>
                                    </ModalPortal>

                                    <div className="neighbor-teacher__activity-body">
                                    {/* 공개·비공개는 주제마다 자세히 보기 → 제출 글 공개 창에서 한다(2026-09-25). 예전 ② 공개 글 관리는
                                        이웃 글 마당과 같은 화면이라 모든 공간 글이 섞여 나와 이 공간에서는 뺐다. */}
                                    {renderStepBar([
                                        { id: 'topics', label: '주제' },
                                        { id: 'engage', label: '댓글·반응' }
                                    ], topicStep, setTopicStep)}

                                    {topicStep === 'topics' && (
                                    <section className="neighbor-teacher-card neighbor-teacher__activity-list" role="tabpanel">
                                        <div className="neighbor-teacher__activity-head">
                                            <strong>📊 진행 현황 {selectedActivities.length > 0 ? `(${selectedActivities.length})` : ''}</strong>
                                            <Button type="button" onClick={() => setTopicCreateOpen(true)}>✏️ 주제 만들기</Button>
                                        </div>
                                        {selectedActivities.length === 0 ? <p className="neighbor-teacher__empty">아직 만든 주제가 없습니다. `주제 만들기` 에서 첫 주제를 내 보세요.</p> : <div className="neighbor-topic-tiles">{selectedActivities.map((activity) => (
                                    <button type="button" key={activity.id} className="neighbor-topic-tile" data-status={activity.status}
                                        onClick={() => setTopicDetailId(activity.id)} aria-label={`${activity.title} 자세히 보기`}>
                                        <span className="neighbor-topic-tile__top">
                                            <span className="neighbor-topic-card__status" data-status={activity.status}>
                                                {activity.status === 'pending_approval' ? '⏳ 승인 대기' : activity.status === 'closed' ? '🔒 종료' : '✏️ 글 쓰는 중'}
                                            </span>
                                            {activity.can_review && <span className="neighbor-teacher__new-flag">승인할 제안</span>}
                                            {(activity.my_submissions || []).some((submission) => submission.is_new || seenNewSubmissionIds.has(submission.post_id))
                                                && <span className="neighbor-teacher__new-flag">NEW</span>}
                                        </span>
                                        <strong className="neighbor-topic-tile__title">{activity.title}</strong>
                                        <span className="neighbor-topic-tile__meta">{topicTileDeadline(activity)}</span>
                                        <span className="neighbor-topic-tile__meta">
                                            {activity.status === 'pending_approval'
                                                ? `참여 반 ${(activity.approvals || []).length}곳 · 승인 ${(activity.approvals || []).filter((approval) => approval.is_proposer || approval.status === 'approved').length}곳`
                                                : `우리 반 제출 ${activity.my_submissions?.length || 0}편 · 공개 ${(activity.my_submissions || []).filter((submission) => submission.share_status === 'published').length}편`}
                                        </span>
                                    </button>
                                        ))}</div>}
                                    </section>
                                    )}

                                    {topicStep === 'engage' && renderEngageStep()}
                                    </div>
                                </>
                            )}
                            </div>
                        </div>
                    )}
                </>
            )}
            {/* 통합 검토함: 두 활동의 공개 대기 글을 한 곳에서 처리한다(어느 탭에서든 상단 검토 버튼으로 연다). */}
            {workspace?.space?.my_status === 'active' && isReady && (
                <Modal isOpen={reviewInboxOpen} onClose={() => setReviewInboxOpen(false)} title="🗂️ 검토함" maxWidth="640px" showFooter={false}>
                    {workspace.space.my_role === 'host' && (
                        <>
                            <h3 className="neighbor-teacher__inbox-heading">🚪 참여 신청</h3>
                            {pendingMemberships.length === 0
                                ? <p className="neighbor-teacher__empty">새 참여 신청이 없습니다.</p>
                                : <div className="neighbor-teacher__post-list">{pendingMemberships.map((membership) => (
                                    <article key={membership.class_id}>
                                        <div><span><strong>{membership.class_name}</strong><small>우리 공간에 들어오려고 해요</small></span></div>
                                        <span className="neighbor-teacher__row-actions">
                                            <Button type="button" disabled={Boolean(busy)} onClick={() => runAction('review_join', { space_id: workspace.space.id, target_class_id: membership.class_id, approve: true }, '참여 학급을 승인했습니다.')}>승인</Button>
                                            <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => runAction('review_join', { space_id: workspace.space.id, target_class_id: membership.class_id, approve: false }, '참여 신청을 거절했습니다.')}>거절</Button>
                                        </span>
                                    </article>))}</div>}
                        </>
                    )}

                    {newTopicSubmissions > 0 && (
                        <>
                            <h3 className="neighbor-teacher__inbox-heading">🎪 같이 쓰기 광장 새 제출 글</h3>
                            <div className="neighbor-teacher__post-list">
                                <article>
                                    <div><span><strong>우리 반 학생이 새 글 {newTopicSubmissions}편을 냈어요</strong><small>진행 현황에서 보면 알림이 사라져요</small></span></div>
                                    <span className="neighbor-teacher__row-actions">
                                        <Button type="button" onClick={() => { setReviewInboxOpen(false); selectActivityTab('topic'); setTopicStep('topics'); }}>진행 현황 보기</Button>
                                    </span>
                                </article>
                            </div>
                        </>
                    )}

                    {pendingGuestbook.length > 0 && (
                        <>
                            <h3 className="neighbor-teacher__inbox-heading">📚 우리 반 문집 방문록</h3>
                            <div className="neighbor-teacher__post-list">{pendingGuestbook.map((entry) => (
                                <article key={entry.entry_id}>
                                    <div>
                                        <span><strong>{entry.class_name} {entry.student_name}</strong><small>{entry.book_title}</small></span>
                                        <p>{entry.content}</p>
                                    </div>
                                    <span className="neighbor-teacher__row-actions">
                                        <Button type="button" disabled={Boolean(busy)} onClick={() => reviewGuestbookEntry(entry, 'approve')}>올리기</Button>
                                        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => reviewGuestbookEntry(entry, 'reject')}>올리지 않기</Button>
                                    </span>
                                </article>))}</div>
                            {(notif.pending_guestbook || 0) > pendingGuestbook.length
                                && <p className="neighbor-teacher__inbox-note">방문록 {notif.pending_guestbook}건 중 오래된 {pendingGuestbook.length}건입니다. 처리하면 다음 것이 이어집니다.</p>}
                        </>
                    )}

                    <h3 className="neighbor-teacher__inbox-heading">같이 쓰기 광장 제안</h3>
                    {pendingApprovalActivities.length === 0
                        ? <p className="neighbor-teacher__empty">승인할 주제 제안이 없습니다.</p>
                        : <div className="neighbor-teacher__post-list">{pendingApprovalActivities.map((activity) => (
                            <article key={activity.id}>
                                <div>
                                    <span><strong>{activity.title}</strong><small>{getNeighborActivityLabel(activity.type)} 제안</small></span>
                                    {activity.prompt && <p>{activity.prompt}</p>}
                                    <small className="neighbor-teacher__proposal-schedule">
                                        글쓰기 마감 {activity.writing_close_at ? formatDeadline(activity.writing_close_at) : '없음'} · 댓글·반응 마감 {activity.comments_close_at ? formatDeadline(activity.comments_close_at) : '없음'}
                                    </small>
                                </div>
                                <span className="neighbor-teacher__row-actions">
                                    <Button type="button" loading={busy === 'review_activity'} disabled={Boolean(busy)} onClick={() => runAction('review_activity', { space_id: workspace.space.id, activity_id: activity.id, approve: true }, '주제 제안을 승인했습니다. 모든 학급이 승인하면 학생에게 열립니다.')}>승인</Button>
                                    <Button type="button" variant="outline" loading={busy === 'review_activity'} disabled={Boolean(busy)} onClick={() => runAction('review_activity', { space_id: workspace.space.id, activity_id: activity.id, approve: false }, '주제 제안을 거절했습니다.')}>거절</Button>
                                </span>
                            </article>))}</div>}

                    <h3 className="neighbor-teacher__inbox-heading">🚫 AI가 막은 우리 반 댓글</h3>
                    {(workspace.blocked_comments || []).length === 0
                        ? <p className="neighbor-teacher__empty">AI가 막은 댓글이 없습니다.</p>
                        : <div className="neighbor-teacher__post-list">{workspace.blocked_comments.map((comment) => (
                            <article key={comment.comment_id}>
                                <div>
                                    <span><strong>{comment.student_name}</strong><small>{comment.post_title ? `글: ${comment.post_title}` : ''}</small></span>
                                    <p>{comment.content}</p>
                                    {comment.reason && <small className="neighbor-teacher__block-reason">막힌 이유: {comment.reason}</small>}
                                </div>
                                <span className="neighbor-teacher__row-actions">
                                    <Button type="button" disabled={Boolean(busy)} onClick={() => handleBlockedComment(comment.comment_id, 'restore')}>되살리기</Button>
                                    <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => handleBlockedComment(comment.comment_id, 'delete')}>삭제</Button>
                                </span>
                            </article>))}</div>}
                    {(notif.blocked_comments || 0) > (workspace.blocked_comments || []).length
                        && <p className="neighbor-teacher__inbox-note">막힌 댓글 {notif.blocked_comments}건 중 최신 {workspace.blocked_comments.length}건입니다. 처리하면 다음 것이 이어집니다.</p>}
                </Modal>
            )}

            {/* 공간 관리: 참여 학급·초대·학생 입장·종료/나가기 등 가끔 쓰는 것 모음(역할별). */}
            {workspace?.space?.my_status === 'active' && isReady && (
                <Modal isOpen={manageOpen} onClose={() => { if (!busy) setManageOpen(false); }} title="⚙️ 공간 관리" maxWidth="640px" showFooter={false}>
                    <div className="neighbor-teacher__manage">
                        <section>
                            <h3>참여 학급 {activeMemberships.length}/{NEIGHBOR_AGIT_LIMITS.maxClassesPerSpace}</h3>
                            <ul className="neighbor-teacher__members">
                                {workspace.memberships.map((membership) => (
                                    <li key={membership.class_id}>
                                        <span><strong>{membership.class_name}</strong><small>{membership.role === 'host' ? '호스트' : membership.status === 'pending' ? '승인 대기' : '게스트'} · 학생 {membership.student_access_enabled ? '공개' : 'OFF'}</small></span>
                                        {workspace.space.my_role === 'host' && membership.status === 'pending' && <span className="neighbor-teacher__row-actions"><Button type="button" disabled={Boolean(busy)} onClick={() => runAction('review_join', { space_id: workspace.space.id, target_class_id: membership.class_id, approve: true }, '참여 학급을 승인했습니다.')}>승인</Button><Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => runAction('review_join', { space_id: workspace.space.id, target_class_id: membership.class_id, approve: false }, '참여 신청을 거절했습니다.')}>거절</Button></span>}
                                    </li>
                                ))}
                            </ul>
                        </section>
                        {workspace.space.my_role === 'host' && (
                            <section>
                                <h3>이웃 반 초대</h3>
                                {invite ? <InviteCodeBox invite={invite} spaceName={workspace.space.name} /> : <p>초대 코드 하나로 여러 반이 7일 동안 신청할 수 있어요.</p>}
                                <Button type="button" variant={invite ? 'outline' : 'primary'} loading={busy === 'create_invite'} disabled={Boolean(busy) || activeMemberships.length >= NEIGHBOR_AGIT_LIMITS.maxClassesPerSpace} onClick={createInvite}>{invite ? '새 초대 코드로 바꾸기' : '초대 코드 만들기'}</Button>
                                {activeMemberships.length >= NEIGHBOR_AGIT_LIMITS.maxClassesPerSpace && <p className="neighbor-teacher__empty">참여 학급이 {NEIGHBOR_AGIT_LIMITS.maxClassesPerSpace}개로 가득 찼습니다.</p>}
                            </section>
                        )}
                        <section>
                            <h3>우리 반 학생 입장</h3>
                            <p>두 반 이상 모이면 저절로 열려 우리 반 학생 홈에 카드가 나타납니다. 닫으면 우리 반 학생에게만 보이지 않아요(다른 반은 그대로).</p>
                            <Button type="button" variant={workspace.space.student_access_enabled ? 'outline' : 'primary'} loading={busy === 'set_access'} disabled={Boolean(busy) || activeMemberships.length < 2} onClick={() => runAction('set_access', { space_id: workspace.space.id, enabled: !workspace.space.student_access_enabled }, workspace.space.student_access_enabled ? '우리 반 학생 입장을 닫았습니다.' : '우리 반 학생 입장을 열었습니다.')}>{workspace.space.student_access_enabled ? '학생 입장 닫기' : '학생 입장 열기'}</Button>
                        </section>
                        <section>
                            {workspace.space.my_role === 'host'
                                ? <><h3>공간 종료</h3><p>모든 반의 학생 입장이 바로 끝납니다. 우리 반 글은 학급에 그대로 남고, 이 공간에서 주고받은 댓글·공감은 더 이상 볼 수 없어요.</p><Button type="button" variant="outline" loading={busy === 'close_space'} disabled={Boolean(busy)} onClick={closeSpace}>공간 종료</Button></>
                                : <><h3>공간 나가기</h3><p>우리 반 글은 학급에 그대로 남고, 이 공간에서 주고받은 댓글·공감은 더 이상 볼 수 없어요.</p><Button type="button" variant="outline" loading={busy === 'leave_space'} disabled={Boolean(busy)} onClick={leaveSpace}>공간 나가기</Button></>}
                        </section>
                    </div>
                </Modal>
            )}

            {/* 댓글·반응: 공개 글을 크게 보고 댓글·공감을 확인·검열한다(③ 스텝에서 연다). */}
            {(detailBusy || postDetail) && (
                <Modal isOpen onClose={closePostDetail} title={postDetail?.title || '이웃 글'} maxWidth="720px" showFooter={false}>
                    {detailBusy ? <p className="neighbor-teacher__empty">글을 불러오는 중입니다…</p> : postDetail ? (
                        <div className="neighbor-teacher__detail">
                            <div className="neighbor-teacher__detail-meta"><strong>{postDetail.author_name}</strong><span>{postDetail.class_name}</span></div>
                            <p className="neighbor-teacher__detail-content">{postDetail.content}</p>
                            <h3>댓글 {postDetail.comments.length}개</h3>
                            {postDetail.comments.length === 0 ? <p className="neighbor-teacher__empty">아직 댓글이 없어요.</p>
                                : <ul className="neighbor-teacher__detail-comments">{postDetail.comments.map((comment) => (
                                    <li key={comment.comment_id}>
                                        <div><span><strong>{comment.author_name}</strong><small>{comment.class_name}</small></span><p>{comment.status === 'hidden' ? '(숨긴 댓글)' : comment.content}</p></div>
                                        {comment.status === 'visible' ? <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => runAction('hide_comment', { space_id: workspace.space.id, item_id: comment.comment_id, reason: '교사 확인' }, '댓글을 숨겼습니다.')}>숨기기</Button>
                                            : comment.is_own_class ? <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={() => runAction('restore_comment', { space_id: workspace.space.id, item_id: comment.comment_id, reason: '' }, '댓글을 복원했습니다.')}>복원</Button> : null}
                                    </li>))}</ul>}
                        </div>
                    ) : null}
                </Modal>
            )}

            {reviewSelection && <TeacherPostReview selection={reviewSelection} spaceId={workspace.space.id}
                classId={classId} api={api} busy={busy} onSubmit={submitReviewedPost} onClose={() => setReviewSelection(null)} />}

            {activityPublishFor && (
                <Modal isOpen onClose={() => { if (!busy) { setActivityPublishFor(null); setActivityCandidates(null); } }}
                    title={`✏️ "${activityPublishFor.title}" 제출 글 공개`} maxWidth="880px" showFooter={false}>
                    <div className="neighbor-teacher__candidate-panel">
                        <p className="neighbor-teacher__gallery-intro"><span>우리 반 제출 글을 골라 이웃 반에 공개합니다. 공개는 선생님이 정하고, 공개한 글은 여기서 다시 비공개로 돌릴 수 있습니다.</span></p>
                        {activityCandLoading && !activityCandidates && <p className="neighbor-teacher__empty">활동 글을 불러오는 중…</p>}
                        {activityCandidates && (activityCandidates.length === 0 ? (
                            <p className="neighbor-teacher__empty">아직 제출한 활동 글이 없습니다.</p>
                        ) : (
                            <>
                                <div className="neighbor-teacher__candidate-summary">
                                    <strong>{activityCandidates.length}편</strong>
                                    {(() => {
                                        const ready = activityCandidates.filter((post) => !['published', 'hidden'].includes(post.share_status)).length;
                                        return ready > 0
                                            ? <Button type="button" size="sm" className="neighbor-teacher__bulk-publish" loading={busy === 'publish_activity_posts_bulk'} disabled={Boolean(busy)} onClick={() => bulkPublishActivity(activityPublishFor, activityCandidates)}>{ready}편 일괄 공개</Button>
                                            : <span>모두 공개됨</span>;
                                    })()}
                                </div>
                                <div className="neighbor-teacher__candidate-list">
                                    {activityCandidates.map((post) => (
                                        <article key={post.post_id}>
                                            <div className="neighbor-teacher__candidate-card-body">
                                                <div className="neighbor-teacher__candidate-meta">
                                                    <span className={`neighbor-teacher__share-status is-${post.share_status || 'ready'}`}>{post.share_status === 'published' ? '공개 중' : post.share_status === 'hidden' ? '숨김' : '공개 전'}</span>
                                                </div>
                                                <h3>{post.title || '제목 없는 글'}</h3>
                                                <p>{post.excerpt || '내용 미리보기가 없습니다.'}</p>
                                                <strong className="neighbor-teacher__candidate-author">{post.student_name}</strong>
                                            </div>
                                            {post.share_status === 'hidden' ? (
                                                <Button type="button" loading={busy === 'restore_post'} disabled={Boolean(busy)}
                                                    onClick={async () => { const r = await runAction('restore_post', { space_id: workspace.space.id, item_id: post.shared_post_id, reason: '' }, '글을 다시 공개했습니다.'); if (r) await reloadActivityCandidates(activityPublishFor.id); }}>
                                                    숨김 해제·다시 공개
                                                </Button>
                                            ) : post.share_status === 'published' ? (
                                                // 공개한 주제 글은 여기서 다시 비공개로 돌린다(예전 ② 공개 글 관리의 일, 2026-09-25).
                                                <Button type="button" variant="outline" loading={busy === 'hide_post'} disabled={Boolean(busy)}
                                                    onClick={async () => { const r = await runAction('hide_post', { space_id: workspace.space.id, item_id: post.shared_post_id, reason: '교사 확인' }, '글을 비공개로 돌렸습니다.'); if (r) await reloadActivityCandidates(activityPublishFor.id); }}>
                                                    비공개로 돌리기
                                                </Button>
                                            ) : (
                                                <Button type="button" variant="primary"
                                                    loading={busy === 'publish_activity_post'}
                                                    disabled={Boolean(busy)}
                                                    onClick={() => publishActivityPost(activityPublishFor.id, post)}>
                                                    공개하기
                                                </Button>
                                            )}
                                        </article>
                                    ))}
                                </div>
                            </>
                        ))}
                    </div>
                </Modal>
            )}
            {/* 활동 종료: 글쓰기만 마칠지, 댓글·반응까지 함께 닫을지 고른다.
                글쓰기와 댓글 마감은 따로 움직이므로 "종료했는데 왜 댓글이 달리지?" 가 생기지 않게 여기서 묻는다. */}
            {(() => {
                const topicDetail = topicDetailId ? activities.find((activity) => activity.id === topicDetailId) : null;
                return (
                    <Modal isOpen={Boolean(topicDetail)} onClose={() => setTopicDetailId(null)} title="🎪 같이 쓰기 광장 주제" maxWidth="1100px" showFooter={false}>
                        {topicDetail && renderTopicDetail(topicDetail)}
                    </Modal>
                );
            })()}
            <Modal isOpen={Boolean(closeActivityFor)} onClose={() => setCloseActivityFor(null)} title="이 주제를 어떻게 마칠까요?" maxWidth="520px" showFooter={false}>
                {closeActivityFor && (
                    <div className="neighbor-teacher__close-choice">
                        <p><strong>{closeActivityFor.title}</strong> — 새 글쓰기는 끝나고, 공개된 글은 그대로 남아요.</p>
                        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => closeActivity(closeActivityFor, false)}>
                            글쓰기만 마치기 <small>댓글·공감은 계속 남길 수 있어요</small>
                        </Button>
                        <Button type="button" variant="danger" disabled={Boolean(busy)} onClick={() => closeActivity(closeActivityFor, true)}>
                            댓글·반응까지 함께 마치기 <small>이제 읽기만 돼요</small>
                        </Button>
                    </div>
                )}
            </Modal>
            {confirmDialog}
        </section>
    );
};

export default NeighborAgitTeacherEntry;
