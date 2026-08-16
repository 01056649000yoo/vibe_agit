import { supabase } from '../../../lib/supabaseClient';

const unwrap = ({ data, error }) => {
    if (error) throw error;
    return data;
};

export const getVocabReviewDeck = async ({ grade, deckNumber }) => unwrap(await supabase.rpc(
    'admin_get_vocab_tower_v2_review_deck_v1',
    {
        p_grade: grade,
        p_deck_number: deckNumber,
        p_limit: 50
    }
));

export const seedVocabReviewDeck = async ({ deck, items, initialStatus }) => unwrap(await supabase.rpc(
    'admin_seed_vocab_tower_v2_review_deck_v1',
    {
        p_grade: deck.grade,
        p_deck_number: deck.deckNumber,
        p_deck_id: deck.deckId,
        p_source_fingerprint: deck.sourceFingerprint,
        p_items: items,
        p_initial_status: initialStatus
    }
));

export const saveVocabReviewItem = async (item) => unwrap(await supabase.rpc(
    'admin_save_vocab_tower_v2_review_item_v1',
    {
        p_item_key: item.item_key,
        p_expected_version: item.version,
        p_part_of_speech: item.part_of_speech,
        p_meaning_number: item.meaning_number,
        p_difficulty: item.difficulty,
        p_definition: item.definition,
        p_example: item.example,
        p_accepted_answers: item.accepted_answers,
        p_questions: item.questions,
        p_review_notes: item.review_notes || null
    }
));

export const setVocabReviewDeckStatus = async ({ deckId, expectedVersion, reviewStatus }) => unwrap(await supabase.rpc(
    'admin_set_vocab_tower_v2_review_status_v1',
    {
        p_deck_id: deckId,
        p_expected_version: expectedVersion,
        p_review_status: reviewStatus
    }
));
