export const DEFAULT_REACTION_PROFILE_ID = 'standard';

const createProfile = (id, label, options) => Object.freeze({
    id,
    label,
    options: Object.freeze(options.map((option) => Object.freeze({ ...option }))),
});

const reactionProfiles = new Map([
    ['standard', createProfile('standard', '기본 글 반응', [
        { type: 'heart', label: '좋아요', emoji: '❤️' },
        { type: 'laugh', label: '재밌어요', emoji: '😂' },
        { type: 'wow', label: '멋져요', emoji: '👏' },
        { type: 'bulb', label: '배워요', emoji: '💡' },
        { type: 'star', label: '최고야', emoji: '✨' },
    ])],
    ['report', createProfile('report', '보고하는 글 반응', [
        { type: 'report_detail', label: '관찰이 자세해요', emoji: '🔍' },
        { type: 'report_clear', label: '정리가 잘됐어요', emoji: '📋' },
        { type: 'report_new', label: '새롭게 알았어요', emoji: '💡' },
    ])],
    ['meeting', createProfile('meeting', '회의 안건 반응', [
        { type: 'agree', label: '마음에 들어요', emoji: '💜' },
        { type: 'supplement', label: '더 이야기해요', emoji: '🔧' },
        { type: 'disagree', label: '다른 생각이에요', emoji: '💭' },
    ])],
]);

const reactionOptionsByType = new Map();
for (const profile of reactionProfiles.values()) {
    for (const option of profile.options) {
        if (reactionOptionsByType.has(option.type)) {
            throw new Error(`반응 유형이 여러 프로필에 중복 등록되었습니다: ${option.type}`);
        }
        reactionOptionsByType.set(option.type, Object.freeze({ ...option, profileId: profile.id }));
    }
}

const UNKNOWN_REACTION = Object.freeze({
    type: 'unknown',
    label: '반응',
    emoji: '✨',
    profileId: DEFAULT_REACTION_PROFILE_ID,
});

export const getReactionProfiles = () => Array.from(reactionProfiles.values());

export const getReactionProfile = (profileId = DEFAULT_REACTION_PROFILE_ID) => (
    reactionProfiles.get(profileId) || reactionProfiles.get(DEFAULT_REACTION_PROFILE_ID)
);

export const getReactionOptions = (profileId = DEFAULT_REACTION_PROFILE_ID) => (
    getReactionProfile(profileId).options
);

export const getReactionOption = (reactionType) => (
    reactionOptionsByType.get(reactionType) || { ...UNKNOWN_REACTION, type: reactionType || 'unknown' }
);

export const isKnownReactionProfile = (profileId) => reactionProfiles.has(profileId);

