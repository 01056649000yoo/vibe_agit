/*
 * 로그인해 둔 사람이 새로고침할 때 첫 화면(로그인 안내)이 잠깐 보였다 사라지던 문제를 막는다.
 * index.html 의 미리 그린 첫 화면은 로그인 전 방문자·검색 로봇용이라, 저장된 로그인이 있으면 가린다.
 * 판정은 useAuthStore.js 의 hasStoredSession 과 같은 기준이다(표시용일 뿐, 권한은 서버가 확인한다).
 * 인라인 스크립트는 보안 정책(CSP)이 막아서 파일로 둔다.
 */
(function () {
  try {
    var stored = Object.keys(localStorage).some(function (key) { return key.indexOf('sb-') === 0 && /-auth-token$/.test(key); })
      || document.cookie.split(';').some(function (cookie) { return cookie.trim().indexOf('sb-agit-auth-token') === 0; })
      || localStorage.getItem('student_session') !== null;
    if (stored) document.documentElement.classList.add('has-session');
  } catch { /* 저장소를 못 읽으면 그대로 둔다 */ }
})();
