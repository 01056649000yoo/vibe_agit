/**
 * 학생이 글을 쓰는 세 화면(질문 없는 과제·질문 있는 과제·독서록)의 공용 바깥 폭.
 *
 * Card는 border-box이고 좌우 32px, 실제 편집 섹션은 좌우 60px 여백을 사용한다.
 * 따라서 PC에서 제목·본문의 실제 폭은 1200 - 64 - 120 = 1016px가 된다.
 * 모바일에서는 Card의 width: 100%가 화면 폭에 맞춰 자동으로 줄어든다.
 */
export const STUDENT_WRITING_CARD_MAX_WIDTH = '1200px';

/** 과제·독서록이 모바일에서도 같은 실제 입력 폭을 갖게 하는 공용 카드 여백. */
export const getStudentWritingCardPadding = (isMobile) => (
    isMobile ? '32px 20px' : '32px'
);
