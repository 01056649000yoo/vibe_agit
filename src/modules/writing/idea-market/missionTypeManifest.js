export const meetingMissionType = {
    id: 'meeting',
    name: '회의 안건 미션',
    icon: '🏛️',
    description: '학급 회의 안건에 대한 학생들의 의견과 제안을 모읍니다.',
    teacherEntry: () => import('./IdeaMarketManager'),
    teacherReview: true,
    reviewLabel: '학생 제안 보기',
    supportsEvaluation: true,
    studentRoute: 'writing',
    postStatus: '제안중',
    studentLabels: {
        editorHeading: '🏛️ 나의 안건 제안',
        titlePlaceholder: '안건 제목을 적어주세요...',
        contentPlaceholder: '왜 필요한 안건인지, 어떻게 하면 좋을지 자유롭게 적어보세요...',
        previewHeading: '안건 제출 전 확인',
        previewDescription: '안건 제목과 제안 내용이 친구들에게 잘 전달되는지 마지막으로 확인해보세요.',
        titleLabel: '안건 제목',
        contentLabel: '제안 내용 미리보기',
        submitLabel: '안건 제출하기 🏛️',
        previewSubmitLabel: '이 안건 제출하기 🏛️',
        titleRequiredMessage: '친구들이 이해할 수 있도록 안건 제목을 적어주세요! 🏛️',
        submitConfirmMessage: '이 안건을 제출할까요? 제출 후에는 바로 수정할 수 없어요.'
    },
    reactionIcons: [
        { type: 'agree', label: '마음에 들어요', emoji: '💜' },
        { type: 'supplement', label: '더 이야기해요', emoji: '🔧' },
        { type: 'disagree', label: '다른 생각이에요', emoji: '💭' }
    ],
    ownPostReactionsReadOnly: true,
    getSubmitSuccessMessage: ({ extensionResult }) => {
        if (extensionResult?.success && extensionResult.points_awarded > 0) {
            return `🎉 안건을 제출했어요! 친구 아지트에서 함께 살펴볼 수 있어요.\n제출 보상 +${extensionResult.points_awarded}P를 받았어요! 🪙`;
        }
        return '🎉 안건을 제출했어요! 친구 아지트에서 친구들과 함께 살펴볼 수 있어요.';
    }
};

export default meetingMissionType;
