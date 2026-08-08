(function guideKakaoBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (!userAgent.includes('kakaotalk')) return;

  if (userAgent.includes('android')) {
    location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
    return;
  }
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
    window.alert("구글 로그인을 위해 외부 브라우저가 필요합니다.\n\n오른쪽 하단 '...' 버튼을 누른 뒤\n'다른 브라우저로 열기' 또는 'Safari로 열기'를 선택해주세요!");
  }
}());
