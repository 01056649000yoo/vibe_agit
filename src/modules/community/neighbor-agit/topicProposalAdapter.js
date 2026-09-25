import { createMissionDraft, normalizeMissionDraft } from '../../writing/mission-form/missionDraft';

// 같이 쓰기 광장 주제의 처음 값(2026-09-25 선생님 요청: 300자·100포인트). 글 종류를 고르면
// 손대지 않은 글자 수는 그 종류의 권장값(300~400자)으로 맞춰진다 — 비교도 이 값 하나를 본다.
export const NEIGHBOR_TOPIC_DEFAULTS = Object.freeze({
    min_chars: 300,
    base_reward: 100,
    bonus_threshold: 0,
    bonus_reward: 0
});

export const createNeighborTopicDraft = () => createMissionDraft({ ...NEIGHBOR_TOPIC_DEFAULTS });

/** 공용 미션 초안을 모두의 아지트의 교사 승인형 제안 명령으로 바꾼다. */
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
