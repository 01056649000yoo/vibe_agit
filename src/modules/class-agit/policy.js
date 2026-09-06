const worksPerRoom = 20;
const maxWorks = 120;
export const CLASS_AGIT_LIMITS = Object.freeze({
    worksPerRoom, maxRooms: 10, maxWorks, maxCandidates: 100,
    roomTitleLength: 60, roomIntroductionLength: 240,
    titleLength: 80, introductionLength: 240, authorLength: 30,
    anthologyWorks: 100, externalExpiryDays: 30,
    selectionBatch: 50, candidatePage: 30, missionPage: 50,
});

// Navigation, student responses and public responses share the same canonical work IDs.
export const isClassAgitWorkId = (value) => typeof value === 'string' && value === value.trim()
    && /^published-[1-9][0-9]{0,2}$/.test(value)
    && Number(value.slice('published-'.length)) <= CLASS_AGIT_LIMITS.maxWorks;

// 문집 차례 id 도 같은 규칙을 쓴다. 상한을 정규식에 박아 두면 anthologyWorks 만 올렸을 때
// 101번째부터 학생 화면이 조용히 되돌아가고 원인이 어디에도 남지 않는다.
export const isClassAgitChapterId = (value) => typeof value === 'string' && value === value.trim()
    && /^chapter-[1-9][0-9]{0,2}$/.test(value)
    && Number(value.slice('chapter-'.length)) <= CLASS_AGIT_LIMITS.anthologyWorks;

export const CLASS_AGIT_SCOPES = Object.freeze({
    class: '학급 전시', anthology: '글꽃 책방', external: '외부 공개본',
});
