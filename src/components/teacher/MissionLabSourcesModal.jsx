import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, Link2, Link2Off } from 'lucide-react';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';
import { labReferenceApi } from '../../modules/writing/references/labReferenceApi';
import './MissionLabSourcesModal.css';

const SOURCE_META = Object.freeze({
    outline: {
        title: '글 개요짜기',
        description: '학생이 완성한 처음·가운데·끝 개요를 참고함에 먼저 보여줘요.'
    },
    selected_questions: {
        title: '좋은 질문 고르기',
        description: '학생이 활동에서 직접 고른 질문을 참고함에 먼저 보여줘요.'
    }
});

const formatDate = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ko-KR');
};

const MissionLabSourcesModal = ({ mission, onClose }) => {
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [savingKind, setSavingKind] = useState('');

    const loadSources = useCallback(async () => {
        if (!mission?.id) return;
        setLoading(true);
        setError('');
        try {
            setSources(await labReferenceApi.listTeacherSources(mission.id));
        } catch {
            setError('이 과제에 연결할 연구소 활동을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [mission?.id]);

    useEffect(() => {
        void loadSources();
    }, [loadSources]);

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

    const updateLink = async (resultKind, roomId) => {
        setSavingKind(resultKind);
        setError('');
        try {
            await labReferenceApi.setTeacherSource({
                missionId: mission.id,
                resultKind,
                roomId
            });
            setSources((current) => current.map((source) => (
                source.resultKind === resultKind
                    ? { ...source, isLinked: roomId !== null && source.roomId === roomId }
                    : source
            )));
        } catch {
            setError('연구소 활동 연결을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        } finally {
            setSavingKind('');
        }
    };

    return (
        <ModalPortal>
            <div className="mission-lab-sources-overlay" onMouseDown={onClose}>
                <section
                    className="mission-lab-sources-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mission-lab-sources-title"
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    <header>
                        <div className="mission-lab-sources-title">
                            <span aria-hidden="true"><FlaskConical size={22} /></span>
                            <div>
                                <small>{mission?.title}</small>
                                <h2 id="mission-lab-sources-title">연구소 자료 연결</h2>
                            </div>
                        </div>
                        <ModalCloseButton onClick={onClose} label="연구소 자료 연결 닫기" />
                    </header>

                    <p className="mission-lab-sources-guide">
                        연결한 활동을 완료한 학생은 자기 결과를 글쓰기 참고함에서 먼저 볼 수 있습니다.
                    </p>

                    <div className="mission-lab-sources-body">
                        {loading && <div className="mission-lab-sources-state">우리 반 연구소 활동을 찾는 중…</div>}
                        {!loading && error && (
                            <div className="mission-lab-sources-state is-error">
                                <p>{error}</p>
                                <button type="button" onClick={() => void loadSources()}>다시 불러오기</button>
                            </div>
                        )}

                        {!loading && !error && Object.entries(SOURCE_META).map(([resultKind, meta]) => {
                            const items = sources.filter((source) => source.resultKind === resultKind);
                            const linkedItem = items.find((source) => source.isLinked);
                            const isSaving = savingKind === resultKind;

                            return (
                                <section key={resultKind} className="mission-lab-source-group">
                                    <div className="mission-lab-source-group__heading">
                                        <div>
                                            <h3>{meta.title}</h3>
                                            <p>{meta.description}</p>
                                        </div>
                                        {linkedItem && (
                                            <button
                                                type="button"
                                                className="mission-lab-source-unlink"
                                                disabled={isSaving}
                                                onClick={() => void updateLink(resultKind, null)}
                                            >
                                                <Link2Off size={15} aria-hidden="true" /> 연결 해제
                                            </button>
                                        )}
                                    </div>

                                    {items.length === 0 ? (
                                        <div className="mission-lab-source-empty">
                                            이 유형으로 만든 우리 반 연구소 활동이 아직 없습니다.
                                        </div>
                                    ) : (
                                        <div className="mission-lab-source-options">
                                            {items.map((source) => (
                                                <button
                                                    key={source.roomId}
                                                    type="button"
                                                    className={source.isLinked ? 'is-linked' : ''}
                                                    disabled={isSaving}
                                                    onClick={() => void updateLink(resultKind, source.roomId)}
                                                >
                                                    <span className="mission-lab-source-option__icon" aria-hidden="true">
                                                        <Link2 size={17} />
                                                    </span>
                                                    <span>
                                                        <strong>{source.title}</strong>
                                                        {source.topic && <small>주제: {source.topic}</small>}
                                                        <em>{formatDate(source.createdAt)}{source.isActive ? ' · 진행 가능' : ' · 종료된 활동'}</em>
                                                    </span>
                                                    <b>{source.isLinked ? '연결됨' : '선택'}</b>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            );
                        })}
                    </div>
                </section>
            </div>
        </ModalPortal>
    );
};

export default MissionLabSourcesModal;
