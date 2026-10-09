import FeatureAvailabilitySwitch from '../../../components/common/FeatureAvailabilitySwitch';

/**
 * 과제의 "학생끼리 서로의 글 보기" 선택(2026-10-08). 과제 만드는 화면 네 곳(일반·편지·보고서·시)이 함께 쓴다.
 * 끄면 이 과제의 학생 글은 선생님과 쓴 학생 본인만 본다 — 서버가 visibility 를 private 로 둔다(20261385).
 * 친구가 글을 볼 수 없으니 친구 댓글도 함께 끈다(peerReadingPatch).
 * 모양은 과제 화면의 다른 켜기와 같은 공용 스위치(2026-10-09 화면 정리).
 */
export const peerReadingPatch = (enabled) => (enabled
    ? { peer_reading_enabled: true }
    : { peer_reading_enabled: false, allow_comments: false });

export default function PeerReadingChoice({ enabled = true, onChange }) {
    return (
        <FeatureAvailabilitySwitch
            checked={enabled}
            onChange={(next) => onChange(peerReadingPatch(next))}
            ariaLabel="반 친구도 글 읽기"
            enabledLabel="👀 반 친구도 글을 읽어요"
            disabledLabel="🔒 선생님만 글을 읽어요"
            enabledDescription="끄면 학생끼리 서로의 글을 볼 수 없어요."
            disabledDescription="친구 글 보기·친구 댓글이 꺼져요. 학생 본인은 자기 글을 봐요."
            fullWidth
        />
    );
}

/** 친구 댓글 켜기 — 친구가 글을 못 보면 댓글도 쓸 수 없어 잠근다. */
export function PeerCommentSwitch({ allowComments, peerReadingEnabled = true, onChange }) {
    const locked = peerReadingEnabled === false;
    return (
        <FeatureAvailabilitySwitch
            checked={!locked && Boolean(allowComments)}
            onChange={(next) => onChange(next)}
            disabled={locked}
            ariaLabel="친구 댓글 허용"
            enabledLabel="💬 친구 댓글 허용"
            disabledLabel={locked ? '💬 친구 댓글 꺼짐' : '💬 친구 댓글 사용 안 함'}
            enabledDescription="친구 글에 한 줄 댓글을 남길 수 있어요."
            disabledDescription={locked ? '선생님만 읽는 과제라 댓글도 꺼져요.' : '켜면 친구 글에 댓글을 남길 수 있어요.'}
            fullWidth
        />
    );
}
