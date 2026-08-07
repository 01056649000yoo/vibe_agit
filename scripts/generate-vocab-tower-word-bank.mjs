import { readFileSync, writeFileSync } from 'node:fs';

const outputPath = 'supabase/migrations/20260927_vocab_tower_word_bank.sql';
const sqlText = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const rows = [];

for (let grade = 3; grade <= 6; grade += 1) {
    const source = JSON.parse(readFileSync(`public/data/grade${grade}_vocab.json`, 'utf8'));
    const uniqueWords = new Map(source.map((item) => [item.word, item]));
    for (const item of uniqueWords.values()) {
        rows.push(`    (${grade}, ${sqlText(item.word)}, ${sqlText(item.category)}, ${Number(item.level || 1)}, ${sqlText(item.definition)}, ${sqlText(item.example)})`);
    }
}

const migration = `-- public/data의 3~6학년 어휘를 서버 검증용 단어 은행으로 동기화한다.
-- 이 파일은 scripts/generate-vocab-tower-word-bank.mjs로 다시 만들 수 있다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vocab_tower_words (
    grade SMALLINT NOT NULL CHECK (grade BETWEEN 3 AND 6),
    word TEXT NOT NULL,
    category TEXT NOT NULL,
    level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 5),
    definition TEXT NOT NULL,
    example TEXT NOT NULL,
    PRIMARY KEY (grade, word)
);

INSERT INTO public.vocab_tower_words (grade, word, category, level, definition, example)
VALUES
${rows.join(',\n')}
ON CONFLICT (grade, word) DO UPDATE SET
    category = EXCLUDED.category,
    level = EXCLUDED.level,
    definition = EXCLUDED.definition,
    example = EXCLUDED.example;

CREATE INDEX IF NOT EXISTS idx_vocab_tower_words_grade_level
    ON public.vocab_tower_words (grade, level, word);

ALTER TABLE public.vocab_tower_words ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vocab_tower_words FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vocab_tower_words TO service_role;

COMMIT;
`;

writeFileSync(outputPath, migration);
console.log(`wrote ${outputPath} (${rows.length} unique grade/word rows)`);
