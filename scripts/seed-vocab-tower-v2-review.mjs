#!/usr/bin/env node

/**
 * 생성된 어휘 V2 검수 산출물을 맥미니 agit-db 작업공간에 일괄 반영한다.
 * 기본 실행은 모든 쓰기와 검증을 한 뒤 ROLLBACK한다. 실제 반영은 --apply가 있어야 한다.
 * 기존 덱의 교사 수정값은 덮어쓰지 않고 검수 우선순위 메타데이터만 보강한다.
 */
import { execFileSync } from 'node:child_process';
import { createAuditArtifacts } from './audit-vocab-tower-v2.mjs';

const container = process.env.AGIT_DB_CONTAINER || 'agit-db';
const databaseUser = process.env.AGIT_DB_USER || 'supabase_admin';
const applyChanges = process.argv.includes('--apply');

const { reviewDrafts } = await createAuditArtifacts();
const payload = reviewDrafts.map((draft) => ({
    deckId: draft.deckId,
    grade: draft.grade,
    deckNumber: draft.deckNumber,
    sourceFingerprint: draft.sourceFingerprint,
    initialStatus: draft.reviewMode === 'manual' || draft.reviewSummary.priorityItems === 0
        ? 'teacher_confirmed'
        : 'editorial_review',
    items: draft.items.map((item, itemIndex) => ({
        itemKey: item.itemKey,
        itemOrder: itemIndex + 1,
        word: item.word,
        partOfSpeech: item.partOfSpeech,
        meaningNumber: item.meaningNumber,
        level: item.level,
        category: item.category,
        sourceDefinition: item.sourceDefinition,
        sourceExample: item.sourceExample,
        definition: item.definition,
        example: item.example,
        acceptedAnswers: item.questions.definitionInput.acceptedAnswers,
        questions: item.questions
    }))
}));

const payloadText = JSON.stringify(payload);
if (payloadText.includes('$vocab_review_seed$')) {
    throw new Error('어휘 검수 payload에 예약 구분자가 포함되어 있습니다.');
}

const transactionEnd = applyChanges ? 'COMMIT;' : 'ROLLBACK;';
const sql = `
BEGIN;

CREATE TEMP TABLE vocab_tower_v2_review_seed_payload (
    payload JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO vocab_tower_v2_review_seed_payload(payload)
VALUES ($vocab_review_seed$${payloadText}$vocab_review_seed$::JSONB);

DO $seed$
DECLARE
    v_deck JSONB;
    v_item JSONB;
    v_answers TEXT[];
    v_existing_count INTEGER;
    v_usage_metadata JSONB;
BEGIN
    FOR v_deck IN
        SELECT value
        FROM jsonb_array_elements((SELECT payload FROM vocab_tower_v2_review_seed_payload))
    LOOP
        IF EXISTS (
            SELECT 1
            FROM public.vocab_tower_v2_review_decks deck
            WHERE deck.deck_id = v_deck->>'deckId'
              AND deck.source_fingerprint IS DISTINCT FROM v_deck->>'sourceFingerprint'
        ) THEN
            RAISE EXCEPTION 'vocabulary review deck source changed: %', v_deck->>'deckId';
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.vocab_tower_v2_review_decks deck
            WHERE deck.deck_id = v_deck->>'deckId'
        ) THEN
            SELECT count(*) INTO v_existing_count
            FROM public.vocab_tower_v2_review_items item
            WHERE item.deck_id = v_deck->>'deckId';

            IF v_existing_count <> jsonb_array_length(v_deck->'items') THEN
                RAISE EXCEPTION 'existing vocabulary review deck item count changed: %', v_deck->>'deckId';
            END IF;

            SELECT count(*) INTO v_existing_count
            FROM jsonb_array_elements(v_deck->'items') payload_item
            JOIN public.vocab_tower_v2_review_items item
              ON item.item_key = payload_item->>'itemKey'
             AND item.deck_id = v_deck->>'deckId';
            IF v_existing_count <> jsonb_array_length(v_deck->'items') THEN
                RAISE EXCEPTION 'existing vocabulary review deck item keys changed: %', v_deck->>'deckId';
            END IF;

            FOR v_item IN SELECT value FROM jsonb_array_elements(v_deck->'items')
            LOOP
                v_usage_metadata := jsonb_build_object(
                    'reviewOrigin', v_item#>>'{questions,usageDistinction,reviewOrigin}',
                    'reviewPriority', v_item#>>'{questions,usageDistinction,reviewPriority}',
                    'reviewReasons', v_item#>'{questions,usageDistinction,reviewReasons}',
                    'sourceItemKey', v_item#>'{questions,usageDistinction,sourceItemKey}'
                );
                UPDATE public.vocab_tower_v2_review_items item
                   SET questions = jsonb_set(
                       item.questions,
                       '{usageDistinction}',
                       (item.questions->'usageDistinction') || v_usage_metadata,
                       FALSE
                   )
                 WHERE item.item_key = v_item->>'itemKey'
                   AND item.deck_id = v_deck->>'deckId';
            END LOOP;
            CONTINUE;
        END IF;

        INSERT INTO public.vocab_tower_v2_review_decks (
            deck_id, grade, deck_number, review_status, source_fingerprint, reviewed_at
        ) VALUES (
            v_deck->>'deckId',
            (v_deck->>'grade')::SMALLINT,
            (v_deck->>'deckNumber')::SMALLINT,
            v_deck->>'initialStatus',
            v_deck->>'sourceFingerprint',
            CASE WHEN v_deck->>'initialStatus' = 'teacher_confirmed' THEN NOW() ELSE NULL END
        );

        FOR v_item IN SELECT value FROM jsonb_array_elements(v_deck->'items')
        LOOP
            IF NOT public.validate_vocab_tower_v2_review_questions_v1(
                v_item->'questions', v_item->>'word'
            ) THEN
                RAISE EXCEPTION 'invalid vocabulary review questions: %', v_item->>'itemKey';
            END IF;

            SELECT ARRAY(
                SELECT BTRIM(value)
                FROM jsonb_array_elements_text(v_item->'acceptedAnswers')
            ) INTO v_answers;

            IF cardinality(v_answers) NOT BETWEEN 1 AND 10
               OR NOT (v_item->>'word' = ANY(v_answers)) THEN
                RAISE EXCEPTION 'invalid vocabulary review answers: %', v_item->>'itemKey';
            END IF;

            INSERT INTO public.vocab_tower_v2_review_items (
                item_key, deck_id, item_order, word, part_of_speech, meaning_number,
                difficulty, category, source_definition, source_example, definition,
                example, accepted_answers, questions
            ) VALUES (
                v_item->>'itemKey',
                v_deck->>'deckId',
                (v_item->>'itemOrder')::SMALLINT,
                BTRIM(v_item->>'word'),
                BTRIM(v_item->>'partOfSpeech'),
                (v_item->>'meaningNumber')::SMALLINT,
                (v_item->>'level')::SMALLINT,
                BTRIM(v_item->>'category'),
                BTRIM(v_item->>'sourceDefinition'),
                BTRIM(v_item->>'sourceExample'),
                BTRIM(v_item->>'definition'),
                BTRIM(v_item->>'example'),
                v_answers,
                v_item->'questions'
            );
        END LOOP;
    END LOOP;

    IF (SELECT count(*) FROM public.vocab_tower_v2_review_decks) <> 40
       OR (SELECT count(*) FROM public.vocab_tower_v2_review_items) <> 1573 THEN
        RAISE EXCEPTION 'unexpected vocabulary review totals';
    END IF;
END;
$seed$;

SELECT jsonb_build_object(
    'decks', (SELECT count(*) FROM public.vocab_tower_v2_review_decks),
    'items', (SELECT count(*) FROM public.vocab_tower_v2_review_items),
    'teacherConfirmedDecks', (
        SELECT count(*) FROM public.vocab_tower_v2_review_decks WHERE review_status = 'teacher_confirmed'
    ),
    'editorialReviewDecks', (
        SELECT count(*) FROM public.vocab_tower_v2_review_decks WHERE review_status = 'editorial_review'
    ),
    'priorityItems', (
        SELECT count(*) FROM public.vocab_tower_v2_review_items
        WHERE questions#>>'{usageDistinction,reviewPriority}' = 'priority'
          AND deck_id IN (
              SELECT deck_id FROM public.vocab_tower_v2_review_decks WHERE review_status = 'editorial_review'
          )
    )
) AS result;

${transactionEnd}
`;

const output = execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', databaseUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off'],
    { input: sql, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
);

process.stdout.write(output);
console.log(applyChanges
    ? '어휘 V2 검수 작업공간을 운영 DB에 일괄 반영했습니다.'
    : '어휘 V2 검수 작업공간 일괄 반영을 검증했고 모든 변경을 롤백했습니다.');
