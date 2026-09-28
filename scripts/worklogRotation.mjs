/**
 * 작업 로그(WORKLOG.md) 순환·형식 검사 — 순수 함수만 둔다. 명령은 `scripts/worklog.mjs`.
 *
 * 왜 필요한가 (2026-09-28):
 *   지난 기록을 docs/worklog/ 로 옮기는 일은 2,500줄 한도에 걸린 모델이 그때그때 손으로 했다.
 *   9/2 에는 한꺼번에, 9/15 에는 이틀치만 — 옮기는 범위가 매번 달라서 세션마다 읽는 양도 달랐다.
 *   기준을 코드 한 곳에 두면 어느 모델이 마감하든 결과가 같다.
 *
 * 기준: 가장 최근 항목 날짜에서 KEEP_DAYS 일 안의 항목은 남기고, 그보다 오래됐어도 위에서
 *   KEEP_MIN 개까지는 남긴다. 기준일을 "오늘"이 아니라 "가장 최근 항목"으로 잡는 까닭은
 *   몇 주 쉬었다 돌아와도 바로 앞 맥락이 통째로 빠져나가지 않게 하려는 것이다.
 */

import { DRAFT_PLACEHOLDERS } from './wrapDraft.mjs';

export const KEEP_DAYS = 7;
export const KEEP_MIN = 20;

/** 이 날짜부터 쓴 항목만 형식을 본다. 그 전 항목은 그대로 둔다(옛 기록을 고쳐 쓰지 않는다). */
export const FORMAT_SINCE = '2026-09-29';
export const MAX_ENTRY_BODY_LINES = 15;
export const REQUIRED_FIELDS = ['한 일', '변경', '결과/검증', '남은 것'];

const ENTRY_HEADING = /^## (\d{4}-\d{2}-\d{2})\b/;
const ANY_H2 = /^## /;

/**
 * 마크다운을 머리말·항목들·꼬리말로 나눈다.
 * 항목은 `## YYYY-MM-DD` 줄에서 시작해 다음 `## ` 줄 앞까지다.
 * 첫 항목 뒤에 나오는 날짜 없는 `## ` 절(예: `## 지난 기록`)부터는 꼬리말로 본다.
 * 보관소에는 날짜 없는 절이 항목 사이에 섞여 있을 수 있으므로(7월 파일의 계획 절),
 * `tailFromFirstUndated: false` 로 부르면 그런 절을 앞 항목에 붙여 그대로 보존한다.
 */
export const parseLog = (text, { tailFromFirstUndated = true } = {}) => {
    const lines = text.split('\n');
    const firstEntry = lines.findIndex((line) => ENTRY_HEADING.test(line));
    if (firstEntry < 0) return { head: text, entries: [], tail: '' };

    const head = lines.slice(0, firstEntry).join('\n');
    const entries = [];
    let tailStart = lines.length;
    let current = null;

    for (let i = firstEntry; i < lines.length; i++) {
        const line = lines[i];
        const dated = line.match(ENTRY_HEADING);
        if (dated) {
            current = { date: dated[1], title: line, lines: [line] };
            entries.push(current);
        } else if (ANY_H2.test(line) && tailFromFirstUndated) {
            tailStart = i;
            break;
        } else {
            current.lines.push(line);
        }
    }

    return {
        head,
        entries: entries.map((entry) => ({ date: entry.date, title: entry.title, text: entry.lines.join('\n') })),
        tail: lines.slice(tailStart).join('\n')
    };
};

const addDays = (isoDate, days) => {
    const date = new Date(`${isoDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

/** 남길 항목과 옮길 항목을 가른다. 순서는 파일 순서를 그대로 지킨다. */
export const splitForRotation = (entries, { keepDays = KEEP_DAYS, keepMin = KEEP_MIN } = {}) => {
    if (entries.length === 0) return { keep: [], move: [], cutoff: null };
    const newest = entries.map((entry) => entry.date).sort().at(-1);
    const cutoff = addDays(newest, -keepDays);
    const keep = [];
    const move = [];
    entries.forEach((entry, index) => {
        if (index < keepMin || entry.date > cutoff) keep.push(entry);
        else move.push(entry);
    });
    return { keep, move, cutoff };
};

const monthOf = (isoDate) => isoDate.slice(0, 7);
const trimEntry = (text) => text.replace(/\s+$/, '');

export const archiveHeader = (month, lastDay = null) => {
    const [year, mm] = month.split('-');
    const label = `${year}년 ${Number(mm)}월${lastDay ? ` (${Number(lastDay)}일까지)` : ''}`;
    return [
        `# 작업 로그 — ${label}`,
        '',
        '> 이 파일은 **지난 기록 보관소**다. 최신 기록은 [WORKLOG.md](../../WORKLOG.md) 에 있다.',
        '> 여기는 통째로 읽지 말고 `grep` 으로 필요한 항목만 찾아 읽는다.',
        ''
    ].join('\n');
};

/** 보관소 첫 줄의 "(N일까지)" 를 실제 상태에 맞춘다. 다른 머리말 내용은 건드리지 않는다. */
const retitleArchive = (text, month, lastDay) => {
    const [year, mm] = month.split('-');
    const label = `${year}년 ${Number(mm)}월${lastDay ? ` (${Number(lastDay)}일까지)` : ''}`;
    return text.replace(/^# 작업 로그 — .*$/m, `# 작업 로그 — ${label}`);
};

/**
 * 순환을 계산한다. 파일을 쓰지 않고 새 내용만 돌려준다.
 *
 * @param {string} worklog  WORKLOG.md 내용
 * @param {Record<string,string>} archives  { 'YYYY-MM': 내용 } — 없는 달은 새로 만든다
 * @returns {{ worklog: string, archives: Record<string,string>, moved: number, cutoff: string|null }}
 */
export const rotate = (worklog, archives, options = {}) => {
    const parsed = parseLog(worklog);
    const { keep, move, cutoff } = splitForRotation(parsed.entries, options);

    const nextArchives = { ...archives };
    const movedByMonth = new Map();
    for (const entry of move) {
        const month = monthOf(entry.date);
        if (!movedByMonth.has(month)) movedByMonth.set(month, []);
        movedByMonth.get(month).push(entry);
    }

    // 남는 가장 오래된 항목의 달 = 아직 WORKLOG 에 걸쳐 있는 달. 그 달 보관소는 "N일까지" 로 적는다.
    const oldestKeptMonth = keep.length ? keep.map((entry) => monthOf(entry.date)).sort()[0] : null;

    for (const [month, entries] of movedByMonth) {
        const existing = nextArchives[month] ?? archiveHeader(month);
        const archive = parseLog(existing, { tailFromFirstUndated: false });
        const head = archive.head.replace(/\s+$/, '');
        const oldBody = archive.entries.map((entry) => trimEntry(entry.text)).join('\n\n');
        const newBody = entries.map((entry) => trimEntry(entry.text)).join('\n\n');
        nextArchives[month] = `${head}\n\n${newBody}${oldBody ? `\n\n${oldBody}` : ''}\n`;
    }

    for (const month of Object.keys(nextArchives)) {
        const dates = parseLog(nextArchives[month], { tailFromFirstUndated: false }).entries
            .map((entry) => entry.date)
            .filter((date) => monthOf(date) === month)
            .sort();
        const lastDay = month === oldestKeptMonth && dates.length ? dates.at(-1).slice(8, 10) : null;
        nextArchives[month] = retitleArchive(nextArchives[month], month, lastDay);
    }

    const body = keep.map((entry) => trimEntry(entry.text)).join('\n\n');
    const head = parsed.head.replace(/\s+$/, '');
    const tail = buildTail(nextArchives, oldestKeptMonth);
    const nextWorklog = `${head}\n${body}\n\n${tail}\n`;

    return { worklog: nextWorklog, archives: nextArchives, moved: move.length, cutoff };
};

/** `## 지난 기록` 표를 보관소 목록에서 다시 만든다. 손으로 고칠 필요가 없게. */
export const buildTail = (archives, oldestKeptMonth) => {
    const rows = Object.keys(archives).sort().reverse().map((month) => {
        const [year, mm] = month.split('-');
        const title = archives[month].match(/^# 작업 로그 — .*?(\((\d+)일까지\))?$/m);
        const partialDay = month === oldestKeptMonth && title?.[2] ? title[2] : null;
        const label = partialDay ? `${year}년 ${Number(mm)}월 ${partialDay}일까지` : `${year}년 ${Number(mm)}월`;
        return `| ${label} | [docs/worklog/${month}.md](docs/worklog/${month}.md) |`;
    });
    return [
        '## 지난 기록',
        '',
        '이 파일에는 **최근 것만** 둔다. 통째로 읽으면 한 세션 예산을 통째로 쓴다.',
        `옮기기는 손으로 하지 않는다 — \`npm run worklog:rotate\` 가 최근 ${KEEP_DAYS}일(최소 ${KEEP_MIN}항목)만 남기고 옮긴다.`,
        '',
        '| 기간 | 보관소 |',
        '|---|---|',
        ...rows,
        '',
        '옛일을 찾을 때는 열어 읽지 말고 낱말로 찾는다 — `grep -n "찾을 말" docs/worklog/*.md`'
    ].join('\n');
};

/** 날짜가 붙은 항목 수(보관소 안의 날짜 없는 계획 절은 세지 않는다). */
export const countEntries = (text) => parseLog(text, { tailFromFirstUndated: false }).entries.length;

/**
 * 새 항목 형식을 본다. FORMAT_SINCE 이후 날짜의 항목만 본다.
 * @returns {string[]} 문제 목록(비었으면 통과)
 */
export const lintEntries = (worklog, { since = FORMAT_SINCE, maxBodyLines = MAX_ENTRY_BODY_LINES } = {}) => {
    const problems = [];
    for (const entry of parseLog(worklog).entries) {
        if (entry.date < since) continue;
        const name = entry.title.replace(/^## /, '');
        if (!/^## \d{4}-\d{2}-\d{2} — .+ \([^()]+\)\s*$/.test(entry.title)) {
            problems.push(`${name}: 제목은 \`## YYYY-MM-DD — 제목 (작업 모델)\` 형식이어야 합니다.`);
        }
        const body = entry.text.split('\n').slice(1).filter((line) => line.trim() !== '');
        if (body.length > maxBodyLines) {
            problems.push(`${name}: 본문이 ${body.length}줄입니다(상한 ${maxBodyLines}줄). 자세한 것은 커밋 메시지나 전용 문서에 두고 링크만 남기세요.`);
        }
        for (const mark of DRAFT_PLACEHOLDERS) {
            if (entry.text.includes(mark)) problems.push(`${name}: 초안 빈칸 \`${mark}\` 이 남아 있습니다. 채우세요.`);
        }
        for (const field of REQUIRED_FIELDS) {
            if (!body.some((line) => line.startsWith(`- **${field}`))) {
                problems.push(`${name}: \`- **${field}**\` 칸이 없습니다.`);
            }
        }
    }
    return problems;
};
