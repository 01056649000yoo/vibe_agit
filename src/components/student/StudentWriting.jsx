import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import CommentComposer from './CommentComposer';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';
import { motion, AnimatePresence } from 'framer-motion';
import { useMissionSubmit } from '../../hooks/useMissionSubmit';
import { usePostInteractions } from '../../hooks/usePostInteractions';
import useMediaQuery from '../../hooks/useMediaQuery';
import { countContentChars } from '../../lib/textMetrics';
import { getGenreMissionType, getGenreMissionTypes } from '../../modules/writing/mission-types/registry';
import WritingToolHost from '../../modules/writing/tools/WritingToolHost';
import WritingReferencePanel from '../../modules/writing/references/WritingReferencePanel';
import LabReferenceSource from '../../modules/writing/references/LabReferenceSource';
import { useWritingEditorSettings } from '../../modules/writing/editor-settings/WritingEditorSettingsContext';
import { AI_SPELL_CHECK_TOOL_ID, LAB_RESULTS_TOOL_ID } from '../../modules/writing/editor-settings/settings';

const AiSpellCheckPanel = lazy(() => import('../../modules/writing/tools/ai-spell-check/AiSpellCheckPanel'));
import {
    buildDraftKey,
    readLocalDraft,
    removeLocalDraft,
    writeLocalDraft
} from '../../modules/writing/drafts/localWritingDraft';
import WritingEditorFields from '../writing/WritingEditorFields';
import {
    WritingNotice,
    WritingSectionHeader,
    WritingWorkspace,
    WritingWorkspaceHeader,
    WritingWorkspacePath
} from '../writing/WritingWorkspace';
import SpellingUnderlineTextarea from '../../modules/writing/tools/spelling-lookup/SpellingUnderlineTextarea';
import WritingPolicyProgress from '../../modules/writing/policy/WritingPolicyProgress';
import { writingPolicyFromMission } from '../../modules/writing/policy/writingPolicy';
import { getReactionOptions } from '../../modules/writing/reactions/registry';
import ReactionNamesTooltip from './ReactionNamesTooltip';

const ReportDocument = lazy(() => import('../../modules/writing/mission-types/report/ReportDocument'));

const GENRE_EDITORS = new Map(
    getGenreMissionTypes()
        .filter((missionType) => missionType.studentEditorEntry)
        .map((missionType) => [missionType.id, lazy(missionType.studentEditorEntry)])
);

const PREVIEW_MODAL_STYLES = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(44, 62, 80, 0.55)',
        backdropFilter: 'blur(3px)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
    },
    dialog: {
        width: '100%',
        maxWidth: '820px',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: '#FFFFFF',
        borderRadius: '28px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        padding: '28px'
    }
};

const LOCAL_DRAFT_DEBOUNCE_MS = 3000;
const DB_BACKUP_INTERVAL_MS = 120000;

const createDraftSnapshot = (title, content, studentAnswers, structuredContent = null) => ({
    title,
    content,
    studentAnswers: [...studentAnswers],
    structuredContent
});

const isSameDraft = (a, b) => (
    a.title === b.title &&
    a.content === b.content &&
    JSON.stringify(a.studentAnswers) === JSON.stringify(b.studentAnswers) &&
    JSON.stringify(a.structuredContent) === JSON.stringify(b.structuredContent)
);

const hasStructuredDraftContent = (structuredContent) => (
    (Array.isArray(structuredContent?.stanzas)
        && structuredContent.stanzas.some((stanza) => stanza?.trim()))
    || (Array.isArray(structuredContent?.sections)
        && structuredContent.sections.some((section) => (
            section?.heading?.trim() || section?.body?.trim() || section?.image?.path
        )))
);

// 읽기·쓰기·지우기는 독서록과 같은 파일을 쓴다(`modules/writing/drafts/localWritingDraft`).
// 이 화면은 로컬 임시본 위에 DB 백업까지 얹기 때문에 아래 자동 저장 흐름은 여기서 따로 맡는다.
const getDraftStorageKey = (studentId, missionId) => (
    buildDraftKey('student_writing_draft', studentId, missionId)
);

/**
 * 역할: 학생 - 글쓰기 에디터 (단계별 답변 및 본문 삽입 기능 포함) ✨
 */
const StudentWriting = ({ studentSession, missionId, onBack, onNavigate, params }) => {
    // 교사가 `연구소 결과 불러오기`를 끄면 참고함의 연구소 자료도 함께 닫힌다(도구 버튼만 숨기면 반만 닫힌다).
    const { isToolEnabled } = useWritingEditorSettings();
    const labResultsEnabled = isToolEnabled(LAB_RESULTS_TOOL_ID);
    const aiSpellCheckEnabled = isToolEnabled(AI_SPELL_CHECK_TOOL_ID);
    const {
        mission,
        title, setTitle,
        content, setContent,
        loading,
        submitting,
        isReturned,
        isConfirmed,
        isSubmitted,
        aiFeedback,
        originalTitle,
        originalContent,
        showOriginalToFriends,
        isTeacherEdited,
        teacherEditedAt,
        studentAnswers,
        setStudentAnswers,
        structuredContent,
        setStructuredContent,
        postUpdatedAt,
        loadError,
        retryLoad,
        handleSave,
        handleSubmit,
        handleShowOriginalChange,
        postId
    } = useMissionSubmit(studentSession, missionId, params, onBack, onNavigate);

    // 수정 가능한 동안에는 아래 반응·댓글 영역 자체가 보이지 않는다.
    // 편집 중 15초 상호작용 폴링까지 돌리면 입력 화면에 불필요한 주기 렌더가 생기므로 잠긴 글에서만 조회한다.
    const isLocked = Boolean(loadError) || Boolean(mission?.is_archived) || isConfirmed || (isSubmitted && !isReturned);

    const {
        reactions,
        comments,
        handleReaction,
        addComment,
        updateComment,
        deleteComment
    } = usePostInteractions(isLocked ? postId : null, studentSession?.id);

    const [commentInput, setCommentInput] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [hoveredType, setHoveredType] = useState(null);

    const [showOriginal, setShowOriginal] = useState(false);
    const [savingOriginalSharing, setSavingOriginalSharing] = useState(false);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const editorRef = useRef(null);
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [autoSaveAt, setAutoSaveAt] = useState(null);
    const [autoSaveError, setAutoSaveError] = useState('');
    // 학생이 임시 저장을 직접 눌렀을 때만 잠깐 띄우는 확인 표시. 자동 저장과 구분해서
    // "내가 누른 것이 됐다"를 알려 준다(예전에는 alert 였는데 태블릿에서 키보드를 닫고
    // 반복되면 브라우저가 조용히 막았다).
    const [manualSavedAt, setManualSavedAt] = useState(null);
    const manualSavedTimerRef = useRef(null);
    const genreMissionType = getGenreMissionType(mission?.input_template);
    const GenreEditor = GENRE_EDITORS.get(mission?.input_template) || null;
    const studentLabels = genreMissionType?.studentLabels || {};
    const activeReactionIcons = getReactionOptions(genreMissionType?.reactionProfile);
    const ownPostReactionsReadOnly = genreMissionType?.ownPostReactionsReadOnly === true;
    const isReportWriting = structuredContent?.template === 'report'
        || mission?.input_template === 'report';

    // 질문 개수가 변하면 studentAnswers 배열 초기화/유지 로직
    useEffect(() => {
        if (mission?.guide_questions?.length > 0) {
            // 기존 답변이 없거나 질문 개수가 다를 때 초기화 (기본적으로 빈 배열이면 초기화)
            if (studentAnswers.length === 0) {
                setStudentAnswers(new Array(mission.guide_questions.length).fill(''));
            }
        }
    }, [mission?.guide_questions, studentAnswers.length, setStudentAnswers]);

    const handleAnswerChange = (idx, val) => {
        const newAnswers = [...studentAnswers];
        newAnswers.splice(idx, 1, val);
        setStudentAnswers(newAnswers);
    };

    const insertToBody = (text) => {
        if (!text?.trim()) return;
        const textarea = editorRef.current;

        // 커서 위치에 삽입 로직
        if (!textarea) {
            setContent(prev => prev ? prev + '\n' + text : text);
            return;
        }

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = content.substring(0, start);
        const after = content.substring(end);

        setContent(before + text + after);

        // 삽입 후 포커스 유지 및 커서 이동
        setTimeout(() => {
            textarea.focus();
            const newPos = start + text.length;
            textarea.setSelectionRange(newPos, newPos);
        }, 0);
    };

    const insertAllToBody = () => {
        const validAnswers = studentAnswers.filter(a => a?.trim());
        if (validAnswers.length === 0) {
            alert('입력된 답변이 없습니다! 질문에 먼저 답을 적어주세요. 😊');
            return;
        }
        const combined = validAnswers.join('\n\n');
        setContent(prev => prev ? prev + '\n\n' + combined : combined);
    };

    const previewParagraphs = content
        .split('\n')
        .map((paragraph) => paragraph.trimEnd())
        .filter((paragraph) => paragraph.trim().length > 0);
    const previewLines = content.split('\n');

    // 통계 계산
    const charCount = countContentChars(content);
    const genreParagraphCount = genreMissionType?.countParagraphs?.({
        structuredContent,
        content,
        config: mission?.template_config || {}
    });
    const paragraphCount = Number.isFinite(genreParagraphCount)
        ? genreParagraphCount
        : content.split(/\n+/).filter((paragraph) => paragraph.trim().length > 0).length;

    const hasRevisedVersion = Boolean(originalContent) && (
        originalTitle !== title || originalContent !== content
    );

    const handleOriginalSharingToggle = async (event) => {
        const nextValue = event.target.checked;
        setSavingOriginalSharing(true);
        const saved = await handleShowOriginalChange(nextValue);
        setSavingOriginalSharing(false);
        if (saved) {
            alert(nextValue
                ? '친구들이 처음글과 마지막글을 비교해서 볼 수 있어요. 📜'
                : '친구들에게는 마지막글만 보여요. 🔒');
        }
    };

    const draftStorageKey = getDraftStorageKey(studentSession?.id, missionId);
    const latestDraftRef = useRef(createDraftSnapshot('', '', []));
    const latestSaveRef = useRef(handleSave);
    const lastLocalSavedDataRef = useRef({ ...createDraftSnapshot('', '', []), initialized: false });
    const lastDbSavedDataRef = useRef({ ...createDraftSnapshot('', '', []), initialized: false });
    const localSaveTimerRef = useRef(null);
    const isDbBackupSavingRef = useRef(false);
    const autoSaveStateRef = useRef({ loading, submitting, isLocked, draftStorageKey });
    const saveLocalDraftRef = useRef(null);
    const runDbBackupRef = useRef(null);

    latestSaveRef.current = handleSave;
    latestDraftRef.current = createDraftSnapshot(title, content, studentAnswers, structuredContent);
    autoSaveStateRef.current = { loading, submitting, isLocked, draftStorageKey };

    const saveLocalDraft = () => {
        const { draftStorageKey: key, loading: isLoading, isLocked: locked } = autoSaveStateRef.current;
        if (!key || isLoading || locked) return false;

        const draft = latestDraftRef.current;
        const hasDraftContent =
            draft.title.trim().length > 0 ||
            draft.content.trim().length > 0 ||
            draft.studentAnswers.some((answer) => answer?.trim()) ||
            hasStructuredDraftContent(draft.structuredContent);

        if (!hasDraftContent || isSameDraft(lastLocalSavedDataRef.current, draft)) return false;

        const savedAt = writeLocalDraft(key, draft);
        if (!savedAt) {
            setAutoSaveError('이 단말의 임시저장 공간이 부족해요. 다른 단말이나 새 창에서 다시 시도해 주세요.');
            return false;
        }
        lastLocalSavedDataRef.current = {
            ...draft,
            initialized: true
        };
        setAutoSaveAt(new Date(savedAt));
        setAutoSaveError('');
        return true;
    };
    saveLocalDraftRef.current = saveLocalDraft;

    const runDbBackup = async () => {
        const { loading: isLoading, submitting: isSubmitting, isLocked: locked } = autoSaveStateRef.current;
        if (isLoading || isSubmitting || locked || isDbBackupSavingRef.current) return false;

        const draft = latestDraftRef.current;
        const hasDraftContent =
            draft.title.trim().length > 0 ||
            draft.content.trim().length > 0 ||
            draft.studentAnswers.some((answer) => answer?.trim()) ||
            hasStructuredDraftContent(draft.structuredContent);

        if (!hasDraftContent || isSameDraft(lastDbSavedDataRef.current, draft)) return false;

        isDbBackupSavingRef.current = true;
        try {
            // 저장을 시작한 순간의 스냅샷을 그대로 서버에 보내고 그 스냅샷만 저장 완료로 표시한다.
            // 요청 중 학생이 더 입력한 내용까지 저장됐다고 잘못 판단하면 다음 백업을 건너뛸 수 있다.
            const saved = await latestSaveRef.current(false, draft);
            if (!saved) return false;
            lastDbSavedDataRef.current = {
                ...draft,
                initialized: true
            };
            setAutoSaveError('');
            return true;
        } catch (err) {
            console.error('DB 자동 백업 실패:', err);
            setAutoSaveError('DB 백업 중 잠시 문제가 생겼어요.');
            return false;
        } finally {
            isDbBackupSavingRef.current = false;
        }
    };
    runDbBackupRef.current = runDbBackup;

    useEffect(() => {
        lastLocalSavedDataRef.current = { ...createDraftSnapshot('', '', []), initialized: false };
        lastDbSavedDataRef.current = { ...createDraftSnapshot('', '', []), initialized: false };
        setAutoSaveAt(null);
        setAutoSaveError('');
    }, [draftStorageKey]);

    useEffect(() => {
        if (loading) return;

        const dbSnapshot = latestDraftRef.current;
        if (!lastDbSavedDataRef.current.initialized) {
            lastDbSavedDataRef.current = {
                ...dbSnapshot,
                initialized: true
            };
        }

        const localDraft = readLocalDraft(draftStorageKey);
        if (!localDraft || isLocked) {
            if (!lastLocalSavedDataRef.current.initialized) {
                lastLocalSavedDataRef.current = {
                    ...dbSnapshot,
                    initialized: true
                };
            }
            return;
        }

        const localSnapshot = createDraftSnapshot(
            localDraft.title || '',
            localDraft.content || '',
            Array.isArray(localDraft.studentAnswers) ? localDraft.studentAnswers : [],
            localDraft.structuredContent || null
        );

        // DB(선생님 수정본 또는 다른 단말에서의 학생 저장)와 로컬 임시본 중 더 최신인 쪽을 사용한다.
        // 다른 브라우저/단말에서 한 작업이 이 단말의 옛 임시본에 덮어쓰이지 않도록 한다.
        const localSavedTime = localDraft.savedAt ? new Date(localDraft.savedAt).getTime() : 0;
        const teacherEditedTime = teacherEditedAt ? new Date(teacherEditedAt).getTime() : 0;
        const postUpdatedTime = postUpdatedAt ? new Date(postUpdatedAt).getTime() : 0;
        const dbFreshestTime = Math.max(teacherEditedTime, postUpdatedTime);
        if (dbFreshestTime > localSavedTime) {
            removeLocalDraft(draftStorageKey);
            lastLocalSavedDataRef.current = {
                ...dbSnapshot,
                initialized: true
            };
            const freshIso = teacherEditedTime >= postUpdatedTime ? teacherEditedAt : postUpdatedAt;
            if (freshIso) setAutoSaveAt(new Date(freshIso));
            return;
        }

        lastLocalSavedDataRef.current = {
            ...localSnapshot,
            initialized: true
        };

        if (!isSameDraft(dbSnapshot, localSnapshot)) {
            setTitle(localSnapshot.title);
            setContent(localSnapshot.content);
            setStudentAnswers(localSnapshot.studentAnswers);
            setStructuredContent(localSnapshot.structuredContent);
            if (localDraft.savedAt) setAutoSaveAt(new Date(localDraft.savedAt));
        }
    }, [loading, draftStorageKey, isLocked, teacherEditedAt, postUpdatedAt, setTitle, setContent, setStudentAnswers, setStructuredContent]);

    useEffect(() => {
        if (localSaveTimerRef.current) {
            window.clearTimeout(localSaveTimerRef.current);
            localSaveTimerRef.current = null;
        }

        if (loading || isLocked) return;

        localSaveTimerRef.current = window.setTimeout(() => {
            saveLocalDraftRef.current?.();
        }, LOCAL_DRAFT_DEBOUNCE_MS);

        return () => {
            if (localSaveTimerRef.current) {
                window.clearTimeout(localSaveTimerRef.current);
                localSaveTimerRef.current = null;
            }
        };
    }, [title, content, studentAnswers, structuredContent, loading, isLocked]);

    useEffect(() => {
        if (loading || submitting || isLocked) return;

        const intervalId = window.setInterval(() => {
            saveLocalDraftRef.current?.();
            runDbBackupRef.current?.();
        }, DB_BACKUP_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, [loading, submitting, isLocked]);

    useEffect(() => {
        const saveBeforeLeaving = () => {
            const state = autoSaveStateRef.current;
            if (!state.loading && !state.isLocked) {
                saveLocalDraftRef.current?.();
                if (!state.submitting) runDbBackupRef.current?.();
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') saveBeforeLeaving();
        };

        window.addEventListener('pagehide', saveBeforeLeaving);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            saveBeforeLeaving();
            window.removeEventListener('pagehide', saveBeforeLeaving);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const handleFinalSubmit = async () => {
        saveLocalDraftRef.current?.();
        const submitted = await handleSubmit();
        if (submitted) removeLocalDraft(draftStorageKey);
    };

    const handleManualSave = async () => {
        try {
            const draft = latestDraftRef.current;
            const saved = await handleSave(true, draft);
            if (!saved) return;
            const localSavedAt = writeLocalDraft(draftStorageKey, draft);
            lastLocalSavedDataRef.current = {
                ...draft,
                initialized: true
            };
            lastDbSavedDataRef.current = {
                ...draft,
                initialized: true
            };
            setAutoSaveAt(new Date());
            if (!localSavedAt && draftStorageKey) {
                // DB 저장은 성공했지만 로컬 백업이 실패한 케이스.
                setAutoSaveError('이 단말 임시저장이 실패했지만, 서버에는 안전하게 저장됐어요.');
            } else {
                setAutoSaveError('');
            }
            // 화면 안에서 잠깐 알린다. 키보드를 닫지 않아 학생이 바로 이어 쓸 수 있다.
            setManualSavedAt(new Date());
            if (manualSavedTimerRef.current) window.clearTimeout(manualSavedTimerRef.current);
            manualSavedTimerRef.current = window.setTimeout(() => {
                manualSavedTimerRef.current = null;
                setManualSavedAt(null);
            }, 4000);
        } catch (err) {
            console.error('수동 저장 실패:', err);
        }
    };

    useEffect(() => () => {
        if (manualSavedTimerRef.current) window.clearTimeout(manualSavedTimerRef.current);
    }, []);

    const ensureGenreDraftPost = async () => {
        if (postId) return postId;
        const draft = latestDraftRef.current;
        const savedPostId = await handleSave(false, draft);
        if (savedPostId) {
            lastDbSavedDataRef.current = { ...draft, initialized: true };
        }
        return savedPostId || null;
    };

    const persistGenreDraft = async ({ structuredContent: nextStructuredContent, content: nextContent }) => {
        const draft = {
            ...latestDraftRef.current,
            content: nextContent,
            structuredContent: nextStructuredContent,
        };
        const savedPostId = await handleSave(false, draft);
        if (savedPostId) {
            lastDbSavedDataRef.current = { ...draft, initialized: true };
        }
        return savedPostId || false;
    };

    const handleCommentConfirm = async () => {
        if (!commentInput.trim() || submittingComment) return;

        setSubmittingComment(true);
        try {
            if (editingCommentId) {
                const success = await updateComment(editingCommentId, commentInput);
                if (success) {
                    setEditingCommentId(null);
                    setCommentInput('');
                    return true;
                }
            } else {
                const alreadyCommented = comments.some(c => c.student_id === studentSession?.id);
                if (alreadyCommented) {
                    alert('댓글은 하나만 작성할 수 있어요! 😊');
                    setSubmittingComment(false);
                    return false;
                }
                const success = await addComment(commentInput);
                if (success) {
                    setCommentInput('');
                    return true;
                }
            }
        } catch (err) {
            console.error('댓글 작업 실패:', err.message);
            return false;
        } finally {
            setSubmittingComment(false);
        }
        return false;
    };

    if (loading) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 도구를 준비하는 중... ✍️</p></Card>;
    if (loadError) return (
        <Card style={{ maxWidth: '680px', margin: '40px auto', textAlign: 'center', padding: '36px' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🛟</div>
            <h2 style={{ color: '#C62828', marginBottom: '10px' }}>글을 안전하게 불러오지 못했어요</h2>
            <p style={{ color: '#607D8B', lineHeight: 1.7 }}>{loadError}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '22px' }}>
                <Button variant="ghost" onClick={onBack}>과제 목록으로</Button>
                <Button onClick={retryLoad}>다시 불러오기</Button>
            </div>
        </Card>
    );
    if (!mission) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 미션을 찾을 수 없습니다.</p><Button onClick={onBack}>과제 목록으로</Button></Card>;

    const hasQuestions = mission?.guide_questions?.length > 0;
    const writingReferenceSections = [
        ...(mission.guide?.trim() ? [{
            id: 'teacher-guide',
            eyebrow: '선생님 안내',
            title: '이번 글에서 기억할 점',
            items: [{
                id: 'teacher-guide-main',
                text: mission.guide.trim()
            }]
        }] : []),
        ...(hasQuestions ? [{
            id: 'teacher-questions',
            eyebrow: '선생님 질문',
            title: '생각을 여는 핵심 질문',
            description: '답을 고치려면 위의 생각 일깨우기에서 수정하세요.',
            items: mission.guide_questions.map((question, index) => ({
                id: `teacher-question-${index + 1}`,
                label: `질문 ${index + 1}`,
                text: question,
                supportingText: Reflect.get(studentAnswers, index)?.trim() || ''
            }))
        }] : [])
    ];

    return (
        <WritingWorkspace tone="assignment">
            <WritingWorkspaceHeader
                onBack={onBack}
                disabled={submitting}
                eyebrow={`✍️ ${mission.genre || '글쓰기 과제'}`}
                title={mission.title}
                description="생각을 정리한 뒤 글을 쓰고, 마지막에 한 번 검토해 제출해요."
            />
            <WritingWorkspacePath
                steps={hasQuestions
                    ? ['생각 열기', '글쓰기', '검토·제출']
                    : ['안내 읽기', '글쓰기', '검토·제출']}
            />

            {/* 선생님 피드백/상태 표시 영역 (기존 로직 유지) */}
            <AnimatePresence>
                {isConfirmed ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ overflow: 'hidden' }}>
                        <WritingNotice tone="success" icon="✅" title="포인트 지급 완료!">
                            선생님이 글을 승인하고 포인트를 선물하셨어요. 축하해요! 🌟
                        </WritingNotice>
                    </motion.div>
                ) : isSubmitted ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ overflow: 'hidden' }}>
                        <WritingNotice tone="info" icon="⏳" title="선생님이 확인 중이에요">
                            글을 멋지게 제출했어요! 조금만 기다려주세요. ✨
                        </WritingNotice>
                    </motion.div>
                ) : isReturned && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ overflow: 'hidden' }}>
                        <WritingNotice tone="warning" icon="♻️" title="선생님이 다시 쓰기를 요청하셨어요">
                            {/* 한 문단으로 이어서 끝낸다 — 줄을 나누거나 굵게 하면 조각나 보인다(2026-08-20). */}
                            <div style={{ marginBottom: aiFeedback ? '8px' : '0' }}>
                                내용을 보완해서 다시 한번 멋진 글을 완성해볼까요?
                                {aiSpellCheckEnabled && ' 참고함에서 맞춤법 검사를 한번 할 수 있어요.'}
                            </div>
                            {aiFeedback && <div style={{ background: 'rgba(255,255,255,0.7)', padding: '20px', borderRadius: '16px', fontSize: 'var(--ui-text-lg)', color: '#444', whiteSpace: 'pre-wrap', lineHeight: '1.8', border: '1px solid rgba(230, 81, 0, 0.2)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)' }}>{aiFeedback}</div>}
                        </WritingNotice>
                    </motion.div>
                )}
            </AnimatePresence>

            {isSubmitted && hasRevisedVersion && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px', padding: '16px 18px', borderRadius: '16px', border: showOriginalToFriends ? '2px solid #FFB74D' : '1px solid #E0E0E0', background: showOriginalToFriends ? '#FFF8E1' : '#FAFAFA', cursor: savingOriginalSharing ? 'wait' : 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={showOriginalToFriends}
                        onChange={handleOriginalSharingToggle}
                        disabled={savingOriginalSharing}
                        style={{ width: '20px', height: '20px', accentColor: '#FB8C00' }}
                    />
                    <span style={{ fontSize: '1.5rem' }}>📜</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <strong style={{ color: '#5D4037' }}>친구에게 처음글과 마지막글 비교 공개</strong>
                        <small style={{ color: '#8D6E63' }}>
                            {savingOriginalSharing ? '설정을 저장하는 중...' : '끄면 친구들에게는 완성한 마지막글만 보여요.'}
                        </small>
                    </span>
                </label>
            )}

            {/* 가이드 박스 */}
            <AnimatePresence>
                {isTeacherEdited && isReturned && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ overflow: 'hidden' }}>
                        <WritingNotice tone="success" icon="📝" title="선생님이 직접 다듬은 글이 도착했어요">
                            아래 글은 선생님이 손봐서 보내준 버전이에요. 이 상태에서 이어서 수정하거나 다시 제출하면 돼요.
                            {teacherEditedAt ? ` (${new Date(teacherEditedAt).toLocaleString()})` : ''}
                        </WritingNotice>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="writing-guide">
                <span className="writing-guide__label">💡 선생님의 글쓰기 안내</span>
                <p>{mission.guide}</p>
            </div>

            {/* 1단계: 생각 일깨우기 (질문 리스트) */}
            {hasQuestions && (
                <section className="writing-question-stage">
                    <WritingSectionHeader
                        icon="🎯"
                        title="생각 일깨우기"
                        description="질문에 답하며 글에 넣을 생각을 먼저 모아봐요."
                        action={<Button type="button" size="sm" onClick={insertAllToBody}>답변 전체 넣기</Button>}
                    />

                    <div className="writing-question-list">
                        {mission.guide_questions.map((q, idx) => (
                            <div key={idx} className="writing-question">
                                <div className="writing-question__prompt">
                                    <span className="writing-question__number">{idx + 1}</span>
                                    <span>{q}</span>
                                </div>
                                <div className="writing-question__answer">
                                    <SpellingUnderlineTextarea
                                        value={Reflect.get(studentAnswers, idx) || ''}
                                        onChange={(e) => handleAnswerChange(idx, e.target.value)}
                                        placeholder="여기에 생각을 적어보세요..."
                                        autoCapitalize="sentences"
                                        lang="ko"
                                        enterKeyHint="enter"
                                        wrap="soft"
                                        style={{ width: '100%', resize: 'none', outline: 'none' }}
                                        disabled={isLocked}
                                    />
                                </div>
                                <div className="writing-question__action">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => insertToBody(Reflect.get(studentAnswers, idx))}
                                        disabled={isLocked || !Reflect.get(studentAnswers, idx)?.trim()}
                                    >
                                        이 답변만 본문에 넣기
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* 2단계: 메인 글쓰기 에디터 */}
            <section className="writing-editor-surface">
                <WritingSectionHeader
                    icon="✍️"
                    title={studentLabels.editorHeading || '본격 글쓰기'}
                    description="제목과 내용을 차근차근 적어보세요. 입력한 글은 자동으로 안전하게 남겨요."
                    action={originalContent && (
                        <Button
                            type="button"
                            variant={showOriginal ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setShowOriginal(!showOriginal)}
                        >
                            {showOriginal ? '✨ 마지막 글(수정본) 보기' : '📜 나의 처음 글과 비교하기'}
                        </Button>
                    )}
                />

                <WritingToolHost
                    disabled={submitting || isLocked}
                    onInsertText={GenreEditor ? undefined : insertToBody}
                />

                <WritingReferencePanel
                    key={missionId}
                    sections={writingReferenceSections}
                    renderSources={labResultsEnabled
                        ? ({ isOpen }) => (
                            <LabReferenceSource
                                missionId={missionId}
                                missionTitle={mission.title}
                                isActive={isOpen}
                                isApproved={isConfirmed}
                                onInsertText={GenreEditor ? undefined : insertToBody}
                            />
                        )
                        : undefined}
                    extraTabs={aiSpellCheckEnabled ? [{
                        id: 'spell-check',
                        label: '맞춤법',
                        icon: '🔍',
                        /*
                         * ⚠️ 참고함 옆 설명이 **언제 열리는지**를 말하게 한다(2026-08-25 요청).
                         *    맞춤법 검사는 선생님이 `다시 쓰기` 를 요청한 뒤에만 열리는데, 예전에는
                         *    아직 못 쓰는 학생에게도 "여기서 맞춤법 검사도 해요"라고 말하고 있었다.
                         *    조건은 아래 `canRun` 과 같아야 한다 — 다르면 말과 동작이 어긋난다.
                         */
                        statusReady: Boolean(isReturned) && !isConfirmed,
                        statusNote: isConfirmed
                            ? '선생님이 확인을 마친 글이라 맞춤법 검사는 끝났어요.'
                            : (isReturned
                                ? 'AI 맞춤법 검사를 지금 할 수 있어요. 글 한 편에 한 번이에요.'
                                : (isSubmitted
                                    ? '선생님이 확인하는 중이에요. 다시 쓰기 요청을 받으면 맞춤법 검사가 열려요.'
                                    : '글을 내고 선생님께 다시 쓰기 요청을 받으면 맞춤법 검사가 열려요.')),
                        // 다시 쓰기 요청을 받았을 때만 위에 눈에 띄는 줄을 띄운다(그전에는 눌러도 못 쓴다).
                        cta: (isReturned && !isConfirmed) ? {
                            label: 'AI 맞춤법 검사를 할 수 있어요',
                            hint: '다시 쓰기 전에 한 번, 틀린 곳을 모아서 볼 수 있어요.'
                        } : null,
                        // 자료(볼 것)와 맞춤법(고칠 것)은 성격이 달라 같은 자리에서 갈래로 나눈다.
                        render: () => (
                            <Suspense fallback={null}>
                                <AiSpellCheckPanel
                                    postId={postId}
                                    studentId={studentSession?.id}
                                    canRun={Boolean(isReturned) && !isConfirmed && !submitting}
                                    blockedReason={isConfirmed
                                        ? '선생님이 이미 확인한 글이라 검사하지 않아요.'
                                        : isSubmitted
                                            ? '선생님이 확인하는 중이에요. 다시 쓰기 요청을 받으면 검사할 수 있어요.'
                                            : '먼저 글을 제출하고, 선생님께 다시 쓰기 요청을 받으면 검사할 수 있어요.'}
                                    onEnsurePost={ensureGenreDraftPost}
                                />
                            </Suspense>
                        )
                    }] : []}
                >
                    <div style={{ position: 'relative' }}>
                        {showOriginal && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.98)', zIndex: 10, display: 'flex', flexDirection: 'column', padding: '0' }}>
                                <div style={{
                                    width: '100%',
                                    padding: '16px 0',
                                    fontSize: isMobile ? '1.5rem' : '2rem',
                                    fontWeight: '900',
                                    borderBottom: '2px solid #FBC02D',
                                    marginBottom: '24px',
                                    color: '#2C3E50',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    lineHeight: '1.4'
                                }}>
                                    {originalTitle || '제목 없음'}
                                    <span style={{ fontSize: 'var(--ui-text-md)', color: '#E67E22', background: '#FFF3E0', padding: '4px 12px', borderRadius: '10px', fontWeight: '900' }}>나의 처음 글</span>
                                </div>
                                <div style={{
                                    fontSize: isMobile ? '1.1rem' : '1.25rem',
                                    lineHeight: '1.8',
                                    color: '#7F8C8D',
                                    whiteSpace: 'pre-wrap',
                                    flex: 1,
                                    overflowY: 'auto',
                                    padding: '10px 0'
                                }}>{originalContent || '기록된 내용이 없습니다.'}</div>
                            </div>
                        )}
                        {GenreEditor ? (
                            <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center', color: '#64748B' }}>장르 글쓰기 틀을 준비하는 중...</div>}>
                                <GenreEditor
                                    title={title}
                                    setTitle={setTitle}
                                    content={content}
                                    setContent={setContent}
                                    structuredContent={structuredContent}
                                    setStructuredContent={setStructuredContent}
                                    studentName={studentSession?.name}
                                    config={mission.template_config || {}}
                                    disabled={submitting || isLocked}
                                    isMobile={isMobile}
                                    postId={postId}
                                    ensureDraftPost={ensureGenreDraftPost}
                                    onPersistDraft={persistGenreDraft}
                                />
                            </Suspense>
                        ) : (
                            <WritingEditorFields
                                ref={editorRef}
                                title={title}
                                onTitleChange={setTitle}
                                content={content}
                                onContentChange={setContent}
                                titlePlaceholder={studentLabels.titlePlaceholder || '글의 제목을 적어주세요...'}
                                contentPlaceholder={studentLabels.contentPlaceholder || '여기에 자유롭게 이야기를 시작해보세요...'}
                                disabled={submitting || isLocked}
                                isMobile={isMobile}
                            />
                        )}
                    </div>
                </WritingReferencePanel>
            </section>

            {/* [신규] 내 글에 달린 소식 (반응 및 댓글) */}
            <AnimatePresence>
                {isLocked && postId && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{
                            marginTop: '40px',
                            padding: '40px',
                            background: '#F8F9FA',
                            borderRadius: '32px',
                            border: '1px solid #E9ECEF'
                        }}
                    >
                        <h3 style={{ margin: '0 0 24px 0', fontSize: 'var(--ui-text-xl)', color: '#2C3E50', fontWeight: '900' }}>
                            💬 친구들의 소중한 반응
                        </h3>

                        {/* 반응 버튼들 */}
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            marginBottom: '40px',
                            overflowX: 'visible'
                        }}>
                            {activeReactionIcons.map((icon) => {
                                const typeReactions = reactions.filter(r => r.reaction_type === icon.type);
                                const isMine = typeReactions.some(r => r.student_id === studentSession?.id);
                                const reactorNames = typeReactions.map(r => r.students?.name).filter(Boolean);

                                return (
                                    <div
                                        key={icon.type}
                                        style={{ flex: 1, position: 'relative' }}
                                        onMouseEnter={() => setHoveredType(icon.type)}
                                        onMouseLeave={() => setHoveredType(null)}
                                    >
                                        <button
                                            onClick={() => {
                                                if (!ownPostReactionsReadOnly) handleReaction(icon.type);
                                            }}
                                            disabled={ownPostReactionsReadOnly}
                                            style={{
                                                width: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '12px 8px',
                                                border: isMine ? '2px solid #3498DB' : '1px solid #ECEFF1',
                                                background: isMine ? '#E3F2FD' : 'white',
                                                borderRadius: '16px',
                                                cursor: ownPostReactionsReadOnly ? 'default' : 'pointer',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <span style={{ fontSize: '1.4rem' }}>{icon.emoji}</span>
                                            <span style={{ fontSize: 'var(--ui-text-sm)', fontWeight: 'bold', color: isMine ? '#3498DB' : '#7F8C8D' }}>{icon.label}</span>
                                            <span style={{ fontSize: 'var(--ui-text-sm)', fontWeight: '900', color: isMine ? '#2980B9' : '#ADB5BD' }}>{typeReactions.length}</span>
                                        </button>

                                        <ReactionNamesTooltip open={hoveredType === icon.type} names={reactorNames} />
                                    </div>
                                );
                            })}
                        </div>

                        {/* 댓글 리스트 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {comments.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#B2BEC3', padding: '40px', background: 'white', borderRadius: '24px', border: '2px dashed #F1F3F5' }}>
                                    아직 친구들이나 선생님의 댓글이 없어요. 🌵
                                </div>
                            ) : (
                                comments.map(c => {
                                    const isTeacher = !!c.teacher_id;
                                    const isMe = c.student_id === studentSession?.id;
                                    return (
                                        <div key={c.id} style={{
                                            padding: '20px',
                                            background: isTeacher ? '#EFF6FF' : isMe ? '#E3F2FD' : 'white',
                                            borderRadius: '20px',
                                            border: isTeacher ? '1px solid #BFDBFE' : '1px solid #F1F3F5',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {isTeacher ? (
                                                        <span style={{
                                                            fontSize: 'var(--ui-text-sm)', fontWeight: '900',
                                                            background: '#3B82F6', color: 'white',
                                                            padding: '2px 8px', borderRadius: '6px'
                                                        }}>🍎 선생님</span>
                                                    ) : (
                                                        <span style={{ fontWeight: '900', fontSize: 'var(--ui-text-md)', color: isMe ? '#1976D2' : '#3498DB' }}>
                                                            {c.students?.name} {isMe && '(나)'}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: 'var(--ui-text-sm)', color: '#ADB5BD' }}>
                                                        {new Date(c.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                {isMe && (
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button onClick={() => { setEditingCommentId(c.id); setCommentInput(c.content); }} style={{ background: 'none', border: 'none', color: '#7F8C8D', fontSize: 'var(--ui-text-sm)', cursor: 'pointer' }}>수정</button>
                                                        <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', color: '#E74C3C', fontSize: 'var(--ui-text-sm)', cursor: 'pointer' }}>삭제</button>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 'var(--ui-text-lg)', color: '#2D3436', lineHeight: '1.6' }}>{c.content}</div>
                                        </div>
                                    );
                                })
                            )}

                            {/* 댓글 입력창 (내 글이지만 나도 댓글 달 수 있게 하거나, 혹은 보기만 하거나 선택 가능) */}
                            <CommentComposer
                                key={`${postId || ''}:${editingCommentId || 'new'}`}
                                value={commentInput}
                                onChange={setCommentInput}
                                onConfirm={handleCommentConfirm}
                                submitting={submittingComment}
                                editing={Boolean(editingCommentId)}
                                onCancelEdit={() => { setEditingCommentId(null); setCommentInput(''); }}
                                placeholder={editingCommentId ? '댓글을 수정하고 있어요...' : '친구들에게 답글을 남겨보세요... ✨'}
                            />
                            <div style={{ marginTop: '10px', fontSize: 'var(--ui-text-sm)', color: '#95A5A6', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <span>🛡️</span> <strong>AI 보안관</strong>이 안전한 댓글 문화를 위해 24시간 감시 중이에요.
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 공용 분량·보상 정책 현황 + 자동 저장 상태 */}
            <WritingPolicyProgress
                policy={writingPolicyFromMission(mission)}
                metrics={{ charCount, paragraphCount }}
                unitLabel={genreMissionType?.unitLabel || '문단'}
                skipParagraphValidation={genreMissionType?.skipGenericParagraphValidation}
            />
            <div className="writing-metrics">
                <div className="writing-metric">
                    <span>{manualSavedAt && !autoSaveError ? '임시 저장 완료' : '자동 저장'}</span>
                    <strong className={autoSaveError ? 'is-pending' : ''}>
                        {autoSaveError || (manualSavedAt
                            ? `저장했어요 ✓ ${manualSavedAt.toLocaleTimeString()}`
                            : (autoSaveAt ? autoSaveAt.toLocaleTimeString() : '-'))}
                    </strong>
                        {!autoSaveError && (
                        <small>
                            {manualSavedAt
                                ? '다른 기기에서도 이어 쓸 수 있어요'
                                : '이 기기에 먼저 저장돼요'}
                        </small>
                        )}
                </div>
            </div>

            {/* 저장 및 제출 버튼 */}
            <div className="writing-action-bar">
                <Button type="button" size="lg" variant="ghost" onClick={handleManualSave} disabled={submitting || isLocked}>
                    {isLocked ? '수정 불가 🔒' : '임시 저장 💾'}
                </Button>
                <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    onClick={() => setIsPreviewOpen(true)}
                    disabled={submitting || isLocked || (!title.trim() && !content.trim())}
                >
                    제출 전 검토하기 👀
                </Button>
                <Button type="button" size="lg" onClick={handleFinalSubmit} disabled={submitting || isLocked}>
                    {submitting
                        ? '제출 중...'
                        : isConfirmed
                            ? '승인 완료 ✨'
                            : (isSubmitted && isReturned)
                                ? '수정해서 다시 제출! 🚀'
                                : (isSubmitted && !isReturned)
                                    ? '확인 대기 중...'
                                    : (studentLabels.submitLabel || '멋지게 제출하기! 🚀')}
                </Button>
            </div>

            <ModalPortal>
                <AnimatePresence>
                    {isPreviewOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={PREVIEW_MODAL_STYLES.overlay}
                            onClick={() => setIsPreviewOpen(false)}
                        >
                            <motion.div
                                role="dialog"
                                aria-modal="true"
                                aria-label={studentLabels.previewHeading || '제출 전 검토하기'}
                                initial={{ y: 24, opacity: 0, scale: 0.98 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: 24, opacity: 0, scale: 0.98 }}
                                transition={{ duration: 0.2 }}
                                style={PREVIEW_MODAL_STYLES.dialog}
                                onClick={(e) => e.stopPropagation()}
                            >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '24px' }}>
                                <div>
                                    <div style={{ fontSize: 'var(--ui-text-2xl)', fontWeight: '900', color: '#263238', marginBottom: '8px' }}>
                                        {studentLabels.previewHeading || '제출 전 검토하기'}
                                    </div>
                                    <div style={{ color: '#607D8B', fontSize: 'var(--ui-text-md)', lineHeight: '1.6' }}>
                                        {studentLabels.previewDescription || '문단이 잘 나뉘었는지, 제목과 본문이 의도대로 보이는지 마지막으로 확인해보세요.'}
                                    </div>
                                </div>
                                <ModalCloseButton
                                    onClick={() => setIsPreviewOpen(false)}
                                    label="제출 전 검토 창 닫기"
                                />
                            </div>

                            <div style={{
                                display: 'flex',
                                gap: '12px',
                                flexWrap: 'wrap',
                                marginBottom: '24px'
                            }}>
                                <div style={{ background: '#FFF8E1', border: '1px solid #FFE082', borderRadius: '14px', padding: '10px 14px', fontWeight: '800', color: '#8D6E63' }}>
                                    글자 수 {charCount}자
                                </div>
                                <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: '14px', padding: '10px 14px', fontWeight: '800', color: '#2E7D32' }}>
                                    문단 수 {paragraphCount}개
                                </div>
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <div style={{ fontSize: 'var(--ui-text-md)', color: '#78909C', fontWeight: '800', marginBottom: '8px' }}>
                                    {studentLabels.titleLabel || '제목'}
                                </div>
                                <div style={{
                                    background: '#FAFAFA',
                                    border: '1px solid #ECEFF1',
                                    borderRadius: '18px',
                                    padding: '18px 20px',
                                    fontSize: 'var(--ui-text-2xl)',
                                    fontWeight: '900',
                                    color: '#263238',
                                    lineHeight: '1.4'
                                }}>
                                    {title.trim() || '제목이 아직 비어 있어요.'}
                                </div>
                            </div>

                            <div style={{ marginBottom: '28px' }}>
                                <div style={{ fontSize: 'var(--ui-text-md)', color: '#78909C', fontWeight: '800', marginBottom: '8px' }}>
                                    {studentLabels.contentLabel || '본문 미리보기'}
                                </div>
                                <div style={{
                                    background: '#FBFCFD',
                                    border: '1px solid #ECEFF1',
                                    borderRadius: '22px',
                                    padding: '20px'
                                }}>
                                    {isReportWriting && structuredContent?.template === 'report' ? (
                                        <Suspense fallback={<div style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>보고서 사진과 칸을 준비하는 중...</div>}>
                                            <ReportDocument structuredContent={structuredContent} content={content} compact />
                                        </Suspense>
                                    ) : previewParagraphs.length > 0 ? (
                                        <div style={{
                                            background: '#FFFFFF',
                                            border: '1px solid #E3F2FD',
                                            borderRadius: '18px',
                                            padding: '18px 20px',
                                            fontSize: 'var(--ui-text-lg)',
                                            lineHeight: '1.9',
                                            color: '#37474F',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            overflowWrap: 'anywhere',
                                            boxSizing: 'border-box',
                                            width: '100%',
                                            maxWidth: '100%',
                                            overflowX: 'hidden',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                                        }}>
                                            {previewLines.map((line, index) => {
                                                const isLastLine = index === previewLines.length - 1;

                                                return (
                                                    <React.Fragment key={`preview-line-${index}`}>
                                                        <div style={{ minHeight: '1.9em' }}>
                                                            {line.length > 0 ? line : '\u00A0'}
                                                        </div>
                                                        {!isLastLine && (
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'flex-end',
                                                                margin: '8px 0 10px 0',
                                                                borderTop: '1px dashed #FFCC80',
                                                                paddingTop: '6px'
                                                            }}>
                                                                <span style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    width: '22px',
                                                                    height: '22px',
                                                                    borderRadius: '999px',
                                                                    background: '#FFF8E1',
                                                                    border: '1px solid #FFE082',
                                                                    color: '#FB8C00',
                                                                    fontSize: 'var(--ui-text-sm)',
                                                                    fontWeight: '800'
                                                                }}>
                                                                    ↵
                                                                </span>
                                                            </div>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#90A4AE', padding: '36px 20px', fontWeight: '700' }}>
                                            아직 본문이 비어 있어요. 내용을 조금 더 적고 검토해보세요.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <Button
                                    size="lg"
                                    onClick={() => setIsPreviewOpen(false)}
                                    style={{ flex: 1, height: '58px', background: '#ECEFF1', color: '#455A64', border: 'none', fontWeight: '800' }}
                                >
                                    수정하기
                                </Button>
                                <Button
                                    size="lg"
                                    onClick={async () => {
                                        setIsPreviewOpen(false);
                                        await handleFinalSubmit();
                                    }}
                                    disabled={submitting || isLocked}
                                    style={{ flex: 1.4, height: '58px', background: 'var(--primary-color)', color: 'white', border: 'none', fontWeight: '900' }}
                                >
                                    {studentLabels.previewSubmitLabel || '이대로 제출하기 🚀'}
                                </Button>
                            </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </ModalPortal>
        </WritingWorkspace>
    );
};

export default StudentWriting;
