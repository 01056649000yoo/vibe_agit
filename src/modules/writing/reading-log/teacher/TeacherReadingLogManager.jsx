import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../../components/common/Button';
import ExportSelectModal from '../../../../components/common/ExportSelectModal';
import ModalCloseButton from '../../../../components/common/ModalCloseButton';
import TeacherGuideButton from '../../../../components/teacher/TeacherGuideButton';
import { useDataExport } from '../../../../hooks/useDataExport';
import { supabase } from '../../../../lib/supabaseClient';
import { classKey, classScope, dataCache } from '../../../../lib/cache';
import WritingPolicySettings from '../../policy/WritingPolicySettings';
import './teacherReadingLog.css';
import { READING_LOG_POLICY_DEFAULTS } from '../../policy/writingPolicy';
import {
    SelfWritingBulkToolbar,
    getSelfWritingRecordTone,
    getSelfWritingReviewLabel,
    SelfWritingQueueCard,
    SelfWritingReviewSummary,
    SelfWritingReviewViewTabs
} from '../../review/SelfWritingReviewWorkspace';

const ReadingMarathonTeacherSettings = lazy(() => import('../marathon/ReadingMarathonTeacherSettings'));

const EMPTY_COUNTS = { total: 0, unreviewed: 0, revision_requested: 0, reviewed: 0, students: 0 };

const getFilteredTotal = (counts, filter) => {
    if (filter === 'unreviewed') return counts.unreviewed;
    if (filter === 'revision_requested') return counts.revision_requested;
    if (filter === 'reviewed') return counts.reviewed;
    return counts.total;
};

// 첫 화면에는 한 번에 처리하기 좋은 20편만 받고 나머지는 "더 보기"로 잇는다.
const PAGE_SIZE = 20;
// 한 학생이 쓴 독서록은 펼칠 때 한 번에 받는다. 100편을 넘기는 경우는 없다고 본다.
const STUDENT_LOG_LIMIT = 100;

// 보기를 오가거나 필터를 눌렀을 때 같은 결과를 다시 받아오지 않기 위한 짧은 캐시.
// 길게 잡지 않는 이유: 학생은 계속 글을 쓰고 있고, 교사가 다른 기기에서 확인 표시를
// 남길 수도 있다. 늦게 보이는 것보다 안 보이는 것이 훨씬 나쁘므로 20초만 둔다.
// 확인 표시를 저장하거나 새로고침을 누르면 즉시 버린다.
const CACHE_TTL_MS = 20000;

const formatDate = (value) => {
    if (!value) return '-';
    return new Intl.DateTimeFormat('ko-KR', {
        year: 'numeric', month: 'short', day: 'numeric'
    }).format(new Date(value));
};

const TeacherReadingLogManager = ({ activeClass, isMobile, navigationTarget, onNavigationHandled }) => {
    const classId = activeClass?.id;
    const handledNavigationRef = useRef(null);
    const [section, setSection] = useState('reviews'); // 'reviews' | 'policy' | 'events'
    const [policySettingsDirty, setPolicySettingsDirty] = useState(false);

    // 평소 업무는 검토 대기함에서 시작한다. 학생별 책장과 전체 기록은 필요할 때 연다.
    const [reviewFilter, setReviewFilter] = useState('all');
    const [viewMode, setViewMode] = useState('queue'); // 'queue' | 'student' | 'archive'

    const [items, setItems] = useState([]);
    const [counts, setCounts] = useState(EMPTY_COUNTS);
    const [loadingMore, setLoadingMore] = useState(false);

    const [summary, setSummary] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [studentLogs, setStudentLogs] = useState(() => new Map());
    const [studentLogsLoading, setStudentLogsLoading] = useState(null);
    const [showQuietStudents, setShowQuietStudents] = useState(false);

    const [students, setStudents] = useState([]);
    const [studentFilter, setStudentFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');

    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [selected, setSelected] = useState(null);
    const [detail, setDetail] = useState(null);
    const [comment, setComment] = useState('');
    const [detailLoading, setDetailLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedReviewIds, setSelectedReviewIds] = useState(() => new Set());
    const [bulkSaving, setBulkSaving] = useState(false);
    const [bulkNotice, setBulkNotice] = useState('');
    const [exportTarget, setExportTarget] = useState(null);
    const [exporting, setExporting] = useState(false);
    const {
        fetchWritingContentExportData,
        fetchCheckedReadingLogClassExportData,
        exportWritingContentToExcel,
        exportWritingContentToPdf,
        exportWritingContentToGoogleDoc,
        authorizeGoogleExport,
        isGapiLoaded
    } = useDataExport(classId);

    const effectiveReviewFilter = viewMode === 'queue' ? 'unreviewed'
        : viewMode === 'archive' ? reviewFilter : 'all';

    useEffect(() => {
        const timerId = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => window.clearTimeout(timerId);
    }, [query]);

    useEffect(() => {
        setSelectedReviewIds(new Set());
        setBulkNotice('');
    }, [classId, effectiveReviewFilter, studentFilter, debouncedQuery, viewMode]);

    useEffect(() => {
        let active = true;
        const fetchStudents = async () => {
            if (!classId) return;
            const { data, error } = await supabase
                .from('students')
                .select('id, name')
                .eq('class_id', classId)
                .is('deleted_at', null)
                .order('name', { ascending: true });
            if (!active) return;
            if (error) {
                console.error('독서록 학생 목록 로드 실패:', error.message);
                setStudents([]);
            } else {
                setStudents(data || []);
            }
        };
        fetchStudents();
        return () => { active = false; };
    }, [classId]);

    // 조건이 바뀌면 펼쳐 둔 학생의 글 목록은 더 이상 맞지 않는다.
    useEffect(() => {
        const timerId = window.setTimeout(() => {
            setStudentLogs(new Map());
            setExpandedId(null);
        }, 0);
        return () => window.clearTimeout(timerId);
    }, [classId, debouncedQuery]);

    const fetchPage = useCallback(async (offset) => {
        return supabase.rpc('get_teacher_reading_log_overview', {
            p_class_id: classId,
            p_review_filter: effectiveReviewFilter,
            p_student_id: studentFilter === 'all' ? null : studentFilter,
            p_query: debouncedQuery || null,
            p_limit: PAGE_SIZE,
            p_offset: offset
        });
    }, [classId, effectiveReviewFilter, studentFilter, debouncedQuery]);

    const recentKey = classKey(classId, 'reading-log-list', {
        filter: effectiveReviewFilter, student: studentFilter, q: debouncedQuery
    });
    const summaryKey = classKey(classId, 'reading-log-by-student', { q: debouncedQuery });

    const fetchRecent = useCallback(async () => {
        if (!classId) return;
        setLoadError('');

        try {
            const cached = await dataCache.get(recentKey, async () => {
                setLoading(true);
                const { data, error } = await fetchPage(0);
                if (error) throw error;
                return {
                    items: Array.isArray(data?.items) ? data.items : [],
                    counts: { ...EMPTY_COUNTS, ...(data?.counts || {}) }
                };
            }, CACHE_TTL_MS);
            setItems(cached.items);
            setCounts(cached.counts);
        } catch (error) {
            console.error('교사 독서록 목록 로드 실패:', error.message);
            setItems([]);
            setCounts(EMPTY_COUNTS);
            setLoadError('학생 독서록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        setLoading(false);
    }, [classId, fetchPage, recentKey]);

    const fetchSummary = useCallback(async () => {
        if (!classId) return;
        setLoadError('');

        try {
            const rows = await dataCache.get(summaryKey, async () => {
                setLoading(true);
                const { data, error } = await supabase.rpc('get_teacher_reading_log_student_summary', {
                    p_class_id: classId,
                    p_query: debouncedQuery || null
                });
                if (error) throw error;
                return Array.isArray(data?.students) ? data.students : [];
            }, CACHE_TTL_MS);
            setSummary(rows);
        } catch (error) {
            console.error('학생별 독서록 요약 로드 실패:', error.message);
            setSummary([]);
            setLoadError('학생별 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        setLoading(false);
    }, [classId, debouncedQuery, summaryKey]);

    const refresh = useCallback(async () => {
        dataCache.invalidatePrefix(classScope(classId));
        setStudentLogs(new Map());
        if (viewMode === 'student') await fetchSummary();
        else await fetchRecent();
    }, [classId, viewMode, fetchSummary, fetchRecent]);

    // 보기별로 나눈 이유: 하나로 두면 필터를 누를 때마다 fetchRecent 의 정체가 바뀌어,
    // 학생별 보기에서도(그쪽은 필터를 화면에서 처리하는데) 요약을 다시 받아왔다.
    useEffect(() => {
        if (viewMode === 'student') return undefined;
        const timerId = window.setTimeout(fetchRecent, 0);
        return () => window.clearTimeout(timerId);
    }, [viewMode, fetchRecent]);

    useEffect(() => {
        if (viewMode !== 'student') return undefined;
        const timerId = window.setTimeout(fetchSummary, 0);
        return () => window.clearTimeout(timerId);
    }, [viewMode, fetchSummary]);

    // 학생별 보기에서는 요약만으로 합계를 낼 수 있어 목록 RPC를 부르지 않는다.
    const summaryCounts = useMemo(() => {
        if (!summary) return null;
        return summary.reduce((acc, row) => ({
            total: acc.total + row.total_count,
            unreviewed: acc.unreviewed + row.unreviewed_count,
            revision_requested: acc.revision_requested + row.revision_requested_count,
            reviewed: acc.reviewed + row.reviewed_count,
            students: acc.students + (row.total_count > 0 ? 1 : 0)
        }), { ...EMPTY_COUNTS });
    }, [summary]);

    const shownCounts = viewMode === 'student'
        ? (summaryCounts || EMPTY_COUNTS)
        : counts;

    const filteredTotal = getFilteredTotal(shownCounts, effectiveReviewFilter);

    const hasMore = viewMode !== 'student'
        && !loading
        && items.length > 0
        && items.length < filteredTotal;

    const loadMore = async () => {
        setLoadingMore(true);
        const { data, error } = await fetchPage(items.length);
        if (error) {
            console.error('독서록 더 보기 실패:', error.message);
            alert('다음 목록을 불러오지 못했습니다.');
        } else {
            const next = Array.isArray(data?.items) ? data.items : [];
            const nextCounts = { ...EMPTY_COUNTS, ...(data?.counts || {}) };
            const seen = new Set(items.map((row) => row.post_id));
            const merged = [...items, ...next.filter((row) => !seen.has(row.post_id))];
            setItems(merged);
            setCounts(nextCounts);
            // 더 받은 만큼까지 캐시에 담아 둔다. 보기를 바꿨다 돌아왔을 때
            // 첫 50편으로 되돌아가 다시 눌러야 하는 일이 없도록.
            dataCache.set(recentKey, { items: merged, counts: nextCounts });
        }
        setLoadingMore(false);
    };

    // 학생별 책장은 전체 누적 편수를 기준으로 한 학생당 카드 하나만 만든다.
    const { activeRows, quietRows } = useMemo(() => {
        if (!summary) return { activeRows: [], quietRows: [] };
        const active = [];
        const quiet = [];
        summary.forEach((row) => {
            if (row.total_count > 0) active.push(row);
            else quiet.push(row);
        });
        return { activeRows: active, quietRows: quiet };
    }, [summary]);

    const toggleStudent = async (studentId) => {
        if (expandedId === studentId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(studentId);
        if (studentLogs.has(studentId)) return;

        setStudentLogsLoading(studentId);
        const { data, error } = await supabase.rpc('get_teacher_reading_log_overview', {
            p_class_id: classId,
            p_review_filter: 'all',
            p_student_id: studentId,
            p_query: debouncedQuery || null,
            p_limit: STUDENT_LOG_LIMIT,
            p_offset: 0
        });
        setStudentLogsLoading(null);

        if (error) {
            console.error('학생 독서록 펼치기 실패:', error.message);
            alert('이 학생의 독서록을 불러오지 못했습니다.');
            setExpandedId(null);
            return;
        }
        setStudentLogs((current) => new Map(current).set(
            studentId,
            Array.isArray(data?.items) ? data.items : []
        ));
    };

    const openStudentExport = (row) => {
        if (!row?.student_id || row.total_count < 1) return;
        setExportTarget({
            scope: 'student',
            studentId: row.student_id,
            studentName: row.student_name,
            totalCount: row.total_count
        });
    };

    const openClassExport = () => {
        if (shownCounts.reviewed < 1) return;
        setExportTarget({
            scope: 'class',
            studentId: null,
            studentName: activeClass?.name || '우리 반',
            totalCount: shownCounts.reviewed
        });
    };

    const handleStudentExport = async (format, options) => {
        if (!exportTarget || exporting) return;
        setExporting(true);
        let googleAccessToken = null;

        try {
            if (format === 'googleDoc') {
                // 팝업 차단을 피하려면 데이터 조회보다 권한 창을 먼저 열어야 한다.
                googleAccessToken = await authorizeGoogleExport();
            }

            const data = exportTarget.scope === 'class'
                ? await fetchCheckedReadingLogClassExportData(2000)
                : await fetchWritingContentExportData('reading_log', exportTarget.studentId);
            if (data.length === 0) {
                alert('내보낼 독서록이 없습니다.');
                return;
            }

            const fileName = exportTarget.scope === 'class'
                ? `${exportTarget.studentName}_확인완료_독서록_모음`
                : `${exportTarget.studentName}_독서록_모음`;
            if (format === 'excel') {
                await exportWritingContentToExcel(data, fileName, 'reading_log');
            } else if (format === 'pdf') {
                await exportWritingContentToPdf(data, fileName, 'reading_log');
            } else {
                await exportWritingContentToGoogleDoc(
                    data,
                    fileName,
                    'reading_log',
                    options.usePageBreak,
                    googleAccessToken
                );
            }
        } catch (error) {
            console.error('학생 독서록 내보내기 실패:', error.message);
            alert('독서록 내보내기에 실패했습니다: ' + (error.message || '잠시 후 다시 시도해 주세요.'));
        } finally {
            setExporting(false);
        }
    };

    const openDetail = useCallback(async (item) => {
        setSelected(item);
        setDetail(null);
        setComment('');
        setDetailLoading(true);

        const [postResult, reviewResult] = await Promise.all([
            supabase
                .from('student_posts')
                .select('id, title, content, visibility, created_at, updated_at, students!inner(id, name, class_id)')
                .eq('id', item.post_id)
                .eq('class_id', classId)
                .eq('writing_context', 'self')
                .eq('self_writing_type', 'reading_log')
                .maybeSingle(),
            supabase
                .from('reading_log_teacher_reviews')
                .select('review_status, teacher_comment, reviewed_at')
                .eq('post_id', item.post_id)
                .maybeSingle()
        ]);

        if (postResult.error || !postResult.data) {
            console.error('독서록 상세 로드 실패:', postResult.error?.message);
            alert('독서록 내용을 불러오지 못했습니다.');
            setSelected(null);
        } else {
            setDetail({
                ...postResult.data,
                review: reviewResult.error ? null : reviewResult.data
            });
            setComment(reviewResult.data?.teacher_comment || '');
        }
        setDetailLoading(false);
    }, [classId]);

    useEffect(() => {
        const requestId = navigationTarget?.requestId;
        if (!requestId || navigationTarget.kind !== 'reading-review' || handledNavigationRef.current === requestId) return;

        const timerId = window.setTimeout(() => {
            if (handledNavigationRef.current === requestId) return;
            handledNavigationRef.current = requestId;
            setSection('reviews');
            const targetItem = navigationTarget.item;
            if (!targetItem?.post_id) {
                onNavigationHandled?.(requestId);
                return;
            }

            openDetail(targetItem).finally(() => onNavigationHandled?.(requestId));
        }, 0);

        return () => window.clearTimeout(timerId);
    }, [navigationTarget, onNavigationHandled, openDetail]);

    const changeSection = (nextSection) => {
        if (nextSection === section) return;
        if (section === 'policy' && policySettingsDirty) {
            const shouldLeave = window.confirm('아직 저장하지 않은 완료조건/포인트 설정이 있어요. 저장하지 않고 다른 탭으로 이동할까요?');
            if (!shouldLeave) return;
        }
        setSection(nextSection);
    };

    const saveReview = async (teacherComment, decision = 'accepted') => {
        if (!selected) return;
        if (!teacherComment.trim() && detail?.review?.teacher_comment) {
            const shouldClear = window.confirm('저장된 선생님 한마디를 지우고, 확인 표시만 남길까요?');
            if (!shouldClear) return;
        }
        setSaving(true);
        const { data, error } = await supabase.rpc('save_teacher_self_writing_review_v2', {
            p_post_id: selected.post_id,
            p_teacher_comment: teacherComment,
            p_decision: decision
        });
        setSaving(false);

        if (error) {
            console.error('독서록 확인 저장 실패:', error.message);
            alert('확인 내용을 저장하지 못했습니다.');
            return;
        }

        const awardedPoints = Number(data?.points_awarded) || 0;
        const successNotice = decision === 'revision_requested'
            ? '보완 요청을 학생 활동 알림으로 보냈습니다.'
            : awardedPoints > 0
                ? `확인 완료! ${awardedPoints}P를 지급하고 학생에게 알렸습니다.`
                : '확인 완료! 학생 활동 알림도 함께 보냈습니다.';
        setBulkNotice(`✅ ${successNotice}`);
        setSelected(null);
        setDetail(null);
        setComment('');
        await refresh();
    };

    const toggleReviewSelection = (postId) => {
        setSelectedReviewIds((current) => {
            const next = new Set(current);
            if (next.has(postId)) next.delete(postId);
            else next.add(postId);
            return next;
        });
        setBulkNotice('');
    };

    const selectableIds = useMemo(
        () => items.filter((item) => item.review_status === 'unreviewed').map((item) => item.post_id),
        [items]
    );
    const allLoadedSelected = selectableIds.length > 0
        && selectableIds.every((postId) => selectedReviewIds.has(postId));

    const toggleAllLoadedReviews = () => {
        setSelectedReviewIds(allLoadedSelected ? new Set() : new Set(selectableIds));
        setBulkNotice('');
    };

    const saveBulkReviews = async () => {
        const postIds = selectableIds.filter((postId) => selectedReviewIds.has(postId));
        if (postIds.length === 0 || bulkSaving) return;
        const shouldSave = window.confirm(`선택한 독서록 ${postIds.length}편을 모두 확인 완료로 표시할까요?`);
        if (!shouldSave) return;

        setBulkSaving(true);
        setBulkNotice('');
        const { data, error } = await supabase.rpc('save_teacher_self_writing_reviews_bulk_v1', {
            p_post_ids: postIds,
            p_writing_type: 'reading_log'
        });
        setBulkSaving(false);

        if (error) {
            console.error('독서록 일괄 확인 실패:', error.message);
            alert('선택한 독서록을 일괄 확인하지 못했습니다. 다시 시도해 주세요.');
            return;
        }

        const confirmedCount = Number(data?.confirmed_count ?? postIds.length);
        const awardedPoints = Number(data?.points_awarded || 0);
        setSelectedReviewIds(new Set());
        setBulkNotice(`✅ 독서록 ${confirmedCount}편 확인${awardedPoints > 0 ? ` · ${awardedPoints}P 지급` : ''}`);
        await refresh();
    };

    const filteredTitle = useMemo(() => {
        if (viewMode === 'queue') return '검토 대기 독서록';
        if (reviewFilter === 'revision_requested') return '보완 요청한 독서록';
        if (reviewFilter === 'reviewed') return '확인한 독서록 기록';
        return '전체 독서록';
    }, [reviewFilter, viewMode]);

    const renderQueueCard = (item) => {
        const isSelected = selectedReviewIds.has(item.post_id);
        return (
            <SelfWritingQueueCard
                key={item.post_id}
                postId={item.post_id}
                typeLabel="독서록"
                studentName={item.student_name || '이름 없음'}
                dateLabel={formatDate(item.updated_at)}
                title={item.title || '제목 없는 독서록'}
                secondary={`『${item.book_title || '책 정보 없음'}』`}
                selected={isSelected}
                disabled={bulkSaving}
                onToggle={toggleReviewSelection}
                onOpen={() => openDetail(item)}
            />
        );
    };

    const renderArchiveCard = (item) => (
        <SelfWritingQueueCard
            key={item.post_id}
            postId={item.post_id}
            typeLabel="독서록"
            studentName={item.student_name || '이름 없음'}
            dateLabel={formatDate(item.updated_at)}
            title={item.title || '제목 없는 독서록'}
            secondary={`『${item.book_title || '책 정보 없음'}』 · ${getSelfWritingReviewLabel(item.review_status)}`}
            selectable={false}
            tone={getSelfWritingRecordTone(item.review_status, 'reading')}
            actionLabel="독서록 보기 ›"
            onOpen={() => openDetail(item)}
        />
    );

    const renderShelfCard = (item) => (
        <button key={item.post_id} type="button" className="self-writing-shelf-card" onClick={() => openDetail(item)}>
            <span className={`teacher-reading-status ${item.review_status}`}>{getSelfWritingReviewLabel(item.review_status)}</span>
            <h4>{item.title || '제목 없는 독서록'}</h4>
            <p>『{item.book_title || '책 정보 없음'}』</p>
            <small>{formatDate(item.updated_at)}</small>
        </button>
    );

    const renderEmpty = () => {
        if (viewMode === 'queue' && !debouncedQuery && studentFilter === 'all' && shownCounts.total > 0) {
            return (
                <div className="teacher-reading-empty done">
                    <strong>모두 확인했어요! 👏</strong>
                    <p>새로 올라온 독서록이 없습니다.</p>
                    <Button variant="ghost" size="sm" onClick={() => { setReviewFilter('all'); setViewMode('archive'); }}>
                        전체 {shownCounts.total}편 보기
                    </Button>
                </div>
            );
        }
        return <div className="teacher-reading-empty">조건에 맞는 독서록이 아직 없어요.</div>;
    };

    return (
        <section className="teacher-reading-manager">
            <header className="teacher-reading-header">
                <div>
                    <span className="teacher-reading-kicker">자율 글쓰기 관리</span>
                    <h2>📚 학생 독서록</h2>
                    <p>학생은 스스로 완료하고, 선생님은 확인 완료 또는 보완 요청과 짧은 한마디를 남겨요.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <TeacherGuideButton tabId="reading-logs" variant="help" />
                    <TeacherGuideButton tabId="reading-events" />
                    {section === 'reviews' && (
                        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>새로고침</Button>
                    )}
                </div>
            </header>

            <nav className="teacher-reading-sections" role="tablist" aria-label="학생 독서록 관리 메뉴">
                <button
                    type="button"
                    role="tab"
                    aria-selected={section === 'reviews'}
                    className={section === 'reviews' ? 'active' : ''}
                    onClick={() => changeSection('reviews')}
                >
                    <span>📚 학생 독서록 확인</span>
                    {shownCounts.unreviewed > 0 && <strong>{shownCounts.unreviewed}</strong>}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={section === 'policy'}
                    className={section === 'policy' ? 'active' : ''}
                    onClick={() => changeSection('policy')}
                >
                    <span>⚙️ 독서록 완료조건/포인트</span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={section === 'events'}
                    className={section === 'events' ? 'active' : ''}
                    onClick={() => changeSection('events')}
                >
                    <span>🏃 독서록 이벤트</span>
                </button>
            </nav>

            {section === 'policy' ? (
                <div className="teacher-reading-policy-panel" role="tabpanel" aria-label="독서록 완료조건과 포인트 설정">
                    <WritingPolicySettings
                        classId={classId}
                        writingType="reading_log"
                        defaults={READING_LOG_POLICY_DEFAULTS}
                        title="독서록 완료 조건과 포인트"
                        description="학생이 작성 완료할 때 분량과 하루 완료 편수를 확인합니다. 포인트는 한 책당 최초 한 번만 지급합니다."
                        kicker="독서록 운영 설정"
                        onDirtyChange={setPolicySettingsDirty}
                    />
                </div>
            ) : section === 'events' ? (
                <div className="teacher-reading-event-panel" role="tabpanel" aria-label="독서록 이벤트 설정">
                    <Suspense fallback={<div className="reading-marathon-settings__loading">독서마라톤 설정을 준비하는 중... 🏃</div>}>
                        <ReadingMarathonTeacherSettings classId={classId} className={activeClass?.name} />
                    </Suspense>
                </div>
            ) : (<>

            <SelfWritingReviewSummary
                counts={shownCounts}
                activeKey={viewMode === 'queue' ? 'unreviewed' : viewMode === 'archive' ? reviewFilter : ''}
                onSelect={(key) => {
                    if (key === 'unreviewed') setViewMode('queue');
                    else { setReviewFilter(key); setViewMode('archive'); }
                }}
            />

            <SelfWritingReviewViewTabs
                value={viewMode === 'student' ? 'students' : viewMode}
                studentLabel="학생별 책장"
                onChange={(nextView) => {
                    setStudentFilter('all');
                    if (nextView === 'students') setViewMode('student');
                    else {
                        if (nextView === 'archive') setReviewFilter('all');
                        setViewMode(nextView);
                    }
                }}
            />

            <div className={`teacher-reading-filters ${viewMode === 'student' ? 'is-wide' : ''}`}>
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="학생 이름·독서록 제목·책 제목 검색"
                    aria-label="독서록 검색"
                />
                {viewMode !== 'student' && (
                    <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} aria-label="학생 선택">
                        <option value="all">전체 학생</option>
                        {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                    </select>
                )}
            </div>

            <div className="teacher-reading-list-heading">
                <div>
                    <h3>{viewMode === 'student' ? '학생별 현황' : filteredTitle}</h3>
                    <small>
                        {viewMode === 'student'
                            ? '학생 한 명당 카드 하나로 보고, 책장을 열거나 글 모음을 내보낼 수 있어요.'
                            : viewMode === 'queue'
                                ? '아직 확인하지 않은 글만 모았습니다. 확인하면 이 대기함에서 빠져요.'
                                : '검색과 학생 필터로 지난 독서록을 찾아볼 수 있어요.'}
                    </small>
                </div>
                {viewMode === 'archive' && shownCounts.reviewed > 0 && (
                    <Button variant="outline" size="sm" onClick={openClassExport} disabled={exporting}>
                        {exporting && exportTarget?.scope === 'class' ? '내보내는 중...' : '📤 확인 독서록 전체 내보내기'}
                    </Button>
                )}
            </div>

            {viewMode === 'queue' && !loading && items.length > 0 && (
                <SelfWritingBulkToolbar
                    typeLabel="독서록"
                    selectedCount={selectedReviewIds.size}
                    allSelected={allLoadedSelected}
                    disabled={bulkSaving}
                    onToggleAll={toggleAllLoadedReviews}
                    onConfirm={saveBulkReviews}
                />
            )}

            {bulkNotice && <div className="teacher-reading-success-notice" role="status">{bulkNotice}</div>}

            {loading ? (
                <div className="teacher-reading-empty">독서록 목록을 불러오는 중... 📖</div>
            ) : loadError ? (
                <div className="teacher-reading-empty error">{loadError}</div>
            ) : viewMode === 'student' ? (
                activeRows.length === 0 && quietRows.length === 0 ? (
                    <div className="teacher-reading-empty">이 학급에 학생이 아직 없어요.</div>
                ) : (
                    <>
                        {activeRows.length === 0 && renderEmpty()}

                        <div className="self-writing-student-grid">
                            {activeRows.map((row) => (
                            <article key={row.student_id} className={`self-writing-student-card ${expandedId === row.student_id ? 'is-open' : ''}`}>
                                <button
                                    type="button"
                                    className="self-writing-student-card__main"
                                    onClick={() => toggleStudent(row.student_id)}
                                    aria-expanded={expandedId === row.student_id}
                                >
                                    <span className="self-writing-student-card__avatar">👤</span>
                                    <span className="self-writing-student-card__identity">
                                        <strong>{row.student_name}</strong>
                                        <small>{row.last_written_at ? `최근 ${formatDate(row.last_written_at)}` : '작성 기록 없음'}</small>
                                    </span>
                                    <em>{expandedId === row.student_id ? '책장 닫기 ▴' : '책장 열기 ▾'}</em>
                                </button>

                                <div className="self-writing-student-card__stats">
                                    <span><strong>{row.total_count}</strong>전체</span>
                                    <span className={row.unreviewed_count > 0 ? 'has-unread' : ''}><strong>{row.unreviewed_count}</strong>미확인</span>
                                    <span className={row.revision_requested_count > 0 ? 'has-revision' : ''}><strong>{row.revision_requested_count}</strong>보완</span>
                                    <span><strong>{row.reviewed_count}</strong>완료</span>
                                </div>
                                <button type="button" className="self-writing-student-card__export" onClick={() => openStudentExport(row)}>
                                    📤 독서록 모음 내보내기
                                </button>
                            </article>
                            ))}
                        </div>

                        {expandedId && (
                            <section className="self-writing-student-shelf">
                                <header>
                                    <div>
                                        <span>학생별 책장</span>
                                        <h3>{activeRows.find((row) => row.student_id === expandedId)?.student_name || '학생'}의 독서록</h3>
                                    </div>
                                    <ModalCloseButton
                                        onClick={() => setExpandedId(null)}
                                        label="학생 책장 닫기"
                                        size="sm"
                                    />
                                </header>
                                {studentLogsLoading === expandedId ? (
                                    <div className="teacher-reading-grouploading">책장을 불러오는 중... 📖</div>
                                ) : (
                                    <div className="self-writing-student-log-grid">
                                        {(studentLogs.get(expandedId) || []).map(renderShelfCard)}
                                    </div>
                                )}
                            </section>
                        )}

                        {quietRows.length > 0 && (
                            <div className="teacher-reading-quiet">
                                <button type="button" onClick={() => setShowQuietStudents((v) => !v)} aria-expanded={showQuietStudents}>
                                    <span>{showQuietStudents ? '▾' : '▸'}</span>
                                    아직 독서록을 쓰지 않은 학생 {quietRows.length}명
                                </button>
                                {showQuietStudents && (
                                    <p>{quietRows.map((row) => row.student_name).join(' · ')}</p>
                                )}
                            </div>
                        )}
                    </>
                )
            ) : items.length === 0 ? (
                renderEmpty()
            ) : (
                <>
                    <div className="self-writing-review-queue">
                        {items.map(viewMode === 'queue' ? renderQueueCard : renderArchiveCard)}
                    </div>
                    {hasMore && (
                        <div className="teacher-reading-more">
                            <Button variant="ghost" onClick={loadMore} disabled={loadingMore}>
                                {loadingMore ? '불러오는 중...' : `더 보기 (${items.length}/${filteredTotal})`}
                            </Button>
                        </div>
                    )}
                </>
            )}

            {selected && (
                <div className="teacher-reading-modal-backdrop" onClick={() => !saving && setSelected(null)}>
                    <article className="teacher-reading-modal" onClick={(event) => event.stopPropagation()}>
                        <header>
                            <div>
                                <span>{selected.student_name} · 『{selected.book_title || '책 정보 없음'}』</span>
                                <h2>{selected.title || '제목 없는 독서록'}</h2>
                            </div>
                            <ModalCloseButton
                                onClick={() => setSelected(null)}
                                disabled={saving}
                                label="독서록 상세 창 닫기"
                            />
                        </header>

                        {detailLoading ? (
                            <div className="teacher-reading-detail-loading">독서록을 펼치는 중... 📖</div>
                        ) : detail && (
                            <>
                                <div className="teacher-reading-detail-meta">
                                    <span>{detail.visibility === 'class' ? '📚 친구 공개' : '🔒 친구에게 비공개'}</span>
                                    <span>마지막 수정 {formatDate(detail.updated_at)}</span>
                                </div>
                                <div className="teacher-reading-content">{detail.content || '작성된 내용이 없습니다.'}</div>
                                <section className={`teacher-reading-review-box ${detail.review ? 'is-reviewed' : ''}`}>
                                    <div>
                                        <h3>선생님 확인</h3>
                                        <span className={`teacher-reading-review-state ${detail.review?.review_status || 'unreviewed'}`}>
                                            {getSelfWritingReviewLabel(detail.review?.review_status)}
                                        </span>
                                    </div>
                                    <textarea
                                        value={comment}
                                        onChange={(event) => setComment(event.target.value.slice(0, 500))}
                                        placeholder="학생에게 전할 한마디가 있으면 적어주세요. (선택)"
                                        aria-label="학생에게 전할 선생님 한마디"
                                        rows={isMobile ? 4 : 3}
                                        disabled={saving}
                                    />
                                    <small>{comment.length}/500 · 한마디는 선택이며 처리 결과는 학생 활동 알림으로 보냅니다.</small>
                                    <div className="teacher-reading-review-actions">
                                        <Button
                                            variant="outline"
                                            style={{ borderColor: '#F59E0B', color: '#B45309' }}
                                            onClick={() => saveReview(comment.trim(), 'revision_requested')}
                                            disabled={saving}
                                        >
                                            보완 요청하기 ✏️
                                        </Button>
                                        <Button onClick={() => saveReview(comment.trim(), 'accepted')} disabled={saving}>
                                            {saving ? '저장 중...' : '확인 완료 ✓'}
                                        </Button>
                                    </div>
                                </section>
                            </>
                        )}
                    </article>
                </div>
            )}

            <ExportSelectModal
                isOpen={Boolean(exportTarget)}
                onClose={() => !exporting && setExportTarget(null)}
                onConfirm={handleStudentExport}
                title={exportTarget
                    ? exportTarget.scope === 'class'
                        ? `${exportTarget.studentName} 확인 완료 독서록 ${exportTarget.totalCount}편`
                        : `${exportTarget.studentName} 학생 독서록 ${exportTarget.totalCount}편`
                    : '독서록 내보내기'}
                isGapiLoaded={isGapiLoaded}
            />
            </>)}

        </section>
    );
};

export default TeacherReadingLogManager;
