import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ExternalLink, Search, X } from 'lucide-react';
import ModalPortal from '../../../../components/common/ModalPortal';
import { supabase } from '../../../../lib/supabaseClient';
import {
    createOfficialDictionarySearchUrl,
    getPopularSpellingEntries,
    searchElementarySpelling
} from './elementarySpellingEntries';
import { getElementarySpellingQuizQuestions } from './elementarySpellingQuiz';
import { spellingLearningApi } from '../../spelling-learning/api';
import { flushSpellingSearches, rememberSpellingSearch } from '../../spelling-learning/searchSession';
import './SpellingLookupTool.css';

const MAX_QUERY_LENGTH = 180;
const MAX_DICTIONARY_QUERY_LENGTH = 30;
const dictionarySearchCache = new Map();

const canSearchOfficialDictionary = (query) => (
    query.length <= MAX_DICTIONARY_QUERY_LENGTH && !/[.!?。！？\n\r]/.test(query)
);

const getErrorPayload = async (error) => {
    try {
        return await error?.context?.json();
    } catch {
        return null;
    }
};

/**
 * 맞춤법 수첩 본체.
 *
 * 여는 버튼과 "열어 달라"는 신호 처리는 공통 호스트(`WritingToolHost`)가 맡는다.
 * 이 컴포넌트는 **열려 있을 때만 화면에 올라온다** — 그래야 글쓰기 창을 열기만 한 학생이
 * 이 무거운 파일(설명·예문·사전)을 받지 않는다.
 */
const SpellingLookupTool = ({ initialQuery = '', correction = null, onClose }) => {
    const [activeView, setActiveView] = useState('lookup');
    const [query, setQuery] = useState(initialQuery.slice(0, MAX_QUERY_LENGTH));
    const [searchedQuery, setSearchedQuery] = useState(initialQuery.slice(0, MAX_QUERY_LENGTH));
    const [dictionaryItems, setDictionaryItems] = useState([]);
    const [dictionaryLoading, setDictionaryLoading] = useState(false);
    const [dictionaryMessage, setDictionaryMessage] = useState('');
    const [dictionarySearchedQuery, setDictionarySearchedQuery] = useState('');
    const [classEntries, setClassEntries] = useState([]);
    const [quizIndex, setQuizIndex] = useState(0);
    const [quizSelection, setQuizSelection] = useState('');
    const [quizScore, setQuizScore] = useState(0);
    const [quizFinished, setQuizFinished] = useState(false);
    const inputRef = useRef(null);
    const searchRequestRef = useRef(0);
    const popularEntries = useMemo(() => getPopularSpellingEntries(), []);
    const quizQuestions = useMemo(() => getElementarySpellingQuizQuestions(), []);
    const activeQuizQuestion = quizQuestions.at(quizIndex);
    const results = useMemo(() => {
        if (!searchedQuery) return [];
        const normalized = searchedQuery.normalize('NFC').toLocaleLowerCase('ko-KR');
        const custom = classEntries.filter((entry) => [entry.wrong_expression, entry.correct_expression]
            .some((value) => normalized.includes(String(value || '').normalize('NFC').toLocaleLowerCase('ko-KR'))))
            .map((entry) => ({
                id: `class:${entry.id}`,
                question: entry.wrong_expression,
                answer: entry.correct_expression,
                explanation: entry.explanation,
                examples: entry.examples || [],
                label: entry.label,
                source: { label: '우리 반 맞춤법 수첩', url: '#' }
            }));
        return [...custom, ...searchElementarySpelling(searchedQuery)].slice(0, 20);
    }, [classEntries, searchedQuery]);

    const selectQuizAnswer = (choice) => {
        if (quizSelection || quizFinished) return;
        setQuizSelection(choice);
        if (choice === activeQuizQuestion.answer) setQuizScore((score) => score + 1);
    };

    const advanceQuiz = () => {
        if (!quizSelection) return;
        if (quizIndex === quizQuestions.length - 1) {
            setQuizFinished(true);
            return;
        }
        setQuizIndex((index) => index + 1);
        setQuizSelection('');
    };

    const restartQuiz = () => {
        setQuizIndex(0);
        setQuizSelection('');
        setQuizScore(0);
        setQuizFinished(false);
    };

    const closeTool = useCallback(() => {
        flushSpellingSearches().catch(() => {});
        onClose?.();
    }, [onClose]);

    useEffect(() => {
        spellingLearningApi.getStudentEntries()
            .then((entries) => setClassEntries(Array.isArray(entries) ? entries : []))
            .catch(() => setClassEntries([]));
    }, []);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') closeTool();
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [closeTool]);

    const runSearch = async (nextQuery = query, { includeOfficial = true } = {}) => {
        const trimmed = nextQuery.trim();
        const requestId = searchRequestRef.current + 1;
        searchRequestRef.current = requestId;
        if (!trimmed) {
            setSearchedQuery('');
            setDictionaryItems([]);
            setDictionaryLoading(false);
            setDictionaryMessage('');
            setDictionarySearchedQuery('');
            inputRef.current?.focus();
            return;
        }
        setQuery(trimmed);
        setSearchedQuery(trimmed);
        setDictionaryItems([]);
        setDictionaryLoading(false);
        setDictionaryMessage('');
        setDictionarySearchedQuery('');

        const localMatches = searchElementarySpelling(trimmed);
        const classMatch = classEntries.find((entry) => [entry.wrong_expression, entry.correct_expression]
            .some((value) => trimmed.includes(String(value || ''))));
        const firstMatch = classMatch || localMatches[0];
        rememberSpellingSearch({
            entryKey: classMatch ? `class:${classMatch.id}` : (firstMatch?.id ? `common:${firstMatch.id}` : `unmatched:${trimmed.normalize('NFC').toLocaleLowerCase('ko-KR')}`),
            label: classMatch?.label || firstMatch?.label || '미분류',
            query: trimmed,
            matched: !!firstMatch
        });

        if (!includeOfficial) return;

        setDictionarySearchedQuery(trimmed);
        if (!canSearchOfficialDictionary(trimmed)) {
            setDictionaryMessage('문장 전체는 수첩 규칙으로 살펴봤어요. 공식 사전에서는 궁금한 낱말이나 짧은 구만 다시 찾아보세요.');
            return;
        }
        if (!supabase) {
            setDictionaryMessage('공식 사전 연결을 준비하고 있어요. 아래 링크에서 직접 확인할 수 있어요.');
            return;
        }

        const cacheKey = trimmed.toLocaleLowerCase('ko-KR');
        if (dictionarySearchCache.has(cacheKey)) {
            const cachedItems = dictionarySearchCache.get(cacheKey);
            setDictionaryItems(cachedItems);
            setDictionaryMessage(cachedItems.length === 0 ? '표준국어대사전에서 일치하는 낱말을 찾지 못했어요.' : '');
            return;
        }

        setDictionaryLoading(true);
        const { data, error } = await supabase.functions.invoke('korean-dictionary-search', {
            body: { query: trimmed }
        });
        if (searchRequestRef.current !== requestId) return;

        setDictionaryLoading(false);
        if (error) {
            const payload = await getErrorPayload(error);
            if (searchRequestRef.current !== requestId) return;
            setDictionaryMessage(payload?.code === 'STDICT_NOT_CONFIGURED'
                ? '국립국어원 사전 연결을 준비하고 있어요. 아래 링크에서 직접 확인할 수 있어요.'
                : (payload?.error || '국립국어원 사전에 잠시 연결할 수 없어요. 아래 링크에서 직접 확인해 보세요.'));
            return;
        }

        const items = Array.isArray(data?.items) ? data.items : [];
        dictionarySearchCache.set(cacheKey, items);
        setDictionaryItems(items);
        setDictionaryMessage(items.length === 0 ? '표준국어대사전에서 일치하는 낱말을 찾지 못했어요.' : '');
    };

    // 밑줄 칩으로 열렸을 때는 학생이 쓴 **틀린 말**이 아니라 사전에 실제로 있는 **표제어**로 찾는다.
    // `됬` 을 그대로 찾으면 사전은 늘 빈손으로 돌아온다 — 찾을 말은 `되다` 다.
    useEffect(() => {
        const openingQuery = correction?.lookup || initialQuery;
        if (openingQuery.trim()) runSearch(openingQuery);
        // 처음 열릴 때 한 번만. 이후 검색은 학생이 직접 한다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    return (
        <ModalPortal>
            <div className="spelling-lookup-overlay" onMouseDown={closeTool}>
                <section
                    className="spelling-lookup-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="spelling-lookup-title"
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <header className="spelling-lookup-header">
                        <div className="spelling-lookup-heading">
                            <span className="spelling-lookup-heading-icon" aria-hidden="true">
                                <BookOpen size={22} />
                            </span>
                            <div>
                                <span>나의 맞춤법 수첩</span>
                                <h2 id="spelling-lookup-title">{activeView === 'lookup' ? '맞춤법 찾아보기' : '맞춤법 100문제'}</h2>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="spelling-lookup-close"
                            onClick={closeTool}
                            aria-label="맞춤법 찾아보기 닫기"
                        >
                            <X size={23} aria-hidden="true" />
                        </button>
                    </header>

                    <div className="spelling-lookup-tabs" role="tablist" aria-label="맞춤법 수첩 보기 선택">
                        <button type="button" role="tab" aria-selected={activeView === 'lookup'} className={activeView === 'lookup' ? 'is-active' : ''} onClick={() => setActiveView('lookup')}>🔎 찾아보기</button>
                        <button type="button" role="tab" aria-selected={activeView === 'quiz'} className={activeView === 'quiz' ? 'is-active' : ''} onClick={() => setActiveView('quiz')}>✏️ 100문제</button>
                    </div>

                    {activeView === 'lookup' && <>
                    {correction?.right && (
                        <div className="spelling-correction-card">
                            <span className="spelling-correction-label">이렇게 고쳐 써요</span>
                            <p className="spelling-correction-pair">
                                <span className="spelling-correction-wrong">{correction.wrong}</span>
                                <ArrowRight size={18} aria-hidden="true" />
                                <span className="spelling-correction-right">{correction.right}</span>
                            </p>
                            <span className="spelling-correction-help">
                                틀린 말은 사전에 실려 있지 않아서, 바른 표기 &lsquo;{correction.lookup}&rsquo;(으)로 찾아봤어요.
                            </span>
                        </div>
                    )}

                    <p className="spelling-lookup-promise">
                        문장은 기기 안의 수첩 규칙으로 살펴보고, 직접 찾기를 누른 낱말·짧은 구만 국립국어원 사전에서 찾아요. 글을 자동으로 고치지 않아요.
                    </p>

                    <form
                        className="spelling-lookup-search"
                        onSubmit={(event) => {
                            event.preventDefault();
                            runSearch();
                        }}
                    >
                        <label htmlFor="spelling-lookup-query">어떤 낱말이나 문장이 궁금한가요?</label>
                        <div className="spelling-lookup-search-row">
                            <input
                                ref={inputRef}
                                id="spelling-lookup-query"
                                value={query}
                                onChange={(event) => setQuery(event.target.value.slice(0, MAX_QUERY_LENGTH))}
                                placeholder="예: 오늘은 웬지 기분이 좋아요."
                                lang="ko"
                                spellCheck={false}
                                autoCorrect="off"
                                autoCapitalize="none"
                                enterKeyHint="search"
                            />
                            <button type="submit" disabled={!query.trim()}>
                                <Search size={19} aria-hidden="true" />
                                찾기
                            </button>
                        </div>
                    </form>

                    {!searchedQuery && (
                        <div className="spelling-lookup-popular">
                            <strong>많이 헷갈리는 표현</strong>
                            <div>
                                {popularEntries.map((entry) => (
                                    <button
                                        type="button"
                                        key={entry.id}
                                        onClick={() => runSearch(entry.question, { includeOfficial: false })}
                                    >
                                        {entry.question}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="spelling-lookup-results" aria-live="polite">
                        {searchedQuery && results.length > 0 && (
                            <>
                                <p className="spelling-lookup-result-count">
                                    <strong>‘{searchedQuery}’</strong>와 관련된 설명 {results.length}개를 찾았어요.
                                </p>
                                {results.map((entry) => (
                                    <article className="spelling-lookup-result-card" key={entry.id}>
                                        <div className="spelling-lookup-answer-row">
                                            <span>{entry.question}</span>
                                            <strong>{entry.answer}</strong>
                                        </div>
                                        <p>{entry.explanation}</p>
                                        <div className="spelling-lookup-examples">
                                            <strong>이렇게 써요</strong>
                                            {entry.examples.map((example) => (
                                                <span key={example}>{example}</span>
                                            ))}
                                        </div>
                                        {entry.source.url !== '#' && <a href={entry.source.url} target="_blank" rel="noreferrer">
                                            {entry.source.label}에서 더 보기
                                            <ExternalLink size={15} aria-hidden="true" />
                                        </a>}
                                    </article>
                                ))}
                            </>
                        )}

                        {searchedQuery && results.length === 0 && !dictionaryLoading && dictionaryItems.length === 0 && !dictionarySearchedQuery && (
                            <div className="spelling-lookup-empty">
                                <span aria-hidden="true">🔎</span>
                                <strong>수첩에서 관련 규칙을 찾지 못했어요.</strong>
                                <p>낱말은 국립국어원 사전에서 직접 확인할 수 있어요. 문장은 수첩 규칙을 더 보강하면서 검색 범위를 넓혀 갈게요.</p>
                                <a
                                    href={createOfficialDictionarySearchUrl(searchedQuery)}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    국립국어원 사전에서 ‘{searchedQuery}’ 찾기
                                    <ExternalLink size={15} aria-hidden="true" />
                                </a>
                            </div>
                        )}

                        {dictionarySearchedQuery && (
                            <section className="spelling-dictionary-results" aria-labelledby="spelling-dictionary-title">
                                <div className="spelling-dictionary-heading">
                                    <div>
                                        <span>공식 사전 검색</span>
                                        <h3 id="spelling-dictionary-title">국립국어원 표준국어대사전</h3>
                                    </div>
                                    <a
                                        href={createOfficialDictionarySearchUrl(dictionarySearchedQuery)}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        사전에서 직접 보기
                                        <ExternalLink size={15} aria-hidden="true" />
                                    </a>
                                </div>

                                {dictionaryLoading && (
                                    <div className="spelling-dictionary-status" role="status">
                                        <span className="spelling-dictionary-spinner" aria-hidden="true" />
                                        국립국어원 사전에서 찾는 중이에요.
                                    </div>
                                )}

                                {!dictionaryLoading && dictionaryMessage && (
                                    <div className="spelling-dictionary-message">{dictionaryMessage}</div>
                                )}

                                {!dictionaryLoading && dictionaryItems.length > 0 && (
                                    <div className="spelling-dictionary-list">
                                        {dictionaryItems.map((item, index) => (
                                            <article key={`${item.targetCode || item.word}-${index}`} className="spelling-dictionary-card">
                                                <div>
                                                    <h4>{item.word}{item.supNo ? <sup>{item.supNo}</sup> : null}</h4>
                                                    {item.pos && <span>{item.pos}</span>}
                                                    {item.category && <span>{item.category}</span>}
                                                </div>
                                                <p>{item.definition}</p>
                                                {item.origin && <small>원어 {item.origin}</small>}
                                                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                                                    자세한 뜻 보기
                                                    <ExternalLink size={14} aria-hidden="true" />
                                                </a>
                                            </article>
                                        ))}
                                    </div>
                                )}
                            </section>
                        )}
                    </div>

                    </>}

                    {activeView === 'quiz' && <div className="spelling-quiz-pane" role="tabpanel">
                        {!quizFinished && <>
                            <div className="spelling-quiz-status">
                                <span><b>{quizIndex + 1}</b> / {quizQuestions.length}</span>
                                <span>맞힌 문제 <b>{quizScore}</b>개</span>
                            </div>
                            <div className="spelling-quiz-progress" role="progressbar" aria-label="맞춤법 문제 풀이 진행률" aria-valuemin="0" aria-valuemax={quizQuestions.length} aria-valuenow={quizIndex + (quizSelection ? 1 : 0)}>
                                <span style={{ width: `${((quizIndex + (quizSelection ? 1 : 0)) / quizQuestions.length) * 100}%` }} />
                            </div>
                            <article className="spelling-quiz-card">
                                <span className="spelling-quiz-number">문제 {activeQuizQuestion.number}</span>
                                <h3>{activeQuizQuestion.prompt}</h3>
                                <div className="spelling-quiz-choices">
                                    {activeQuizQuestion.choices.map((choice) => {
                                        const isCorrect = choice === activeQuizQuestion.answer;
                                        const isSelected = choice === quizSelection;
                                        const resultClass = quizSelection
                                            ? isCorrect ? ' is-correct' : isSelected ? ' is-wrong' : ''
                                            : '';
                                        return <button
                                            type="button"
                                            key={choice}
                                            className={resultClass}
                                            aria-pressed={isSelected}
                                            disabled={!!quizSelection}
                                            onClick={() => selectQuizAnswer(choice)}
                                        >
                                            {choice}
                                        </button>;
                                    })}
                                </div>
                                {quizSelection && <div className={`spelling-quiz-feedback${quizSelection === activeQuizQuestion.answer ? ' is-correct' : ' is-wrong'}`} role="status">
                                    <strong>{quizSelection === activeQuizQuestion.answer ? '정답이에요!' : '다시 기억해 봐요.'}</strong>
                                    <p>정답 <b>{activeQuizQuestion.answer}</b></p>
                                    <span>{activeQuizQuestion.explanation}</span>
                                </div>}
                                <button type="button" className="spelling-quiz-next" disabled={!quizSelection} onClick={advanceQuiz}>
                                    {quizIndex === quizQuestions.length - 1 ? '결과 보기' : '다음 문제'}
                                </button>
                            </article>
                        </>}
                        {quizFinished && <div className="spelling-quiz-finish" role="status">
                            <span aria-hidden="true">🎉</span>
                            <strong>100문제를 모두 풀었어요!</strong>
                            <p><b>{quizScore}</b>개를 맞혔어요.</p>
                            <small>틀린 문제의 설명을 떠올리며 다시 도전해 보세요.</small>
                            <button type="button" onClick={restartQuiz}>처음부터 다시 풀기</button>
                        </div>}
                    </div>}

                    <footer className="spelling-lookup-footer">
                        {activeView === 'lookup'
                            ? '설명을 읽은 뒤 글쓰기 창으로 돌아가 직접 판단하고 고쳐 보세요.'
                            : '정답과 설명은 이 기기에서만 확인하며 점수는 저장하지 않아요.'}
                    </footer>
                </section>
            </div>
        </ModalPortal>
    );
};

export default SpellingLookupTool;
