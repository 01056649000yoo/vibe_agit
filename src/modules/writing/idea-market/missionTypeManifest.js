export const meetingMissionType = {
    id: 'meeting',
    name: '회의 안건 미션',
    icon: '🏛️',
    description: '학급 회의 안건에 대한 학생들의 의견과 제안을 모읍니다.',
    teacherEntry: () => import('./IdeaMarketManager'),
    studentRoute: 'idea_market',
};

export default meetingMissionType;
