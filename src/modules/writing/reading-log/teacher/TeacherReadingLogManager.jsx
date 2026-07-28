import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../../components/common/Button';
import { supabase } from '../../../../lib/supabaseClient';
import { classKey, classScope, dataCache } from '../../../../lib/cache';

const EMPTY_COUNTS = { total: 0, unreviewed: 0, reviewed: 0, students: 0 };

// 목록 RPC의 상한은 100이다. 한 번에 50편씩 받고 나머지는 "더 보기"로 잇는다.
const PAGE_SIZE = 50;
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

const reviewLabel = (status) => {
    if (status === 'commented') return '💬 한마디 있음';
    if (status === 'checked') return '✅ 확인했어요';
    return '🕓 미확인';
};

const TeacherReadingLogManager = ({ activeClass, isMobile, navigationTarget, onNavigationHandled }) => {
    const classId = activeClass?.id;
    const handledNavigationRef = useRef(null);

    // 탭을 열면 "확인할 것"부터 보여준다. 전체 목록은 한 번 더 눌러서 본다.
    const [reviewFilter, setReviewFilter] = useState('unreviewed');
    const [viewMode, setViewMode] = useState('recent'); // 'recent' | 'student'

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

    useEffect(() => {
        const timerId = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
        return () => window.clearTimeout(timerId);
    }, [query]);

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
    }, [classId, reviewFilter, debouncedQuery]);

    const fetchPage = useCallback(async (offset) => {
        return supabase.rpc('get_teacher_reading_log_overview', {
            p_class_id: classId,
            p_review_filter: reviewFilter,
            p_student_id: studentFilter === 'all' ? null : studentFilter,
            p_query: debouncedQuery || null,
            p_limit: PAGE_SIZE,
            p_offset: offset
        });
    }, [classId, reviewFilter, studentFilter, debouncedQuery]);

    const recentKey = classKey(classId, 'reading-log-list', {
        filter: reviewFilter, student: studentFilter, q: debouncedQuery
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
        if (viewMode !== 'recent') return undefined;
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
            reviewed: acc.reviewed + row.reviewed_count,
            students: acc.students + (row.total_count > 0 ? 1 : 0)
        }), { ...EMPTY_COUNTS });
    }, [summary]);

    const shownCounts = viewMode === 'student'
        ? (summaryCounts || EMPTY_COUNTS)
        : counts;

    const filteredTotal = reviewFilter === 'unreviewed'
        ? shownCounts.unreviewed
        : reviewFilter === 'reviewed'
            ? shownCounts.reviewed
            : shownCounts.total;

    const hasMore = viewMode === 'recent'
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

    const countForFilter = useCallback((row) => (
        reviewFilter === 'unreviewed' ? row.unreviewed_count
            : reviewFilter === 'reviewed' ? row.reviewed_count
                : row.total_count
    ), [reviewFilter]);

    // 조건에 걸리는 글이 없는 학생은 접어 둔다. 전체 보기일 때는 "아직 안 쓴 학생"이라
    // 도움이 되는 정보라 이름은 남기고, 목록만 눌러서 펼치게 한다.
    const { activeRows, quietRows } = useMemo(() => {
        if (!summary) return { activeRows: [], quietRows: [] };
        const active = [];
        const quiet = [];
        summary.forEach((row) => {
            if (countForFilter(row) > 0) active.push(row);
            else quiet.push(row);
        });
        return { activeRows: active, quietRows: quiet };
    }, [summary, countForFilter]);

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
            p_review_filter: reviewFilter,
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
            const targetItem = navigationTarget.item;
            if (!targetItem?.post_id) {
                onNavigationHandled?.(requestId);
                return;
            }

            openDetail(targetItem).finally(() => onNavigationHandled?.(requestId));
        }, 0);

        return () => window.clearTimeout(timerId);
    }, [navigationTarget, onNavigationHandled, openDetail]);

    const saveReview = async (teacherComment) => {
        if (!selected) return;
        if (!teacherComment.trim() && detail?.review?.teacher_comment) {
            const shouldClear = window.confirm('저장된 선생님 한마디를 지우고, 확인 표시만 남길까요?');
            if (!shouldClear) return;
        }
        setSaving(true);
        const { data, error } = await supabase.rpc('save_teacher_reading_log_review', {
            p_post_id: selected.post_id,
            p_teacher_comment: teacherComment
        });
        setSaving(false);

        if (error) {
            console.error('독서록 확인 저장 실패:', error.message);
            alert('확인 내용을 저장하지 못했습니다.');
            return;
        }

        const savedReview = {
            review_status: data?.review_status || (teacherComment.trim() ? 'commented' : 'checked'),
            teacher_comment: data?.teacher_comment || '',
            reviewed_at: data?.reviewed_at || new Date().toISOString()
        };
        setDetail((current) => current ? { ...current, review: savedReview } : current);
        setSelected((current) => current ? { ...current, review_status: savedReview.review_status } : current);
        setComment(savedReview.teacher_comment);
        await refresh();
    };

    const filteredTitle = useMemo(() => {
        if (reviewFilter === 'unreviewed') return '아직 확인하지 않은 독서록';
        if (reviewFilter === 'reviewed') return '확인한 독서록';
        return '전체 독서록';
    }, [reviewFilter]);

    const renderRow = (item) => (
        <button key={item.post_id} type="button" className="teacher-reading-row" onClick={() => openDetail(item)}>
            <div className="teacher-reading-student"><span>👤</span><strong>{item.student_name || '이름 없음'}</strong></div>
            <div className="teacher-reading-title">
                <strong>{item.title || '제목 없는 독서록'}</strong>
                <small>『{item.book_title || '책 정보 없음'}』 · {formatDate(item.updated_at)}</small>
            </div>
            <span className={`teacher-reading-status ${item.review_status}`}>{reviewLabel(item.review_status)}</span>
            <span className="teacher-reading-open">내용 보기 ›</span>
        </button>
    );

    const renderEmpty = () => {
        if (reviewFilter === 'unreviewed' && !debouncedQuery && studentFilter === 'all' && shownCounts.total > 0) {
            return (
                <div className="teacher-reading-empty done">
                    <strong>모두 확인했어요! 👏</strong>
                    <p>새로 올라온 독서록이 없습니다.</p>
                    <Button variant="ghost" size="sm" onClick={() => setReviewFilter('all')}>
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
                    <p>점수나 승인 없이 읽어보고, 확인 표시와 짧은 한마디만 남길 수 있어요.</p>
                </div>
                <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>새로고침</Button>
            </header>

            <div className="teacher-reading-stats">
                <button type="button" className={reviewFilter === 'unreviewed' ? 'active warning' : ''} onClick={() => setReviewFilter('unreviewed')}>
                    <strong>{shownCounts.unreviewed}</strong><span>🕓 미확인</span>
                </button>
                <button type="button" className={reviewFilter === 'reviewed' ? 'active success' : ''} onClick={() => setReviewFilter('reviewed')}>
                    <strong>{shownCounts.reviewed}</strong><span>✅ 확인 완료</span>
                </button>
                <button type="button" className={reviewFilter === 'all' ? 'active' : ''} onClick={() => setReviewFilter('all')}>
                    <strong>{shownCounts.total}</strong><span>전체 독서록</span>
                </button>
                <div><strong>{shownCounts.students}</strong><span>작성 학생</span></div>
            </div>

            <div className="teacher-reading-viewtabs" role="tablist" aria-label="목록 보는 방법">
                <button
                    type="button" role="tab" aria-selected={viewMode === 'recent'}
                    className={viewMode === 'recent' ? 'active' : ''}
                    onClick={() => setViewMode('recent')}
                >🕘 최신순</button>
                <button
                    type="button" role="tab" aria-selected={viewMode === 'student'}
                    className={viewMode === 'student' ? 'active' : ''}
                    onClick={() => { setStudentFilter('all'); setViewMode('student'); }}
                >👥 학생별</button>
            </div>

            <div className={`teacher-reading-filters ${viewMode === 'student' ? 'is-wide' : ''}`}>
                <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="학생 이름·독서록 제목·책 제목 검색"
                    aria-label="독서록 검색"
                />
                {viewMode === 'recent' && (
                    <select value={studentFilter} onChange={(event) => setStudentFilter(event.target.value)} aria-label="학생 선택">
                        <option value="all">전체 학생</option>
                        {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                    </select>
                )}
            </div>

            <div className="teacher-reading-list-heading">
                <h3>{viewMode === 'student' ? '학생별 현황' : filteredTitle}</h3>
                <small>
                    {viewMode === 'student'
                        ? '이름을 누르면 그 학생이 쓴 글이 펼쳐져요.'
                        : '글을 선택하면 전체 내용을 크게 볼 수 있어요.'}
                </small>
            </div>

            {loading ? (
                <div className="teacher-reading-empty">독서록 목록을 불러오는 중... 📖</div>
            ) : loadError ? (
                <div className="teacher-reading-empty error">{loadError}</div>
            ) : viewMode === 'student' ? (
                activeRows.length === 0 && quietRows.length === 0 ? (
                    <div className="teacher-reading-empty">이 학급에 학생이 아직 없어요.</div>
                ) : (
                    <div className="teacher-reading-list">
                        {activeRows.length === 0 && renderEmpty()}

                        {activeRows.map((row) => (
                            <div key={row.student_id} className="teacher-reading-group">
                                <button
                                    type="button"
                                    className="teacher-reading-grouprow"
                                    onClick={() => toggleStudent(row.student_id)}
                                    aria-expanded={expandedId === row.student_id}
                                >
                                    <span className="teacher-reading-caret">{expandedId === row.student_id ? '▾' : '▸'}</span>
                                    <strong>{row.student_name}</strong>
                                    <span className="teacher-reading-groupmeta">
                                        {countForFilter(row)}편
                                        {row.unreviewed_count > 0 && (
                                            <em className="teacher-reading-unread">미확인 {row.unreviewed_count}</em>
                                        )}
                                    </span>
                                    <small>{row.last_written_at ? `최근 ${formatDate(row.last_written_at)}` : ''}</small>
                                </button>

                                {expandedId === row.student_id && (
                                    studentLogsLoading === row.student_id ? (
                                        <div className="teacher-reading-grouploading">불러오는 중... 📖</div>
                                    ) : (
                                        <div className="teacher-reading-sublist">
                                            {(studentLogs.get(row.student_id) || []).map(renderRow)}
                                        </div>
                                    )
                                )}
                            </div>
                        ))}

                        {quietRows.length > 0 && (
                            <div className="teacher-reading-quiet">
                                <button type="button" onClick={() => setShowQuietStudents((v) => !v)} aria-expanded={showQuietStudents}>
                                    <span>{showQuietStudents ? '▾' : '▸'}</span>
                                    {reviewFilter === 'all'
                                        ? `아직 독서록을 쓰지 않은 학생 ${quietRows.length}명`
                                        : `해당하는 글이 없는 학생 ${quietRows.length}명`}
                                </button>
                                {showQuietStudents && (
                                    <p>{quietRows.map((row) => row.student_name).join(' · ')}</p>
                                )}
                            </div>
                        )}
                    </div>
                )
            ) : items.length === 0 ? (
                renderEmpty()
            ) : (
                <>
                    <div className="teacher-reading-list">
                        {items.map(renderRow)}
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
                            <button type="button" onClick={() => setSelected(null)} disabled={saving} aria-label="닫기">×</button>
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
                                <section className="teacher-reading-review-box">
                                    <div>
                                        <h3>선생님 확인</h3>
                                        <span>{reviewLabel(detail.review?.review_status)}</span>
                                    </div>
                                    <textarea
                                        value={comment}
                                        onChange={(event) => setComment(event.target.value.slice(0, 500))}
                                        placeholder="학생에게 전할 짧은 한마디를 적어주세요. (선택)"
                                        rows={isMobile ? 4 : 3}
                                        disabled={saving}
                                    />
                                    <small>{comment.length}/500 · 학생의 나의 책장에 표시됩니다.</small>
                                    <div className="teacher-reading-review-actions">
                                        <Button variant="ghost" onClick={() => saveReview('')} disabled={saving}>
                                            {saving ? '저장 중...' : '확인했어요만 표시'}
                                        </Button>
                                        <Button onClick={() => saveReview(comment.trim())} disabled={saving || !comment.trim()}>
                                            한마디 저장하기 💬
                                        </Button>
                                    </div>
                                </section>
                            </>
                        )}
                    </article>
                </div>
            )}

            <style>{`
                .teacher-reading-manager { width:100%; padding:28px; box-sizing:border-box; border:1px solid #E2E8F0; border-radius:26px; background:white; box-shadow:0 8px 26px rgba(15,23,42,.04); }
                .teacher-reading-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }
                .teacher-reading-kicker { color:#2563EB; font-size:.78rem; font-weight:900; }
                .teacher-reading-header h2 { margin:7px 0; color:#1E293B; font-size:1.7rem; }
                .teacher-reading-header p { margin:0; color:#64748B; }
                .teacher-reading-stats { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:12px; margin:26px 0 18px; }
                .teacher-reading-stats > * { display:flex; flex-direction:column; align-items:flex-start; gap:4px; padding:16px 18px; border:1px solid #E2E8F0; border-radius:16px; background:#F8FAFC; color:#64748B; text-align:left; }
                .teacher-reading-stats button { cursor:pointer; }
                .teacher-reading-stats button.active { border-color:#93C5FD; background:#EFF6FF; color:#1D4ED8; }
                .teacher-reading-stats button.active.warning { border-color:#FCD34D; background:#FFFBEB; color:#B45309; }
                .teacher-reading-stats button.active.success { border-color:#86EFAC; background:#F0FDF4; color:#15803D; }
                .teacher-reading-stats strong { font-size:1.55rem; color:inherit; }
                .teacher-reading-stats span { font-size:.78rem; font-weight:800; }
                .teacher-reading-viewtabs { display:inline-flex; gap:4px; margin-bottom:12px; padding:4px; border-radius:14px; background:#F1F5F9; }
                .teacher-reading-viewtabs button { padding:9px 16px; border:0; border-radius:11px; background:transparent; color:#64748B; font-weight:900; font-size:.85rem; cursor:pointer; }
                .teacher-reading-viewtabs button.active { background:white; color:#1D4ED8; box-shadow:0 1px 4px rgba(15,23,42,.12); }
                .teacher-reading-filters { display:grid; grid-template-columns:minmax(0, 1fr) 220px; gap:10px; padding:14px; border-radius:16px; background:#F8FAFC; }
                .teacher-reading-filters.is-wide { grid-template-columns:minmax(0, 1fr); }
                .teacher-reading-filters input, .teacher-reading-filters select { width:100%; padding:12px 14px; border:1px solid #CBD5E1; border-radius:12px; background:white; color:#334155; box-sizing:border-box; }
                .teacher-reading-list-heading { display:flex; align-items:flex-end; justify-content:space-between; margin:24px 2px 10px; }
                .teacher-reading-list-heading h3 { margin:0; color:#334155; }
                .teacher-reading-list-heading small { color:#94A3B8; }
                .teacher-reading-list { display:flex; flex-direction:column; border-top:1px solid #E2E8F0; }
                .teacher-reading-row { display:grid; grid-template-columns:150px minmax(0, 1fr) 130px 84px; align-items:center; gap:14px; width:100%; padding:17px 12px; border:0; border-bottom:1px solid #E2E8F0; background:white; text-align:left; cursor:pointer; }
                .teacher-reading-row:hover { background:#F8FAFC; }
                .teacher-reading-student { display:flex; align-items:center; gap:8px; color:#334155; }
                .teacher-reading-title { min-width:0; display:flex; flex-direction:column; gap:5px; }
                .teacher-reading-title strong { overflow:hidden; color:#1E293B; text-overflow:ellipsis; white-space:nowrap; }
                .teacher-reading-title small { overflow:hidden; color:#94A3B8; text-overflow:ellipsis; white-space:nowrap; }
                .teacher-reading-status { justify-self:start; padding:6px 9px; border-radius:9px; background:#F1F5F9; color:#64748B; font-size:.72rem; font-weight:900; }
                .teacher-reading-status.checked { background:#F0FDF4; color:#15803D; }
                .teacher-reading-status.commented { background:#F5F3FF; color:#6D28D9; }
                .teacher-reading-open { justify-self:end; color:#2563EB; font-size:.8rem; font-weight:900; }
                .teacher-reading-group { border-bottom:1px solid #E2E8F0; }
                .teacher-reading-grouprow { display:grid; grid-template-columns:22px 150px minmax(0, 1fr) auto; align-items:center; gap:12px; width:100%; padding:16px 12px; border:0; background:white; text-align:left; cursor:pointer; }
                .teacher-reading-grouprow:hover { background:#F8FAFC; }
                .teacher-reading-grouprow[aria-expanded="true"] { background:#F8FAFC; }
                .teacher-reading-caret { color:#94A3B8; font-size:.9rem; }
                .teacher-reading-grouprow strong { color:#1E293B; }
                .teacher-reading-groupmeta { display:flex; align-items:center; gap:8px; color:#64748B; font-size:.85rem; font-weight:800; }
                .teacher-reading-unread { padding:4px 8px; border-radius:8px; background:#FFFBEB; color:#B45309; font-style:normal; font-size:.74rem; font-weight:900; }
                .teacher-reading-grouprow small { color:#94A3B8; font-size:.78rem; }
                .teacher-reading-grouploading { padding:18px 12px 18px 46px; color:#94A3B8; font-size:.88rem; }
                .teacher-reading-sublist { padding-left:34px; border-top:1px solid #E2E8F0; background:#FCFDFE; }
                .teacher-reading-sublist .teacher-reading-row:last-child { border-bottom:0; }
                .teacher-reading-sublist .teacher-reading-row { background:transparent; }
                .teacher-reading-quiet { padding:16px 12px; }
                .teacher-reading-quiet button { display:flex; align-items:center; gap:8px; padding:0; border:0; background:transparent; color:#64748B; font-size:.85rem; font-weight:800; cursor:pointer; }
                .teacher-reading-quiet button span { color:#94A3B8; }
                .teacher-reading-quiet p { margin:10px 0 0 20px; color:#94A3B8; font-size:.85rem; line-height:1.8; }
                .teacher-reading-more { display:flex; justify-content:center; padding:18px 0 4px; }
                .teacher-reading-empty { padding:70px 20px; border:2px dashed #CBD5E1; border-radius:18px; color:#94A3B8; text-align:center; }
                .teacher-reading-empty.error { border-color:#FECACA; color:#B91C1C; background:#FEF2F2; }
                .teacher-reading-empty.done { border-color:#BBF7D0; background:#F0FDF4; color:#15803D; }
                .teacher-reading-empty.done strong { display:block; font-size:1.15rem; }
                .teacher-reading-empty.done p { margin:8px 0 16px; color:#3F8F5F; }
                .teacher-reading-modal-backdrop { position:fixed; inset:0; z-index:2700; display:flex; align-items:center; justify-content:center; padding:24px; background:rgba(15,23,42,.62); }
                .teacher-reading-modal { width:min(1040px, 100%); max-height:92vh; overflow-y:auto; border-radius:26px; background:white; box-shadow:0 30px 90px rgba(15,23,42,.32); }
                .teacher-reading-modal > header { position:sticky; top:0; z-index:1; display:flex; justify-content:space-between; gap:18px; padding:24px 28px; border-bottom:1px solid #E2E8F0; background:white; }
                .teacher-reading-modal > header span { color:#64748B; font-size:.84rem; font-weight:800; }
                .teacher-reading-modal > header h2 { margin:6px 0 0; color:#1E293B; }
                .teacher-reading-modal > header button { width:38px; height:38px; border:0; border-radius:50%; background:#F1F5F9; color:#64748B; cursor:pointer; font-size:1.7rem; }
                .teacher-reading-detail-loading { padding:100px 24px; text-align:center; color:#94A3B8; }
                .teacher-reading-detail-meta { display:flex; justify-content:space-between; gap:12px; padding:18px 30px 0; color:#64748B; font-size:.82rem; font-weight:800; }
                .teacher-reading-content { min-height:260px; margin:18px 30px 24px; padding:34px; border:1px solid #E2E8F0; border-radius:20px; background:#FFFEFA; color:#334155; font-size:1.08rem; line-height:1.9; white-space:pre-wrap; overflow-wrap:anywhere; }
                .teacher-reading-review-box { margin:0 30px 30px; padding:22px; border-radius:20px; background:#EFF6FF; }
                .teacher-reading-review-box > div:first-child { display:flex; align-items:center; justify-content:space-between; gap:12px; }
                .teacher-reading-review-box h3 { margin:0; color:#1E3A8A; }
                .teacher-reading-review-box > div:first-child span { color:#475569; font-size:.8rem; font-weight:900; }
                .teacher-reading-review-box textarea { width:100%; margin-top:14px; padding:14px; border:1px solid #BFDBFE; border-radius:13px; box-sizing:border-box; resize:vertical; color:#334155; font:inherit; line-height:1.6; }
                .teacher-reading-review-box > small { display:block; margin-top:6px; color:#64748B; text-align:right; }
                .teacher-reading-review-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:14px; }
                @media (max-width: 760px) {
                    .teacher-reading-manager { padding:18px 14px; border-radius:20px; }
                    .teacher-reading-header { flex-direction:column; }
                    .teacher-reading-stats { grid-template-columns:repeat(2, minmax(0, 1fr)); }
                    .teacher-reading-filters, .teacher-reading-filters.is-wide { grid-template-columns:1fr; }
                    .teacher-reading-viewtabs { display:grid; grid-template-columns:1fr 1fr; }
                    .teacher-reading-list-heading { align-items:flex-start; flex-direction:column; gap:5px; }
                    .teacher-reading-row { grid-template-columns:minmax(0, 1fr) auto; gap:8px; padding:16px 8px; }
                    .teacher-reading-student { grid-column:1; }
                    .teacher-reading-title { grid-column:1 / -1; grid-row:2; }
                    .teacher-reading-status { grid-column:2; grid-row:1; }
                    .teacher-reading-open { display:none; }
                    .teacher-reading-grouprow { grid-template-columns:20px minmax(0, 1fr) auto; gap:8px; padding:14px 8px; }
                    .teacher-reading-grouprow small { display:none; }
                    .teacher-reading-sublist { padding-left:14px; }
                    .teacher-reading-modal-backdrop { padding:0; }
                    .teacher-reading-modal { width:100%; height:100%; max-height:none; border-radius:0; }
                    .teacher-reading-modal > header { padding:18px; }
                    .teacher-reading-detail-meta { flex-direction:column; padding:16px 18px 0; }
                    .teacher-reading-content { margin:14px 18px 20px; padding:22px 18px; }
                    .teacher-reading-review-box { margin:0 18px 24px; padding:18px; }
                    .teacher-reading-review-actions { flex-direction:column-reverse; }
                    .teacher-reading-review-actions button { width:100%; }
                }
            `}</style>
        </section>
    );
};

export default TeacherReadingLogManager;
