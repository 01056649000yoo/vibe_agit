import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, RefreshCw, Trash2 } from 'lucide-react';
import Button from '../../../components/common/Button';
import CenteredDialog from '../../../components/common/CenteredDialog';
import { labResultsApi } from '../tools/lab-results/api';
import LabOutlineReferenceCard from './LabOutlineReferenceCard';

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

const REFERENCE_KIND_ORDER = ['outline', 'selected_questions', 'one_line'];

const sortReferences = (items) => [...items].sort((a, b) => (
    REFERENCE_KIND_ORDER.indexOf(a.resultKind) - REFERENCE_KIND_ORDER.indexOf(b.resultKind)
));

const mergeLoadedSelections = (current, items) => {
    const pinnedOutline = items.find((item) => item.resultKind === 'outline' && item.isPinned);
    const selectedByKind = new Map();

    current
        .filter((item) => item.resultKind !== 'outline')
        .forEach((item) => {
            const fresh = items.find((candidate) => candidate.id === item.id);
            if (fresh) selectedByKind.set(fresh.resultKind, fresh);
        });
    items
        .filter((item) => item.resultKind !== 'outline' && item.isLinked)
        .forEach((item) => {
            if (!selectedByKind.has(item.resultKind)) selectedByKind.set(item.resultKind, item);
        });

    return sortReferences([
        ...(pinnedOutline ? [pinnedOutline] : []),
        ...selectedByKind.values()
    ]);
};

const OutlinePinConfirmDialog = ({
    result,
    currentResult,
    missionTitle,
    isSaving,
    error,
    onCancel,
    onConfirm
}) => {
    const isReplacing = Boolean(currentResult && currentResult.id !== result?.id);
    const dialogTitle = isReplacing ? '다른 개요로 바꿀까요?' : '이 개요를 고정할까요?';

    return (
        <CenteredDialog
            isOpen={Boolean(result)}
            onClose={isSaving ? () => {} : onCancel}
            eyebrow="글쓰기 개요 확인"
            title={dialogTitle}
            description={missionTitle ? `적용할 과제 · ${missionTitle}` : '현재 글쓰기 과제에 적용합니다.'}
            maxWidth="720px"
            zIndex={28000}
        >
            {isReplacing && (
                <div className="writing-reference-pin-change-summary">
                    현재 고정된 <strong>{currentResult.title}</strong>을(를) 아래 개요로 바꿉니다.
                </div>
            )}
            <LabOutlineReferenceCard
                result={result}
                eyebrow="선택한 개요"
                heading={result?.title || '글 개요'}
                badge={isReplacing ? '교체할 개요' : '고정할 개요'}
                compact
                notice={(
                    <p>확인하면 이 개요가 글에 고정되고 학생과 선생님에게 최신 저장 내용이 표시됩니다.</p>
                )}
            />
            {error && <p className="writing-reference-pin-error" role="alert">{error}</p>}
            <div className="writing-reference-pin-actions">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
                    다시 선택하기
                </Button>
                <Button type="button" onClick={onConfirm} disabled={isSaving}>
                    {isSaving ? '고정하는 중…' : (isReplacing ? '이 개요로 바꾸기' : '이 개요 고정하기')}
                </Button>
            </div>
        </CenteredDialog>
    );
};

const LabReferenceResult = ({ result, onRemove, onChangeOutline, outlineChangeLocked }) => {
    const meta = RESULT_META[result.resultKind] || RESULT_META.outline;

    if (result.resultKind === 'outline') {
        return (
            <div className="writing-reference-lab-result">
                <LabOutlineReferenceCard
                    result={result}
                    badge="이 글에 고정됨"
                    notice={(
                        <p>연구소에서 같은 개요를 다시 고치면 서버에 저장된 최신 내용이 자동으로 반영돼요.</p>
                    )}
                    actions={(
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={onChangeOutline}
                            disabled={outlineChangeLocked}
                        >
                            {outlineChangeLocked ? '승인된 글은 개요 교체 불가' : '다른 개요로 바꾸기'}
                        </Button>
                    )}
                />
            </div>
        );
    }

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

            {result.resultKind === 'one_line' ? (
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

const LabReferenceSource = ({ missionId, missionTitle, isActive, isApproved = false, onInsertText }) => {
    const [results, setResults] = useState([]);
    const [selectedResults, setSelectedResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [pendingOutline, setPendingOutline] = useState(null);
    const [pinning, setPinning] = useState(false);
    const [pinError, setPinError] = useState('');
    const [selectionMessage, setSelectionMessage] = useState('');
    const loadRequestRef = useRef(null);
    const activeMissionRef = useRef(missionId);
    const lastLoadedAtRef = useRef(0);

    activeMissionRef.current = missionId;

    const loadResults = useCallback(async ({ silent = false, force = false } = {}) => {
        if (!missionId) return;
        if (loadRequestRef.current?.missionId === missionId) {
            if (!force) return loadRequestRef.current.promise;
            await loadRequestRef.current.promise;
            if (activeMissionRef.current !== missionId) return;
        }

        const requestedMissionId = missionId;
        const request = (async () => {
            if (!silent) setLoading(true);
            setError('');
            try {
                const items = await labResultsApi.listForWritingReference({ missionId, limit: 20 });
                if (activeMissionRef.current !== requestedMissionId) return;
                setResults(items);
                setSelectedResults((current) => mergeLoadedSelections(current, items));
                setLoaded(true);
                lastLoadedAtRef.current = Date.now();
                return true;
            } catch {
                if (!silent && activeMissionRef.current === requestedMissionId) {
                    setError('연구소 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
                }
                return false;
            } finally {
                if (!silent && activeMissionRef.current === requestedMissionId) setLoading(false);
            }
        })();

        loadRequestRef.current = { missionId, promise: request };
        try {
            return await request;
        } finally {
            if (loadRequestRef.current?.promise === request) loadRequestRef.current = null;
        }
    }, [missionId]);

    useEffect(() => {
        setResults([]);
        setSelectedResults([]);
        setLoaded(false);
        setError('');
        setIsPickerOpen(false);
        setPendingOutline(null);
        setPinError('');
        setSelectionMessage('');
        lastLoadedAtRef.current = 0;
    }, [missionId]);

    useEffect(() => {
        if (!isActive) return;
        void loadResults();
    }, [isActive, loadResults]);

    useEffect(() => {
        if (!isActive) return undefined;
        const refreshWhenReturning = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - lastLoadedAtRef.current < 1000) return;
            void loadResults({ silent: true });
        };
        window.addEventListener('focus', refreshWhenReturning);
        document.addEventListener('visibilitychange', refreshWhenReturning);
        return () => {
            window.removeEventListener('focus', refreshWhenReturning);
            document.removeEventListener('visibilitychange', refreshWhenReturning);
        };
    }, [isActive, loadResults]);

    const toggleReference = (result) => {
        if (result.resultKind === 'outline') {
            const currentPinned = results.find((item) => item.resultKind === 'outline' && item.isPinned);
            if (currentPinned?.id === result.id || isApproved) return;
            setPinError('');
            setSelectionMessage('');
            setPendingOutline(result);
            return;
        }
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

    const confirmOutlinePin = async () => {
        if (!pendingOutline || pinning) return;
        const currentPinned = results.find((item) => item.resultKind === 'outline' && item.isPinned) || null;
        setPinning(true);
        setPinError('');
        try {
            const response = await labResultsApi.pinOutline({
                missionId,
                resultId: pendingOutline.id,
                expectedResultId: currentPinned?.id || null
            });
            if (response?.success) {
                const pinnedResult = {
                    ...pendingOutline,
                    isPinned: true,
                    pinnedAt: response.pinned_at || new Date().toISOString()
                };
                setResults((current) => current.map((item) => ({
                    ...item,
                    isPinned: item.resultKind === 'outline' && item.id === pinnedResult.id,
                    pinnedAt: item.resultKind === 'outline' && item.id === pinnedResult.id
                        ? pinnedResult.pinnedAt
                        : null
                })));
                setSelectedResults((current) => sortReferences([
                    pinnedResult,
                    ...current.filter((item) => item.resultKind !== 'outline')
                ]));
                await loadResults({ silent: true, force: true });
                setPendingOutline(null);
                setIsPickerOpen(false);
                setSelectionMessage('');
                return;
            }
            if (response?.status === 'conflict') {
                setPendingOutline(null);
                setSelectionMessage('다른 창에서 고정 개요가 바뀌었어요. 최신 선택을 불러왔으니 다시 확인해 주세요.');
                await loadResults({ silent: true, force: true });
                return;
            }
            if (response?.status === 'approved_locked') {
                setPendingOutline(null);
                setSelectionMessage('선생님이 최종 승인한 글은 다른 개요로 바꿀 수 없어요.');
                await loadResults({ silent: true, force: true });
                return;
            }
            setPinError('개요를 고정하지 못했어요. 잠시 후 다시 시도해 주세요.');
        } catch {
            setPinError('개요를 고정하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');
        } finally {
            setPinning(false);
        }
    };

    const selectedResultIds = selectedResults.map((result) => result.id);
    const currentPinnedOutline = results.find((result) => result.resultKind === 'outline' && result.isPinned) || null;

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
                    onChangeOutline={() => setIsPickerOpen(true)}
                    outlineChangeLocked={isApproved}
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
                        outlineSelectionLocked={isApproved}
                        selectionMessage={selectionMessage}
                    />
                </Suspense>
            )}

            {pendingOutline && (
                <OutlinePinConfirmDialog
                    result={pendingOutline}
                    currentResult={currentPinnedOutline}
                    missionTitle={missionTitle}
                    isSaving={pinning}
                    error={pinError}
                    onCancel={() => {
                        setPendingOutline(null);
                        setPinError('');
                    }}
                    onConfirm={() => void confirmOutlinePin()}
                />
            )}
        </div>
    );
};

export default LabReferenceSource;
