import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../../components/common/Button';
import Card from '../../../../components/common/Card';
import ExportSelectModal from '../../../../components/common/ExportSelectModal';
import FeatureAvailabilitySwitch from '../../../../components/common/FeatureAvailabilitySwitch';
import Modal from '../../../../components/common/Modal';
import ModalCloseButton from '../../../../components/common/ModalCloseButton';
import TeacherGuideButton from '../../../../components/teacher/TeacherGuideButton';
import { supabase } from '../../../../lib/supabaseClient';
import { useDataExport } from '../../../../hooks/useDataExport';
import WritingPolicySettings from '../../policy/WritingPolicySettings';
import {
    SelfWritingBulkToolbar,
    getSelfWritingRecordTone,
    getSelfWritingReviewLabel,
    SelfWritingQueueCard,
    SelfWritingReviewSummary,
    SelfWritingReviewViewTabs
} from '../../review/SelfWritingReviewWorkspace';
import './teacherDiary.css';

/** 학생 화면(`DiaryPage`)의 기본값과 같아야 한다. 서버 기본값은 `writing_types.diary` 다. */
const DIARY_POLICY_DEFAULTS = Object.freeze({
    is_enabled: true,
    min_chars: 150,
    min_paragraphs: 1,
    base_reward: 80,
    bonus_enabled: false,
    bonus_threshold: 0,
    bonus_reward: 0,
    repeat_bonus_enabled: false,
    repeat_bonus_threshold: 0,
    repeat_bonus_reward: 0,
    repeat_bonus_max_count: 0,
    daily_reward_limit: 1
});

/** 독서록과 같은 압축형 검토 대기함을 쓰되 일기 전용 학생별·내보내기 흐름은 이 모듈이 소유한다. */

const PAGE_SIZE = 20;
const STUDENT_DIARY_LIMIT = 100;
const EMPTY_OVERVIEW = Object.freeze({
    total: 0,
    pending_count: 0,
    counts: { total: 0, unreviewed: 0, revision_requested: 0, reviewed: 0, students: 0 },
    items: []
});

const formatDiaryDate = (value) => {
    if (!value) return '날짜 없음';
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year) return String(value);
    return `${year}. ${month}. ${day}.`;
};

const TeacherDiaryManager = ({ activeClass }) => {
    const classId = activeClass?.id || null;
    const [diaryEnabled, setDiaryEnabled] = useState(true);
    const [availabilityLoading, setAvailabilityLoading] = useState(true);
    const [availabilitySaving, setAvailabilitySaving] = useState(false);
    const [availabilityExists, setAvailabilityExists] = useState(true);
    // 매일 쓰는 `확인`을 기본으로 두고, 큰 설정 폼은 열 때만 마운트한다(독서록과 같은 구조).
    const [section, setSection] = useState('reviews');
    const [policyDirty, setPolicyDirty] = useState(false);
    // 독서록과 같은 세 보기 — 매일 쓰는 `검토 대기`, 학생 한 명씩 모아 보는 `학생별`, 검색·필터의 `전체 기록`.
    const [view, setView] = useState('queue');
    const [students, setStudents] = useState([]);
    const [studentQuery, setStudentQuery] = useState('');
    const [openStudentId, setOpenStudentId] = useState(null);
    const [studentDiaries, setStudentDiaries] = useState({});
    const [studentDiariesLoading, setStudentDiariesLoading] = useState(null);
    const [showQuietStudents, setShowQuietStudents] = useState(false);
    const [exportTarget, setExportTarget] = useState(null);
    const [exportingId, setExportingId] = useState(null);
    const [filter, setFilter] = useState('unreviewed');
    const [overview, setOverview] = useState(EMPTY_OVERVIEW);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [selected, setSelected] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [comment, setComment] = useState('');
    const [saving, setSaving] = useState(false);
    const [selectedReviewIds, setSelectedReviewIds] = useState(() => new Set());
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkNotice, setBulkNotice] = useState('');

    const {
        fetchWritingContentExportData,
        exportWritingContentToExcel,
        exportWritingContentToPdf,
        exportWritingContentToGoogleDoc,
        authorizeGoogleExport,
        isGapiLoaded
    } = useDataExport(classId);

    useEffect(() => {
        if (!classId) return undefined;
        let active = true;
        const loadAvailability = async () => {
            setAvailabilityLoading(true);
            const { data, error } = await supabase
                .from('class_writing_policies')
                .select('is_enabled')
                .eq('class_id', classId)
                .eq('writing_type', 'diary')
                .maybeSingle();
            if (!active) return;
            if (error) {
                console.error('일기 사용 여부 불러오기 실패:', error.message);
            } else {
                setAvailabilityExists(Boolean(data));
                setDiaryEnabled(data?.is_enabled ?? true);
            }
            setAvailabilityLoading(false);
        };
        loadAvailability();
        return () => { active = false; };
    }, [classId]);

    const changeDiaryAvailability = async (nextEnabled) => {
        if (!nextEnabled && !window.confirm(
            '학생 화면에서 일기 탭을 숨길까요?\n이미 작성한 일기는 삭제되지 않으며, 다시 켜면 그대로 사용할 수 있습니다.'
        )) return;

        setAvailabilitySaving(true);
        const query = availabilityExists
            ? supabase
                .from('class_writing_policies')
                .update({ is_enabled: nextEnabled })
                .eq('class_id', classId)
                .eq('writing_type', 'diary')
            : supabase
                .from('class_writing_policies')
                .insert({ class_id: classId, writing_type: 'diary', ...DIARY_POLICY_DEFAULTS, is_enabled: nextEnabled });
        const { error } = await query;
        setAvailabilitySaving(false);
        if (error) {
            console.error('일기 사용 여부 저장 실패:', error.message);
            alert('일기 사용 여부를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }
        setAvailabilityExists(true);
        setDiaryEnabled(nextEnabled);
    };

    const load = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');
        const { data, error } = await supabase.rpc('get_teacher_diary_overview', {
            p_class_id: classId,
            p_review_filter: view === 'queue' ? 'unreviewed' : filter,
            p_student_id: null,
            p_limit: PAGE_SIZE,
            p_offset: 0
        });
        if (error) {
            console.error('학생 일기 목록 불러오기 실패:', error.message);
            setErrorMessage('일기 목록을 불러오지 못했습니다.');
            setOverview(EMPTY_OVERVIEW);
        } else {
            const total = Number(data?.counts?.total ?? data?.total ?? 0);
            const unreviewed = Number(data?.counts?.unreviewed ?? data?.pending_count ?? 0);
            setOverview({
                total: Number(data?.total || 0),
                pending_count: unreviewed,
                counts: {
                    total,
                    unreviewed,
                    revision_requested: Number(data?.counts?.revision_requested || 0),
                    reviewed: Number(data?.counts?.reviewed || 0),
                    students: Number(data?.counts?.students || 0)
                },
                items: Array.isArray(data?.items) ? data.items : []
            });
        }
        setLoading(false);
    }, [classId, filter, view]);

    useEffect(() => {
        if (!classId || section !== 'reviews' || view === 'students') return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [classId, load, section, view]);

    useEffect(() => {
        setSelectedReviewIds(new Set());
        setBulkNotice('');
    }, [classId, filter, view]);

    const loadMore = async () => {
        if (loadingMore) return;
        setLoadingMore(true);
        const { data, error } = await supabase.rpc('get_teacher_diary_overview', {
            p_class_id: classId,
            p_review_filter: view === 'queue' ? 'unreviewed' : filter,
            p_student_id: null,
            p_limit: PAGE_SIZE,
            p_offset: overview.items.length
        });
        setLoadingMore(false);
        if (error) {
            console.error('일기 더 보기 실패:', error.message);
            alert('다음 일기를 불러오지 못했습니다.');
            return;
        }
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        const seen = new Set(overview.items.map((item) => item.post_id));
        setOverview((current) => ({
            ...current,
            items: [...current.items, ...nextItems.filter((item) => !seen.has(item.post_id))]
        }));
    };

    const openDiary = async (item) => {
        setSelected({ ...item, content: null });
        setComment(item.teacher_comment || '');
        setDetailLoading(true);
        const { data, error } = await supabase.rpc('get_teacher_diary_detail', { p_post_id: item.post_id });
        setDetailLoading(false);
        if (error || !data) {
            console.error('일기 상세 불러오기 실패:', error?.message);
            alert('일기를 불러오지 못했습니다.');
            setSelected(null);
            return;
        }
        setSelected(data);
        setComment(data.teacher_comment || '');
    };

    const saveReview = async (decision = 'accepted') => {
        if (!selected?.post_id) return;
        setSaving(true);
        const { data, error } = await supabase.rpc('save_teacher_self_writing_review_v2', {
            p_post_id: selected.post_id,
            p_teacher_comment: comment,
            p_decision: decision
        });
        setSaving(false);
        if (error || !data?.success) {
            console.error('일기 확인 저장 실패:', error?.message || data?.error);
            alert(error?.message || '확인을 저장하지 못했습니다.');
            return;
        }
        setSelected(null);
        await load();
    };

    // 학생별 보기는 명단 요약만 먼저 받고, 한 학생을 펼칠 때 그 학생 일기를 지연 조회한다.
    const loadStudents = useCallback(async () => {
        if (!classId) return;
        const { data, error } = await supabase.rpc('get_teacher_diary_student_summary', {
            p_class_id: classId,
            p_query: studentQuery.trim() || null
        });
        if (error) {
            console.error('학생별 일기 요약 불러오기 실패:', error.message);
            setStudents([]);
            return;
        }
        setStudents(Array.isArray(data?.students) ? data.students : []);
    }, [classId, studentQuery]);

    useEffect(() => {
        if (section !== 'reviews' || view !== 'students') return undefined;
        const timerId = window.setTimeout(loadStudents, 250);
        return () => window.clearTimeout(timerId);
    }, [loadStudents, section, view]);

    const toggleStudent = async (studentId) => {
        if (openStudentId === studentId) {
            setOpenStudentId(null);
            return;
        }
        setOpenStudentId(studentId);
        if (Reflect.get(studentDiaries, studentId)) return;
        setStudentDiariesLoading(studentId);
        const { data, error } = await supabase.rpc('get_teacher_diary_overview', {
            p_class_id: classId,
            p_review_filter: 'all',
            p_student_id: studentId,
            p_limit: STUDENT_DIARY_LIMIT,
            p_offset: 0
        });
        setStudentDiariesLoading(null);
        if (error) {
            console.error('학생 일기 목록 불러오기 실패:', error.message);
            setOpenStudentId(null);
            alert('이 학생의 일기를 불러오지 못했습니다.');
            return;
        }
        setStudentDiaries((current) => ({ ...current, [studentId]: data?.items || [] }));
    };

    const exportStudent = async (student, format) => {
        setExportingId(student.student_id);
        try {
            let googleAccessToken = null;
            // 팝업 차단을 피하려면 데이터 조회보다 권한 창을 먼저 연다(독서록과 같은 순서).
            if (format === 'googleDoc') googleAccessToken = await authorizeGoogleExport();

            const data = await fetchWritingContentExportData('diary', student.student_id);
            if (data.length === 0) {
                alert('내보낼 일기가 없습니다.');
                return;
            }
            const fileName = `${student.name}_일기_모음`;
            if (format === 'excel') {
                await exportWritingContentToExcel(data, fileName, 'diary');
            } else if (format === 'pdf') {
                await exportWritingContentToPdf(data, fileName, 'diary');
            } else {
                await exportWritingContentToGoogleDoc(data, fileName, 'diary', true, googleAccessToken);
            }
        } catch (error) {
            console.error('학생 일기 내보내기 실패:', error.message);
            alert('일기 내보내기에 실패했습니다: ' + (error.message || '잠시 후 다시 시도해 주세요.'));
        } finally {
            setExportingId(null);
        }
    };

    const changeSection = (nextSection) => {
        if (nextSection === section) return;
        if (section === 'motivation' && policyDirty
            && !window.confirm('아직 저장하지 않은 동기부여 설정이 있어요. 저장하지 않고 학생 일기 확인으로 이동할까요?')) {
            return;
        }
        setSection(nextSection);
    };

    const emptyMessage = useMemo(() => {
        if (view === 'queue' || filter === 'unreviewed') return '확인을 기다리는 일기가 없어요. 모두 살펴보셨습니다. ✅';
        if (filter === 'revision_requested') return '현재 보완을 요청한 일기가 없어요.';
        if (filter === 'reviewed') return '아직 확인한 일기가 없어요.';
        return '학생이 쓴 일기가 아직 없어요.';
    }, [filter, view]);

    const { activeStudents, quietStudents } = useMemo(() => {
        const active = [];
        const quiet = [];
        students.forEach((student) => {
            if (Number(student.total) > 0) active.push(student);
            else quiet.push(student);
        });
        return { activeStudents: active, quietStudents: quiet };
    }, [students]);

    const selectableIds = useMemo(
        () => overview.items.filter((item) => item.review_status === 'unreviewed').map((item) => item.post_id),
        [overview.items]
    );
    const allLoadedSelected = selectableIds.length > 0
        && selectableIds.every((postId) => selectedReviewIds.has(postId));
    const hasMore = view !== 'students' && !loading && overview.items.length < overview.total;

    const toggleReviewSelection = (postId) => {
        setSelectedReviewIds((current) => {
            const next = new Set(current);
            if (next.has(postId)) next.delete(postId);
            else next.add(postId);
            return next;
        });
        setBulkNotice('');
    };

    const toggleAllLoadedReviews = () => {
        setSelectedReviewIds(allLoadedSelected ? new Set() : new Set(selectableIds));
        setBulkNotice('');
    };

    const saveBulkReviews = async () => {
        const postIds = selectableIds.filter((postId) => selectedReviewIds.has(postId));
        if (postIds.length === 0 || bulkSaving) return;
        if (!window.confirm(`선택한 일기 ${postIds.length}편을 모두 확인할까요?`)) return;

        setBulkSaving(true);
        setBulkNotice('');
        const { data, error } = await supabase.rpc('save_teacher_self_writing_reviews_bulk_v1', {
            p_post_ids: postIds,
            p_writing_type: 'diary'
        });
        setBulkSaving(false);
        if (error) {
            console.error('일기 일괄 확인 실패:', error.message);
            alert('선택한 일기를 일괄 확인하지 못했습니다. 다시 시도해 주세요.');
            return;
        }

        const confirmedCount = Number(data?.confirmed_count ?? postIds.length);
        const awardedPoints = Number(data?.points_awarded || 0);
        setSelectedReviewIds(new Set());
        setBulkNotice(`✅ 일기 ${confirmedCount}편 확인${awardedPoints > 0 ? ` · ${awardedPoints}P 지급` : ''}`);
        await load();
    };

    return (
        <section className="teacher-diary">
            <header className="teacher-diary__header">
                <div>
                    <span className="teacher-diary__kicker">자율 글쓰기 관리</span>
                    <h2>📔 학생 일기</h2>
                    <p>미확인 일기를 골라 한 번에 확인하고, 필요한 글만 자세히 살펴봐요.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <TeacherGuideButton tabId="diaries" variant="help" />
                    {section === 'reviews' && (
                        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>새로고침</Button>
                    )}
                    <FeatureAvailabilitySwitch
                        checked={diaryEnabled}
                        disabled={availabilityLoading || !classId}
                        loading={availabilitySaving}
                        onChange={changeDiaryAvailability}
                        enabledLabel="학생 일기 사용 중"
                        disabledLabel="학생 일기 사용 안 함"
                        enabledDescription="학생 화면에 일기 탭이 보입니다."
                        disabledDescription="기존 일기는 보관하고 작성·수정만 막습니다."
                        ariaLabel="학생 일기 사용"
                    />
                </div>
            </header>

            <nav className="teacher-diary__sections" role="tablist" aria-label="학생 일기 업무">
                <button
                    type="button"
                    role="tab"
                    aria-selected={section === 'reviews'}
                    className={section === 'reviews' ? 'active' : ''}
                    onClick={() => changeSection('reviews')}
                >
                    <span>📔 학생 일기 확인</span>
                    {overview.pending_count > 0 && <strong>{overview.pending_count}</strong>}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={section === 'motivation'}
                    className={section === 'motivation' ? 'active' : ''}
                    onClick={() => changeSection('motivation')}
                >
                    <span>⚙️ 글쓰기 동기부여 설정</span>
                </button>
            </nav>

            {section === 'motivation' ? (
                <div className="teacher-diary__policy" role="tabpanel" aria-label="글쓰기 동기부여 설정">
                    <WritingPolicySettings
                        classId={classId}
                        writingType="diary"
                        defaults={DIARY_POLICY_DEFAULTS}
                        availabilityEnabled={diaryEnabled}
                        title="일기 완료 조건과 포인트"
                        description="학생이 작성 완료할 때 분량과 하루 완료 편수를 확인합니다. 일기는 하루에 한 편이며 포인트는 그 날짜에 최초 한 번만 지급합니다."
                        onDirtyChange={setPolicyDirty}
                    />
                </div>
            ) : (<>
            <SelfWritingReviewSummary
                counts={overview.counts}
                activeKey={view === 'queue' ? 'unreviewed' : view === 'archive' ? filter : ''}
                onSelect={(key) => {
                    setOpenStudentId(null);
                    if (key === 'unreviewed') setView('queue');
                    else { setFilter(key); setView('archive'); }
                }}
            />

            <SelfWritingReviewViewTabs
                value={view}
                onChange={(nextView) => {
                    setView(nextView);
                    setOpenStudentId(null);
                    if (nextView === 'archive') setFilter('all');
                }}
            />

            {view === 'students' ? (
                <div className="teacher-diary__students">
                    <input
                        type="search"
                        className="teacher-diary__student-search"
                        value={studentQuery}
                        onChange={(event) => setStudentQuery(event.target.value)}
                        placeholder="학생 이름으로 찾기"
                        aria-label="학생 이름으로 찾기"
                    />
                    {activeStudents.length === 0 && quietStudents.length === 0 ? (
                        <Card style={{ textAlign: 'center', padding: '48px 24px' }}>
                            <p style={{ color: 'var(--ui-ink-muted)' }}>찾는 학생이 없어요.</p>
                        </Card>
                    ) : (
                        <>
                            <div className="self-writing-student-grid">
                                {activeStudents.map((student) => {
                                    const isOpen = openStudentId === student.student_id;
                                    return (
                                        <article key={student.student_id} className={`self-writing-student-card is-diary ${isOpen ? 'is-open' : ''}`}>
                                            <button
                                                type="button"
                                                className="self-writing-student-card__main"
                                                onClick={() => toggleStudent(student.student_id)}
                                                aria-expanded={isOpen}
                                            >
                                                <span className="self-writing-student-card__avatar">👤</span>
                                                <span className="self-writing-student-card__identity">
                                                    <strong>{student.name}</strong>
                                                    <small>{student.last_diary_date ? `최근 ${formatDiaryDate(student.last_diary_date)}` : '작성 기록 없음'}</small>
                                                </span>
                                                <em>{isOpen ? '책장 닫기 ▴' : '책장 열기 ▾'}</em>
                                            </button>
                                            <div className="self-writing-student-card__stats">
                                                <span><strong>{student.total}</strong>전체</span>
                                                <span className={student.unreviewed > 0 ? 'has-unread' : ''}><strong>{student.unreviewed}</strong>미확인</span>
                                                <span className={student.revision_requested > 0 ? 'has-revision' : ''}><strong>{student.revision_requested}</strong>보완</span>
                                                <span><strong>{student.reviewed}</strong>완료</span>
                                            </div>
                                            <button
                                                type="button"
                                                className="self-writing-student-card__export"
                                                disabled={exportingId === student.student_id}
                                                onClick={() => setExportTarget(student)}
                                            >
                                                {exportingId === student.student_id ? '내보내는 중...' : '📤 일기 모음 내보내기'}
                                            </button>
                                        </article>
                                    );
                                })}
                            </div>

                            {openStudentId ? (
                                <section className="self-writing-student-shelf is-diary">
                                    <header>
                                        <div>
                                            <span>학생별 책장</span>
                                            <h3>{activeStudents.find((student) => student.student_id === openStudentId)?.name || '학생'}의 일기</h3>
                                        </div>
                                        <ModalCloseButton onClick={() => setOpenStudentId(null)} label="학생 책장 닫기" size="sm" />
                                    </header>
                                    {studentDiariesLoading === openStudentId ? (
                                        <div className="self-writing-student-empty">책장을 불러오는 중... 📔</div>
                                    ) : (
                                    <div className="self-writing-student-log-grid">
                                        {(Reflect.get(studentDiaries, openStudentId) || []).map((item) => (
                                            <button
                                                key={item.post_id}
                                                type="button"
                                                className="self-writing-shelf-card is-diary"
                                                onClick={() => openDiary(item)}
                                            >
                                                <span className={`self-writing-shelf-card__status ${item.review_status === 'revision_requested' ? 'is-revision' : item.review_status === 'checked' || item.review_status === 'commented' ? 'is-checked' : ''}`}>
                                                    {getSelfWritingReviewLabel(item.review_status)}
                                                </span>
                                                <h4>{item.title || '제목 없는 일기'}</h4>
                                                <p>{item.char_count || 0}자 · {item.visibility === 'class' ? '친구 공개' : '나만 보기'}</p>
                                                <small>{formatDiaryDate(item.diary_date)}</small>
                                            </button>
                                        ))}
                                    </div>
                                    )}
                                </section>
                            ) : null}

                            {quietStudents.length > 0 ? (
                                <div className="self-writing-quiet-students">
                                    <button type="button" onClick={() => setShowQuietStudents((current) => !current)} aria-expanded={showQuietStudents}>
                                        {showQuietStudents ? '▾' : '▸'} 아직 일기를 쓰지 않은 학생 {quietStudents.length}명
                                    </button>
                                    {showQuietStudents ? <p>{quietStudents.map((student) => student.name).join(' · ')}</p> : null}
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            ) : (<>
            {view === 'queue' && !loading && overview.items.length > 0 && (
                <SelfWritingBulkToolbar
                    typeLabel="일기"
                    selectedCount={selectedReviewIds.size}
                    allSelected={allLoadedSelected}
                    disabled={bulkSaving}
                    onToggleAll={toggleAllLoadedReviews}
                    onConfirm={saveBulkReviews}
                />
            )}

            {bulkNotice && <div className="teacher-diary__bulk-notice" role="status">{bulkNotice}</div>}

            {errorMessage && (
                <Card style={{ borderColor: '#FCA5A5', color: '#B91C1C' }}>{errorMessage}</Card>
            )}

            {loading ? (
                <Card><p style={{ textAlign: 'center', padding: '42px' }}>학생 일기를 정리하는 중... 📔</p></Card>
            ) : overview.items.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '56px 24px' }}>
                    <div style={{ fontSize: '3rem' }}>📔</div>
                    <p style={{ color: 'var(--ui-ink-muted)' }}>{emptyMessage}</p>
                </Card>
            ) : (
                <>
                    <div className="self-writing-review-queue">
                        {overview.items.map((item) => view === 'queue' ? (
                            <SelfWritingQueueCard
                                key={item.post_id}
                                postId={item.post_id}
                                typeLabel="일기"
                                studentName={item.student_name || '이름 없음'}
                                dateLabel={formatDiaryDate(item.diary_date)}
                                title={item.title || '제목 없는 일기'}
                                secondary={`${item.char_count || 0}자 · ${item.visibility === 'class' ? '친구 공개' : '나만 보기'}`}
                                selected={selectedReviewIds.has(item.post_id)}
                                disabled={bulkSaving}
                                onToggle={toggleReviewSelection}
                                onOpen={() => openDiary(item)}
                            />
                        ) : (
                            <SelfWritingQueueCard
                                key={item.post_id}
                                postId={item.post_id}
                                typeLabel="일기"
                                studentName={item.student_name || '이름 없음'}
                                dateLabel={formatDiaryDate(item.diary_date)}
                                title={item.title || '제목 없는 일기'}
                                secondary={`${item.char_count || 0}자 · ${item.visibility === 'class' ? '친구 공개' : '나만 보기'} · ${getSelfWritingReviewLabel(item.review_status)}`}
                                selectable={false}
                                tone={getSelfWritingRecordTone(item.review_status, 'diary')}
                                actionLabel="일기 보기 ›"
                                onOpen={() => openDiary(item)}
                            />
                        ))}
                    </div>
                    {hasMore && (
                        <div className="teacher-diary__more">
                            <Button variant="ghost" onClick={loadMore} disabled={loadingMore}>
                                {loadingMore ? '불러오는 중...' : `더 보기 (${overview.items.length}/${overview.total})`}
                            </Button>
                        </div>
                    )}
                </>
            )}

            </>)}
            </>)}

            <ExportSelectModal
                isOpen={Boolean(exportTarget)}
                onClose={() => setExportTarget(null)}
                onConfirm={(format) => {
                    if (exportTarget) exportStudent(exportTarget, format);
                }}
                title={exportTarget ? `${exportTarget.name} 학생 일기 ${exportTarget.total}편` : '일기 내보내기'}
                isGapiLoaded={isGapiLoaded}
            />

            <Modal
                isOpen={Boolean(selected)}
                onClose={() => setSelected(null)}
                title={selected ? `📔 ${selected.student_name || ''} · ${formatDiaryDate(selected.diary_date)}` : '📔 일기'}
                maxWidth="880px"
            >
                {detailLoading ? (
                    <p style={{ textAlign: 'center', padding: '32px' }}>일기를 펼치는 중...</p>
                ) : selected && (
                    <div className="teacher-diary__detail">
                        <h3>{selected.title || '제목 없는 일기'}</h3>
                        <p className="teacher-diary__content">{selected.content}</p>

                        <label className="teacher-diary__comment">
                            <span>선생님 한마디 <small>선택 사항 · 500자까지</small></span>
                            <textarea
                                value={comment}
                                onChange={(event) => setComment(event.target.value)}
                                maxLength={500}
                                rows={4}
                                placeholder="학생에게 전할 한마디가 있으면 적어주세요. (선택)"
                                disabled={saving}
                            />
                        </label>

                        <div className="teacher-diary__actions">
                            <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>닫기</Button>
                            <Button variant="outline" onClick={() => saveReview('revision_requested')} disabled={saving}>
                                보완 요청하기 ✏️
                            </Button>
                            <Button onClick={() => saveReview('accepted')} disabled={saving}>
                                {saving ? '저장하는 중...' : '확인 완료 ✓'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </section>
    );
};

export default TeacherDiaryManager;
