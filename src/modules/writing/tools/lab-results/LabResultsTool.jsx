import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, FlaskConical, Pin, Plus, X } from 'lucide-react';
import ModalPortal from '../../../../components/common/ModalPortal';
import { labResultsApi } from './api';
import './LabResultsTool.css';

const RESULT_LABELS = Object.freeze({
    outline: '글 개요',
    questions: '만든 질문',
    selected_questions: '고른 질문',
    one_line: '한줄모아',
    hanja_sentences: '한자 활용 문장'
});

const buildResultText = (result) => {
    if (result.resultKind !== 'outline') {
        return result.chunks.map((chunk) => chunk.text).join('\n');
    }

    const sections = ['처음', '가운데', '끝'];
    return sections
        .map((section) => {
            const chunks = result.chunks.filter((chunk) => chunk.section === section);
            if (chunks.length === 0) return '';
            return `[${section}]\n${chunks.map((chunk) => (
                chunk.label ? `- ${chunk.label}: ${chunk.text}` : `- ${chunk.text}`
            )).join('\n')}`;
        })
        .filter(Boolean)
        .join('\n\n');
};

const copyText = async (text) => {
    if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
};

const LabResultsTool = ({
    onClose,
    onInsertText,
    onToggleReference,
    selectedResultIds = [],
    providedResults = null,
    resultKinds = null,
    outlineSelectionLocked = false,
    selectionMessage = ''
}) => {
    const usesProvidedResults = Array.isArray(providedResults);
    const isReferenceSelection = typeof onToggleReference === 'function';
    const [results, setResults] = useState(() => usesProvidedResults ? providedResults : []);
    const [loading, setLoading] = useState(!usesProvidedResults);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [hasMore, setHasMore] = useState(false);
    const [cursor, setCursor] = useState(null);
    const [copiedId, setCopiedId] = useState('');

    const closeTool = useCallback(() => onClose?.(), [onClose]);
    const loadResults = useCallback(async ({ append = false, before = null } = {}) => {
        append ? setLoadingMore(true) : setLoading(true);
        setError('');
        try {
            const page = await labResultsApi.list({ limit: 20, before, resultKinds });
            setResults((current) => append ? [...current, ...page.items] : page.items);
            setHasMore(page.hasMore);
            setCursor(page.nextCursor);
        } catch {
            setError('연구소 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [resultKinds]);

    useEffect(() => {
        if (usesProvidedResults) return;
        void loadResults();
    }, [loadResults, usesProvidedResults]);

    useEffect(() => {
        if (!usesProvidedResults) return;
        setResults(providedResults);
        setLoading(false);
        setHasMore(false);
        setCursor(null);
    }, [providedResults, usesProvidedResults]);

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

    const groupedResults = useMemo(() => results.map((result) => ({
        ...result,
        text: buildResultText(result)
    })), [results]);
    const hasPinnedOutline = groupedResults.some((result) => (
        result.resultKind === 'outline'
        && result.isPinned
        && selectedResultIds.includes(result.id)
    ));

    const handleUseText = async (id, text) => {
        if (!text) return;
        if (onInsertText) {
            onInsertText(text);
            closeTool();
            return;
        }
        await copyText(text);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId(''), 1800);
    };

    return (
        <ModalPortal>
            <div className="lab-results-overlay" onMouseDown={closeTool}>
                <section
                    className="lab-results-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="lab-results-title"
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <header className="lab-results-header">
                        <div>
                            <span className="lab-results-icon" aria-hidden="true"><FlaskConical size={22} /></span>
                            <div>
                                <small>끄적끄적 아지트</small>
                                <h2 id="lab-results-title">연구소 결과 불러오기</h2>
                            </div>
                        </div>
                        <button type="button" onClick={closeTool} aria-label="연구소 결과 닫기"><X size={22} /></button>
                    </header>

                    <p className="lab-results-guide">
                        {isReferenceSelection
                            ? '내가 완성한 개요와 고른 질문만 보여요. 참고함에 둘 자료를 골라도 현재 글은 바뀌지 않습니다.'
                            : '내가 완성한 결과만 보여요. 버튼을 눌러 넣기 전에는 현재 글이 바뀌지 않습니다.'}
                    </p>

                    <div className="lab-results-body">
                        {selectionMessage && (
                            <div className="lab-results-selection-message" role="status">{selectionMessage}</div>
                        )}
                        {loading && <div className="lab-results-state">연구소 결과를 불러오는 중...</div>}
                        {!loading && error && (
                            <div className="lab-results-state is-error">
                                <p>{error}</p>
                                <button type="button" onClick={() => void loadResults()}>다시 시도</button>
                            </div>
                        )}
                        {!loading && !error && groupedResults.length === 0 && (
                            <div className="lab-results-state">
                                <strong>아직 가져올 결과가 없어요.</strong>
                                <p>글쓰기 연구소 활동을 끝내면 이곳에 차곡차곡 모입니다.</p>
                            </div>
                        )}

                        {!loading && !error && groupedResults.map((result) => (
                            <article key={result.id} className="lab-results-card">
                                <div className="lab-results-card-heading">
                                    <div>
                                        <span>
                                            {Reflect.get(RESULT_LABELS, result.resultKind) || '연구소 활동'}
                                            {result.isLinked && <em className="lab-results-linked-badge">이 과제와 연결됨</em>}
                                            {result.isPinned && <em className="lab-results-pinned-badge">이 글에 고정됨</em>}
                                        </span>
                                        <h3>{result.title}</h3>
                                        {result.topic && <p>{result.topic}</p>}
                                        {result.hint && <p className="lab-results-hint">{result.hint}</p>}
                                    </div>
                                    <time dateTime={result.updatedAt || result.completedAt}>
                                        {result.resultKind === 'outline' ? '최신 저장 ' : ''}
                                        {new Date(result.updatedAt || result.completedAt).toLocaleDateString('ko-KR')}
                                    </time>
                                </div>

                                <div className="lab-results-chunks">
                                    {result.chunks.map((chunk) => (
                                        <div key={`${result.id}:${chunk.id}`}>
                                            <p>
                                                {chunk.section && <strong>{chunk.section}</strong>}
                                                {chunk.label && <span>{chunk.label}</span>}
                                                {chunk.text}
                                            </p>
                                            {!isReferenceSelection && (
                                                <button type="button" onClick={() => void handleUseText(`${result.id}:${chunk.id}`, chunk.text)}>
                                                    {onInsertText ? <Plus size={16} /> : <Copy size={16} />}
                                                    {onInsertText ? '이 내용 넣기' : (copiedId === `${result.id}:${chunk.id}` ? '복사됨' : '복사')}
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {isReferenceSelection ? (
                                    <button
                                        type="button"
                                        className={`lab-results-use-all ${selectedResultIds.includes(result.id) ? 'is-selected' : ''}`}
                                        onClick={() => onToggleReference(result)}
                                        disabled={result.resultKind === 'outline' && (
                                            outlineSelectionLocked || (result.isPinned && selectedResultIds.includes(result.id))
                                        )}
                                    >
                                        {result.resultKind === 'outline'
                                            ? (result.isPinned ? <Check size={17} /> : <Pin size={17} />)
                                            : <Plus size={17} />}
                                        {result.resultKind === 'outline'
                                            ? (outlineSelectionLocked
                                                ? '승인된 글은 개요 교체 불가'
                                                : result.isPinned && selectedResultIds.includes(result.id)
                                                    ? '현재 고정된 개요'
                                                    : hasPinnedOutline ? '이 개요로 바꾸기' : '이 개요 고정하기')
                                            : selectedResultIds.includes(result.id) ? '참고함에서 빼기' : '참고함에 두기'}
                                    </button>
                                ) : (
                                    <button type="button" className="lab-results-use-all" onClick={() => void handleUseText(result.id, result.text)}>
                                        {onInsertText ? <Plus size={17} /> : <Copy size={17} />}
                                        {onInsertText ? '전체 내용을 본문에 넣기' : (copiedId === result.id ? '전체 내용 복사됨' : '전체 내용 복사')}
                                    </button>
                                )}
                            </article>
                        ))}

                        {!loading && !error && hasMore && cursor && (
                            <button
                                type="button"
                                className="lab-results-more"
                                disabled={loadingMore}
                                onClick={() => void loadResults({ append: true, before: cursor })}
                            >
                                {loadingMore ? '더 불러오는 중...' : '이전 결과 더 보기'}
                            </button>
                        )}
                    </div>
                </section>
            </div>
        </ModalPortal>
    );
};

export default LabResultsTool;
