// Open synchronously in the click handler, before loading the renderer or fetching data.
export function prepareAnthologyWindow() {
    const target = window.open('', '_blank');
    if (!target) throw new Error('문집 인쇄 창이 차단되었습니다. 팝업을 허용한 뒤 다시 눌러 주세요.');
    target.document.title = '문집 준비 중'; target.document.body.textContent = '수록 작품과 출력을 확인하고 있습니다…';
    return target;
}
