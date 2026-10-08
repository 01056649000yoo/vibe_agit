import './PeerReadingChoice.css';

/**
 * 과제의 "학생끼리 서로의 글 보기" 선택(2026-10-08). 과제 만드는 화면 네 곳(일반·편지·보고서·시)이 함께 쓴다.
 * 끄면 이 과제의 학생 글은 선생님과 쓴 학생 본인만 본다 — 서버가 visibility 를 private 로 둔다(20261385).
 * 친구가 글을 볼 수 없으니 친구 댓글도 함께 끈다(peerReadingPatch).
 */
export const peerReadingPatch = (enabled) => (enabled
    ? { peer_reading_enabled: true }
    : { peer_reading_enabled: false, allow_comments: false });

export default function PeerReadingChoice({ enabled = true, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            className={`peer-reading-choice${enabled ? '' : ' is-private'}`}
            onClick={() => onChange(peerReadingPatch(!enabled))}
        >
            <span aria-hidden="true">{enabled ? '👀' : '🔒'}</span>
            <span>
                <strong>{enabled ? '반 친구도 글을 읽어요' : '선생님만 글을 읽어요'}</strong>
                <small>{enabled ? '누르면 학생끼리 서로의 글을 볼 수 없게 바꿔요' : '친구 글 보기·친구 댓글이 꺼져요(학생 본인은 자기 글을 봐요)'}</small>
            </span>
        </button>
    );
}
