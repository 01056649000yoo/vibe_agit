import React from 'react';
import Button from '../../../components/common/Button';
import {
    getCurriculumGradeBand,
    getKoreanStandardsForGradeBand,
    KOREAN_GRADE_BANDS,
    KOREAN_CURRICULUM_VERSION,
} from './koreanAchievementStandards';

const LEVEL_PRESETS = {
    3: [
        { score: 3, label: '우수' },
        { score: 2, label: '보통' },
        { score: 1, label: '노력' }
    ],
    4: [
        { score: 4, label: '매우 우수' },
        { score: 3, label: '우수' },
        { score: 2, label: '보통' },
        { score: 1, label: '노력' }
    ],
    5: [
        { score: 5, label: '매우 우수' },
        { score: 4, label: '우수' },
        { score: 3, label: '보통' },
        { score: 2, label: '기초' },
        { score: 1, label: '노력' }
    ]
};

export const createDefaultEvaluationRubric = (rubric = null) => {
    const savedLevels = Array.isArray(rubric?.levels) && rubric.levels.length > 0
        ? rubric.levels.map((level) => ({ ...level }))
        : LEVEL_PRESETS[3].map((level) => ({ ...level }));
    const curriculum = rubric?.curriculum || {};
    const gradeBand = getCurriculumGradeBand(curriculum);
    const availableCodes = new Set(
        getKoreanStandardsForGradeBand(gradeBand).map((standard) => standard.code)
    );
    const selectedCodes = Array.isArray(curriculum.achievement_standard_codes)
        ? curriculum.achievement_standard_codes.filter((code) => availableCodes.has(code))
        : [];

    return {
        ...(rubric || {}),
        use_rubric: rubric?.use_rubric === true,
        levels: savedLevels,
        curriculum: {
            version: curriculum.version || KOREAN_CURRICULUM_VERSION,
            subject: '국어',
            grade_band: gradeBand,
            achievement_standard_codes: selectedCodes
        }
    };
};

const RubricSettings = ({
    rubric,
    onChange,
    isMobile,
    onSaveDefaultRubric,
    recommendedCodes = []
}) => {
    const normalized = createDefaultEvaluationRubric(rubric);
    const curriculum = normalized.curriculum;
    const availableStandards = getKoreanStandardsForGradeBand(curriculum.grade_band);
    const selectedCodes = curriculum.achievement_standard_codes;

    const updateRubric = (patch) => onChange({ ...normalized, ...patch });
    const updateCurriculum = (patch) => updateRubric({
        curriculum: { ...curriculum, ...patch }
    });

    const handleGradeBandChange = (event) => {
        const gradeBand = event.target.value || null;
        const keepCodes = gradeBand === curriculum.grade_band;
        const gradeBandStandardCodes = new Set(
            getKoreanStandardsForGradeBand(gradeBand).map((standard) => standard.code)
        );
        const recommendedForGradeBand = recommendedCodes.filter((code) => gradeBandStandardCodes.has(code));
        updateCurriculum({
            grade_band: gradeBand,
            achievement_standard_codes: keepCodes ? selectedCodes : recommendedForGradeBand
        });
    };

    const toggleStandard = (code) => {
        const nextCodes = selectedCodes.includes(code)
            ? selectedCodes.filter((selectedCode) => selectedCode !== code)
            : [...selectedCodes, code];
        updateCurriculum({ achievement_standard_codes: nextCodes });
    };

    return (
        <div style={{
            background: '#FFF8F0',
            padding: isMobile ? '16px' : '20px',
            borderRadius: '20px',
            border: normalized.use_rubric ? '2px solid #F39C12' : '1px dashed #E67E22',
            marginBottom: '8px',
            transition: 'all 0.3s'
        }}>
            <div style={{
                display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap',
                marginBottom: normalized.use_rubric ? '20px' : 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={normalized.use_rubric}
                        aria-label="글쓰기 평가 루브릭 사용"
                        onClick={() => updateRubric({ use_rubric: !normalized.use_rubric })}
                        style={{
                            width: '50px', height: '26px', border: 'none', padding: 0,
                            background: normalized.use_rubric ? '#F39C12' : '#BDC3C7',
                            borderRadius: '13px', position: 'relative', cursor: 'pointer', flexShrink: 0
                        }}
                    >
                        <span style={{
                            width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                            position: 'absolute', top: '3px',
                            left: normalized.use_rubric ? '27px' : '3px',
                            transition: 'all 0.3s'
                        }} />
                    </button>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#2C3E50' }}>
                            📊 글쓰기 평가 루브릭 {normalized.use_rubric ? '(사용 중)' : '(선택)'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#7F8C8D', lineHeight: 1.5 }}>
                            성취도 평가와 2022 개정 국어 성취기준 기반 평어 작성에 연결됩니다.
                        </div>
                    </div>
                </div>

                {normalized.use_rubric && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {[3, 4, 5].map((levelCount) => {
                            const isSelected = normalized.levels.length === levelCount;
                            return (
                                <button
                                    key={levelCount}
                                    type="button"
                                    onClick={() => updateRubric({
                                        levels: Reflect.get(LEVEL_PRESETS, levelCount).map((level) => ({ ...level }))
                                    })}
                                    style={{
                                        padding: '6px 14px', borderRadius: '12px',
                                        border: `2px solid ${isSelected ? '#F39C12' : '#E2E8F0'}`,
                                        background: isSelected ? '#F39C12' : 'white',
                                        color: isSelected ? 'white' : '#64748B',
                                        fontSize: '0.85rem', fontWeight: '900', cursor: 'pointer'
                                    }}
                                >
                                    {levelCount}단계
                                </button>
                            );
                        })}
                        {onSaveDefaultRubric && (
                            <Button
                                type="button"
                                onClick={onSaveDefaultRubric}
                                style={{
                                    background: '#FFFFFF', border: '1px solid #F39C12', color: '#F39C12',
                                    padding: '6px 12px', fontSize: '0.8rem', borderRadius: '10px',
                                    fontWeight: 'bold', minHeight: 'auto'
                                }}
                            >
                                💾 단계 기본값 저장
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {normalized.use_rubric && (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : `repeat(${normalized.levels.length}, 1fr)`,
                        gap: '10px', width: '100%', boxSizing: 'border-box', marginBottom: '20px'
                    }}>
                        {normalized.levels.map((level, index) => (
                            <label key={level.score} style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                <span style={{ fontSize: '0.7rem', color: '#E67E22', fontWeight: 'bold' }}>{level.score}점 명칭</span>
                                <input
                                    type="text"
                                    value={level.label}
                                    onChange={(event) => updateRubric({
                                        levels: normalized.levels.map((currentLevel, levelIndex) => (
                                            levelIndex === index ? { ...currentLevel, label: event.target.value } : currentLevel
                                        ))
                                    })}
                                    style={{
                                        width: '100%', padding: '10px', borderRadius: '10px',
                                        border: '1px solid #FAD7A0', fontSize: '0.85rem', textAlign: 'center',
                                        outline: 'none', background: 'white', boxSizing: 'border-box', minWidth: 0
                                    }}
                                />
                            </label>
                        ))}
                    </div>

                    <div style={{ borderTop: '1px solid #FED7AA', paddingTop: '18px' }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            gap: '12px', flexWrap: 'wrap', marginBottom: '12px'
                        }}>
                            <div>
                                <div style={{ color: '#9A3412', fontWeight: '900', fontSize: '0.9rem' }}>
                                    📚 국어 성취기준 연결
                                </div>
                                <div style={{ color: '#9A3412', opacity: 0.75, fontSize: '0.75rem', marginTop: '3px' }}>
                                    2022 개정 국어과 교육과정의 학년군을 선택합니다. 장르 관련 기준은 학년군 선택 시 추천됩니다.
                                </div>
                            </div>
                            <select
                                value={curriculum.grade_band || ''}
                                onChange={handleGradeBandChange}
                                aria-label="국어 성취기준 적용 학년군"
                                style={{
                                    minWidth: '150px', padding: '10px 12px', borderRadius: '12px',
                                    border: '1px solid #FDBA74', background: 'white', color: '#9A3412',
                                    fontWeight: '800', fontSize: '0.85rem'
                                }}
                            >
                                <option value="">학년군 선택</option>
                                {KOREAN_GRADE_BANDS.map((gradeBand) => (
                                    <option key={gradeBand.value} value={gradeBand.value}>{gradeBand.label}</option>
                                ))}
                            </select>
                        </div>

                        {!curriculum.grade_band ? (
                            <div style={{ padding: '16px', borderRadius: '12px', background: '#FFFBEB', color: '#A16207', fontSize: '0.82rem', textAlign: 'center' }}>
                                학년군을 선택하면 글쓰기 관련 국어 성취기준이 나타납니다.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {availableStandards.map((standard) => {
                                    const isSelected = selectedCodes.includes(standard.code);
                                    const isRecommended = recommendedCodes.includes(standard.code);
                                    return (
                                        <button
                                            key={standard.code}
                                            type="button"
                                            onClick={() => toggleStandard(standard.code)}
                                            style={{
                                                width: '100%', textAlign: 'left', padding: '11px 12px',
                                                borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit',
                                                border: isSelected ? '2px solid #F59E0B' : '1px solid #FED7AA',
                                                background: isSelected ? '#FFFBEB' : 'white', color: '#7C2D12'
                                            }}
                                        >
                                            <span style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                                <span aria-hidden="true" style={{ color: isSelected ? '#D97706' : '#CBD5E1', fontWeight: '900' }}>
                                                    {isSelected ? '✓' : '○'}
                                                </span>
                                                <span style={{ lineHeight: 1.5, fontSize: '0.82rem' }}>
                                                    <strong>[{standard.code}]</strong> {standard.description}
                                                    <span style={{ marginLeft: '6px', color: '#9A3412', opacity: 0.7, fontSize: '0.72rem' }}>
                                                        {standard.domain}{isRecommended ? ' · 추천' : ''}
                                                    </span>
                                                </span>
                                            </span>
                                        </button>
                                    );
                                })}
                                <div style={{ color: '#9A3412', fontSize: '0.74rem', textAlign: 'right' }}>
                                    선택 {selectedCodes.length}개 · 2022 개정 국어과 교육과정
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default RubricSettings;
