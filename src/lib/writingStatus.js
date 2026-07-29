/**
 * 학생이 지금 실제로 다시 써서 제출해야 하는 글인지 판정한다.
 *
 * is_returned 하나만 보면 과거 데이터의 모순 상태(재제출/승인됐는데 플래그가
 * 남은 경우)까지 할 일로 잡힌다. 화면에서는 아래 네 조건을 하나의 계약으로 쓴다.
 */
export const isPendingRewrite = (post) => Boolean(
    post?.is_returned &&
    !post?.is_submitted &&
    !post?.is_confirmed &&
    !post?.recalled_at
);
