import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Card from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import Modal from '../../../components/common/Modal';
import WritingEditorFields from '../../../components/writing/WritingEditorFields';
import {
    WritingNotice,
    WritingSectionHeader,
    WritingWorkspace,
    WritingWorkspaceHeader,
    WritingWorkspacePath
} from '../../../components/writing/WritingWorkspace';
import useMediaQuery from '../../../hooks/useMediaQuery';
import { supabase } from '../../../lib/supabaseClient';
import WritingToolHost from '../tools/WritingToolHost';
import { buildDraftKey, readLocalDraft, useLocalWritingDraft } from '../drafts/localWritingDraft';
import WritingPolicyProgress from '../policy/WritingPolicyProgress';
import {
    evaluateWritingPolicy,
    getWritingPolicyError,
    measureWritingContent,
    normalizeWritingPolicy
} from '../policy/writingPolicy';
import MyPostEngagementPanel from '../engagement/MyPostEngagementPanel';
import useDiaryDailyStatus from './useDiaryDailyStatus';
import './diary.css';

const DIARY_POLICY_DEFAULTS = Object.freeze({
    is_enabled: true,
    min_chars: 150,
    min_paragraphs: 1,
    base_reward: 80,
    bonus_enabled: false,
    bonus_threshold: 0,
    bonus_reward: 0,
    daily_reward_limit: 1
});

/** 일기의 축은 날짜다. 화면·저장·보상이 모두 이 값을 기준으로 움직인다. */
const todayInKorea = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const formatDiaryDate = (value) => {
    if (!value) return '';
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return String(value);
    const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    return `${year}년 ${month}월 ${day}일 ${weekday}요일`;
};

const formatTime = (value) => (value
    ? new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '');

const formatShortDate = (value) => {
    if (!value) return '';
    const [, month, day] = String(value).split('-').map(Number);
    return `${month}/${day}`;
};

const EMPTY_FORM = {
    title: '',
    content: '',
    // 일기는 개인적인 글이라 기본은 나만 보기다. 독서록(기본 친구 공개)과 반대다.
    visibility: 'private'
};

const diaryDraftHasContent = (candidate) => Boolean(
    candidate?.title?.trim() || candidate?.content?.trim()
);

const DiaryEditor = ({ studentSession, postId, diaryDate, dailyStatus, onDone, onCancel }) => {
    const studentClassId = studentSession?.classId || studentSession?.class_id || null;
    const [form, setForm] = useState(EMPTY_FORM);
    const [initialForm, setInitialForm] = useState(EMPTY_FORM);
    const [loading, setLoading] = useState(Boolean(postId));
    const [saving, setSaving] = useState(false);
    const [writingPolicy, setWritingPolicy] = useState(DIARY_POLICY_DEFAULTS);
    const [policyLoading, setPolicyLoading] = useState(Boolean(studentClassId));
    const isMobile = useMediaQuery('(max-width: 768px)');
    const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
    const writingMetrics = useMemo(() => measureWritingContent(form.content), [form.content]);

    useEffect(() => {
        if (!studentClassId) return undefined;
        let active = true;
        const loadPolicy = async () => {
            setPolicyLoading(true);
            const { data, error } = await supabase
                .from('class_writing_policies')
                .select('is_enabled, min_chars, min_paragraphs, base_reward, bonus_enabled, bonus_threshold, bonus_reward, daily_reward_limit')
                .eq('class_id', studentClassId)
                .eq('writing_type', 'diary')
                .maybeSingle();
            if (!active) return;
            if (error) console.error('일기 완료 조건 불러오기 실패:', error.message);
            setWritingPolicy(normalizeWritingPolicy(data || DIARY_POLICY_DEFAULTS, DIARY_POLICY_DEFAULTS));
            setPolicyLoading(false);
        };
        loadPolicy();
        return () => { active = false; };
    }, [studentClassId]);

    useEffect(() => {
        if (!postId) return undefined;
        let active = true;
        const loadPost = async () => {
            const { data, error } = await supabase
                .from('student_posts')
                .select('id, title, content, visibility, structured_content')
                .eq('class_id', studentClassId)
                .eq('student_id', studentSession.id)
                .eq('id', postId)
                .maybeSingle();
            if (!active) return;
            if (error || !data) {
                console.error('일기 불러오기 실패:', error?.message);
                alert('일기를 불러오지 못했어요.');
                onCancel();
                return;
            }
            const loadedForm = {
                title: data.title || '',
                content: data.content || '',
                visibility: data.visibility === 'class' ? 'class' : 'private'
            };
            setForm(loadedForm);
            setInitialForm(loadedForm);
            setLoading(false);
        };
        loadPost();
        return () => { active = false; };
    }, [onCancel, postId, studentClassId, studentSession.id]);

    const [serverDraftAt, setServerDraftAt] = useState(null);
    const [savingDraft, setSavingDraft] = useState(false);

    // 초안은 날짜별로 나눈다. 그러지 않으면 어제 쓰다 만 내용이 오늘 일기에 되살아난다.
    const draftKey = buildDraftKey('diary_draft', studentSession?.id, postId || diaryDate);
    const draftHasContent = useCallback((candidate) => diaryDraftHasContent(candidate), []);
    const restoreDraft = useCallback((stored) => {
        setForm((current) => ({ ...current, ...stored }));
    }, []);
    const {
        savedAt: draftSavedAt,
        error: draftError,
        clear: clearLocalDraft
    } = useLocalWritingDraft(
        draftKey,
        form,
        { enabled: !loading && !saving, hasContent: draftHasContent, onRestore: restoreDraft }
    );

    /*
     * 다른 기기에서 남긴 임시본을 가져온다. 이 기기에 남은 것보다 **새 것일 때만** 덮는다.
     * 그러지 않으면 방금 이 기기에서 쓴 내용이 옛 임시본에 지워진다(독서록과 같은 규칙).
     */
    useEffect(() => {
        if (loading || !studentSession?.id) return undefined;
        let active = true;
        const load = async () => {
            const { data, error } = await supabase.rpc('get_my_self_writing_draft', {
                p_writing_type: 'diary',
                p_source_key: diaryDate
            });
            if (!active || error || !data) {
                if (error) console.error('일기 서버 임시본 불러오기 실패:', error.message);
                return;
            }
            const serverAt = new Date(data.updated_at);
            setServerDraftAt(serverAt);

            const localAt = readLocalDraft(draftKey)?.savedAt;
            if (localAt && new Date(localAt) >= serverAt) return;

            setForm((current) => ({
                ...current,
                title: data.title || current.title,
                content: data.content || current.content,
                visibility: data.visibility === 'class' ? 'class' : current.visibility
            }));
        };
        load();
        return () => { active = false; };
        // 처음 열릴 때 한 번만 가져온다. 이후에는 이 기기의 내용이 기준이다.
    }, [diaryDate, draftKey, loading, studentSession?.id]);

    const handleSaveDraft = async () => {
        if (!diaryDraftHasContent(form)) {
            alert('아직 적은 내용이 없어요. 한 줄이라도 적은 뒤에 임시 저장해 주세요. ✍️');
            return;
        }
        setSavingDraft(true);
        const { data, error } = await supabase.rpc('upsert_my_self_writing_draft', {
            p_writing_type: 'diary',
            p_source_key: diaryDate,
            p_post_id: postId || null,
            p_title: form.title,
            p_content: form.content,
            p_visibility: form.visibility
        });
        setSavingDraft(false);
        if (error || !data?.success) {
            console.error('일기 임시 저장 실패:', error?.message);
            alert('이 기기에는 남겼지만 서버 임시 저장에 실패했어요. 잠시 후 다시 눌러 주세요.');
            return;
        }
        setServerDraftAt(data.updated_at ? new Date(data.updated_at) : new Date());
        alert('임시 저장했어요. 다른 기기에서도 이어 쓸 수 있어요. 💾\n아직 선생님과 친구에게는 보이지 않아요.');
    };

    const handleCancel = () => {
        if (isDirty && !window.confirm('아직 저장하지 않은 내용이 있어요. 일기 목록으로 나갈까요?')) return;
        onCancel();
    };

    const handleSave = async () => {
        if (!form.title.trim()) {
            alert('일기 제목을 적어주세요. ✍️');
            return;
        }
        if (!form.content.trim()) {
            alert('오늘 있었던 일과 마음을 적어주세요. 💭');
            return;
        }
        const policyError = getWritingPolicyError(evaluateWritingPolicy(writingPolicy, writingMetrics));
        if (policyError) {
            alert(policyError);
            return;
        }

        setSaving(true);
        const { data, error } = await supabase.rpc('upsert_my_diary', {
            p_post_id: postId || null,
            p_diary_date: diaryDate,
            p_title: form.title,
            p_content: form.content,
            p_visibility: form.visibility
        });
        setSaving(false);

        if (error || !data?.success) {
            console.error('일기 저장 실패:', error?.message || data?.error);
            alert(error?.message || '일기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
            return;
        }

        clearLocalDraft();
        // 남기면 다음에 들어올 때 저장된 글 위로 옛 임시본이 되살아난다.
        const { error: draftError } = await supabase.rpc('delete_my_self_writing_draft', {
            p_writing_type: 'diary',
            p_source_key: diaryDate
        });
        if (draftError) console.error('일기 서버 임시본 정리 실패:', draftError.message);
        setServerDraftAt(null);

        const awardedPoints = Number(data.points_awarded) || 0;
        const rewardMessage = awardedPoints > 0
            ? `\n완료 보상으로 ${awardedPoints}P를 받았어요! 🪙`
            : data.reward_status === 'daily_limit'
                ? '\n오늘 받을 수 있는 일기 완료 보상은 이미 받았어요.'
                : data.reward_status === 'already_claimed'
                    ? '\n이 날짜의 완료 보상은 예전에 받았어요.'
                    : '';
        alert(form.visibility === 'class'
            ? `일기를 친구 공개로 저장했어요! 📔${rewardMessage}`
            : `일기를 나만 보기로 저장했어요. 선생님은 확인할 수 있어요. 🔒${rewardMessage}`);
        onDone();
    };

    if (loading) {
        return <Card><p style={{ textAlign: 'center', padding: '40px' }}>일기를 펼치는 중... 📔</p></Card>;
    }

    return (
        <WritingWorkspace tone="reading" className="diary-workspace">
            <WritingWorkspaceHeader
                onBack={handleCancel}
                disabled={saving}
                eyebrow="📔 나의 일기"
                title={postId ? '일기 다듬기' : '오늘의 일기 쓰기'}
                description="오늘 있었던 일과 그때 든 마음을 나만의 말로 남겨요."
            />
            <WritingWorkspacePath steps={['날짜 확인', '오늘 쓰기', '완료·공개']} />

            <div className="diary-date-badge" aria-label={`${formatDiaryDate(diaryDate)} 일기`}>
                <span aria-hidden="true">🗓️</span>
                <strong>{formatDiaryDate(diaryDate)}</strong>
            </div>

            <section className="writing-editor-surface">
                <WritingSectionHeader
                    icon="💭"
                    title="오늘의 이야기"
                    description="무슨 일이 있었는지, 그때 어떤 마음이었는지 자유롭게 적어봐요."
                />
                <WritingToolHost disabled={saving} />
                <WritingEditorFields
                    title={form.title}
                    onTitleChange={(value) => setForm((current) => ({ ...current, title: value }))}
                    content={form.content}
                    onContentChange={(value) => setForm((current) => ({ ...current, content: value }))}
                    titlePlaceholder="오늘 일기의 제목을 적어주세요..."
                    contentPlaceholder={'오늘 있었던 일, 기억에 남는 장면, 그때 든 마음을 자유롭게 적어보세요...'}
                    disabled={saving}
                    isMobile={isMobile}
                />

                {(draftError || draftSavedAt || serverDraftAt) && (
                    <WritingNotice tone={draftError ? 'danger' : 'success'} icon={draftError ? '⚠️' : '💾'} compact>
                        {draftError || (serverDraftAt
                            ? `${formatTime(serverDraftAt)}에 임시 저장했어요. 다른 기기에서도 이어 쓸 수 있어요. 아직 선생님과 친구에게는 보이지 않아요.`
                            : '쓰던 내용을 이 기기에 남겨 두고 있어요. 다른 기기에서도 이어 쓰려면 임시 저장을 눌러 주세요.')}
                    </WritingNotice>
                )}
            </section>

            <WritingPolicyProgress
                policy={writingPolicy}
                metrics={writingMetrics}
                dailyRemaining={postId ? null : dailyStatus?.remainingToday ?? null}
            />
            {policyLoading && (
                <WritingNotice tone="info" icon="⏳" compact>이 학급의 완료 조건을 확인하고 있어요.</WritingNotice>
            )}

            {/*
              * 일기는 개인적인 글이라 **아무것도 고르지 않으면 나만 보기**다.
              * 그래서 `둘 중 하나 고르기` 가 아니라 `이미 잠겨 있고, 열려면 한 번 누르기` 로 보여 준다.
              * 현재 상태를 먼저 못박고, 그 아래에 여는 행동 하나만 둔다.
              */}
            <div className={`diary-visibility ${form.visibility === 'class' ? 'is-public' : ''}`}>
                <span className="diary-visibility__state">
                    <span aria-hidden="true">{form.visibility === 'class' ? '📔' : '🔒'}</span>
                    <span>
                        <strong>
                            {form.visibility === 'class' ? '지금은 친구도 볼 수 있어요' : '지금은 나만 봐요'}
                        </strong>
                        <small>
                            {form.visibility === 'class'
                                ? '친구들이 내 아지트 책장에서 읽고 반응과 댓글을 남길 수 있어요.'
                                : '그냥 두면 친구에게 보이지 않아요. 선생님은 확인할 수 있어요.'}
                        </small>
                    </span>
                </span>
                <button
                    type="button"
                    className="diary-visibility__toggle"
                    onClick={() => setForm((current) => ({
                        ...current,
                        visibility: current.visibility === 'class' ? 'private' : 'class'
                    }))}
                    disabled={saving}
                >
                    {form.visibility === 'class' ? '🔒 다시 나만 보기로' : '📔 친구에게도 보여주기'}
                </button>
            </div>

            {/* 이미 낸 일기에는 확인 상태·선생님 의견·친구 댓글을 함께 보여 준다(세 글쓰기 공용 부품). */}
            {postId && <MyPostEngagementPanel postId={postId} />}

            <div className="diary-editor-actions">
                <Button variant="outline" onClick={handleCancel} disabled={saving || savingDraft}>취소</Button>
                <Button variant="outline" onClick={handleSaveDraft} disabled={saving || savingDraft}>
                    {savingDraft ? '임시 저장 중...' : '임시 저장 💾'}
                </Button>
                <Button onClick={handleSave} disabled={saving || savingDraft}>
                    {saving ? '저장하는 중...' : postId ? '수정 완료' : '작성 완료'}
                </Button>
            </div>
        </WritingWorkspace>
    );
};

const DiaryPage = ({ studentSession, params = {}, onBack, onNavigate }) => {
    const classId = studentSession?.classId || studentSession?.class_id || null;
    const studentId = studentSession?.id || null;
    const [diaries, setDiaries] = useState([]);
    const [reviews, setReviews] = useState({});
    const [selectedComment, setSelectedComment] = useState(null);
    const [loading, setLoading] = useState(true);
    const dailyStatus = useDiaryDailyStatus(studentId);
    const mode = params.mode === 'editor' ? 'editor' : 'list';
    const today = todayInKorea();

    const load = useCallback(async () => {
        if (!classId || !studentId) return;
        setLoading(true);
        // 선생님 한마디는 본인 것만 읽히는 정책이 있어 목록과 함께 받아 카드에 표시한다.
        const [postsResult, reviewsResult] = await Promise.all([
            supabase
                .from('student_posts')
                .select('id, title, char_count, visibility, created_at, updated_at, structured_content')
                .eq('class_id', classId)
                .eq('student_id', studentId)
                .eq('writing_context', 'self')
                .eq('self_writing_type', 'diary')
                .order('created_at', { ascending: false })
                .limit(100),
            supabase
                .from('reading_log_teacher_reviews')
                .select('post_id, review_status, teacher_comment, reviewed_at')
                .eq('class_id', classId)
                .eq('student_id', studentId)
        ]);

        if (postsResult.error) {
            console.error('내 일기 목록 불러오기 실패:', postsResult.error.message);
            setDiaries([]);
        } else {
            setDiaries(postsResult.data || []);
        }
        if (reviewsResult.error) {
            console.error('선생님 한마디 불러오기 실패:', reviewsResult.error.message);
            setReviews({});
        } else {
            setReviews(Object.fromEntries((reviewsResult.data || []).map((row) => [row.post_id, row])));
        }
        setLoading(false);
    }, [classId, studentId]);

    useEffect(() => {
        if (mode !== 'list') return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [load, mode]);

    const diaryByDate = useMemo(() => {
        const map = new Map();
        diaries.forEach((entry) => {
            const date = entry.structured_content?.diaryDate;
            if (date) map.set(date, entry);
        });
        return map;
    }, [diaries]);

    const todayDiary = diaryByDate.get(today) || null;

    const openEditor = (editorParams) => {
        onNavigate('diaries', { mode: 'editor', ...editorParams });
    };

    const handleDelete = async (entry) => {
        const label = entry.structured_content?.diaryDate
            ? formatDiaryDate(entry.structured_content.diaryDate)
            : (entry.title || '제목 없는 일기');
        if (!window.confirm(`${label} 일기를 삭제할까요?\n삭제하면 되돌릴 수 없어요.`)) return;
        const { data, error } = await supabase.rpc('delete_my_diary', { p_post_id: entry.id });
        if (error || !data?.success) {
            console.error('일기 삭제 실패:', error?.message || data?.error);
            alert('일기를 삭제하지 못했습니다.');
            return;
        }
        setDiaries((current) => current.filter((item) => item.id !== entry.id));
        dailyStatus.reload();
    };

    if (dailyStatus.loading) {
        return <Card><p style={{ textAlign: 'center', padding: '40px' }}>일기 사용 여부를 확인하는 중... 📔</p></Card>;
    }

    if (dailyStatus.error) {
        return (
            <Card style={{ maxWidth: '680px', margin: '48px auto', padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: '3.5rem' }}>📡</div>
                <h1 style={{ color: '#334155', fontSize: '1.5rem' }}>일기 사용 여부를 확인하지 못했어요</h1>
                <p style={{ color: '#64748B' }}>잠시 뒤 다시 확인해 주세요. 확인 전에는 개인정보 보호를 위해 일기장을 열지 않습니다.</p>
                <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <Button variant="outline" onClick={onBack}>홈으로</Button>
                    <Button onClick={dailyStatus.reload}>다시 확인</Button>
                </div>
            </Card>
        );
    }

    if (!dailyStatus.isEnabled) {
        return (
            <div className="diary-page">
                <Card style={{ maxWidth: '680px', margin: '48px auto', padding: '48px 24px', textAlign: 'center' }}>
                    <div style={{ fontSize: '3.5rem' }}>🔒</div>
                    <h1 style={{ color: '#334155', fontSize: '1.5rem' }}>지금은 일기 쓰기를 사용하지 않아요</h1>
                    <p style={{ color: '#64748B', lineHeight: 1.7 }}>
                        선생님이 학급의 일기 기능을 꺼 두었습니다.<br />이미 작성한 일기는 삭제되지 않고 안전하게 보관됩니다.
                    </p>
                    <Button onClick={onBack}>홈으로 돌아가기</Button>
                </Card>
            </div>
        );
    }

    if (mode === 'editor') {
        return (
            <DiaryEditor
                studentSession={studentSession}
                postId={params.postId || null}
                diaryDate={params.diaryDate || today}
                dailyStatus={dailyStatus}
                onDone={() => {
                    dailyStatus.reload();
                    onNavigate('diaries', {});
                }}
                onCancel={() => onNavigate('diaries', {})}
            />
        );
    }

    return (
        <div className="diary-page">
            <header className="diary-page-header">
                <div>
                    <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 홈으로</Button>
                    <h1>📔 나의 일기</h1>
                    <p>하루에 한 편, 오늘의 나를 남겨요.</p>
                </div>
            </header>

            <div className="diary-today-card">
                <div className="diary-today-card__info">
                    <span className="diary-today-card__eyebrow">오늘</span>
                    <strong>{formatDiaryDate(today)}</strong>
                    <small>
                        {todayDiary
                            ? '오늘 일기를 이미 썼어요. 다시 열어 다듬을 수 있어요.'
                            : dailyStatus.loading
                                ? '오늘 작성 현황을 확인하고 있어요.'
                                : `오늘 일기를 아직 안 썼어요. 완료하면 ${dailyStatus.remainingToday > 0 ? '포인트를 받아요' : '기록으로 남아요'}.`}
                    </small>
                </div>
                <Button
                    onClick={() => (todayDiary
                        ? openEditor({ postId: todayDiary.id, diaryDate: today })
                        : openEditor({ diaryDate: today }))}
                >
                    {todayDiary ? '오늘 일기 다듬기' : '오늘의 일기 쓰기 ✍️'}
                </Button>
            </div>

            {loading ? (
                <Card><p style={{ textAlign: 'center', padding: '42px' }}>일기장을 넘기는 중... 📔</p></Card>
            ) : diaries.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '64px 24px', border: '2px dashed #C7D2FE' }}>
                    <div style={{ fontSize: '4rem' }}>📔</div>
                    <h2 style={{ color: '#4338CA' }}>첫 일기를 남겨보세요</h2>
                    <p style={{ color: 'var(--ui-ink-muted)' }}>오늘 있었던 일을 짧게라도 적어 두면 나중에 큰 이야기가 돼요.</p>
                </Card>
            ) : (
                <div className="diary-grid">
                    {diaries.map((entry) => (
                        <motion.article
                            key={entry.id}
                            className="diary-card"
                            whileHover={{ y: -2 }}
                        >
                            <div className="diary-card__date">
                                <strong>{formatShortDate(entry.structured_content?.diaryDate)}</strong>
                                <span>{entry.visibility === 'class' ? '📔 친구 공개' : '🔒 나만 보기'}</span>
                            </div>
                            <h3>{entry.title || '제목 없는 일기'}</h3>
                            <p className="diary-card__meta">{entry.char_count || 0}자</p>
                            {(() => {
                                const review = Reflect.get(reviews, entry.id);
                                if (!review) return null;
                                // 한마디가 있으면 눌러서 그 글만 본다. 확인만 한 경우는 표시만 남긴다.
                                return review.teacher_comment?.trim() ? (
                                    <button
                                        type="button"
                                        className="diary-card__teacher-comment"
                                        onClick={() => setSelectedComment({
                                            ...review,
                                            diaryDate: entry.structured_content?.diaryDate,
                                            title: entry.title
                                        })}
                                    >
                                        💬 선생님 한마디 있음
                                    </button>
                                ) : (
                                    <span className="diary-card__teacher-checked">✅ 선생님 확인</span>
                                );
                            })()}
                            <div className="diary-card__actions">
                                <Button
                                    size="sm"
                                    onClick={() => openEditor({
                                        postId: entry.id,
                                        diaryDate: entry.structured_content?.diaryDate || today
                                    })}
                                >
                                    열어보기
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(entry)}>삭제</Button>
                            </div>
                        </motion.article>
                    ))}
                </div>
            )}

            <Modal
                isOpen={Boolean(selectedComment)}
                onClose={() => setSelectedComment(null)}
                title="💬 선생님 한마디"
                maxWidth="560px"
            >
                {selectedComment && (
                    <div className="diary-comment-modal">
                        <p className="diary-comment-modal__about">
                            {formatDiaryDate(selectedComment.diaryDate)} · {selectedComment.title || '제목 없는 일기'}
                        </p>
                        <p className="diary-comment-modal__body">{selectedComment.teacher_comment}</p>
                        {selectedComment.reviewed_at && (
                            <p className="diary-comment-modal__when">
                                {formatDiaryDate(String(selectedComment.reviewed_at).slice(0, 10))}에 남겨 주셨어요.
                            </p>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default DiaryPage;
