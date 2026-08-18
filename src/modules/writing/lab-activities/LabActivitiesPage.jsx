import { useCallback, useEffect, useState } from 'react';
import Card from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import { labActivitiesApi } from './api';
import './LabActivitiesPage.css';
import StudentBackButton from '../../../components/student/StudentBackButton';

const ACTIVITY_META = Object.freeze({
    outline_builder: { icon: '🧩', label: '글 개요 짜기', tone: 'amber' },
    question_generator: { icon: '❓', label: '질문 만들기', tone: 'sky' },
    question_voting: { icon: '🗳️', label: '좋은 질문 고르기', tone: 'violet' },
    one_line_share: { icon: '💬', label: '한줄모아', tone: 'rose' },
    hanja_writing: { icon: '📜', label: '한자 활용 문장 만들기', tone: 'orange' }
});

const STATUS_META = Object.freeze({
    not_started: { label: '시작 전', action: '활동 시작' },
    in_progress: { label: '활동 중', action: '이어서 하기' },
    done: { label: '완료', action: '결과 보기' }
});

const formatExpiry = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
};

const LabActivitiesPage = ({ onBack }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState(null);

    const loadActivities = useCallback(async ({ append = false, before = null } = {}) => {
        if (append) setLoadingMore(true);
        else setLoading(true);
        setError('');

        try {
            const page = await labActivitiesApi.list({ limit: 20, before });
            setItems((current) => {
                if (!append) return page.items;
                const knownIds = new Set(current.map((item) => item.id));
                return [...current, ...page.items.filter((item) => !knownIds.has(item.id))];
            });
            setHasMore(page.hasMore);
            setNextCursor(page.nextCursor);
        } catch {
            setError('우리 반 연구소 활동을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    useEffect(() => {
        void loadActivities();
    }, [loadActivities]);

    // 머리말에 보여 줄 요약. 목록을 이미 받아 왔으므로 따로 조회하지 않는다(성능 계약).
    // 더 불러오기 전이면 화면에 있는 것만 세므로 `hasMore` 일 때는 `+` 를 붙여 정확히 말한다.
    const openCount = items.filter((item) => item.status !== 'done').length;
    const doneCount = items.filter((item) => item.status === 'done').length;

    const openActivity = (activityId) => {
        window.location.assign(`/lab/room/${encodeURIComponent(activityId)}`);
    };

    return (
        <Card
            className="lab-activities-page"
            style={{
                maxWidth: '820px',
                minHeight: 'min(760px, 100vh)',
                margin: '0 auto',
                padding: 'var(--lab-activities-page-padding)',
                background: 'var(--ui-page)',
                boxShadow: 'none',
                overflow: 'visible'
            }}
        >
            {/* 뒤로가기는 제목 카드 밖 맨 위에 둔다 — 일기·독서록과 같은 자리다.
                이 화면만 카드 안 왼쪽 칸에 있어서 다른 창을 오가면 버튼이 움직여 보였다. */}
            <StudentBackButton onClick={onBack} disabled={loading} className="lab-activities-page__back" />

            <header className="lab-activities-page__header">
                <span className="lab-activities-page__crest" aria-hidden="true">🔬</span>
                <div className="lab-activities-page__heading">
                    <span className="lab-activities-page__eyebrow">우리 반 글쓰기 활동</span>
                    <h1>글쓰기 연구소</h1>
                </div>
                <button
                    type="button"
                    className="lab-activities-page__refresh"
                    onClick={() => void loadActivities()}
                    disabled={loading}
                >
                    <span aria-hidden="true">⟳</span>
                    새로 고침
                </button>

                {/* 활동이 있을 때만 요약 띠를 보여 준다. 빈 화면에 0만 세 개 뜨면 초라하다. */}
                {!loading && !error && items.length > 0 && (
                    <div className="lab-activities-page__stats">
                        <div>
                            <span>참여할 활동</span>
                            <strong>{openCount}{hasMore ? '+' : ''}</strong>
                        </div>
                        <div>
                            <span>끝낸 활동</span>
                            <strong>{doneCount}{hasMore ? '+' : ''}</strong>
                        </div>
                    </div>
                )}
            </header>

            {loading ? (
                <div className="lab-activities-page__state" role="status">
                    <span aria-hidden="true">🧪</span>
                    <strong>우리 반 활동을 찾고 있어요</strong>
                </div>
            ) : error ? (
                <div className="lab-activities-page__state lab-activities-page__state--error" role="alert">
                    <span aria-hidden="true">⚠️</span>
                    <strong>{error}</strong>
                    <button type="button" onClick={() => void loadActivities()}>다시 불러오기</button>
                </div>
            ) : items.length === 0 ? (
                <div className="lab-activities-page__state">
                    <span aria-hidden="true">🌱</span>
                    <strong>지금 참여할 활동이 없어요</strong>
                    <p>선생님이 활동을 열면 이곳에 바로 나타납니다.</p>
                </div>
            ) : (
                <div className="lab-activities-page__list">
                    {items.map((item) => {
                        const activityMeta = ACTIVITY_META[item.activityType] || ACTIVITY_META.outline_builder;
                        const statusMeta = STATUS_META[item.status] || STATUS_META.not_started;
                        const expiry = formatExpiry(item.expiresAt);

                        return (
                            <article key={item.id} className={`lab-activity-card tone-${activityMeta.tone}`}>
                                <div className="lab-activity-card__icon" aria-hidden="true">{activityMeta.icon}</div>
                                <div className="lab-activity-card__body">
                                    <div className="lab-activity-card__badges">
                                        <span>{activityMeta.label}</span>
                                        <em data-status={item.status}>{statusMeta.label}</em>
                                    </div>
                                    <h2>{item.title}</h2>
                                    {item.topic && <p>주제: {item.topic}</p>}
                                    {expiry && <small>{expiry}까지 참여할 수 있어요</small>}
                                </div>
                                <button type="button" onClick={() => openActivity(item.id)}>
                                    {statusMeta.action}
                                    <span aria-hidden="true">›</span>
                                </button>
                            </article>
                        );
                    })}
                </div>
            )}

            {hasMore && !loading && !error && (
                <button
                    type="button"
                    className="lab-activities-page__more"
                    onClick={() => void loadActivities({ append: true, before: nextCursor })}
                    disabled={loadingMore || !nextCursor}
                >
                    {loadingMore ? '더 불러오는 중…' : '이전 활동 더 보기'}
                </button>
            )}
        </Card>
    );
};

export default LabActivitiesPage;
