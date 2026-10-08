/**
 * 학생 입력기 모듈 — 입력창 + 초등 맞춤법 검사기 한 묶음(2026-10-08, 선생님 결정).
 * 학생이 글을 쓰는 칸이 필요한 화면은 여기서만 가져온다. 사용법은 README.md.
 */
export { default as StudentTextArea } from './StudentTextArea';
export { default as StudentTextField } from './StudentTextField';
export { useSpellingCheck } from './checker/useSpellingCheck';
export { checkSpelling, uniqueSpellingIssues, MAX_SPELLING_ISSUES } from './checker/spellingEngine';
