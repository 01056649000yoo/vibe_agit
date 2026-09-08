import { TEACHER_GUIDES } from '../constants/teacherGuides.js';
import { TEACHER_GUIDE_JOURNEYS } from './teacherGuideJourneys.js';

export const GUIDE_CHAT_LIMITS = Object.freeze({
    questionChars: 200,
    candidateCount: 3,
    candidateChars: 450,
    contextChars: 1200
});

const clean = (value) => String(value || '')
    .replace(/\*\*|`/g, '')
    .replace(/[^0-9A-Za-z가-힣]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compact = (value) => clean(value).replace(/\s/g, '').toLowerCase();

const terms = (value) => [...new Set(clean(value).toLowerCase().split(' ').filter((term) => term.length >= 2))];

export const buildTeacherGuideSearchDocuments = () => Object.entries(TEACHER_GUIDES).flatMap(([guideRef, guide]) => {
    const sections = Array.isArray(guide.sections) && guide.sections.length
        ? guide.sections
        : [{ id: null, title: guide.title, steps: guide.steps || [], notes: guide.notes || [] }];
    const journeys = TEACHER_GUIDE_JOURNEYS.flatMap((journey) => journey.steps
        .filter((journeyStep) => journeyStep.guideRef === guideRef)
        .map((journeyStep) => ({ journey, journeyStep })));

    return sections.map((section) => {
        const related = journeys.filter(({ journeyStep }) => !journeyStep.sectionRef || journeyStep.sectionRef === section.id);
        const heading = [guide.title, section.title, ...related.flatMap(({ journey, journeyStep }) => [journey.title, journeyStep.title, journeyStep.purpose])]
            .filter(Boolean).join(' ');
        const passages = [...(section.steps || []), ...(section.notes || [])]
            .map(clean)
            .filter(Boolean);
        return Object.freeze({ guideRef, sectionRef: section.id || null, title: section.title || guide.title, heading: clean(heading), passages });
    });
});

const DOCUMENTS = buildTeacherGuideSearchDocuments();

const scoreDocument = (question, document) => {
    const query = compact(question);
    const heading = compact(document.heading);
    const context = compact(document.passages.join(' '));
    if (!query) return 0;
    let score = heading.includes(query) ? 40 : (context.includes(query) ? 20 : 0);
    for (const term of terms(question)) {
        const normalized = compact(term);
        if (heading.includes(normalized)) score += 8 + Math.min(normalized.length, 6);
        else if (context.includes(normalized)) score += 3 + Math.min(normalized.length, 4);
    }
    return score;
};

const passageScore = (question, passage) => {
    const normalized = compact(passage);
    return terms(question).reduce((score, term) => score + (normalized.includes(compact(term)) ? 1 : 0), 0);
};

const buildCandidateContext = (question, document) => {
    const matched = document.passages
        .map((passage, index) => ({ passage, index, score: passageScore(question, passage) }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .filter((item, index) => item.score > 0 || index === 0)
        .slice(0, 3)
        .sort((left, right) => left.index - right.index)
        .map(({ passage }) => passage);
    return clean([document.heading, ...matched].join(' ')).slice(0, GUIDE_CHAT_LIMITS.candidateChars);
};

export const searchTeacherGuides = (question) => {
    const safeQuestion = String(question || '').trim().slice(0, GUIDE_CHAT_LIMITS.questionChars);
    let usedChars = 0;
    const ranked = DOCUMENTS
        .map((document) => ({ ...document, score: scoreDocument(safeQuestion, document) }))
        .filter((document) => document.score > 0)
        .sort((left, right) => right.score - left.score || left.guideRef.localeCompare(right.guideRef));
    const topScore = ranked[0]?.score || 0;
    const selected = ranked.filter((document, index) => index === 0 || document.score >= Math.max(8, topScore * 0.55))
        .slice(0, GUIDE_CHAT_LIMITS.candidateCount);
    return selected
        .map((document) => {
            const remaining = GUIDE_CHAT_LIMITS.contextChars - usedChars;
            const context = buildCandidateContext(safeQuestion, document).slice(0, Math.max(0, remaining));
            usedChars += context.length;
            return { guideRef: document.guideRef, sectionRef: document.sectionRef, title: document.title, context, score: document.score };
        })
        .filter((document) => document.context);
};

const LOCATION_QUESTION = /(어디|어느 메뉴|찾아가|들어가|이동|바로가기|위치)/;

export const getLocalTeacherGuideAnswer = (question, candidates = searchTeacherGuides(question)) => {
    const [first, second] = candidates;
    if (!first || !LOCATION_QUESTION.test(String(question || ''))) return null;
    const clearMatch = first.score >= 20 && (!second || first.score >= second.score * 1.25);
    if (!clearMatch) return null;
    return {
        answer: `‘${first.title}’ 안내에서 바로 확인할 수 있어요. 아래 버튼을 눌러 해당 안내로 이동하세요.`,
        guideRef: first.guideRef,
        sectionRef: first.sectionRef,
        actionLabel: `${first.title} 보기`,
        confidence: 'high',
        local: true
    };
};
