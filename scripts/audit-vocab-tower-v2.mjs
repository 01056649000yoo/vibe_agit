import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const GRADES = Object.freeze([3, 4, 5, 6]);
const DECK_COUNT = 10;
const DEFAULT_REVIEW_GRADE = 3;
const DEFAULT_REVIEW_DECK = 1;

const sourceUrl = (grade) => new URL(`../public/data/grade${grade}_vocab.json`, import.meta.url);
const reportUrl = new URL('../docs/vocab-tower/V2_WORD_AUDIT.md', import.meta.url);
const deckPlanUrl = new URL('../docs/vocab-tower/data/v2-deck-plan.json', import.meta.url);
const reviewDraftUrl = new URL('../docs/vocab-tower/data/grade3-deck01-review.json', import.meta.url);

const normalizeText = (value) => String(value ?? '').trim();
const normalizeWord = (value) => normalizeText(value).replaceAll(/\s+/g, ' ');
const gradeWordKey = (grade, word) => `${grade}\u0000${word}`;
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

const FLAG_LABELS = Object.freeze({
    missing_word: '낱말 누락',
    missing_category: '분류 누락',
    invalid_level: '난이도 오류',
    missing_definition: '뜻 누락',
    short_definition: '뜻이 너무 짧음',
    long_definition: '뜻이 너무 김',
    definition_contains_word: '뜻에 정답 낱말 포함',
    missing_example: '예문 누락',
    short_example: '예문이 너무 짧음',
    long_example: '예문이 너무 김',
    example_missing_word: '예문에 목표 낱말 없음',
    duplicate_review_required: '중복 원본 검토 필요'
});

const DUPLICATE_LABELS = Object.freeze({
    exact_duplicate: '완전 중복',
    example_variant: '같은 뜻·예문 변형',
    definition_variant: '뜻 표현·복수 의미 검토'
});

const stableRow = (grade, item, sourceIndex) => ({
    grade,
    sourceIndex,
    word: normalizeWord(item.word),
    category: normalizeText(item.category),
    level: Number(item.level),
    definition: normalizeText(item.definition),
    example: normalizeText(item.example)
});

const rowSignature = (row) => JSON.stringify([
    row.category,
    row.level,
    row.definition,
    row.example
]);

export const diagnoseRow = (row, duplicateClassification = null) => {
    const flags = [];
    if (!row.word) flags.push('missing_word');
    if (!row.category) flags.push('missing_category');
    if (!Number.isInteger(row.level) || row.level < 1 || row.level > 5) flags.push('invalid_level');
    if (!row.definition) flags.push('missing_definition');
    if (row.definition && row.definition.length < 8) flags.push('short_definition');
    if (row.definition.length > 100) flags.push('long_definition');
    if (row.word && row.definition.includes(row.word)) flags.push('definition_contains_word');
    if (!row.example) flags.push('missing_example');
    if (row.example && row.example.length < 10) flags.push('short_example');
    if (row.example.length > 120) flags.push('long_example');
    if (row.word && row.example && !row.example.includes(row.word)) flags.push('example_missing_word');
    if (duplicateClassification && duplicateClassification !== 'exact_duplicate') {
        flags.push('duplicate_review_required');
    }
    return flags;
};

const classifyDuplicate = (rows) => {
    const signatures = new Set(rows.map(rowSignature));
    if (signatures.size === 1) return 'exact_duplicate';
    const definitions = new Set(rows.map((row) => row.definition));
    if (definitions.size === 1) return 'example_variant';
    return 'definition_variant';
};

const buildDuplicateGroups = (rows) => {
    const grouped = new Map();
    rows.forEach((row) => {
        const key = gradeWordKey(row.grade, row.word);
        const current = grouped.get(key) || [];
        current.push(row);
        grouped.set(key, current);
    });
    return [...grouped.values()]
        .filter((items) => items.length > 1)
        .map((items) => ({
            grade: items[0].grade,
            word: items[0].word,
            classification: classifyDuplicate(items),
            variants: items.map(({ sourceIndex, category, level, definition, example }) => ({
                sourceIndex,
                category,
                level,
                definition,
                example
            }))
        }))
        .sort((left, right) => left.grade - right.grade || left.word.localeCompare(right.word, 'ko'));
};

export const auditVocabularySources = (sources) => {
    const sourceRows = GRADES.flatMap((grade) => (
        (sources.get(grade) || []).map((item, index) => stableRow(grade, item, index + 1))
    ));
    const duplicateGroups = buildDuplicateGroups(sourceRows);
    const duplicateByKey = new Map(duplicateGroups.map((group) => [
        gradeWordKey(group.grade, group.word),
        group
    ]));

    // 운영 생성기와 같은 규칙이다. 같은 학년·낱말이면 마지막 원본 행을 기준값으로 사용하되
    // 앞 행은 버리지 않고 duplicateGroups에서 검수 자료로 보존한다.
    const canonicalByKey = new Map();
    sourceRows.forEach((row) => canonicalByKey.set(gradeWordKey(row.grade, row.word), row));
    const canonicalRows = [...canonicalByKey.values()]
        .map((row) => {
            const duplicate = duplicateByKey.get(gradeWordKey(row.grade, row.word));
            const duplicateClassification = duplicate?.classification || null;
            return {
                ...row,
                itemKey: `vocab:g${row.grade}:${row.word}`,
                flags: diagnoseRow(row, duplicateClassification),
                duplicateClassification,
                partOfSpeech: null,
                reviewStatus: duplicateClassification && duplicateClassification !== 'exact_duplicate'
                    ? 'needs_review'
                    : 'auto_candidate'
            };
        })
        .sort((left, right) => left.grade - right.grade || left.word.localeCompare(right.word, 'ko'));

    const sourceFingerprint = createHash('sha256')
        .update(JSON.stringify(sourceRows))
        .digest('hex');

    return {
        schemaVersion: 1,
        sourceFingerprint,
        sourceRows,
        canonicalRows,
        duplicateGroups
    };
};

const chooseDeck = ({ item, decks, capacities }) => {
    const candidates = decks
        .map((deck, index) => ({
            index,
            hasCapacity: deck.items.length < capacities[index],
            categoryCount: deck.categoryCounts.get(item.category) || 0,
            levelCount: deck.levelCounts.get(item.level) || 0,
            size: deck.items.length
        }))
        .filter((deck) => deck.hasCapacity)
        .sort((left, right) => (
            left.categoryCount - right.categoryCount
            || left.levelCount - right.levelCount
            || left.size - right.size
            || left.index - right.index
        ));
    return candidates[0]?.index ?? 0;
};

export const buildDeckPlan = (audit) => {
    const grades = GRADES.map((grade) => {
        const gradeItems = audit.canonicalRows
            .filter((item) => item.grade === grade)
            .sort((left, right) => (
                left.category.localeCompare(right.category, 'ko')
                || left.level - right.level
                || left.word.localeCompare(right.word, 'ko')
            ));
        const baseSize = Math.floor(gradeItems.length / DECK_COUNT);
        const extra = gradeItems.length % DECK_COUNT;
        const capacities = Array.from({ length: DECK_COUNT }, (_, index) => baseSize + (index < extra ? 1 : 0));
        const workingDecks = Array.from({ length: DECK_COUNT }, (_, index) => ({
            deckNumber: index + 1,
            items: [],
            categoryCounts: new Map(),
            levelCounts: new Map()
        }));

        gradeItems.forEach((item) => {
            const deckIndex = chooseDeck({ item, decks: workingDecks, capacities });
            const deck = workingDecks[deckIndex];
            deck.items.push(item);
            deck.categoryCounts.set(item.category, (deck.categoryCounts.get(item.category) || 0) + 1);
            deck.levelCounts.set(item.level, (deck.levelCounts.get(item.level) || 0) + 1);
        });

        const decks = workingDecks.map((deck) => ({
            deckId: `grade${grade}-deck${String(deck.deckNumber).padStart(2, '0')}`,
            deckNumber: deck.deckNumber,
            reviewStatus: 'draft',
            itemCount: deck.items.length,
            levelCounts: Object.fromEntries([...deck.levelCounts.entries()].sort(([a], [b]) => a - b)),
            categoryCounts: Object.fromEntries([...deck.categoryCounts.entries()].sort(([a], [b]) => a.localeCompare(b, 'ko'))),
            items: deck.items
                .sort((left, right) => left.level - right.level || left.word.localeCompare(right.word, 'ko'))
                .map((item) => ({
                    itemKey: item.itemKey,
                    word: item.word,
                    category: item.category,
                    level: item.level,
                    reviewStatus: item.reviewStatus,
                    flags: item.flags
                }))
        }));

        return {
            grade,
            itemCount: gradeItems.length,
            decks
        };
    });

    return {
        schemaVersion: 1,
        status: 'draft_not_for_student_delivery',
        sourceFingerprint: audit.sourceFingerprint,
        deckCountPerGrade: DECK_COUNT,
        grades
    };
};

const findItem = (audit, itemKey) => audit.canonicalRows.find((item) => item.itemKey === itemKey);

const distractorCandidates = (target, items) => items
    .filter((item) => item.itemKey !== target.itemKey && item.definition !== target.definition)
    .sort((left, right) => (
        Number(left.category !== target.category) - Number(right.category !== target.category)
        || Math.abs(left.level - target.level) - Math.abs(right.level - target.level)
        || left.word.localeCompare(right.word, 'ko')
    ))
    .slice(0, 3);

const withCorrectMarker = (correctValue, distractors) => [
    { value: correctValue, isCorrect: true },
    ...distractors.map((value) => ({ value, isCorrect: false }))
];

const buildQuestionDrafts = (target, gradeItems) => {
    const distractors = distractorCandidates(target, gradeItems);
    const blankExample = target.example.includes(target.word)
        ? target.example.replace(target.word, '＿＿＿＿')
        : null;
    const meaningBlocked = !target.definition || target.definition.includes(target.word) || distractors.length < 3;
    const clozeBlocked = !blankExample || distractors.length < 3;

    return {
        meaningChoice: {
            status: meaningBlocked ? 'blocked_for_review' : 'draft',
            prompt: `‘${target.word}’의 뜻으로 알맞은 것을 고르세요.`,
            options: withCorrectMarker(target.definition, distractors.map((item) => item.definition))
        },
        clozeChoice: {
            status: clozeBlocked ? 'blocked_for_review' : 'draft',
            prompt: blankExample,
            options: withCorrectMarker(target.word, distractors.map((item) => item.word))
        },
        definitionInput: {
            status: target.definition ? 'draft' : 'blocked_for_review',
            prompt: `${target.definition}\n이 뜻에 맞는 낱말을 직접 쓰세요.`,
            acceptedAnswers: [target.word]
        },
        clozeInput: {
            status: blankExample ? 'draft' : 'blocked_for_review',
            prompt: blankExample,
            acceptedAnswers: [target.word]
        },
        usageDistinction: {
            status: 'human_review_required',
            prompt: null,
            note: '올바른 사용 문장·유사어 구별 문제는 사람 검수 후 작성합니다.'
        }
    };
};

export const buildReviewDraft = (audit, deckPlan, grade = DEFAULT_REVIEW_GRADE, deckNumber = DEFAULT_REVIEW_DECK) => {
    const gradePlan = deckPlan.grades.find((entry) => entry.grade === grade);
    const deck = gradePlan?.decks.find((entry) => entry.deckNumber === deckNumber);
    if (!gradePlan || !deck) throw new Error(`검수 초안 덱을 찾을 수 없습니다: ${grade}학년 ${deckNumber}번 덱`);
    const gradeItems = audit.canonicalRows.filter((item) => item.grade === grade);
    const duplicateByKey = new Map(audit.duplicateGroups.map((group) => [
        gradeWordKey(group.grade, group.word),
        group
    ]));

    return {
        schemaVersion: 1,
        status: 'draft_not_for_student_delivery',
        sourceFingerprint: audit.sourceFingerprint,
        grade,
        deckId: deck.deckId,
        deckNumber,
        itemCount: deck.itemCount,
        requiredEnrichment: [
            'part_of_speech',
            'base_meaning_review',
            'accepted_answer_review',
            'usage_distinction_human_review'
        ],
        items: deck.items.map((deckItem) => {
            const target = findItem(audit, deckItem.itemKey);
            const duplicate = duplicateByKey.get(gradeWordKey(grade, target.word));
            return {
                itemKey: target.itemKey,
                word: target.word,
                partOfSpeech: null,
                category: target.category,
                level: target.level,
                definition: target.definition,
                example: target.example,
                flags: target.flags,
                duplicateReview: duplicate || null,
                reviewStatus: target.reviewStatus,
                questions: buildQuestionDrafts(target, gradeItems)
            };
        })
    };
};

const countBy = (items, getKey) => {
    const counts = new Map();
    items.forEach((item) => {
        const key = getKey(item);
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
};

const markdownCell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');

export const buildMarkdownReport = (audit, deckPlan, reviewDraft) => {
    const sourceCounts = countBy(audit.sourceRows, (item) => item.grade);
    const canonicalCounts = countBy(audit.canonicalRows, (item) => item.grade);
    const duplicateCounts = countBy(audit.duplicateGroups, (item) => item.grade);
    const flagCounts = new Map();
    audit.canonicalRows.forEach((item) => item.flags.forEach((flag) => {
        const key = `${item.grade}:${flag}`;
        flagCounts.set(key, (flagCounts.get(key) || 0) + 1);
    }));

    const totalSource = audit.sourceRows.length;
    const totalCanonical = audit.canonicalRows.length;
    const duplicateClassificationCounts = countBy(audit.duplicateGroups, (item) => item.classification);
    const lines = [
        '# 어휘의 탑 V2 단어 자동 진단',
        '',
        '> 이 문서는 자동 진단 초안이다. 원본 단어·운영 DB·학생 게임을 변경하지 않으며, 경고는 삭제 판정이 아니라 사람 검수 순서다.',
        '',
        `- 입력 지문: \`${audit.sourceFingerprint}\``,
        `- 정적 원본: ${totalSource.toLocaleString('ko-KR')}행`,
        `- 현 운영 생성 규칙 기준: ${totalCanonical.toLocaleString('ko-KR')}개 학년·낱말`,
        `- 중복 검토 그룹: ${audit.duplicateGroups.length}개`,
        `- 완전 중복 ${duplicateClassificationCounts.get('exact_duplicate') || 0}개 · 같은 뜻/예문 변형 ${duplicateClassificationCounts.get('example_variant') || 0}개 · 뜻 표현/복수 의미 검토 ${duplicateClassificationCounts.get('definition_variant') || 0}개`,
        '',
        '## 학년별 기준과 덱 초안',
        '',
        '| 학년 | 정적 원본 | 운영 기준 | 중복 그룹 | 덱 수 | 덱별 단어 수 |',
        '|---:|---:|---:|---:|---:|---|'
    ];

    GRADES.forEach((grade) => {
        const gradePlan = deckPlan.grades.find((entry) => entry.grade === grade);
        lines.push(`| ${grade} | ${sourceCounts.get(grade) || 0} | ${canonicalCounts.get(grade) || 0} | ${duplicateCounts.get(grade) || 0} | ${gradePlan.decks.length} | ${gradePlan.decks.map((deck) => deck.itemCount).join(' · ')} |`);
    });

    lines.push(
        '',
        '덱 배정은 분류·난이도를 분산한 자동 초안이다. 검수 완료 전에는 학생 출제에 사용하지 않는다.',
        '',
        '## 자동 품질 신호',
        '',
        '| 신호 | 3학년 | 4학년 | 5학년 | 6학년 | 합계 |',
        '|---|---:|---:|---:|---:|---:|'
    );
    Object.entries(FLAG_LABELS).forEach(([flag, label]) => {
        const counts = GRADES.map((grade) => flagCounts.get(`${grade}:${flag}`) || 0);
        const total = counts.reduce((sum, count) => sum + count, 0);
        if (total > 0) lines.push(`| ${label} | ${counts.join(' | ')} | ${total} |`);
    });
    lines.push(
        `| 품사 보강 필요 | ${GRADES.map((grade) => canonicalCounts.get(grade) || 0).join(' | ')} | ${totalCanonical} |`,
        '',
        '길이·답 노출 신호는 자동 판정이므로 사람이 실제 문맥을 확인해야 한다.',
        '',
        '### 자동 신호가 잡은 낱말',
        '',
        '| 학년 | 낱말 | 신호 | 현재 뜻·예문 |',
        '|---:|---|---|---|'
    );
    audit.canonicalRows
        .filter((item) => item.flags.some((flag) => flag !== 'duplicate_review_required'))
        .forEach((item) => {
            const signals = item.flags
                .filter((flag) => flag !== 'duplicate_review_required')
                .map((flag) => FLAG_LABELS[flag])
                .join(', ');
            lines.push(`| ${item.grade} | ${markdownCell(item.word)} | ${markdownCell(signals)} | 뜻: ${markdownCell(item.definition)}<br>예: ${markdownCell(item.example)} |`);
        });
    lines.push(
        '',
        '## 중복·뜻 표현 검토 목록',
        '',
        '| 학년 | 낱말 | 분류 | 원본 뜻 |',
        '|---:|---|---|---|'
    );
    audit.duplicateGroups.forEach((group) => {
        const definitions = [...new Set(group.variants.map((variant) => variant.definition))]
            .map((definition, index) => `${index + 1}. ${definition}`)
            .join('<br>');
        lines.push(`| ${group.grade} | ${markdownCell(group.word)} | ${DUPLICATE_LABELS[group.classification]} | ${markdownCell(definitions)} |`);
    });

    const draftStatuses = countBy(
        reviewDraft.items.flatMap((item) => Object.values(item.questions)),
        (question) => question.status
    );
    lines.push(
        '',
        `## 첫 검수 초안: ${reviewDraft.grade}학년 ${reviewDraft.deckNumber}번 덱`,
        '',
        `- 단어: ${reviewDraft.itemCount}개`,
        `- 자동 문항 초안: ${draftStatuses.get('draft') || 0}개`,
        `- 자동 차단·확인 필요: ${draftStatuses.get('blocked_for_review') || 0}개`,
        `- 사람 작성 필수 구별 문항: ${draftStatuses.get('human_review_required') || 0}개`,
        '- 품사·기본 뜻·허용 정답·구별 문항을 확인한 뒤에만 `reviewed`로 전환한다.',
        '',
        '## 생성 파일',
        '',
        '- `docs/vocab-tower/data/v2-deck-plan.json`: 학년별 10개 덱 배정 초안',
        '- `docs/vocab-tower/data/grade3-deck01-review.json`: 첫 덱 단어·문항 검수 초안',
        '',
        '재생성: `npm run vocab:audit` · 원본과 동기화 확인: `npm run vocab:audit:check`',
        ''
    );
    return `${lines.join('\n')}\n`;
};

export const loadVocabularySources = async () => new Map(await Promise.all(GRADES.map(async (grade) => [
    grade,
    JSON.parse(await readFile(sourceUrl(grade), 'utf8'))
])));

export const createAuditArtifacts = async () => {
    const sources = await loadVocabularySources();
    const audit = auditVocabularySources(sources);
    const deckPlan = buildDeckPlan(audit);
    const reviewDraft = buildReviewDraft(audit, deckPlan);
    const report = buildMarkdownReport(audit, deckPlan, reviewDraft);
    return {
        audit,
        deckPlan,
        reviewDraft,
        files: [
            [reportUrl, report],
            [deckPlanUrl, jsonText(deckPlan)],
            [reviewDraftUrl, jsonText(reviewDraft)]
        ]
    };
};

const run = async () => {
    const checkOnly = process.argv.includes('--check');
    const { audit, deckPlan, reviewDraft, files } = await createAuditArtifacts();
    if (checkOnly) {
        const mismatched = [];
        for (const [url, expected] of files) {
            const current = await readFile(url, 'utf8').catch(() => '');
            if (current !== expected) mismatched.push(fileURLToPath(url));
        }
        if (mismatched.length > 0) {
            throw new Error(`어휘 V2 진단 자료가 원본과 다릅니다. npm run vocab:audit를 실행하세요: ${mismatched.join(', ')}`);
        }
        console.log(`어휘 V2 진단 확인: 원본 ${audit.sourceRows.length}행 · 운영 기준 ${audit.canonicalRows.length}개 · 덱 ${deckPlan.grades.length * DECK_COUNT}개 · 첫 검수 ${reviewDraft.itemCount}개`);
        return;
    }

    await mkdir(new URL('../docs/vocab-tower/data/', import.meta.url), { recursive: true });
    await Promise.all(files.map(([url, contents]) => writeFile(url, contents, 'utf8')));
    console.log(`어휘 V2 진단 생성: 원본 ${audit.sourceRows.length}행 · 운영 기준 ${audit.canonicalRows.length}개 · 중복 검토 ${audit.duplicateGroups.length}그룹 · 첫 검수 ${reviewDraft.itemCount}개`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await run();
}
