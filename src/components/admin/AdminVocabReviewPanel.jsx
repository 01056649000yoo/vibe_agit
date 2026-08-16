import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../common/Button';
import reviewArtifact from '../../../docs/vocab-tower/data/grade3-deck01-review.json';
import {
    getVocabReviewDeck,
    saveVocabReviewItem,
    seedVocabReviewDeck,
    setVocabReviewDeckStatus
} from '../../modules/game/vocab-tower/reviewApi';
import {
    artifactToWorkspace,
    CHOICE_QUESTION_KEYS,
    getReviewStatusInfo,
    INPUT_QUESTION_KEYS,
    rowToSeedItem,
    validateReviewItem
} from '../../modules/game/vocab-tower/reviewModel';
import './adminVocabReview.css';

const getQuestion = (questions, questionKey) => {
    switch (questionKey) {
        case 'meaningChoice': return questions.meaningChoice;
        case 'clozeChoice': return questions.clozeChoice;
        case 'definitionInput': return questions.definitionInput;
        case 'clozeInput': return questions.clozeInput;
        case 'usageDistinction': return questions.usageDistinction;
        default: return null;
    }
};

const replaceQuestion = (questions, questionKey, nextQuestion) => {
    switch (questionKey) {
        case 'meaningChoice': return { ...questions, meaningChoice: nextQuestion };
        case 'clozeChoice': return { ...questions, clozeChoice: nextQuestion };
        case 'definitionInput': return { ...questions, definitionInput: nextQuestion };
        case 'clozeInput': return { ...questions, clozeInput: nextQuestion };
        case 'usageDistinction': return { ...questions, usageDistinction: nextQuestion };
        default: return questions;
    }
};

const ChoiceQuestionEditor = ({ label, question, disabled, onChange }) => (
    <section className="admin-vocab-review__question">
        <div className="admin-vocab-review__question-heading">
            <strong>{label}</strong>
            <span>{question.options?.length || 0}개 보기</span>
        </div>
        <label>
            <span>질문</span>
            <textarea
                rows="2"
                value={question.prompt || ''}
                disabled={disabled}
                onChange={(event) => onChange({ ...question, prompt: event.target.value })}
            />
        </label>
        <div className="admin-vocab-review__options">
            {(question.options || []).map((option, optionIndex) => (
                <label key={`${label}-${optionIndex}`} className={option.isCorrect ? 'is-correct' : ''}>
                    <input
                        type="radio"
                        name={`${label}-correct`}
                        checked={option.isCorrect === true}
                        disabled={disabled}
                        onChange={() => onChange({
                            ...question,
                            options: question.options.map((candidate, candidateIndex) => ({
                                ...candidate,
                                isCorrect: candidateIndex === optionIndex
                            }))
                        })}
                    />
                    <textarea
                        rows="2"
                        value={option.value || ''}
                        disabled={disabled}
                        aria-label={`${label} ${optionIndex + 1}번 보기`}
                        onChange={(event) => onChange({
                            ...question,
                            options: question.options.map((candidate, candidateIndex) => (
                                candidateIndex === optionIndex
                                    ? { ...candidate, value: event.target.value }
                                    : candidate
                            ))
                        })}
                    />
                </label>
            ))}
        </div>
        {Object.hasOwn(question, 'explanation') && (
            <label>
                <span>정답 해설</span>
                <textarea
                    rows="2"
                    value={question.explanation || ''}
                    disabled={disabled}
                    onChange={(event) => onChange({ ...question, explanation: event.target.value })}
                />
            </label>
        )}
    </section>
);

const InputQuestionEditor = ({ label, question, disabled, onChange }) => (
    <section className="admin-vocab-review__question admin-vocab-review__question--input">
        <div className="admin-vocab-review__question-heading">
            <strong>{label}</strong>
            <span>직접 입력</span>
        </div>
        <label>
            <span>질문</span>
            <textarea
                rows="3"
                value={question.prompt || ''}
                disabled={disabled}
                onChange={(event) => onChange({ ...question, prompt: event.target.value })}
            />
        </label>
    </section>
);

const AdminVocabReviewPanel = () => {
    const [grade, setGrade] = useState(3);
    const [deckNumber, setDeckNumber] = useState(1);
    const [deck, setDeck] = useState(null);
    const [items, setItems] = useState([]);
    const [selectedKey, setSelectedKey] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [notice, setNotice] = useState('');

    const applyWorkspace = useCallback((workspace) => {
        const nextItems = Array.isArray(workspace?.items) ? workspace.items : [];
        setDeck(workspace?.deck || null);
        setItems(nextItems);
        setSelectedKey((current) => (
            nextItems.some((item) => item.item_key === current)
                ? current
                : nextItems[0]?.item_key || ''
        ));
    }, []);

    const loadDeck = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');
        setNotice('');
        try {
            const workspace = await getVocabReviewDeck({ grade, deckNumber });
            if (!workspace?.deck && grade === 3 && deckNumber === 1) {
                applyWorkspace(artifactToWorkspace(reviewArtifact));
                setNotice('확인한 첫 덱을 DB 작업공간에 준비하기 전 상태입니다. 내용을 한 번 더 보고 저장할 수 있습니다.');
            } else {
                applyWorkspace(workspace);
            }
        } catch (error) {
            console.error('어휘 V2 검수 덱 조회 실패:', error?.message);
            setErrorMessage('검수 작업공간을 불러오지 못했습니다. 마이그레이션 적용 상태와 관리자 권한을 확인해주세요.');
            applyWorkspace({ deck: null, items: [] });
        } finally {
            setLoading(false);
        }
    }, [applyWorkspace, deckNumber, grade]);

    useEffect(() => {
        const timerId = window.setTimeout(() => void loadDeck(), 0);
        return () => window.clearTimeout(timerId);
    }, [loadDeck]);

    const selectedItem = useMemo(
        () => items.find((item) => item.item_key === selectedKey) || null,
        [items, selectedKey]
    );
    const visibleItems = useMemo(() => {
        const query = searchTerm.trim().toLocaleLowerCase('ko-KR');
        if (!query) return items;
        return items.filter((item) => (
            item.word.toLocaleLowerCase('ko-KR').includes(query)
            || item.category.toLocaleLowerCase('ko-KR').includes(query)
        ));
    }, [items, searchTerm]);
    const statusInfo = getReviewStatusInfo(deck?.review_status);
    const isLocalSeed = deck?.is_local_seed === true;
    const isLocked = deck?.review_status === 'locked';
    const canEdit = Boolean(deck) && !isLocked;

    const updateSelected = (patch) => {
        setItems((current) => current.map((item) => (
            item.item_key === selectedKey ? { ...item, ...patch } : item
        )));
        setNotice('저장하지 않은 변경이 있습니다.');
    };

    const updateSelectedQuestion = (questionKey, nextQuestion) => {
        if (!selectedItem) return;
        updateSelected({
            questions: replaceQuestion(selectedItem.questions, questionKey, nextQuestion)
        });
    };

    const handleAcceptedAnswers = (value) => {
        if (!selectedItem) return;
        const answers = [...new Set(value.split(/[,\n]/).map((answer) => answer.trim()).filter(Boolean))];
        updateSelected({
            accepted_answers: answers,
            questions: {
                ...selectedItem.questions,
                definitionInput: { ...selectedItem.questions.definitionInput, acceptedAnswers: answers },
                clozeInput: { ...selectedItem.questions.clozeInput, acceptedAnswers: answers }
            }
        });
    };

    const handleSeed = async () => {
        const invalidItem = items.find((item) => validateReviewItem(item));
        if (invalidItem) {
            setSelectedKey(invalidItem.item_key);
            setErrorMessage(`${invalidItem.word}: ${validateReviewItem(invalidItem)}`);
            return;
        }
        if (!window.confirm('확인한 3학년 첫 덱 40개를 DB 검수 작업공간에 저장할까요? 학생 게임에는 연결되지 않습니다.')) return;
        setWorking(true);
        setErrorMessage('');
        try {
            const workspace = await seedVocabReviewDeck({
                deck: {
                    grade: deck.grade,
                    deckNumber: deck.deck_number,
                    deckId: deck.deck_id,
                    sourceFingerprint: deck.source_fingerprint
                },
                items: items.map(rowToSeedItem),
                initialStatus: 'teacher_confirmed'
            });
            applyWorkspace(workspace);
            setNotice('첫 덱을 교사 확인 상태로 저장했습니다. 내용을 수정하면 자동으로 1차 검수 상태로 돌아갑니다.');
        } catch (error) {
            console.error('어휘 V2 검수 덱 준비 실패:', error?.message);
            setErrorMessage(error?.message || '검수 작업공간을 준비하지 못했습니다.');
        } finally {
            setWorking(false);
        }
    };

    const handleSaveItem = async () => {
        if (!selectedItem || isLocalSeed) return;
        const validationMessage = validateReviewItem(selectedItem);
        if (validationMessage) {
            setErrorMessage(validationMessage);
            return;
        }
        setWorking(true);
        setErrorMessage('');
        try {
            const result = await saveVocabReviewItem(selectedItem);
            setItems((current) => current.map((item) => (
                item.item_key === selectedItem.item_key ? result.item : item
            )));
            setDeck((current) => ({
                ...current,
                review_status: result.deck_status,
                version: result.deck_version
            }));
            setNotice(`${selectedItem.word} 항목을 저장했습니다. 덱 상태는 1차 검수로 돌아갔습니다.`);
        } catch (error) {
            console.error('어휘 V2 검수 항목 저장 실패:', error?.message);
            setErrorMessage(error?.message || '검수 항목을 저장하지 못했습니다. 다시 불러온 뒤 시도해주세요.');
        } finally {
            setWorking(false);
        }
    };

    const handleStatus = async (nextStatus) => {
        if (!deck || isLocalSeed) return;
        const actionLabel = nextStatus === 'locked'
            ? '이 덱을 잠그면 수정 전 잠금 해제가 필요합니다. 계속할까요?'
            : `${getReviewStatusInfo(nextStatus).label} 상태로 바꿀까요?`;
        if (!window.confirm(actionLabel)) return;
        setWorking(true);
        setErrorMessage('');
        try {
            const result = await setVocabReviewDeckStatus({
                deckId: deck.deck_id,
                expectedVersion: deck.version,
                reviewStatus: nextStatus
            });
            setDeck(result.deck);
            setNotice(`덱 상태를 ${getReviewStatusInfo(nextStatus).label}(으)로 변경했습니다.`);
        } catch (error) {
            console.error('어휘 V2 검수 상태 변경 실패:', error?.message);
            setErrorMessage(error?.message || '덱 상태를 변경하지 못했습니다. 다시 불러온 뒤 시도해주세요.');
        } finally {
            setWorking(false);
        }
    };

    return (
        <section className="admin-vocab-review" aria-labelledby="admin-vocab-review-title">
            <header className="admin-vocab-review__header">
                <div>
                    <span className="admin-vocab-review__eyebrow">어휘의 탑 V2 · 학생 출제 전용 준비</span>
                    <h2 id="admin-vocab-review-title">필수 어휘 문항 검수</h2>
                    <p>현재 운영 단어표와 분리된 작업공간입니다. 교사 확인과 잠금만으로 학생 게임이 바뀌지는 않습니다.</p>
                </div>
                {deck && <span className={`admin-vocab-review__status is-${statusInfo.tone}`}>{statusInfo.label}</span>}
            </header>

            <div className="admin-vocab-review__toolbar">
                <label>
                    <span>학년</span>
                    <select value={grade} onChange={(event) => setGrade(Number(event.target.value))} disabled={working}>
                        {[3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}학년</option>)}
                    </select>
                </label>
                <label>
                    <span>덱</span>
                    <select value={deckNumber} onChange={(event) => setDeckNumber(Number(event.target.value))} disabled={working}>
                        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}번 덱</option>)}
                    </select>
                </label>
                <Button type="button" variant="outline" onClick={loadDeck} disabled={working}>다시 불러오기</Button>
                <div className="admin-vocab-review__status-actions">
                    {isLocalSeed && (
                        <Button type="button" onClick={handleSeed} loading={working} loadingText="작업공간 준비 중...">
                            확인한 첫 덱 저장
                        </Button>
                    )}
                    {!isLocalSeed && deck?.review_status === 'editorial_review' && (
                        <Button type="button" onClick={() => handleStatus('teacher_confirmed')} disabled={working}>교사 확인 완료</Button>
                    )}
                    {!isLocalSeed && deck?.review_status === 'teacher_confirmed' && (
                        <>
                            <Button type="button" variant="outline" onClick={() => handleStatus('editorial_review')} disabled={working}>1차 검수로 되돌리기</Button>
                            <Button type="button" onClick={() => handleStatus('locked')} disabled={working}>덱 잠그기</Button>
                        </>
                    )}
                    {!isLocalSeed && deck?.review_status === 'locked' && (
                        <Button type="button" variant="outline" onClick={() => handleStatus('teacher_confirmed')} disabled={working}>잠금 풀기</Button>
                    )}
                </div>
            </div>

            {notice && <p className="admin-vocab-review__notice" role="status">{notice}</p>}
            {errorMessage && <p className="admin-vocab-review__error" role="alert">{errorMessage}</p>}

            {loading ? (
                <div className="admin-vocab-review__empty">검수 작업공간을 불러오는 중입니다...</div>
            ) : !deck ? (
                <div className="admin-vocab-review__empty">
                    <strong>아직 준비된 검수 덱이 없습니다.</strong>
                    <p>현재는 확인을 마친 3학년 1번 덱부터 작업공간을 만들 수 있습니다.</p>
                </div>
            ) : (
                <div className="admin-vocab-review__workspace">
                    <aside className="admin-vocab-review__list" aria-label="검수 낱말 목록">
                        <div className="admin-vocab-review__list-heading">
                            <strong>{items.length}개 낱말</strong>
                            <span>버전 {deck.version || '준비 전'}</span>
                        </div>
                        <input
                            type="search"
                            value={searchTerm}
                            placeholder="낱말·분류 검색"
                            onChange={(event) => setSearchTerm(event.target.value)}
                        />
                        <div className="admin-vocab-review__word-buttons">
                            {visibleItems.map((item) => {
                                const changed = item.definition !== item.source_definition || item.example !== item.source_example;
                                return (
                                    <button
                                        type="button"
                                        key={item.item_key}
                                        className={item.item_key === selectedKey ? 'is-active' : ''}
                                        onClick={() => setSelectedKey(item.item_key)}
                                    >
                                        <span>{item.word}</span>
                                        <small>{changed ? '수정' : '유지'} · {item.category}</small>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    {selectedItem && (
                        <main className="admin-vocab-review__editor">
                            <div className="admin-vocab-review__editor-heading">
                                <div>
                                    <span>{selectedItem.category} · 난이도 {selectedItem.difficulty}</span>
                                    <h3>{selectedItem.word}</h3>
                                </div>
                                <span>항목 v{selectedItem.version}</span>
                            </div>

                            <div className="admin-vocab-review__metadata">
                                <label>
                                    <span>품사</span>
                                    <input value={selectedItem.part_of_speech} disabled={!canEdit || working} onChange={(event) => updateSelected({ part_of_speech: event.target.value })} />
                                </label>
                                <label>
                                    <span>뜻 번호</span>
                                    <input type="number" min="1" max="20" value={selectedItem.meaning_number} disabled={!canEdit || working} onChange={(event) => updateSelected({ meaning_number: Number(event.target.value) })} />
                                </label>
                                <label>
                                    <span>난이도</span>
                                    <select value={selectedItem.difficulty} disabled={!canEdit || working} onChange={(event) => updateSelected({ difficulty: Number(event.target.value) })}>
                                        {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                                    </select>
                                </label>
                            </div>

                            <div className="admin-vocab-review__diff-grid">
                                <div>
                                    <strong>자동 초안 뜻</strong>
                                    <p>{selectedItem.source_definition}</p>
                                </div>
                                <label>
                                    <span>검수 뜻</span>
                                    <textarea rows="4" value={selectedItem.definition} disabled={!canEdit || working} onChange={(event) => updateSelected({ definition: event.target.value })} />
                                </label>
                                <div>
                                    <strong>자동 초안 예문</strong>
                                    <p>{selectedItem.source_example}</p>
                                </div>
                                <label>
                                    <span>검수 예문</span>
                                    <textarea rows="4" value={selectedItem.example} disabled={!canEdit || working} onChange={(event) => updateSelected({ example: event.target.value })} />
                                </label>
                            </div>

                            <label className="admin-vocab-review__answers">
                                <span>허용 정답 <small>쉼표 또는 줄바꿈으로 구분</small></span>
                                <textarea rows="2" value={selectedItem.accepted_answers.join(', ')} disabled={!canEdit || working} onChange={(event) => handleAcceptedAnswers(event.target.value)} />
                            </label>

                            <div className="admin-vocab-review__questions">
                                {CHOICE_QUESTION_KEYS.map(([questionKey, label]) => (
                                    <ChoiceQuestionEditor
                                        key={questionKey}
                                        label={label}
                                        question={getQuestion(selectedItem.questions, questionKey)}
                                        disabled={!canEdit || working}
                                        onChange={(nextQuestion) => updateSelectedQuestion(questionKey, nextQuestion)}
                                    />
                                ))}
                                {INPUT_QUESTION_KEYS.map(([questionKey, label]) => (
                                    <InputQuestionEditor
                                        key={questionKey}
                                        label={label}
                                        question={getQuestion(selectedItem.questions, questionKey)}
                                        disabled={!canEdit || working}
                                        onChange={(nextQuestion) => updateSelectedQuestion(questionKey, nextQuestion)}
                                    />
                                ))}
                            </div>

                            <label className="admin-vocab-review__notes">
                                <span>검수 메모</span>
                                <textarea rows="3" maxLength="1000" value={selectedItem.review_notes || ''} disabled={!canEdit || working} onChange={(event) => updateSelected({ review_notes: event.target.value })} />
                            </label>

                            <div className="admin-vocab-review__editor-actions">
                                {isLocalSeed ? (
                                    <p>준비 전 변경은 위의 <strong>확인한 첫 덱 저장</strong>을 눌러 한 번에 보관합니다.</p>
                                ) : isLocked ? (
                                    <p>잠긴 덱입니다. 수정하려면 먼저 잠금을 풀어주세요.</p>
                                ) : (
                                    <Button type="button" onClick={handleSaveItem} loading={working} loadingText="항목 저장 중...">이 낱말 저장</Button>
                                )}
                            </div>
                        </main>
                    )}
                </div>
            )}
        </section>
    );
};

export default AdminVocabReviewPanel;
