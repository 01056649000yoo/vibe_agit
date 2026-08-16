import Button from '../common/Button';

/**
 * 학생 화면에서 이전 화면(대개 홈)으로 돌아가는 버튼 — 모든 메뉴가 이 하나를 쓴다.
 *
 * 왜 컴포넌트로 두나: 예전에는 화면마다 `뒤로 가기` / `⬅️ 홈으로` / `⬅️ 돌아가기` 로 제각각이었다.
 * 학생은 같은 자리에서 같은 말을 볼 때 가장 빨리 익숙해지므로 문구·모양·크기를 한곳에서 정한다.
 * 문구는 과제 글쓰기 화면에서 쓰던 `뒤로 가기` 를 기준으로 통일했다.
 *
 * **문구를 바꾸는 옵션은 두지 않는다.** 옵션을 열어 두면 화면마다 다시 갈라진다.
 * 홈이 아니라 다른 화면으로 돌아가는 버튼(예: 글 상세에서 `← 내 서재`)은 목적지를 알려 줘야 하므로
 * 이 컴포넌트를 쓰지 말고 그 화면의 말로 따로 만든다.
 */
const StudentBackButton = ({ onClick, disabled = false, className = '' }) => (
    <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className={className}
    >
        뒤로 가기
    </Button>
);

export default StudentBackButton;
