import { TEACHER_GUIDES } from '../constants/teacherGuides.js';
import { TEACHER_GUIDE_JOURNEYS } from './teacherGuideJourneys.js';

export const GUIDE_CHAT_LIMITS = Object.freeze({
    questionChars: 200,
    candidateCount: 3,
    candidateChars: 450,
    contextChars: 1200,
    /*
     * 낱말이 안 맞을 때 보내는 **전체 훑어보기** 후보 수.
     *
     * 전에는 낱말이 하나도 안 걸리면 AI 를 부르지도 않고 "기능 이름을 넣어 다시 물어봐
     * 주세요" 로 끝냈다 — 'AI 길잡이' 라면서 낱말 하나로 문을 닫는 셈이다(2026-09-13 지적).
     * 이제 안내서 전체의 짧은 목록을 후보로 보내 **AI 가 뜻으로 고르게** 한다.
     * 문맥 총량은 그대로라 비용은 늘지 않는다 — 후보가 많으면 하나하나가 짧아질 뿐이다.
     */
    overviewCount: 8
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

/**
 * 안내서 전체를 짧게 훑는 후보 — 낱말이 하나도 안 걸렸을 때 쓴다.
 *
 * 흐름(journey)을 단위로 고른다. 안내서 27개를 다 보내면 하나하나가 너무 짧아져 뜻을
 * 알아볼 수 없고, 흐름은 교사가 실제로 일하는 갈래라 AI 가 고르기에도 낫다.
 */
export const buildTeacherGuideOverview = () => {
    const perCandidate = Math.floor(GUIDE_CHAT_LIMITS.contextChars / GUIDE_CHAT_LIMITS.overviewCount);
    return TEACHER_GUIDE_JOURNEYS
        .slice(0, GUIDE_CHAT_LIMITS.overviewCount)
        .map((journey) => {
            const first = journey.steps[0];
            const titles = journey.steps.map((step) => step.title).join(', ');
            const context = clean(`${journey.summary} 포함: ${titles}`).slice(0, perCandidate);
            return {
                // 버튼이 갈 곳은 그 흐름의 첫 단계가 가리키는 도움말이다.
                guideRef: first?.guideRef || '',
                sectionRef: first?.sectionRef || null,
                title: journey.title,
                context
            };
        })
        .filter((candidate) => candidate.guideRef && candidate.context);
};
