/*
 * 카카오톡 안에서 열렸을 때 바깥 브라우저로 안내한다.
 *
 * 왜 있나: 카카오톡 내장 브라우저에서는 **구글 로그인이 막힌다.** 그래서 로그인해야 하는
 * 화면은 크롬·사파리로 넘겨 준다.
 *
 * 넘기면 안 되는 곳 (2026-09-14 제보로 알게 됨):
 *   안드로이드로 넘길 때 쓰는 `intent://` 주소는 **`#` 뒷부분을 담지 못한다.**
 *   `#` 자리를 `#Intent;…` 문법이 이미 쓰기 때문이다. 그런데 전시 공개 주소는
 *   `/exhibition#<64자리 열쇠>` 처럼 열쇠가 `#` 뒤에 있다.
 *   그대로 넘기면 열쇠가 사라진 채 크롬이 열려, 선생님에게는 **"공유가 끝났거나 지금 볼 수 없는
 *   전시입니다"** 로 보였다. 종료된 게 아니라 열쇠를 잃은 것이었다(문자로 보내면 멀쩡했다).
 *
 * 그래서 두 가지를 거른다.
 *   1) 공개 전시는 로그인을 쓰지 않는다 — 넘길 이유가 없다.
 *   2) 주소에 `#` 내용이 있으면 넘기지 않는다 — 넘기는 순간 그 내용이 사라지기 때문이다.
 *      카카오 내장 브라우저에 머물러도 공개 페이지는 잘 열린다. 열쇠를 잃는 것보다 낫다.
 */
(function guideKakaoBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  if (!userAgent.includes('kakaotalk')) return;

  // 로그인이 필요 없는 공개 주소. 넘기면 오히려 망가진다.
  const PUBLIC_PATHS = ['/exhibition'];
  const isPublicPage = PUBLIC_PATHS.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`));

  // `#` 뒤 내용은 바깥 브라우저로 옮길 방법이 없다. 있으면 여기 머문다.
  const carriesHash = location.hash.length > 1;

  if (isPublicPage || carriesHash) return;

  if (userAgent.includes('android')) {
    location.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
    return;
  }
  if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
    window.alert("구글 로그인을 위해 외부 브라우저가 필요합니다.\n\n오른쪽 하단 '...' 버튼을 누른 뒤\n'다른 브라우저로 열기' 또는 'Safari로 열기'를 선택해주세요!");
  }
}());
