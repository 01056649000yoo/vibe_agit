import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../../components/common/Button';
import Card from '../../../../components/common/Card';
import Modal from '../../../../components/common/Modal';
import { supabase } from '../../../../lib/supabaseClient';
import WritingPolicySettings from '../../policy/WritingPolicySettings';
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
    daily_reward_limit: 1
});

/**
 * 교사가 매일 쓰는 것만 담은 가벼운 일기 확인 화면.
 *
 * 독서록 교사 화면(898줄)을 복사하지 않았다. 그쪽은 책·책장 조인과 학생별 내보내기가 얽혀 있어
 * 일기에는 필요 없는 것을 끌고 온다. 여기서는 `미확인 → 읽기 → 확인·한마디` 하나만 한다.
 * 학생별 책장·내보내기는 실제로 써 보고 필요할 때 붙인다.
 */

const FILTERS = [
    { id: 'unreviewed', label: '확인 대기' },
    { id: 'reviewed', label: '확인함' },
    { id: 'all', label: '전체' }
];

const PAGE_SIZE = 50;

const formatDiaryDate = (value) => {
    if (!value) return '날짜 없음';
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year) return String(value);
    return `${year}. ${month}. ${day}.`;
};

const TeacherDiaryManager = ({ activeClass, isMobile }) => {
    const classId = activeClass?.id || null;
    // 매일 쓰는 `확인`을 기본으로 두고, 큰 설정 폼은 열 때만 마운트한다(독서록과 같은 구조).
    const [section, setSection] = useState('reviews');
    const [policyDirty, setPolicyDirty] = useState(false);
    const [filter, setFilter] = useState('unreviewed');
    const [overview, setOverview] = useState({ total: 0, pending_count: 0, items: [] });
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');
    const [selected, setSelected] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [comment, setComment] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        if (!classId) return;
        setLoading(true);
        setErrorMessage('');
        const { data, error } = await supabase.rpc('get_teacher_diary_overview', {
            p_class_id: classId,
            p_review_filter: filter,
            p_limit: PAGE_SIZE,
            p_offset: 0
        });
        if (error) {
            console.error('학생 일기 목록 불러오기 실패:', error.message);
            setErrorMessage('일기 목록을 불러오지 못했습니다.');
            setOverview({ total: 0, pending_count: 0, items: [] });
        } else {
            setOverview({
                total: Number(data?.total || 0),
                pending_count: Number(data?.pending_count || 0),
                items: Array.isArray(data?.items) ? data.items : []
            });
        }
        setLoading(false);
    }, [classId, filter]);

    useEffect(() => {
        if (!classId) return undefined;
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [classId, load]);

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

    const saveReview = async () => {
        if (!selected?.post_id) return;
        setSaving(true);
        const { data, error } = await supabase.rpc('save_teacher_self_writing_review', {
            p_post_id: selected.post_id,
            p_teacher_comment: comment
        });
        setSaving(false);
        if (error || !data?.success) {
            console.error('일기 확인 저장 실패:', error?.message || data?.error);
            alert(error?.message || '확인을 저장하지 못했습니다.');
            return;
        }
        setSelected(null);
        load();
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
        if (filter === 'unreviewed') return '확인을 기다리는 일기가 없어요. 모두 살펴보셨습니다. ✅';
        if (filter === 'reviewed') return '아직 확인한 일기가 없어요.';
        return '학생이 쓴 일기가 아직 없어요.';
    }, [filter]);

    return (
        <div className="teacher-diary">
            <header className="teacher-diary__header">
                <div>
                    <h2>📔 학생 일기</h2>
                    <p>학생이 하루에 한 편 남긴 일기를 읽고 한마디를 남겨요.</p>
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
                        title="일기 완료 조건과 포인트"
                        description="학생이 작성 완료할 때 분량과 하루 완료 편수를 확인합니다. 일기는 하루에 한 편이며 포인트는 그 날짜에 최초 한 번만 지급합니다."
                        onDirtyChange={setPolicyDirty}
                    />
                </div>
            ) : (<>
            <div className="teacher-diary__filters" role="tablist" aria-label="일기 확인 상태">
                {FILTERS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={filter === item.id}
                        className={filter === item.id ? 'is-active' : ''}
                        onClick={() => setFilter(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

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
                <div className={`teacher-diary__grid ${isMobile ? 'is-mobile' : ''}`}>
                    {overview.items.map((item) => (
                        <button
                            key={item.post_id}
                            type="button"
                            className={`teacher-diary__card ${item.review_status ? 'is-reviewed' : ''}`}
                            onClick={() => openDiary(item)}
                        >
                            <span className="teacher-diary__card-top">
                                <strong>{item.student_name}</strong>
                                <em>{formatDiaryDate(item.diary_date)}</em>
                            </span>
                            <span className="teacher-diary__card-title">{item.title || '제목 없는 일기'}</span>
                            <span className="teacher-diary__card-meta">
                                <span>{item.char_count || 0}자</span>
                                <span>{item.visibility === 'class' ? '📔 친구 공개' : '🔒 나만 보기'}</span>
                                <span className={item.review_status ? 'is-done' : 'is-pending'}>
                                    {item.review_status === 'commented' ? '💬 한마디 남김'
                                        : item.review_status === 'checked' ? '✅ 확인함'
                                            : '확인 대기'}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}

            </>)}

            <Modal
                isOpen={Boolean(selected)}
                onClose={() => setSelected(null)}
                title={selected ? `📔 ${selected.student_name || ''} · ${formatDiaryDate(selected.diary_date)}` : '📔 일기'}
                maxWidth="720px"
            >
                {detailLoading ? (
                    <p style={{ textAlign: 'center', padding: '32px' }}>일기를 펼치는 중...</p>
                ) : selected && (
                    <div className="teacher-diary__detail">
                        <h3>{selected.title || '제목 없는 일기'}</h3>
                        <p className="teacher-diary__content">{selected.content}</p>

                        <label className="teacher-diary__comment">
                            <span>선생님 한마디 <small>비워 두고 저장하면 확인만 표시돼요 (500자까지)</small></span>
                            <textarea
                                value={comment}
                                onChange={(event) => setComment(event.target.value)}
                                maxLength={500}
                                rows={4}
                                placeholder="아이의 하루에 짧게 답해 주세요..."
                                disabled={saving}
                            />
                        </label>

                        <div className="teacher-diary__actions">
                            <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>닫기</Button>
                            <Button onClick={saveReview} disabled={saving}>
                                {saving ? '저장하는 중...' : comment.trim() ? '한마디 남기기' : '확인만 하기'}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default TeacherDiaryManager;
