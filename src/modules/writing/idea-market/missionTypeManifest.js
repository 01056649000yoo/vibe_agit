export const meetingMissionType = {
    id: 'meeting',
    name: '안건 의견 모으기',
    icon: '🏛️',
    description: '선생님이 안건을 내걸고 학생들이 그 안건에 의견을 냅니다.',
    teacherEntry: () => import('./IdeaMarketManager'),
    teacherReview: true,
    reviewLabel: '학생 의견 보기',
    supportsEvaluation: true,
    studentRoute: 'writing',
    postStatus: '제안중',
    reactionProfile: 'meeting',
    studentLabels: {
        editorHeading: '🏛️ 이 안건에 대한 나의 의견',
        titlePlaceholder: '내 의견을 한 줄로 적어주세요...',
        contentPlaceholder: '왜 그렇게 생각하는지, 어떻게 하면 좋을지 자유롭게 적어보세요...',
        previewHeading: '의견 제출 전 확인',
        previewDescription: '의견 제목과 내용이 친구들에게 잘 전달되는지 마지막으로 확인해보세요.',
        titleLabel: '의견 제목',
        contentLabel: '의견 내용 미리보기',
        submitLabel: '의견 제출하기 🏛️',
        previewSubmitLabel: '이 의견 제출하기 🏛️',
        titleRequiredMessage: '친구들이 이해할 수 있도록 의견 제목을 적어주세요! 🏛️',
        submitConfirmMessage: '이 의견을 제출할까요? 제출 후에는 바로 수정할 수 없어요.'
    },
    ownPostReactionsReadOnly: true,
    getSubmitSuccessMessage: ({ extensionResult }) => {
        if (extensionResult?.success && extensionResult.points_awarded > 0) {
            return `🎉 의견을 제출했어요! 친구 아지트에서 함께 살펴볼 수 있어요.\n제출 보상 +${extensionResult.points_awarded}P를 받았어요! 🪙`;
        }
        return '🎉 의견을 제출했어요! 친구 아지트에서 친구들과 함께 살펴볼 수 있어요.';
    }
};
