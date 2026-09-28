import { letterMissionType } from './letter/manifest.js';
import { poemMissionType } from './poem/manifest.js';
import { reportMissionType } from './report/manifest.js';
import { meetingMissionType } from '../idea-market/missionTypeManifest.js';
import { getReactionProfile } from '../reactions/registry.js';
import { countContentChars } from '../../../lib/textMetrics.js';

const genreMissionTypes = [
    poemMissionType,
    letterMissionType,
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

export const getMissionReactionProfile = (mission) => {
    const missionType = getGenreMissionType(resolveGenreMissionTypeId(mission));
    return getReactionProfile(missionType?.reactionProfile);
};

export const getMissionReactionOptions = (mission) => (
    getMissionReactionProfile(mission).options
);

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

// 글자 수의 원본. 보고서·편지·시처럼 칸이 나뉜 글은 학생이 쓴 칸만 세고(장르의 countWrittenChars),
// 그 밖의 글은 본문을 센다. 서버 public.writing_post_char_count 가 같은 규칙을 따른다.
// 칸으로 센 값이 본문보다 클 수는 없게 둘 중 작은 값을 쓴다 — 칸 값만 부풀려 보내도 늘지 않는다.
export const countWrittenChars = ({ content = '', structuredContent = null } = {}) => {
    const contentChars = countContentChars(content);
    for (const type of genreMissionTypes) {
        const written = type.countWrittenChars?.(structuredContent);
        if (Number.isFinite(written)) return Math.min(written, contentChars);
    }
    return contentChars;
};

export const validateGenreMissionSubmission = (id, payload) => {
    const missionType = getGenreMissionType(id);
    return missionType?.validateSubmission?.(payload) ?? null;
};
