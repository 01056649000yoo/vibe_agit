const worksPerRoom = 12;
const maxWorks = 120;
export const CLASS_AGIT_LIMITS = Object.freeze({
    worksPerRoom, maxRooms: Math.ceil(maxWorks / worksPerRoom), maxWorks, maxCandidates: 100,
    titleLength: 80, introductionLength: 240, authorLength: 30,
    anthologyWorks: 100, externalExpiryDays: 30,
});

// Navigation, student responses and public responses share the same canonical work IDs.
export const isClassAgitWorkId = (value) => typeof value === 'string' && value === value.trim()
    && /^published-[1-9][0-9]{0,2}$/.test(value)
    && Number(value.slice('published-'.length)) <= CLASS_AGIT_LIMITS.maxWorks;

export const CLASS_AGIT_SCOPES = Object.freeze({
    class: '학급 전시', anthology: '학급 문집', external: '외부 공개본',
});
