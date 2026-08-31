import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { pointApi } from '../../modules/points/pointApi';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';
import StudentModuleGuide from './StudentModuleGuide';
import './AgitPlayground.css';

/**
 * 아지트 놀이터 — 포인트 잔액·내역과 획득/사용 콘텐츠를 한곳에서 찾는 학생용 허브.
 * 교사가 켠 게임 모듈은 매니페스트의 playground.economy 분류에 따라 자동 배치한다.
 */

const SECTION_DEFINITIONS = Object.freeze([
    {
        id: 'earn',
        icon: '✨',
        title: '포인트 모으기',
        description: '활동에 도전하고 포인트를 차곡차곡 모아 보세요.'
    },
    {
        id: 'spend',
        icon: '🎁',
        title: '포인트 쓰기',
        description: '모은 포인트로 나만의 아지트를 더 즐겁게 꾸며 보세요.'
    }
]);

const ACTIVITY_LABELS = Object.freeze({
    writing_reward: '글쓰기 보상',
    meeting_activity: '학급 활동',
    vocab_tower: '어휘의 탑',
    dragon_care: '수호룡 돌보기',
    hideout_purchase: '아지트 꾸미기',
    starting_bonus: '첫 포인트',
    title_reward: '칭호 단계 보상',
    comment_reward: '친구 댓글 보상 · 이전 기록',
    private_adjustment: '선생님 포인트 조정'
});

const formatPoints = (value) => Number(value || 0).toLocaleString('ko-KR');

const getDateKey = (date) => (
    `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
);

const formatHistoryTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
};

const getHistoryGroupLabel = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '이전 내역';

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const key = getDateKey(date);
    if (key === getDateKey(today)) return '오늘';
    if (key === getDateKey(yesterday)) return '어제';
    return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
};

const groupHistory = (logs) => logs.reduce((groups, log) => {
    const label = getHistoryGroupLabel(log.created_at);
    const lastGroup = groups.at(-1);
    if (lastGroup?.label === label) {
        lastGroup.items.push(log);
        return groups;
    }
    groups.push({ label, items: [log] });
    return groups;
}, []);

const getHistoryReason = (log) => (
    log.activity_type === 'comment_reward'
        ? ACTIVITY_LABELS.comment_reward
        : (log.reason || ACTIVITY_LABELS[log.activity_type] || '포인트 활동')
);

/**
 * 카드 전체가 콘텐츠를 여는 버튼이므로, 안내 버튼은 그 **안에 넣을 수 없다**(버튼 중첩 금지).
 * 바깥 상자를 두고 여는 버튼과 안내 버튼을 형제로 둔다.
 */
const PlaygroundCard = ({ item, onOpen }) => (
    <div
        // 도움말이 있는 카드만 오른쪽 위 자리를 비운다(`포인트 모으기` 알약과 겹치지 않게).
        className={`agit-playground-card-shell${item.guide ? ' has-guide' : ''}`}
        style={{
            '--playground-card-soft': item.background || 'var(--ui-primary-soft)',
            '--playground-card-border': item.borderColor || 'var(--ui-primary-border)'
        }}
    >
        <button
            type="button"
            className="agit-playground-card"
            onClick={() => onOpen(item)}
        >
            <span className="agit-playground-card__icon" aria-hidden="true">{item.icon}</span>
            <span className="agit-playground-card__body">
                {/* `포인트 모으기 / 포인트 쓰기` 알약은 뺐다 — 바로 위 섹션 제목과 같은 말이라
                    중복이고, 그 자리를 비워야 도움말 버튼이 제대로 보인다. */}
                <span className="agit-playground-card__meta">
                    <strong>{item.name}</strong>
                </span>
                <small>{item.badge || item.description}</small>
            </span>
            <span className="agit-playground-card__cta">
                {item.ctaLabel}
                <span aria-hidden="true">›</span>
            </span>
        </button>
        {/* 카드 자체가 <button> 이라 그 안에 버튼을 중첩할 수 없다(HTML 위반).
            형제로 두고 카드 위 오른쪽에 겹쳐 놓아 "이 카드의 도움말"로 읽히게 한다.
            섹션 제목 옆에 두면 `포인트 모으기` 전체 설명처럼 보인다. */}
        {item.guide && (
            <StudentModuleGuide guide={item.guide} className="agit-playground-card__guide" />
        )}
    </div>
);

const PointHistory = ({ state, onRetry }) => {
    if (state.status === 'loading') {
        return <p className="agit-point-history__state" role="status">최근 포인트 내역을 불러오고 있어요.</p>;
    }
    if (state.status === 'error') {
        return (
            <div className="agit-point-history__state is-error" role="alert">
                <p>{state.message}</p>
                <button type="button" onClick={onRetry}>다시 불러오기</button>
            </div>
        );
    }
    if (state.status === 'success' && state.items.length === 0) {
        return <p className="agit-point-history__state">아직 포인트 내역이 없어요. 첫 활동에 도전해 보세요!</p>;
    }

    const groups = groupHistory(state.items);
    return groups.map((group) => (
        <section key={group.label} className="agit-point-history__group" aria-label={`${group.label} 포인트 내역`}>
            <h4>{group.label}</h4>
            <ul>
                {group.items.map((log) => {
                    const amount = Number(log.amount || 0);
                    const positive = amount > 0;
                    return (
                        <li key={log.id}>
                            <span className={`agit-point-history__amount ${positive ? 'is-earned' : 'is-spent'}`}>
                                {positive ? '+' : ''}{formatPoints(amount)}P
                            </span>
                            <span className="agit-point-history__reason">
                                <strong>{getHistoryReason(log)}</strong>
                                <small>{formatHistoryTime(log.created_at)}</small>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    ));
};

const AgitPlayground = ({ isOpen, onClose, points = 0, items = [] }) => {
    const reduceMotion = useReducedMotion();
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyState, setHistoryState] = useState({ status: 'idle', items: [], message: '' });
    const historyRequestRef = useRef(null);
    const historyGenerationRef = useRef(0);

    // onClose 는 부모에서 인라인 화살표로 넘어와 매 렌더 새 함수다.
    // 의존성에 두면 부모가 리렌더될 때마다 pushState 가 쌓인다.
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;
        window.history.pushState({ studentPage: 'main', overlay: 'playground' }, '');
        const closeOnBack = () => {
            historyGenerationRef.current += 1;
            historyRequestRef.current = null;
            setHistoryOpen(false);
            setHistoryState({ status: 'idle', items: [], message: '' });
            onCloseRef.current?.();
        };
        window.addEventListener('popstate', closeOnBack);
        return () => window.removeEventListener('popstate', closeOnBack);
    }, [isOpen]);

    const resetHistory = () => {
        historyGenerationRef.current += 1;
        historyRequestRef.current = null;
        setHistoryOpen(false);
        setHistoryState({ status: 'idle', items: [], message: '' });
    };

    const handleClose = () => {
        resetHistory();
        onClose?.();
    };

    const handleOpenItem = (item) => {
        resetHistory();
        item.onOpen();
    };

    const loadHistory = async () => {
        if (historyRequestRef.current) return historyRequestRef.current;
        const generation = historyGenerationRef.current;
        setHistoryState((current) => ({ ...current, status: 'loading', message: '' }));

        const request = pointApi.getMyHistory({ limit: 20 })
            .then((data) => {
                if (generation !== historyGenerationRef.current) return;
                setHistoryState({ status: 'success', items: data?.items || [], message: '' });
            })
            .catch((error) => {
                if (generation !== historyGenerationRef.current) return;
                console.error('학생 포인트 내역 로드 실패:', error.message);
                setHistoryState({
                    status: 'error',
                    items: [],
                    message: '포인트 내역을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
                });
            })
            .finally(() => {
                if (historyRequestRef.current === request) historyRequestRef.current = null;
            });
        historyRequestRef.current = request;
        return request;
    };

    const toggleHistory = () => {
        const shouldOpen = !historyOpen;
        setHistoryOpen(shouldOpen);
        if (shouldOpen && historyState.status === 'idle') loadHistory();
    };

    if (!isOpen) return null;

    const groupedItems = SECTION_DEFINITIONS.map((section) => ({
        ...section,
        items: items.filter((item) => item.economy === section.id)
    })).filter((section) => section.items.length > 0);

    return (
        <ModalPortal>
            <motion.div
                className="agit-playground"
                initial={reduceMotion ? false : { x: '100%' }}
                animate={{ x: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 210 }}
            >
                <div className="agit-playground__shell">
                    <header className="agit-playground__header">
                        <div>
                            <span>나의 포인트 생활</span>
                            <h2>🎡 아지트 놀이터</h2>
                            <p>포인트를 모으고, 원하는 곳에 즐겁게 사용해 보세요.</p>
                        </div>
                        <ModalCloseButton onClick={handleClose} label="아지트 놀이터 닫기" />
                    </header>

                    <section className="agit-point-wallet" aria-labelledby="agit-point-wallet-title">
                        <span className="agit-point-wallet__icon" aria-hidden="true">⭐</span>
                        <span className="agit-point-wallet__balance">
                            <small id="agit-point-wallet-title">내 포인트</small>
                            <strong>{formatPoints(points)}P</strong>
                            <em>글쓰기와 놀이 활동으로 모을 수 있어요.</em>
                        </span>
                        <button
                            type="button"
                            className="agit-point-wallet__history-button"
                            onClick={toggleHistory}
                            aria-expanded={historyOpen}
                            aria-controls="agit-point-history"
                        >
                            {historyOpen ? '내역 접기' : '내역 보기'}
                            <span aria-hidden="true">{historyOpen ? '⌃' : '›'}</span>
                        </button>
                    </section>

                    {historyOpen && (
                        <section id="agit-point-history" className="agit-point-history" aria-labelledby="agit-point-history-title">
                            <header>
                                <div>
                                    <h3 id="agit-point-history-title">최근 포인트 내역</h3>
                                    <p>가장 최근 활동부터 20개까지 보여 줘요.</p>
                                </div>
                            </header>
                            <PointHistory state={historyState} onRetry={loadHistory} />
                        </section>
                    )}

                    {items.length === 0 ? (
                        <div className="agit-playground__empty">
                            <span aria-hidden="true">🎠</span>
                            <strong>아직 열린 놀거리가 없어요.</strong>
                            <p>내 포인트는 그대로 보관돼요. 선생님이 콘텐츠를 켜 주시면 여기에 나타나요!</p>
                        </div>
                    ) : (
                        <div className="agit-playground__sections">
                            {groupedItems.map((section) => (
                                <section key={section.id} className={`agit-playground-section is-${section.id}`}>
                                    <header className="agit-playground-section__header">
                                        <span aria-hidden="true">{section.icon}</span>
                                        <div>
                                            <h3>{section.title}</h3>
                                            <p>{section.description}</p>
                                        </div>
                                    </header>
                                    <div className="agit-playground-section__cards">
                                        {section.items.map((item) => (
                                            <PlaygroundCard key={item.id} item={item} onOpen={handleOpenItem} />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </ModalPortal>
    );
};

export default AgitPlayground;
