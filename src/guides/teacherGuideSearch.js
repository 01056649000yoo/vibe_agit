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

const KOREAN_PARTICLES = ['으로부터', '에서부터', '에게서', '한테서', '까지는', '부터는', '에서는', '으로는', '로부터', '이라는', '라고는', '에게', '한테', '처럼', '보다', '까지', '부터', '에서', '으로', '하고', '이랑', '랑', '이나', '나', '에는', '은', '는', '이', '가', '을', '를', '에', '로', '와', '과', '도', '만', '의'];
const QUESTION_FILLERS = new Set([
    '어디', '어디서', '어디에', '어디로', '어느', '어떻게', '무엇', '뭐', '왜', '언제',
    '알려줘', '알려주세요', '찾아줘', '찾아주세요', '확인해', '확인하니', '확인하나요',
    '만드니', '만드나요', '만들어', '만들어요', '만드는지', '하니', '하나요', '해요', '되나요'
]);

const stripKoreanParticle = (term) => {
    const particle = KOREAN_PARTICLES.find((candidate) => term.endsWith(candidate) && term.length - candidate.length >= 2);
    return particle ? term.slice(0, -particle.length) : term;
};

const terms = (value) => [...new Set(clean(value).toLowerCase().split(' ').flatMap((term) => {
    if (term.length < 2 || QUESTION_FILLERS.has(term)) return [];
    const stripped = stripKoreanParticle(term);
    const latinKeywords = term.match(/[a-z0-9]{2,}/g) || [];
    return [stripped, ...latinKeywords]
        .filter((keyword) => keyword.length >= 2 && !QUESTION_FILLERS.has(keyword));
}))];

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
    const keywords = terms(question);
    const searchableQueries = [query, ...keywords.map(compact)].filter(Boolean);
    const heading = compact(document.heading);
    const context = compact(document.passages.join(' '));
    if (!query) return 0;
    let score = searchableQueries.some((candidate) => heading.includes(candidate))
        ? 40
        : (searchableQueries.some((candidate) => context.includes(candidate)) ? 20 : 0);
    for (const term of keywords) {
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
