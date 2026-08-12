import { poemMissionType } from './poem/manifest.js';
import { reportMissionType } from './report/manifest.js';
import { meetingMissionType } from '../idea-market/missionTypeManifest.js';

const genreMissionTypes = [
    poemMissionType,
    reportMissionType,
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

// 이 미션의 장르가 PDF 내보내기 때 선택지(예: 보고서의 질문 포함형/완성본)를 선언했다면 그 목록을 준다.
// 없으면 빈 배열이다. 화면은 장르 이름을 하드코딩하지 않고 이 함수만 통해 선택지 유무를 판정한다.
export const getPdfRenderModes = (mission) => (
    getGenreMissionType(resolveGenreMissionTypeId(mission))?.pdfExport?.renderModes || []
);

// 어떤 글이 섞여 있는지 미리 알 수 없는 내보내기(예: 학생 한 명의 전체 글 모음)를 위해,
// 등록된 장르 중 PDF 선택지를 가진 첫 장르의 목록을 돌려준다.
export const getAnyRegisteredPdfRenderModes = () => {
    const withModes = genreMissionTypes.find((type) => type.pdfExport?.renderModes?.length > 0);
    return withModes?.pdfExport.renderModes || [];
};

export const validateGenreMissionSubmission = (id, payload) => {
    const missionType = getGenreMissionType(id);
    return missionType?.validateSubmission?.(payload) ?? null;
};
