import { applyGenrePreset } from '../mission-types/genreCatalog';

export const MISSION_DRAFT_DEFAULTS = Object.freeze({
    title: '', guide: '', genre: '', guide_questions: [],
    min_chars: 100, min_paragraphs: 1, mission_type: '',
    base_reward: 100, bonus_threshold: 100, bonus_reward: 10
});

/** 일반 과제와 연결 기능이 함께 쓰는 최소 미션 초안 계약이다. */
export const createMissionDraft = (overrides = {}) => ({
    ...MISSION_DRAFT_DEFAULTS,
    ...overrides,
    guide_questions: Array.isArray(overrides.guide_questions) ? [...overrides.guide_questions] : []
});

/** 장르 선택 시 일반 과제와 같은 프리셋 규칙을 적용한다. */
export const applyGenreToMissionDraft = (
    draft,
    genreId,
    { previousGenre = draft.genre || null, missionType = draft.mission_type || '', ...options } = {}
) => {
    const result = applyGenrePreset(draft, genreId, { previousGenre, ...options });
    return { ...result, formData: { ...result.formData, mission_type: missionType } };
};

export const normalizeMissionDraft = (draft) => ({
    ...draft,
    title: draft.title.trim(),
    guide: draft.guide.trim(),
    guide_questions: (draft.guide_questions || []).map((question) => question.trim()).filter(Boolean)
});
