import React, { lazy, Suspense, useState } from 'react';
import Button from '../../../components/common/Button';
import { READER_LEVELS, WRITER_LEVELS } from '../../../constants/writerLevels';
import DragonHideoutScene from './DragonHideoutScene';
import {
    DRAGON_SPECIES,
    getDragonStage,
    getReaderDragonEffect
} from './presentation';
import './TeacherStagePreview.css';

const DragonGrowthCelebrationModal = lazy(() => import('./DragonGrowthCelebrationModal'));

const formatWriterRequirement = (level) => {
    if (level.level === 1) return '모든 학생의 시작 단계';
    if (level.criterion === 'posts') return `완성 글 ${level.from}편부터`;
    return `이번 학기 완성 글 ${Number(level.from).toLocaleString('ko-KR')}자부터`;
};

const formatReaderRequirement = (level) => (
    level.level === 1 ? '소통 활동을 시작하는 단계' : `소통 활동 ${Number(level.from).toLocaleString('ko-KR')}점부터`
);

const TeacherStagePreview = () => {
    const [speciesId, setSpeciesId] = useState(DRAGON_SPECIES[0].id);
    const [writerLevel, setWriterLevel] = useState(1);
    const [readerLevel, setReaderLevel] = useState(1);
    const [celebrationOpen, setCelebrationOpen] = useState(false);

    const selectedWriter = WRITER_LEVELS[writerLevel - 1];
    const selectedReader = READER_LEVELS[readerLevel - 1];
    const dragon = getDragonStage(writerLevel, speciesId);
    const readerEffect = getReaderDragonEffect(readerLevel);
    const previewPet = {
        name: '미리보기 수호룡',
        species: speciesId,
        background: 'default'
    };

    return (
        <section className="dragon-stage-preview" aria-labelledby="dragon-stage-preview-title">
            <header className="dragon-stage-preview__header">
                <div>
                    <span className="dragon-teacher-eyebrow">TEACHER PREVIEW</span>
                    <h3 id="dragon-stage-preview-title">수호룡 단계 미리보기</h3>
                    <p>학생 기록을 바꾸지 않고 수호룡 4종, 작가 성장 10단계와 소통 효과 7단계를 조합해 확인합니다.</p>
                </div>
                <span className="dragon-stage-preview__safe-badge">교사 전용 · 저장 안 됨</span>
            </header>

            <div className="dragon-stage-preview__layout">
                <div className="dragon-stage-preview__stage">
                    <div className="dragon-stage-preview__scene-heading">
                        <div>
                            <small>선택한 학생 화면 모습</small>
                            <strong>{dragon.species.shortName} · {dragon.name}</strong>
                        </div>
                        <span>작가 Lv.{writerLevel} + 소통 Lv.{readerLevel}</span>
                    </div>
                    <DragonHideoutScene
                        petData={previewPet}
                        dragon={dragon}
                        readerLevel={readerLevel}
                        ownerName="교사 미리보기"
                        eager
                    />
                    <div className="dragon-stage-preview__summary">
                        <div>
                            <small>작가 성장</small>
                            <strong>{selectedWriter.emoji} Lv.{selectedWriter.level} {selectedWriter.name}</strong>
                            <span>{formatWriterRequirement(selectedWriter)}</span>
                        </div>
                        <div>
                            <small>소통 효과</small>
                            <strong>{selectedReader.emoji} Lv.{selectedReader.level} {readerEffect.name}</strong>
                            <span>{readerEffect.description}</span>
                        </div>
                    </div>
                    <div className="dragon-stage-preview__actions">
                        <Button
                            type="button"
                            variant="accent"
                            onClick={() => setCelebrationOpen(true)}
                            disabled={writerLevel === 1}
                        >
                            {writerLevel === 1 ? '2단계부터 성장 연출 확인' : `${writerLevel - 1} → ${writerLevel}단계 성장 연출 보기`}
                        </Button>
                        <small>연출을 닫아도 학생의 성장 확인 기록에는 반영되지 않습니다.</small>
                    </div>
                </div>

                <div className="dragon-stage-preview__controls">
                    <fieldset>
                        <legend>1. 수호룡 종류</legend>
                        <div className="dragon-stage-preview__species">
                            {DRAGON_SPECIES.map((species) => (
                                <button
                                    type="button"
                                    key={species.id}
                                    className={speciesId === species.id ? 'is-selected' : ''}
                                    aria-pressed={speciesId === species.id}
                                    onClick={() => setSpeciesId(species.id)}
                                >
                                    <span style={{ '--species-accent': species.accent, '--species-soft': species.soft }} aria-hidden="true" />
                                    <strong>{species.shortName}</strong>
                                    <small>{species.description}</small>
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend>2. 작가 성장 단계</legend>
                        <p>완성한 글과 글자 수에 따라 수호룡 몸체가 달라집니다.</p>
                        <div className="dragon-stage-preview__levels dragon-stage-preview__levels--writer">
                            {WRITER_LEVELS.map((level) => (
                                <button
                                    type="button"
                                    key={level.level}
                                    className={writerLevel === level.level ? 'is-selected' : ''}
                                    aria-pressed={writerLevel === level.level}
                                    title={`Lv.${level.level} ${level.name} · ${formatWriterRequirement(level)}`}
                                    onClick={() => setWriterLevel(level.level)}
                                >
                                    <span>{level.emoji}</span>
                                    <strong>{level.level}</strong>
                                </button>
                            ))}
                        </div>
                        <div className="dragon-stage-preview__selection-copy">
                            <strong>Lv.{selectedWriter.level} {selectedWriter.name}</strong>
                            <span>{formatWriterRequirement(selectedWriter)}</span>
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend>3. 소통 효과 단계</legend>
                        <p>친구 글 읽기·반응·댓글 활동이 빛과 입자 효과로 더해집니다.</p>
                        <div className="dragon-stage-preview__levels dragon-stage-preview__levels--reader">
                            {READER_LEVELS.map((level) => (
                                <button
                                    type="button"
                                    key={level.level}
                                    className={readerLevel === level.level ? 'is-selected' : ''}
                                    aria-pressed={readerLevel === level.level}
                                    title={`R${level.level} ${level.name} · ${formatReaderRequirement(level)}`}
                                    onClick={() => setReaderLevel(level.level)}
                                >
                                    <span>{level.emoji}</span>
                                    <strong>{level.level}</strong>
                                </button>
                            ))}
                        </div>
                        <div className="dragon-stage-preview__selection-copy is-reader">
                            <strong>Lv.{selectedReader.level} {selectedReader.name} · {readerEffect.name}</strong>
                            <span>{formatReaderRequirement(selectedReader)} · {readerEffect.description}</span>
                        </div>
                    </fieldset>
                </div>
            </div>

            {celebrationOpen ? (
                <Suspense fallback={<div className="dragon-stage-preview__modal-loading" role="status">성장 연출을 준비하는 중입니다…</div>}>
                    <DragonGrowthCelebrationModal
                        growth={{ fromLevel: writerLevel - 1, toLevel: writerLevel }}
                        species={speciesId}
                        dragonName="미리보기 수호룡"
                        writerTitle={selectedWriter.name}
                        readerLevel={readerLevel}
                        saving={false}
                        onConfirm={() => setCelebrationOpen(false)}
                    />
                </Suspense>
            ) : null}
        </section>
    );
};

export default TeacherStagePreview;
