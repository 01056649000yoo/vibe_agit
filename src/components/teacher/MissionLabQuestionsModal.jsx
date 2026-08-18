import { useCallback, useEffect, useState } from 'react';
import { Check, CheckSquare, ChevronLeft, FlaskConical, Square, Vote } from 'lucide-react';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';
import Button from '../common/Button';
import { labReferenceApi } from '../../modules/writing/references/labReferenceApi';
import './MissionLabQuestionsModal.css';

const MissionLabQuestionsModal = ({ classId, onSelectQuestions, onClose }) => {
    const [rooms, setRooms] = useState([]);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState(new Set());
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [loadingQuestions, setLoadingQuestions] = useState(false);
    const [error, setError] = useState('');

    const loadRooms = useCallback(async () => {
        if (!classId) return;
        setLoadingRooms(true);
        setError('');
        try {
            const data = await labReferenceApi.listQuestionVotingRooms(classId);
            setRooms(data);
        } catch {
            setError('좋은 질문 고르기 활동 목록을 불러오지 못했습니다.');
        } finally {
            setLoadingRooms(false);
        }
    }, [classId]);

    const loadQuestions = useCallback(async (room) => {
        setSelectedRoom(room);
        setLoadingQuestions(true);
        setError('');
        setSelectedQuestionIds(new Set());
        try {
            const data = await labReferenceApi.getQuestionVotingRanking(classId, room.roomId);
            setQuestions(data);
            // 기본으로 득표수가 1표 이상인 질문들을 전부 선택 상태로 초기화
            const topIds = new Set(data.filter((q) => q.votes > 0).map((q) => q.questionId));
            if (topIds.size === 0 && data.length > 0) {
                topIds.add(data[0].questionId);
            }
            setSelectedQuestionIds(topIds);
        } catch {
            setError('활동의 질문 목록을 불러오지 못했습니다.');
        } finally {
            setLoadingQuestions(false);
        }
    }, [classId]);

    useEffect(() => {
        void loadRooms();
    }, [loadRooms]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose?.();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    const toggleQuestion = (questionId) => {
        setSelectedQuestionIds((prev) => {
            const next = new Set(prev);
            if (next.has(questionId)) {
                next.delete(questionId);
            } else {
                next.add(questionId);
            }
            return next;
        });
    };

    const toggleAllQuestions = () => {
        if (selectedQuestionIds.size === questions.length) {
            setSelectedQuestionIds(new Set());
        } else {
            setSelectedQuestionIds(new Set(questions.map((q) => q.questionId)));
        }
    };

    const handleApply = () => {
        const chosenTexts = questions
            .filter((q) => selectedQuestionIds.has(q.questionId))
            .map((q) => q.text)
            .filter(Boolean);

        if (chosenTexts.length > 0) {
            onSelectQuestions?.(chosenTexts);
        }
        onClose?.();
    };

    return (
        <ModalPortal>
            <div className="mission-lab-questions-overlay" onMouseDown={onClose}>
                <section
                    className="mission-lab-questions-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mission-lab-questions-title"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <header className="mission-lab-questions-header">
                        <div className="mission-lab-questions-title">
                            <span className="mission-lab-questions-icon" aria-hidden="true">
                                <Vote size={22} />
                            </span>
                            <div>
                                <h2 id="mission-lab-questions-title">
                                    {selectedRoom ? selectedRoom.title : '연구소 좋은 질문 불러오기'}
                                </h2>
                                <p className="mission-lab-questions-subtitle">
                                    {selectedRoom
                                        ? `주제: ${selectedRoom.topic || '없음'} · 참여 ${selectedRoom.participantCount}명`
                                        : '우리 반 학생들이 투표로 뽑은 좋은 질문을 미션 질문으로 가져옵니다.'}
                                </p>
                            </div>
                        </div>
                        <ModalCloseButton onClick={onClose} label="좋은 질문 불러오기 닫기" />
                    </header>

                    {error && (
                        <div className="mission-lab-questions-error" role="alert">
                            {error}
                        </div>
                    )}

                    <div className="mission-lab-questions-body">
                        {!selectedRoom ? (
                            /* 1단계: 좋은 질문 고르기 활동 목록 */
                            <div className="mission-lab-questions-rooms">
                                {loadingRooms ? (
                                    <div className="mission-lab-questions-loading">
                                        활동 목록을 불러오는 중입니다...
                                    </div>
                                ) : rooms.length === 0 ? (
                                    <div className="mission-lab-questions-empty">
                                        <FlaskConical size={36} aria-hidden="true" />
                                        <p>우리 반에서 진행된 &lsquo;좋은 질문 고르기&rsquo; 활동이 없습니다.</p>
                                        <span>글쓰기 연구소에서 활동을 먼저 진행해 주세요.</span>
                                    </div>
                                ) : (
                                    <div className="mission-lab-questions-room-list">
                                        {rooms.map((room) => (
                                            <button
                                                key={room.roomId}
                                                type="button"
                                                className="mission-lab-questions-room-card"
                                                onClick={() => void loadQuestions(room)}
                                            >
                                                <div className="mission-lab-questions-room-info">
                                                    <span className="mission-lab-questions-room-tag">좋은 질문 고르기</span>
                                                    <h4>{room.title}</h4>
                                                    {room.topic && <p>주제: {room.topic}</p>}
                                                </div>
                                                <div className="mission-lab-questions-room-meta">
                                                    <span className="mission-lab-questions-room-count">
                                                        질문 {room.questionCount}개 · 참여 {room.participantCount}명
                                                    </span>
                                                    <span className="mission-lab-questions-room-date">
                                                        {new Date(room.createdAt).toLocaleDateString('ko-KR')}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* 2단계: 선택된 활동의 질문 득표 순위 목록 */
                            <div className="mission-lab-questions-detail">
                                <div className="mission-lab-questions-detail-bar">
                                    <button
                                        type="button"
                                        className="mission-lab-questions-back-btn"
                                        onClick={() => setSelectedRoom(null)}
                                    >
                                        <ChevronLeft size={16} aria-hidden="true" />
                                        다른 활동 고르기
                                    </button>
                                    {questions.length > 0 && (
                                        <button
                                            type="button"
                                            className="mission-lab-questions-select-all"
                                            onClick={toggleAllQuestions}
                                        >
                                            {selectedQuestionIds.size === questions.length ? (
                                                <CheckSquare size={16} aria-hidden="true" />
                                            ) : (
                                                <Square size={16} aria-hidden="true" />
                                            )}
                                            전체 {selectedQuestionIds.size === questions.length ? '해제' : '선택'}
                                        </button>
                                    )}
                                </div>

                                {loadingQuestions ? (
                                    <div className="mission-lab-questions-loading">
                                        질문 순위를 집계하고 있습니다...
                                    </div>
                                ) : questions.length === 0 ? (
                                    <div className="mission-lab-questions-empty">
                                        <p>이 활동에 등록된 질문이 없습니다.</p>
                                    </div>
                                ) : (
                                    <div className="mission-lab-questions-ranking-list">
                                        {questions.map((q, idx) => {
                                            const isSelected = selectedQuestionIds.has(q.questionId);
                                            return (
                                                <div
                                                    key={q.questionId}
                                                    className={`mission-lab-question-item ${isSelected ? 'mission-lab-question-item--selected' : ''}`}
                                                    onClick={() => toggleQuestion(q.questionId)}
                                                    role="checkbox"
                                                    aria-checked={isSelected}
                                                    tabIndex={0}
                                                    onKeyDown={(e) => {
                                                        if (e.key === ' ' || e.key === 'Enter') {
                                                            e.preventDefault();
                                                            toggleQuestion(q.questionId);
                                                        }
                                                    }}
                                                >
                                                    <div className="mission-lab-question-rank">
                                                        <span className="mission-lab-question-rank-badge">{idx + 1}</span>
                                                        <span className="mission-lab-question-votes">
                                                            🗳️ {q.votes}표
                                                        </span>
                                                    </div>
                                                    <p className="mission-lab-question-text">{q.text}</p>
                                                    <div className="mission-lab-question-check">
                                                        {isSelected ? (
                                                            <span className="mission-lab-question-checked-box">
                                                                <Check size={14} />
                                                            </span>
                                                        ) : (
                                                            <span className="mission-lab-question-unchecked-box" />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <footer className="mission-lab-questions-footer">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            취소
                        </Button>
                        {selectedRoom && (
                            <Button
                                type="button"
                                variant="primary"
                                disabled={selectedQuestionIds.size === 0}
                                onClick={handleApply}
                            >
                                선택한 질문 {selectedQuestionIds.size}개 가져오기
                            </Button>
                        )}
                    </footer>
                </section>
            </div>
        </ModalPortal>
    );
};

export default MissionLabQuestionsModal;
