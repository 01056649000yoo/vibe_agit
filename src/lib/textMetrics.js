// 글자 수 규칙의 원본. 서버 public.writing_content_char_count 가 같은 규칙을 SQL 로 따른다
// (tests/charCountParity.test.mjs 가 두 곳을 한꺼번에 본다).
//
// - 눈에 안 보이는 서식 문자는 세지 않는다.
// - 줄바꿈은 세지 않는다. 엔터를 연타해 글자 수를 늘리지 못하게 한다.
// - 띄어쓰기는 몇 칸이든 한 칸으로 센다. 글 앞뒤 빈칸은 세지 않는다(서버 btrim 과 같게 한 칸만 뗀다 —
//   이미 한 칸으로 줄였으므로 앞뒤에 남는 빈칸은 많아야 한 칸이다).
// - 이모지 같은 글자는 한 글자로 센다(서버 char_length 와 같게 코드 포인트 단위).
//
// 아래 세 글자 묶음은 SQL 쪽에 글자 그대로 같은 모양으로 적혀 있어야 한다(검사가 문자열로 대조한다).
export const INVISIBLE_CHARS_CLASS = '[\\u200B-\\u200D\\u2060\\uFEFF]';
export const LINE_BREAKS_CLASS = '[\\r\\n\\u2028\\u2029]+';
export const SPACE_RUNS_CLASS = '[ \\t\\f\\v\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000]+';

const INVISIBLE_CHARS = new RegExp(INVISIBLE_CHARS_CLASS, 'g');
const LINE_BREAKS = new RegExp(LINE_BREAKS_CLASS, 'g');
const SPACE_RUNS = new RegExp(SPACE_RUNS_CLASS, 'g');

export const normalizeCountedText = (value = '') => String(value ?? '')
    .replace(INVISIBLE_CHARS, '')
    .replace(LINE_BREAKS, '')
    .replace(SPACE_RUNS, ' ')
    .replace(/^ | $/g, '');

export const countContentChars = (value = '') =>
    Array.from(normalizeCountedText(value)).length;
