const EMPTY_REWARD_TRACK = Object.freeze({
    currentLevel: 1,
    claimableTotal: 0,
    claimedTotal: 0,
    levels: Object.freeze([])
});

export const EMPTY_TITLE_REWARDS = Object.freeze({
    enabled: false,
    policyVersion: null,
    seasonId: null,
    seasonStatus: null,
    claimableTotal: 0,
    claimedTotal: 0,
    tracks: Object.freeze({
        diary: EMPTY_REWARD_TRACK,
        reading: EMPTY_REWARD_TRACK
    })
});

export const EMPTY_TITLE_STATUS = Object.freeze({
    writerTotalChars: 0,
    writerCompletedPosts: 0,
    writerLevelOverride: null,
    readerScore: 0,
    readerPostCount: 0,
    readerLevelOverride: null,
    diaryDays: 0,
    readingLogCount: 0,
    readingBookCount: 0,
    season: null,
    titleRewards: EMPTY_TITLE_REWARDS
});

const normalizeRewardTrack = (track) => ({
    currentLevel: Number(track?.current_level || 1),
    claimableTotal: Number(track?.claimable_total || 0),
    claimedTotal: Number(track?.claimed_total || 0),
    levels: Array.isArray(track?.levels)
        ? track.levels.map((item) => ({
            level: Number(item?.level || 0),
            points: Number(item?.points || 0),
            status: item?.status || 'locked'
        }))
        : []
});

export const normalizeTitleRewards = (rewards) => ({
    enabled: rewards?.enabled === true,
    policyVersion: rewards?.policy_version == null ? null : Number(rewards.policy_version),
    seasonId: rewards?.season_id || null,
    seasonStatus: rewards?.season_status || null,
    claimableTotal: Number(rewards?.claimable_total || 0),
    claimedTotal: Number(rewards?.claimed_total || 0),
    tracks: {
        diary: normalizeRewardTrack(rewards?.tracks?.diary),
        reading: normalizeRewardTrack(rewards?.tracks?.reading)
    }
});

/** 칭호 조회·학생 홈 bootstrap·수령 응답이 함께 쓰는 단일 정규화 경계. */
export const normalizeTitleStatus = (data) => ({
    writerTotalChars: Number(data?.writer_total_chars || 0),
    writerCompletedPosts: Number(data?.writer_completed_posts || 0),
    writerLevelOverride: data?.writer_level_override == null ? null : Number(data.writer_level_override),
    readerScore: Number(data?.reader_score || 0),
    readerPostCount: Number(data?.reader_post_count || 0),
    readerLevelOverride: data?.reader_level_override == null ? null : Number(data.reader_level_override),
    diaryDays: Number(data?.diary_days || 0),
    readingLogCount: Number(data?.reading_log_count || 0),
    readingBookCount: Number(data?.reading_book_count || 0),
    season: data?.season || null,
    titleRewards: normalizeTitleRewards(data?.title_rewards)
});

export const getTitleRewardTrack = (status, kind) => (
    kind === 'diary'
        ? (status?.titleRewards?.tracks?.diary || EMPTY_REWARD_TRACK)
        : kind === 'reading'
            ? (status?.titleRewards?.tracks?.reading || EMPTY_REWARD_TRACK)
            : EMPTY_REWARD_TRACK
);
