/*
 * 맞춤법 자료 글을 다듬는 작은 도구(2026-10-22).
 *
 * `fixParticles` — 해설의 ‘따옴표 낱말’ 뒤 조사를 받침에 맞게 고친다.
 *    (‘귀뜸’가 아니라 ‘귀띔’로 → ‘귀뜸’이 아니라 ‘귀띔’으로, ‘모델’라고 → ‘모델’이라고)
 */
const HANGUL_START = 0xAC00;
const HANGUL_END = 0xD7A3;
const RIEUL_FINAL = 8;

const finalOf = (char) => {
    const code = char.codePointAt(0);
    return code >= HANGUL_START && code <= HANGUL_END ? (code - HANGUL_START) % 28 : null;
};

/** [받침 없을 때, 받침 있을 때, 받침이 ㄹ일 때] — ㄹ 받침은 `로` 만 받침 없는 글자처럼 쓴다. */
const PARTICLE_PAIRS = new Map(Object.entries({
    가: ['가', '이', '이'], 이: ['가', '이', '이'],
    는: ['는', '은', '은'], 은: ['는', '은', '은'],
    를: ['를', '을', '을'], 을: ['를', '을', '을'],
    와: ['와', '과', '과'], 과: ['와', '과', '과'],
    로: ['로', '으로', '로'], 으로: ['로', '으로', '로'],
    라고: ['라고', '이라고', '이라고'], 이라고: ['라고', '이라고', '이라고'],
    예요: ['예요', '이에요', '이에요'], 이에요: ['예요', '이에요', '이에요']
}));

const QUOTED_PARTICLE = /([‘'])([^’']{1,30})([’'])(이라고|이에요|으로|라고|예요|가|이|는|은|를|을|와|과|로)(?![가-힣])/gu;

export const fixParticles = (text) => String(text ?? '').replace(QUOTED_PARTICLE, (whole, open, word, close, particle) => {
    const finalSound = finalOf(word.slice(-1));
    if (finalSound === null) return whole;
    const [vowel, consonant, rieul] = PARTICLE_PAIRS.get(particle);
    return `${open}${word}${close}${finalSound === 0 ? vowel : finalSound === RIEUL_FINAL ? rieul : consonant}`;
});
