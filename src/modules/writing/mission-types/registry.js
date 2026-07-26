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

export const validateGenreMissionSubmission = (id, payload) => {
    const missionType = getGenreMissionType(id);
    return missionType?.validateSubmission?.(payload) ?? null;
};
