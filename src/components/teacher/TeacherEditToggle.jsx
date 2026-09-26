import './teacherPostEdit.css';

/**
 * 글 자세히 보기의 `✏️ 직접 고쳐 주기` (2026-09-26). 전에는 윗줄 단추 무리 끝의 연보라 `수정 모드` 라 눈에 띄지 않았고,
 * 승인한 글·보고하는 글에서는 말없이 사라졌다. 이제 본문 제목 줄에 두고, 못 쓰는 글에서는 흐리게 남아 까닭을 적는다
 * (다시 쓰기·승인 단추와 같은 규칙).
 */
export const getTeacherEditBlockedReason = ({ isReportPost, isConfirmed }) => {
    if (isReportPost) return '보고하는 글 틀은 직접 고칠 수 없어요.';
    if (isConfirmed) return '승인한 글은 승인을 취소한 뒤 고칠 수 있어요.';
    return null;
};

export const TeacherEditToggle = ({ active, blockedReason, onToggle }) => (
    <div className="teacher-edit-toggle__wrap">
        <button
            type="button"
            className={`teacher-edit-toggle${active ? ' is-active' : ''}`}
            disabled={Boolean(blockedReason)}
            aria-pressed={active}
            title={blockedReason || (active ? '고친 내용을 버리고 원래 글로 돌아갑니다' : '학생 글을 직접 고쳐서 학생에게 되돌려 줍니다')}
            onClick={onToggle}
        >
            {active ? '✖ 고치기 그만' : '✏️ 직접 고쳐 주기'}
        </button>
        {blockedReason ? <span className="teacher-edit-toggle__hint">{blockedReason}</span> : null}
    </div>
);

/** 고치는 동안 본문 위에 두는 띠 — 저장하면 무슨 일이 생기는지 미리 말한다. */
export const TeacherEditBanner = () => (
    <div className="teacher-edit-banner" role="status">
        <strong>✏️ 학생 글을 고치는 중입니다</strong>
        저장하면 이 글이 학생에게 되돌아가 <b>다시 쓰기</b>가 되고, 학생은 선생님이 고친 글에서 이어 씁니다.
        학생이 다시 내면 승인할 수 있습니다.
    </div>
);
