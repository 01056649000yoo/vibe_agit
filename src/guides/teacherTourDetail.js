/*
 * 동행 패널에 넣을 단계 설명 — **새로 쓰지 않고 안내서에서 끌어온다.**
 *
 * 창 위치만 알려 주고 "자세한 건 안내서에서 보세요" 로 끝나면, 정작 찾기 어려운 기능은
 * 끝까지 모른 채 지나간다(2026-09-13 사용자 지적). 흐름과 핵심은 지나가면서 한 번씩
 * 짚어 줘야 한다.
 *
 * 그렇다고 같은 설명을 여기 다시 적으면 안내서만 고쳐졌을 때 둘의 말이 달라진다.
 * 안내서(`TEACHER_GUIDES`)에 이미 순서(`steps`)와 주의(`notes`)가 있으므로 읽어 온다.
 *
 * **그 단계에 맞는 문장을 고른다.** 앞에서부터 잘라 오면 엉뚱한 것이 나온다 — 수호룡
 * `시즌 마감` 단계인데 `성장 단계 보는 법` 이 나오는 식이다. 단계 제목·설명에 나온 말이
 * 몇 개나 들어 있는지로 점수를 매겨 고른다.
 */

import { getTeacherGuide, getTeacherGuideSection } from './teacherGuideRegistry.js';

const MAX_POINTS = 3;
const MAX_CAUTIONS = 2;
/** 조사·접미사에 붙어도 걸리도록 두 글자 이상만 본다. */
const MIN_KEYWORD = 2;

const plain = (text) => String(text || '').replace(/[*`■]/g, '');

const keywordsOf = (step) => {
    const source = `${step?.title || ''} ${step?.purpose || ''}`;
    return [...new Set(
        plain(source)
            .split(/[\s.,·—\-()[\]{}'"?!:;/]+/)
            .map((word) => word.trim())
            .filter((word) => word.length >= MIN_KEYWORD)
    )];
};

const scoreOf = (line, keywords) => {
    const text = plain(line);
    return keywords.reduce((total, word) => (text.includes(word) ? total + 1 : total), 0);
};

/** 점수가 높은 것부터. 같으면 안내서에 적힌 차례를 지킨다. */
const rank = (lines, keywords, limit) => lines
    .map((line, index) => ({ line, index, score: scoreOf(line, keywords) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.line);

const isEmphasized = (line) => String(line || '').includes('**');

/*
 * 단계가 가리키는 안내서 대목.
 *
 * 안내서는 두 모양이다 — 본문에 바로 `steps`·`notes` 가 있는 것과, `sections` 로 나뉜 것.
 * 나뉜 안내서에서 단계가 구역을 안 집었으면(`sectionRef` 없음) **첫 구역**을 쓴다.
 * 이것이 없으면 독서록처럼 구역으로만 된 안내서에서 설명이 통째로 비어 버린다.
 */
const findSource = (step) => {
    if (!step?.guideRef) return null;
    const guide = getTeacherGuide(step.guideRef);
    if (!guide) return null;
    if (step.sectionRef) {
        const section = getTeacherGuideSection(step.guideRef, step.sectionRef);
        if (section) return section;
    }
    if (Array.isArray(guide.steps) || Array.isArray(guide.notes)) return guide;
    return guide.sections?.[0] || guide;
};

export const getStepDetail = (step) => {
    const source = findSource(step);
    if (!source) return null;

    const keywords = keywordsOf(step);
    const points = rank(Array.isArray(source.steps) ? source.steps : [], keywords, MAX_POINTS);

    /*
     * 주의는 **굵게 강조된 것**부터 본다 — 되돌릴 수 없거나 오해하기 쉬운 대목이다.
     * 그중에서도 이 단계와 관련된 것을 고른다.
     */
    const notes = Array.isArray(source.notes) ? source.notes : [];
    const emphasized = notes.filter(isEmphasized);
    const cautions = rank(emphasized.length ? emphasized : notes, keywords, MAX_CAUTIONS)
        .filter((line) => scoreOf(line, keywords) > 0 || emphasized.length === 0);

    if (!points.length && !cautions.length) return null;
    return { points, cautions };
};
