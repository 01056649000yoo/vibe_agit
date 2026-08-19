import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { FlaskConical, RefreshCw, Trash2 } from 'lucide-react';
import { labResultsApi } from '../tools/lab-results/api';

const LabResultsTool = lazy(() => import('../tools/lab-results/LabResultsTool'));

const RESULT_META = Object.freeze({
    outline: {
        eyebrow: '글 개요짜기',
        title: '나의 글 개요'
    },
    selected_questions: {
        eyebrow: '좋은 질문 고르기',
        title: '내가 고른 좋은 질문'
    },
    one_line: {
        eyebrow: '한줄모아',
        title: '내가 쓴 한 줄 문장'
    }
});

const OUTLINE_SECTIONS = ['처음', '가운데', '끝'];

const LabReferenceResult = ({ result, onRemove }) => {
    const meta = RESULT_META[result.resultKind] || RESULT_META.outline;
    const outlineGroups = result.resultKind === 'outline'
        ? OUTLINE_SECTIONS.map((section) => ({
            section,
            chunks: result.chunks.filter((chunk) => chunk.section === section)
        })).filter((group) => group.chunks.length > 0)
        : [];

    return (
        <section className="writing-reference-section writing-reference-lab-result">
            <div className="writing-reference-section__heading writing-reference-lab-result__heading">
                <div>
                    <span>{meta.eyebrow}</span>
                    <h4>{meta.title}</h4>
                    <p>{result.title}{result.topic ? ` · ${result.topic}` : ''}</p>
                    {result.hint && <p className="writing-reference-lab-result__hint">{result.hint}</p>}
                </div>
                <button type="button" onClick={() => onRemove(result.resultKind)}>
                    <Trash2 size={14} aria-hidden="true" />
                    빼기
                </button>
            </div>

            {result.resultKind === 'outline' ? (
                <div className="writing-reference-outline">
                    {outlineGroups.map((group) => (
                        <div key={group.section}>
                            <strong>{group.section}</strong>
                            <ul>
                                {group.chunks.map((chunk) => (
                                    <li key={`${result.id}:${chunk.id}`}>
                                        {chunk.label && <span>{chunk.label}</span>}
                                        <p>{chunk.text}</p>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            ) : result.resultKind === 'one_line' ? (
                <div className="writing-reference-oneline-box" style={{
                    background: '#FFF5F5',
                    border: '1px solid #FFE4E6',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    color: '#9F1239'
                }}>
                    {result.chunks.map((chunk) => (
                        <p key={`${result.id}:${chunk.id}`} style={{
                            margin: 0,
                            fontSize: '1rem',
                            fontWeight: '600',
                            lineHeight: '1.6'
                        }}>
                            💬 &ldquo;{chunk.text}&rdquo;
                        </p>
                    ))}
                </div>
            ) : (
                <ol className="writing-reference-list writing-reference-question-results">
                    {result.chunks.map((chunk) => (
                        <li key={`${result.id}:${chunk.id}`}>
                            <p>{chunk.text}</p>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
};

const LabReferenceSource = ({ missionId, isActive, onInsertText }) => {
    const [results, setResults] = useState([]);
    const [selectedResults, setSelectedResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [isPickerOpen, setIsPickerOpen] = useState(false);

    const loadResults = useCallback(async () => {
        if (!missionId) return;
        setLoading(true);
        setError('');
        try {
            const items = await labResultsApi.listForWritingReference({ missionId, limit: 20 });
            setResults(items);
            setSelectedResults((current) => {
                const linkedResults = items.filter((item) => (
                    item.isLinked
                    && !current.some((selected) => selected.resultKind === item.resultKind)
                ));
                return [...current, ...linkedResults]
                    .sort((a, b) => ['outline', 'selected_questions', 'one_line'].indexOf(a.resultKind)
                        - ['outline', 'selected_questions', 'one_line'].indexOf(b.resultKind));
            });
            setLoaded(true);
        } catch {
            setError('연구소 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        } finally {
            setLoading(false);
        }
    }, [missionId]);

    useEffect(() => {
        if (!isActive || loaded || loading || error) return;
        void loadResults();
    }, [error, isActive, loadResults, loaded, loading]);

    const toggleReference = (result) => {
        setSelectedResults((current) => current.some((item) => item.id === result.id)
            ? current.filter((item) => item.id !== result.id)
            : [
                ...current.filter((item) => item.resultKind !== result.resultKind),
                result
            ].sort((a, b) => ['outline', 'selected_questions'].indexOf(a.resultKind)
                - ['outline', 'selected_questions'].indexOf(b.resultKind)));
    };

    const removeReference = (resultKind) => {
        setSelectedResults((current) => current.filter((item) => item.resultKind !== resultKind));
    };

    const selectedResultIds = selectedResults.map((result) => result.id);

    return (
        <div className="writing-reference-lab-source">
            <div className="writing-reference-lab-source__intro">
                <span aria-hidden="true"><FlaskConical size={18} /></span>
                <div>
                    <small>내가 만든 글쓰기 자료</small>
                    <strong>글쓰기 연구소</strong>
                    <p>내가 연구소에서 만든 개요·질문·한 줄 문장을 골라 옆에 펼쳐 두거나 본문에 넣을 수 있어요.</p>
                </div>
            </div>

            {loading && (
                <div className="writing-reference-source-state" role="status">
                    연구소 자료를 찾고 있어요…
                </div>
            )}

            {!loading && error && (
                <div className="writing-reference-source-state is-error" role="alert">
                    <p>{error}</p>
                    <button type="button" onClick={() => void loadResults()}>
                        <RefreshCw size={15} aria-hidden="true" /> 다시 시도
                    </button>
                </div>
            )}

            {!loading && !error && loaded && selectedResults.map((result) => (
                <LabReferenceResult
                    key={result.resultKind}
                    result={result}
                    onRemove={removeReference}
                />
            ))}

            {!loading && !error && loaded && selectedResults.length === 0 && (
                <div className="writing-reference-source-state">
                    <strong>아직 참고함에 둔 연구소 자료가 없어요.</strong>
                    <p>내가 완료한 활동 중에서 이 글에 참고할 자료를 골라보세요.</p>
                </div>
            )}

            {!loading && !error && loaded && (
                <button
                    type="button"
                    className="writing-reference-source-picker"
                    onClick={() => setIsPickerOpen(true)}
                >
                    <FlaskConical size={17} aria-hidden="true" />
                    {selectedResults.length > 0 ? '연구소 자료 바꾸기' : '연구소 자료 불러오기'}
                </button>
            )}

            {isPickerOpen && (
                <Suspense fallback={null}>
                    <LabResultsTool
                        onClose={() => setIsPickerOpen(false)}
                        onToggleReference={toggleReference}
                        onInsertText={onInsertText}
                        selectedResultIds={selectedResultIds}
                        providedResults={results}
                    />
                </Suspense>
            )}
        </div>
    );
};

export default LabReferenceSource;
