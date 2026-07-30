import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ExternalLink, Search, X } from 'lucide-react';
import ModalPortal from '../../../../components/common/ModalPortal';
import {
    createOfficialDictionarySearchUrl,
    getPopularSpellingEntries,
    searchElementarySpelling
} from './elementarySpellingEntries';
import './SpellingLookupTool.css';

const MAX_QUERY_LENGTH = 60;

const SpellingLookupTool = ({ disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [searchedQuery, setSearchedQuery] = useState('');
    const inputRef = useRef(null);
    const popularEntries = useMemo(() => getPopularSpellingEntries(), []);
    const results = useMemo(
        () => searchedQuery ? searchElementarySpelling(searchedQuery) : [],
        [searchedQuery]
    );

    useEffect(() => {
        if (!isOpen) return undefined;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    const runSearch = (nextQuery = query) => {
        const trimmed = nextQuery.trim();
        if (!trimmed) {
            setSearchedQuery('');
            inputRef.current?.focus();
            return;
        }
        setQuery(trimmed);
        setSearchedQuery(trimmed);
    };

    const openTool = () => {
        if (disabled) return;
        setIsOpen(true);
    };

    return (
        <div className="spelling-lookup-tool">
            <button
                type="button"
                className="spelling-lookup-trigger"
                onClick={openTool}
                disabled={disabled}
                aria-haspopup="dialog"
            >
                <Search size={19} aria-hidden="true" />
                <span>맞춤법 찾아보기</span>
            </button>
            <span className="spelling-lookup-trigger-help">궁금한 표현을 직접 찾아보고 내 글은 내가 고쳐요.</span>

            {isOpen && (
                <ModalPortal>
                    <div className="spelling-lookup-overlay" onMouseDown={() => setIsOpen(false)}>
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
                                        <h2 id="spelling-lookup-title">맞춤법 찾아보기</h2>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="spelling-lookup-close"
                                    onClick={() => setIsOpen(false)}
                                    aria-label="맞춤법 찾아보기 닫기"
                                >
                                    <X size={23} aria-hidden="true" />
                                </button>
                            </header>

                            <p className="spelling-lookup-promise">
                                이 도구는 내 글을 읽거나 자동으로 고치지 않아요. 궁금한 낱말이나 짧은 표현만 직접 찾아보세요.
                            </p>

                            <form
                                className="spelling-lookup-search"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    runSearch();
                                }}
                            >
                                <label htmlFor="spelling-lookup-query">어떤 표현이 궁금한가요?</label>
                                <div className="spelling-lookup-search-row">
                                    <input
                                        ref={inputRef}
                                        id="spelling-lookup-query"
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value.slice(0, MAX_QUERY_LENGTH))}
                                        placeholder="예: 되요 / 돼요"
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
                                                onClick={() => runSearch(entry.question)}
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
                                                <a href={entry.source.url} target="_blank" rel="noreferrer">
                                                    {entry.source.label}에서 더 보기
                                                    <ExternalLink size={15} aria-hidden="true" />
                                                </a>
                                            </article>
                                        ))}
                                    </>
                                )}

                                {searchedQuery && results.length === 0 && (
                                    <div className="spelling-lookup-empty">
                                        <span aria-hidden="true">🔎</span>
                                        <strong>아직 수첩에 없는 표현이에요.</strong>
                                        <p>비슷한 낱말로 다시 찾아보거나 국립국어원 사전에서 확인해 보세요.</p>
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
                            </div>

                            <footer className="spelling-lookup-footer">
                                설명을 읽은 뒤 글쓰기 창으로 돌아가서 직접 고쳐 보세요.
                            </footer>
                        </section>
                    </div>
                </ModalPortal>
            )}
        </div>
    );
};

export default SpellingLookupTool;
