// 이웃 아지트는 별도 편집기나 글 사본을 만들지 않는다. 기존 글쓰기 화면이 만든
// student_posts 원본과 임시저장을 그대로 쓰고, 제출된 글의 공개 연결만 전용 RPC로 관리한다.
export const NEIGHBOR_AGIT_WRITING_BRIDGE = Object.freeze({
    sourceTable: 'student_posts',
    shareTable: 'neighbor_shared_posts',
    editorStrategy: 'reuse-existing-writing-editor',
    draftStrategy: 'reuse-existing-writing-draft',
    requestRpc: 'request_neighbor_post_share_v1',
    recallRpc: 'recall_my_neighbor_shared_post_v1',
    reviewRpc: 'review_neighbor_shared_post_v1',
    moderationRpc: 'moderate_neighbor_item_v1'
});
