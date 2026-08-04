import React, { lazy, Suspense, useState, useRef, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import ModalPortal from '../common/ModalPortal';
import { motion, AnimatePresence } from 'framer-motion';
import { useMissionSubmit } from '../../hooks/useMissionSubmit';
import { usePostInteractions } from '../../hooks/usePostInteractions';
import { countContentChars } from '../../lib/textMetrics';
import { getGenreMissionType, getGenreMissionTypes } from '../../modules/writing/mission-types/registry';
import WritingToolHost from '../../modules/writing/tools/WritingToolHost';
import {
    buildDraftKey,
    readLocalDraft,
    removeLocalDraft,
    writeLocalDraft
} from '../../modules/writing/drafts/localWritingDraft';
import WritingEditorFields from '../writing/WritingEditorFields';
import { STUDENT_WRITING_CARD_MAX_WIDTH } from '../../modules/writing/layout';

const GENRE_EDITORS = new Map(
    getGenreMissionTypes()
        .filter((missionType) => missionType.studentEditorEntry)
        .map((missionType) => [missionType.id, lazy(missionType.studentEditorEntry)])
);

const REACTION_ICONS = [
    { type: 'heart', label: '좋아요', emoji: '❤️' },
    { type: 'laugh', label: '재밌어요', emoji: '😂' },
    { type: 'wow', label: '멋져요', emoji: '👏' },
    { type: 'bulb', label: '배워요', emoji: '💡' },
    { type: 'star', label: '최고야', emoji: '✨' }
];

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
    Array.isArray(structuredContent?.stanzas) &&
    structuredContent.stanzas.some((stanza) => stanza?.trim())
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
    const isMobile = window.innerWidth <= 768;
    const [autoSaveAt, setAutoSaveAt] = useState(null);
    const [autoSaveError, setAutoSaveError] = useState('');
    const genreMissionType = getGenreMissionType(mission?.input_template);
    const GenreEditor = GENRE_EDITORS.get(mission?.input_template) || null;
    const studentLabels = genreMissionType?.studentLabels || {};
    const activeReactionIcons = genreMissionType?.reactionIcons || REACTION_ICONS;
    const ownPostReactionsReadOnly = genreMissionType?.ownPostReactionsReadOnly === true;

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
        newAnswers[idx] = val;
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
    const genreParagraphCount = genreMissionType?.countParagraphs?.({ structuredContent, content });
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
        } catch (err) {
            console.error('수동 저장 실패:', err);
        }
    };

    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        if (!commentInput.trim() || submittingComment) return;

        setSubmittingComment(true);
        try {
            if (editingCommentId) {
                const success = await updateComment(editingCommentId, commentInput);
                if (success) {
                    setEditingCommentId(null);
                    setCommentInput('');
                }
            } else {
                const alreadyCommented = comments.some(c => c.student_id === studentSession?.id);
                if (alreadyCommented) {
                    alert('댓글은 하나만 작성할 수 있어요! 😊');
                    setSubmittingComment(false);
                    return;
                }
                const success = await addComment(commentInput);
                if (success) setCommentInput('');
            }
        } catch (err) {
            console.error('댓글 작업 실패:', err.message);
        } finally {
            setSubmittingComment(false);
        }
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
    if (!mission) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 미션을 찾을 수 없습니다.</p><Button onClick={onBack}>돌아가기</Button></Card>;

    const hasQuestions = mission?.guide_questions?.length > 0;

    return (
        <Card style={{
            // 질문 유무와 관계없이 질문 있는 과제의 폭을 기준으로 쓴다.
            maxWidth: STUDENT_WRITING_CARD_MAX_WIDTH,
            padding: '32px',
            border: 'none',
            background: '#FFFFFF',
            boxShadow: '0 15px 40px rgba(0,0,0,0.08)',
            margin: '20px auto 40px auto',
            transition: 'all 0.3s ease'
        }}>
            {/* 상단 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <Button variant="ghost" size="sm" onClick={onBack} disabled={submitting}>
                    ⬅️ 나가기
                </Button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        background: '#E3F2FD',
                        color: '#1976D2',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '900',
                        marginBottom: '8px'
                    }}>
                        {mission.genre}
                    </div>
                    <h2 style={{ margin: 0, color: '#263238', fontSize: '1.8rem', fontWeight: '900' }}>{mission.title}</h2>
                </div>
            </div>

            {/* 선생님 피드백/상태 표시 영역 (기존 로직 유지) */}
            <AnimatePresence>
                {isConfirmed ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ background: '#E8F5E9', padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #C8E6C9', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '1.5rem' }}>✅</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#2E7D32', fontSize: '1rem' }}>포인트 지급 완료!</div>
                            <div style={{ fontSize: '0.85rem', color: '#388E3C' }}>선생님이 글을 승인하고 포인트를 선물하셨어요. 축하해요! 🌟</div>
                        </div>
                    </motion.div>
                ) : isSubmitted ? (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ background: '#E3F2FD', padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #BBDEFB', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '1.5rem' }}>⏳</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#1565C0', fontSize: '1rem' }}>선생님이 확인 중이에요</div>
                            <div style={{ fontSize: '0.85rem', color: '#1976D2' }}>글을 멋지게 제출했어요! 조금만 기다려주세요. ✨</div>
                        </div>
                    </motion.div>
                ) : isReturned && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ background: '#FFF3E0', padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #FFE0B2', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '1.5rem' }}>♻️</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#E65100', fontSize: '1rem' }}>선생님이 다시 쓰기를 요청하셨습니다.</div>
                            <div style={{ fontSize: '0.85rem', color: '#EF6C00', marginBottom: aiFeedback ? '8px' : '0' }}>내용을 보완해서 다시 한번 멋진 글을 완성해볼까요?</div>
                            {aiFeedback && <div style={{ background: 'rgba(255,255,255,0.7)', padding: '20px', borderRadius: '16px', fontSize: '1rem', color: '#444', whiteSpace: 'pre-wrap', lineHeight: '1.8', border: '1px solid rgba(230, 81, 0, 0.2)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)' }}>{aiFeedback}</div>}
                        </div>
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
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{ background: '#E8F5E9', padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', border: '1px solid #C8E6C9', display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                        <span style={{ fontSize: '1.5rem' }}>알림</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#2E7D32', fontSize: '1rem' }}>선생님이 직접 다듬은 글이 도착했어요</div>
                            <div style={{ fontSize: '0.85rem', color: '#388E3C' }}>
                                아래 글은 선생님이 손봐서 보내준 버전이에요. 이 상태에서 이어서 수정하거나 다시 제출하면 돼요.
                                {teacherEditedAt ? ` (${new Date(teacherEditedAt).toLocaleString()})` : ''}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ background: '#F8F9FA', padding: '24px', borderRadius: '20px', marginBottom: '32px', border: '1px solid #E9ECEF', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ background: '#FFFFFF', padding: '2px 12px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '900', color: '#607D8B', border: '1px solid #E9ECEF' }}>선생님의 가이드 💡</div>
                </div>
                <p style={{ margin: 10, fontSize: '1.05rem', color: '#455A64', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>{mission.guide}</p>
            </div>

            {/* 1단계: 생각 일깨우기 (질문 리스트) */}
            {hasQuestions && (
                <div style={{
                    background: '#F0F7FF',
                    padding: isMobile ? '24px 20px' : '40px',
                    borderRadius: '28px',
                    border: '1px solid #D6EAF8',
                    marginBottom: '40px',
                    boxShadow: '0 4px 15px rgba(52, 152, 219, 0.05)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.4rem', color: '#1565C0', fontWeight: '900', letterSpacing: '-0.5px' }}>🎯 생각 일깨우기</h3>
                            <p style={{ margin: '8px 0 0 0', color: '#546E7A', fontSize: '0.95rem' }}>글을 쓰기 전, 아래 질문들에 답하며 생각을 정리해볼까요?</p>
                        </div>
                        <Button size="sm" onClick={insertAllToBody} style={{ background: '#3498DB', fontWeight: 'bold', padding: '10px 20px', borderRadius: '14px' }}>답변 전체를 본문에 넣기 📥</Button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        {mission.guide_questions.map((q, idx) => (
                            <div key={idx} style={{
                                background: 'white',
                                padding: isMobile ? '20px' : '32px',
                                borderRadius: '24px',
                                border: '1px solid #E3F2FD',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.03)'
                            }}>
                                <div style={{
                                    fontSize: isMobile ? '1.2rem' : '1.35rem',
                                    color: '#2C3E50',
                                    fontWeight: '900',
                                    marginBottom: '18px',
                                    lineHeight: '1.5',
                                    display: 'flex',
                                    gap: '12px'
                                }}>
                                    <span style={{ color: '#3498DB', minWidth: '24px' }}>{idx + 1}.</span>
                                    <span>{q}</span>
                                </div>
                                <textarea
                                    value={studentAnswers[idx] || ''}
                                    onChange={(e) => handleAnswerChange(idx, e.target.value)}
                                    placeholder="여기에 생각을 적어보세요..."
                                    spellCheck={true}
                                    autoCorrect="off"
                                    autoCapitalize="sentences"
                                    lang="ko"
                                    enterKeyHint="enter"
                                    wrap="soft"
                                    style={{
                                        width: '100%',
                                        minHeight: '120px',
                                        padding: '20px',
                                        borderRadius: '16px',
                                        border: '1px solid #DEE2E6',
                                        fontSize: '1.1rem',
                                        lineHeight: '1.8',
                                        resize: 'none',
                                        background: '#FBFBFB',
                                        outline: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                    onFocus={(e) => e.target.style.borderColor = '#3498DB'}
                                    onBlur={(e) => e.target.style.borderColor = '#DEE2E6'}
                                    disabled={isLocked}
                                />
                                <div style={{ textAlign: 'right', marginTop: '16px' }}>
                                    <button
                                        onClick={() => insertToBody(studentAnswers[idx])}
                                        disabled={isLocked || !studentAnswers[idx]?.trim()}
                                        style={{
                                            background: '#E1F5FE',
                                            color: '#0288D1',
                                            border: 'none',
                                            padding: '8px 20px',
                                            borderRadius: '12px',
                                            fontSize: '0.9rem',
                                            fontWeight: 'bold',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            opacity: (isLocked || !studentAnswers[idx]?.trim()) ? 0.5 : 1
                                        }}
                                    >
                                        이 답변만 본문에 넣기 📥
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 2단계: 메인 글쓰기 에디터 */}
            <div style={{
                background: '#FFFFFF',
                padding: isMobile ? '32px 20px' : '48px 60px',
                borderRadius: '32px',
                border: '2px solid #F1F3F5',
                position: 'relative',
                marginBottom: '40px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div style={{ borderBottom: '2px solid #3498DB', width: '120px', paddingBottom: '8px' }}>
                        <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1.1rem' }}>
                            {studentLabels.editorHeading || '✍️ 본격 글쓰기'}
                        </span>
                    </div>
                    {originalContent && (
                        <button
                            onClick={() => setShowOriginal(!showOriginal)}
                            style={{
                                background: showOriginal ? '#FFFDE7' : '#FFFFFF',
                                color: showOriginal ? '#F57F17' : '#3498DB',
                                border: showOriginal ? '2px solid #FBC02D' : '1px solid #D6EAF8',
                                padding: '10px 18px',
                                borderRadius: '16px',
                                fontSize: '0.95rem',
                                fontWeight: '900',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: showOriginal ? '0 4px 15px rgba(251, 192, 45, 0.2)' : '0 2px 8px rgba(52, 152, 219, 0.1)',
                                transition: 'all 0.2s',
                                zIndex: 20
                            }}
                        >
                            {showOriginal ? '✨ 마지막 글(수정본) 보기' : '📜 나의 처음 글과 비교하기'}
                        </button>
                    )}
                </div>

                <WritingToolHost disabled={submitting || isLocked} />

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
                                <span style={{ fontSize: '0.9rem', color: '#E67E22', background: '#FFF3E0', padding: '4px 12px', borderRadius: '10px', fontWeight: '900' }}>나의 처음 글</span>
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
            </div>

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
                        <h3 style={{ margin: '0 0 24px 0', fontSize: '1.4rem', color: '#2C3E50', fontWeight: '900' }}>
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
                                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: isMine ? '#3498DB' : '#7F8C8D' }}>{icon.label}</span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '900', color: isMine ? '#2980B9' : '#ADB5BD' }}>{typeReactions.length}</span>
                                        </button>

                                        {/* 툴팁 */}
                                        <AnimatePresence>
                                            {hoveredType === icon.type && reactorNames.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                                    style={{
                                                        position: 'absolute',
                                                        bottom: '100%',
                                                        left: '20%',
                                                        marginBottom: '10px',
                                                        background: '#2D3436',
                                                        color: 'white',
                                                        padding: '10px 16px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: '600',
                                                        zIndex: 9999,
                                                        boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
                                                        pointerEvents: 'none',
                                                        minWidth: 'max-content',
                                                        maxWidth: '250px',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>
                                                            <span style={{ fontSize: '0.9rem' }}>👥</span>
                                                            <span style={{ color: '#BDC3C7', fontSize: '0.7rem' }}>반응을 보낸 친구들</span>
                                                        </div>
                                                        <div style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
                                                            {(() => {
                                                                const chunks = [];
                                                                for (let i = 0; i < reactorNames.length; i += 5) {
                                                                    chunks.push(reactorNames.slice(i, i + 5).join(', '));
                                                                }
                                                                return chunks.join(',\n');
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div style={{ position: 'absolute', top: '100%', left: '20px', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #2D3436' }} />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
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
                                                            fontSize: '0.75rem', fontWeight: '900',
                                                            background: '#3B82F6', color: 'white',
                                                            padding: '2px 8px', borderRadius: '6px'
                                                        }}>🍎 선생님</span>
                                                    ) : (
                                                        <span style={{ fontWeight: '900', fontSize: '0.9rem', color: isMe ? '#1976D2' : '#3498DB' }}>
                                                            {c.students?.name} {isMe && '(나)'}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: '0.75rem', color: '#ADB5BD' }}>
                                                        {new Date(c.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                {isMe && (
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button onClick={() => { setEditingCommentId(c.id); setCommentInput(c.content); }} style={{ background: 'none', border: 'none', color: '#7F8C8D', fontSize: '0.8rem', cursor: 'pointer' }}>수정</button>
                                                        <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', color: '#E74C3C', fontSize: '0.8rem', cursor: 'pointer' }}>삭제</button>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '1.05rem', color: '#2D3436', lineHeight: '1.6' }}>{c.content}</div>
                                        </div>
                                    );
                                })
                            )}

                            {/* 댓글 입력창 (내 글이지만 나도 댓글 달 수 있게 하거나, 혹은 보기만 하거나 선택 가능) */}
                            <form onSubmit={handleCommentSubmit} style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                <input
                                    type="text"
                                    value={commentInput}
                                    onChange={e => setCommentInput(e.target.value)}
                                    placeholder="친구들에게 답글을 남겨보세요... ✨"
                                    style={{ flex: 1, padding: '14px 20px', borderRadius: '16px', border: '2px solid #F1F3F5', outline: 'none' }}
                                />
                                <Button type="submit" disabled={submittingComment}>{editingCommentId ? '수정' : '보내기'}</Button>
                            </form>
                            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#95A5A6', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                <span>🛡️</span> <strong>AI 보안관</strong>이 안전한 댓글 문화를 위해 24시간 감시 중이에요.
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 통계 및 보너스 현황 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', background: '#FFFDE7', borderRadius: '20px', marginBottom: '32px', border: '1px solid #FFF59D' }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: '#8D6E63', marginBottom: '4px' }}>글자수</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: charCount >= mission.min_chars ? '#2E7D32' : '#F44336' }}>{charCount} / {mission.min_chars}</div>
                    </div>
                    <div style={{ width: '1px', background: '#FFE082' }} />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: '#8D6E63', marginBottom: '4px' }}>{genreMissionType?.unitLabel || '문단수'}</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: paragraphCount >= mission.min_paragraphs ? '#2E7D32' : '#F44336' }}>{paragraphCount} / {mission.min_paragraphs}</div>
                    </div>
                    <div style={{ width: '1px', background: '#FFE082' }} />
                    <div style={{ textAlign: 'center', minWidth: isMobile ? '90px' : '120px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#8D6E63', marginBottom: '4px' }}>자동 저장</div>
                        <div style={{ fontSize: '0.95rem', fontWeight: '900', color: autoSaveError ? '#D84315' : '#546E7A' }}>
                            {autoSaveError || (autoSaveAt ? autoSaveAt.toLocaleTimeString() : '-')}
                        </div>
                        {!autoSaveError && (
                            <div style={{ marginTop: '4px', fontSize: '0.72rem', color: '#8D6E63' }}>
                                태블릿에 먼저 저장됨
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    {mission.bonus_threshold > 0 && mission.bonus_reward > 0 && (
                        charCount >= (mission.min_chars + mission.bonus_threshold) ? (
                            <div style={{ color: '#E65100', fontWeight: '900', fontSize: '1rem' }}>🔥 보너스 달성 완료! (+{mission.bonus_reward}P)</div>
                        ) : (
                            <div style={{ color: '#795548', fontSize: '0.9rem' }}>
                                <strong style={{ color: '#E65100' }}>{(mission.min_chars || 0) + (mission.bonus_threshold || 0)}자</strong>를 넘기면{' '}
                                <strong style={{ color: '#E65100' }}>+{mission.bonus_reward}P</strong>를 더 얻을 수 있어요!
                                <span style={{ marginLeft: '6px', color: '#BCAAA4', fontSize: '0.8rem' }}>
                                    ({(mission.min_chars + mission.bonus_threshold) - charCount}자 남음)
                                </span>
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* 저장 및 제출 버튼 */}
            <div style={{ display: 'flex', gap: '12px' }}>
                <Button size="lg" onClick={handleManualSave} disabled={submitting || isLocked} style={{ flex: 1, height: '64px', fontSize: '1.2rem', fontWeight: '800', background: isLocked ? '#F1F3F5' : '#ECEFF1', color: isLocked ? '#BDC3C7' : '#455A64', border: 'none' }}>
                    {isLocked ? '수정 불가 🔒' : '임시 저장 💾'}
                </Button>
                <Button
                    size="lg"
                    onClick={() => setIsPreviewOpen(true)}
                    disabled={submitting || isLocked || (!title.trim() && !content.trim())}
                    style={{
                        flex: 1.2,
                        height: '64px',
                        fontSize: '1.2rem',
                        fontWeight: '800',
                        background: (submitting || isLocked || (!title.trim() && !content.trim())) ? '#E0E0E0' : '#E8F1FF',
                        color: (submitting || isLocked || (!title.trim() && !content.trim())) ? '#9E9E9E' : '#1565C0',
                        border: '1px solid #BBDEFB'
                    }}
                >
                    제출 전 검토하기 👀
                </Button>
                <Button size="lg" onClick={handleFinalSubmit} disabled={submitting || isLocked} style={{ flex: 2, height: '64px', fontSize: '1.3rem', fontWeight: '900', background: isLocked ? '#B0BEC5' : 'var(--primary-color)', color: 'white', border: 'none' }}>
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
                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#263238', marginBottom: '8px' }}>
                                        {studentLabels.previewHeading || '제출 전 검토하기'}
                                    </div>
                                    <div style={{ color: '#607D8B', fontSize: '0.95rem', lineHeight: '1.6' }}>
                                        {studentLabels.previewDescription || '문단이 잘 나뉘었는지, 제목과 본문이 의도대로 보이는지 마지막으로 확인해보세요.'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsPreviewOpen(false)}
                                    aria-label="제출 전 검토 창 닫기"
                                    style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#90A4AE' }}
                                >
                                    ✕
                                </button>
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
                                <div style={{ fontSize: '0.9rem', color: '#78909C', fontWeight: '800', marginBottom: '8px' }}>
                                    {studentLabels.titleLabel || '제목'}
                                </div>
                                <div style={{
                                    background: '#FAFAFA',
                                    border: '1px solid #ECEFF1',
                                    borderRadius: '18px',
                                    padding: '18px 20px',
                                    fontSize: '1.5rem',
                                    fontWeight: '900',
                                    color: '#263238',
                                    lineHeight: '1.4'
                                }}>
                                    {title.trim() || '제목이 아직 비어 있어요.'}
                                </div>
                            </div>

                            <div style={{ marginBottom: '28px' }}>
                                <div style={{ fontSize: '0.9rem', color: '#78909C', fontWeight: '800', marginBottom: '8px' }}>
                                    {studentLabels.contentLabel || '본문 미리보기'}
                                </div>
                                <div style={{
                                    background: '#FBFCFD',
                                    border: '1px solid #ECEFF1',
                                    borderRadius: '22px',
                                    padding: '20px'
                                }}>
                                    {previewParagraphs.length > 0 ? (
                                        <div style={{
                                            background: '#FFFFFF',
                                            border: '1px solid #E3F2FD',
                                            borderRadius: '18px',
                                            padding: '18px 20px',
                                            fontSize: '1.05rem',
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
                                                                    fontSize: '0.78rem',
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
        </Card>
    );
};

export default StudentWriting;
