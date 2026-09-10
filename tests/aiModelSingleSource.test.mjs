import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SHARED = 'supabase/functions/_shared/model.js';
const read = (file) => readFileSync(file, 'utf8');

/** 모델 이름처럼 보이는 문자열. 새 모델로 바꿔도 이 모양은 그대로다. */
const MODEL_LITERAL = /['"](gpt-[a-z0-9.-]+|o[0-9]-[a-z0-9.-]+|chatgpt-[a-z0-9.-]+)['"]/;

/** 폴더 아래 코드 파일을 모두 모은다(문서·사본은 뺀다). */
const codeFiles = (dir) => {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { out.push(...codeFiles(full)); continue; }
        if (/\.(js|mjs|ts|jsx)$/.test(entry.name) && !entry.name.includes('.bak')) out.push(full);
    }
    return out;
};

test('AI 모델 이름은 _shared/model.js 한 곳에서만 정한다', () => {
    /*
     * 왜 이 검사가 있나 (2026-09-10):
     *   `gpt-4o-mini` 가 세 곳에 따로 박혀 있었다 — vibe-ai 두 자리와 주간 맞춤법 검수.
     *   모델을 바꾸려면 세 곳을 다 찾아야 했고, 한 곳을 놓치면 **오류 없이** 그 기능만
     *   옛 모델을 계속 썼다. 값이 같은지 아무도 확인하지 않으므로 조용히 어긋난다.
     */
    assert.match(read(SHARED), /export const OPENAI_MODEL = '[^']+';/);

    /*
     * 브라우저 콘솔에 붙여 넣어 쓰는 침투 시험 스크립트만 뺀다. 모듈을 가져올 수 없는 자리이고,
     * 거기 적힌 모델은 **서버로 보내는 시험 입력**일 뿐이다. `vibe-ai` 는 요청 본문의 model 을
     * 아예 읽지 않으므로(클라이언트가 모델을 고를 수 없다) 그 값은 서버 동작과 무관하다.
     */
    const EXEMPT = new Set(['scripts/security-test-plan.js']);

    const offenders = [];
    for (const dir of ['supabase/functions', 'src', 'scripts']) {
        for (const file of codeFiles(dir)) {
            if (file === SHARED || EXEMPT.has(file)) continue;
            const line = read(file).split('\n').findIndex((text) => MODEL_LITERAL.test(text));
            if (line >= 0) offenders.push(`${file}:${line + 1}`);
        }
    }
    assert.deepEqual(offenders, [],
        `모델 이름을 직접 적은 곳이 있습니다. ${SHARED} 를 가져다 쓰세요: ${offenders.join(', ')}`);
});

test('AI 를 부르는 곳은 모두 공유 상수를 가져다 쓴다', () => {
    const vibeAi = read('supabase/functions/vibe-ai/index.ts');
    const reviewCore = read('supabase/functions/spelling-weekly-review/reviewCore.js');

    assert.match(vibeAi, /import \{ OPENAI_MODEL \} from '\.\.\/_shared\/model\.js'/);
    // vibe-ai 는 두 곳에서 AI 를 부른다(댓글 안전 검사·나머지 전부). 둘 다 상수를 써야 한다.
    assert.equal((vibeAi.match(/model: OPENAI_MODEL,/g) || []).length, 2);
    assert.equal((vibeAi.match(/api\.openai\.com/g) || []).length, 2);

    // 클라이언트가 모델을 고를 수 없어야 한다. 고를 수 있으면 비싼 모델로 요금을 태울 수 있다.
    assert.doesNotMatch(vibeAi, /model\s*[=:]\s*(body|payload|req)/);

    // 되돌림 경로(Node)가 쓰던 이름은 그대로 이어 준다.
    assert.match(reviewCore, /export \{ OPENAI_MODEL as MODEL \} from '\.\.\/_shared\/model\.js';/);
    assert.match(read('scripts/run-weekly-spelling-review.mjs'), /MODEL,/);
});

test('공유 파일은 Node 와 Deno 양쪽이 읽을 수 있어야 한다', async () => {
    // `reviewCore.js` 는 엣지(Deno)와 되돌림 경로(Node) 양쪽이 읽는다.
    // Node 는 `.ts` 를 못 읽으므로 공유 파일은 `.js` 여야 한다.
    assert.ok(SHARED.endsWith('.js'), '공유 파일이 .js 가 아니면 Node 되돌림 경로가 깨진다.');
    const loaded = await import(`../${SHARED}`);
    assert.equal(typeof loaded.OPENAI_MODEL, 'string');
    assert.ok(loaded.OPENAI_MODEL.length > 0);

    // 주간 검수가 이어 주는 이름도 실제로 같은 값이어야 한다.
    const core = await import('../supabase/functions/spelling-weekly-review/reviewCore.js');
    assert.equal(core.MODEL, loaded.OPENAI_MODEL);
});
