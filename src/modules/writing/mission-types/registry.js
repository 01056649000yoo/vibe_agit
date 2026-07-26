import { poemMissionType } from './poem/manifest';
import { meetingMissionType } from '../idea-market/missionTypeManifest';

const genreMissionTypes = [
    poemMissionType,
    meetingMissionType,
];

export const getGenreMissionTypes = () => genreMissionTypes;

export const getGenreMissionType = (id) => (
    genreMissionTypes.find((type) => type.id === id) ?? null
);

export const resolveGenreMissionTypeId = (mission) => {
    if (getGenreMissionType(mission?.mission_type)) return mission.mission_type;
    if (getGenreMissionType(mission?.input_template)) return mission.input_template;
    return null;
};

export const validateGenreMissionSubmission = (id, payload) => {
    const missionType = getGenreMissionType(id);
    return missionType?.validateSubmission?.(payload) ?? null;
};
