import { createPortal } from 'react-dom';

/**
 * 모달을 <body> 바로 밑에 그린다.
 *
 * `position: fixed` 는 화면 기준이지만, 조상 중에 `transform` 이 걸린 요소가 있으면
 * **그 조상 기준**으로 바뀐다. 학생 홈의 `Card` 가 정확히 그런 경우다 —
 * `animation: fadeIn`(키프레임에 `translateY`)과 `:hover { transform: translateY(-5px) }`.
 * 게다가 `overflow: hidden` 이라 카드 밖으로 나간 부분이 잘린다.
 * 그래서 모달이 화면 가운데가 아니라 문서 어딘가에 뜨고, 학생이 스크롤해야 보였다.
 *
 * 포털로 body 에 붙이면 조상의 transform 과 무관해져 항상 보는 화면 가운데에 뜬다.
 */
const ModalPortal = ({ children }) => {
    if (typeof document === 'undefined') return null;
    return createPortal(children, document.body);
};

export default ModalPortal;
