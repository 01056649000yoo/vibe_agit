/*
 * 제출 전광판이 다루는 과제 범위를 한 곳에서 정한다.
 *
 * 같은 규칙(보관·회의 과제 제외, 기본은 가장 최근 과제)을 전광판 화면과 우리 반 스크린의
 * 글쓰기 현황이 함께 쓴다. 서버도 `writing_missions`를 `is_archived IS FALSE`,
 * `mission_type <> 'meeting'`, `created_at DESC, id DESC`로 같은 순서로 고른다.
 * 세 곳이 어긋나면 교사가 보는 기본 과제가 화면마다 달라지므로 이 파일을 원본으로 쓴다.
 */

export const getSubmissionBoardMissions = (missions = []) => (Array.isArray(missions) ? missions : [])
    .filter((mission) => mission?.is_archived !== true && mission?.mission_type !== 'meeting');

export const getLatestSubmissionBoardMission = (missions = []) => {
    const candidates = getSubmissionBoardMissions(missions);
    if (candidates.length === 0) return null;
    return candidates.reduce((latest, mission) => {
        const latestTime = Date.parse(latest?.created_at || '') || 0;
        const missionTime = Date.parse(mission?.created_at || '') || 0;
        if (missionTime !== latestTime) return missionTime > latestTime ? mission : latest;
        return String(mission?.id || '') > String(latest?.id || '') ? mission : latest;
    });
};
