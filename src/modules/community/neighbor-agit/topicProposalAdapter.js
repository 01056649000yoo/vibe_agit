import { createMissionDraft, normalizeMissionDraft } from '../../writing/mission-form/missionDraft';

export const createNeighborTopicDraft = () => createMissionDraft({
    min_chars: 50,
    base_reward: 10,
    bonus_threshold: 0,
    bonus_reward: 0
});

/** 공용 미션 초안을 이웃 아지트의 교사 승인형 제안 명령으로 바꾼다. */
export const toNeighborTopicProposal = ({ spaceId, draft }) => {
    const mission = normalizeMissionDraft(draft);
    return {
        space_id: spaceId,
        type: 'topic',
        title: mission.title,
        prompt: mission.guide,
        genre: mission.genre || null,
        guide_questions: mission.guide_questions,
        min_chars: mission.min_chars,
        min_paragraphs: mission.min_paragraphs,
        mission_type_id: mission.mission_type || null,
        base_reward: mission.base_reward,
        bonus_threshold: mission.bonus_threshold,
        bonus_reward: mission.bonus_reward
    };
};
